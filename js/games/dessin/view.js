import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown } from "../../ui/widgets.js";
import { norm, shuffle, drawerOf, skipTurn } from "./logic.js";

const COLORS = ["#1d1a16", "#b5452f", "#d9703c", "#d49a2a", "#2f5d46", "#2c8a8a", "#1f3550", "#7a4a8c", "#8a5a3b", "#ffffff"];
const SIZES = [4, 10, 24];
const W = 800, H = 600;
const MAX_POINTS = 400; // au-delà, le trait est coupé en deux pour rester léger à envoyer

// État d'affichage propre à cet appareil.
const ui = {
  session: null, key: null, path: null, stop: null, strokes: {},
  ctx: null, canDraw: false, color: 0, size: 1,
  rolledFor: null, draft: "", revealed: [], hintFor: null, hintTimer: null
};

// ---- La feuille de dessin : un seul canevas, gardé d'un affichage à l'autre ----

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
canvas.className = "pad";
const pen = canvas.getContext("2d");
let live = null;
let seq = 0;

function trace(stroke) {
  const p = String(stroke.p || "").split(",").map(Number);
  if (p.length < 2) return;
  pen.strokeStyle = COLORS[stroke.c] || COLORS[0];
  pen.lineWidth = SIZES[stroke.w] || SIZES[1];
  pen.lineCap = pen.lineJoin = "round";
  pen.beginPath();
  pen.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) pen.lineTo(p[i], p[i + 1]);
  if (p.length === 2) pen.lineTo(p[0] + 0.1, p[1]);
  pen.stroke();
}

function redraw() {
  pen.fillStyle = "#fffdf6";
  pen.fillRect(0, 0, W, H);
  for (const id of Object.keys(ui.strokes).sort()) trace(ui.strokes[id]);
}

function send(force) {
  const now = performance.now();
  if (!force && now - live.sent < 70) return;
  live.sent = now;
  ui.ctx.write(`${ui.path}/${live.id}`, { c: live.c, w: live.w, p: live.pts.join(",") }).catch(() => {});
}

function point(event) {
  const box = canvas.getBoundingClientRect();
  return [Math.round(((event.clientX - box.left) / box.width) * W), Math.round(((event.clientY - box.top) / box.height) * H)];
}

function begin(event) {
  live = { id: `s${Date.now().toString(36)}${String(seq++ % 1000).padStart(3, "0")}`, c: ui.color, w: ui.size, pts: point(event), sent: 0 };
  send(true);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!ui.canDraw) return;
  event.preventDefault();
  try { canvas.setPointerCapture(event.pointerId); } catch { /* pointeur déjà relâché */ }
  begin(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (!ui.canDraw || !event.buttons) return;
  // Un réaffichage de l'écran peut interrompre le trait : on le reprend sans relever le crayon.
  if (!live) return begin(event);
  const [x, y] = point(event);
  const n = live.pts.length;
  trace({ c: live.c, w: live.w, p: [live.pts[n - 2], live.pts[n - 1], x, y].join(",") });
  live.pts.push(x, y);
  if (live.pts.length >= MAX_POINTS) { send(true); begin(event); } else send(false);
});
for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, () => { if (live) { send(true); live = null; } });
}

// Branche la feuille sur le dessin du tour en cours.
function plug(ctx) {
  const s = ctx.state;
  const key = `${s.g}/${s.turn}`;
  ui.ctx = ctx;
  if (ui.session === ctx.session && ui.key === key) return;
  ui.stop?.();
  Object.assign(ui, {
    session: ctx.session, key, path: `strokes/${ctx.code}/${key}`, strokes: {}, draft: "", revealed: [], hintFor: null
  });
  live = null;
  redraw();
  ui.stop = ctx.listen(ui.path, (value) => { ui.strokes = value || {}; redraw(); });
}

// ---- Mot et indices ----



const wordPath = (ctx) => `draw/${ctx.code}/${ctx.state.g}/${ctx.state.turn}/word`;

// Le mot en tirets, avec les lettres déjà révélées.
function mask(word, revealed) {
  return [...word].map((char, i) => (/[\p{L}\p{N}]/u.test(char) && !revealed.includes(i) ? "_" : char)).join("");
}

function hintLine(text) {
  return h("p", { class: "hint", "aria-label": "Mot à trouver" },
    [...text].map((char) => h("span", { class: char === " " ? "gap" : "" }, char === " " ? "" : char)));
}

function choose(ctx, word) {
  const s = ctx.state;
  return ctx.multi({
    [`${wordPath(ctx)}`]: { text: word, key: norm(word) },
    [`rooms/${ctx.code}/hint/${s.g}/${s.turn}`]: mask(word, [])
  });
}

// Le dessinateur dévoile une lettre à mi-temps, une autre aux trois quarts.
function feedHints(ctx, word) {
  clearInterval(ui.hintTimer);
  ui.hintTimer = null;
  const s = ctx.state;
  if (s.phase !== "draw" || !word) return;
  const letters = [...word].map((char, i) => (/[\p{L}\p{N}]/u.test(char) ? i : -1)).filter((i) => i >= 0);
  const max = letters.length >= 6 ? 2 : letters.length >= 4 ? 1 : 0;
  ui.hintTimer = setInterval(() => {
    const now = ui.ctx.state;
    if (now.turn !== s.turn || now.phase !== "draw") return clearInterval(ui.hintTimer);
    const spent = (ui.ctx.now() - s.startAt) / (s.until - s.startAt);
    const due = Math.min(max, spent > 0.75 ? 2 : spent > 0.5 ? 1 : 0);
    if (ui.revealed.length >= due) return;
    const hidden = letters.filter((i) => !ui.revealed.includes(i));
    ui.revealed.push(hidden[Math.floor(Math.random() * hidden.length)]);
    ui.ctx.write(`rooms/${ui.ctx.code}/hint/${s.g}/${s.turn}`, mask(word, ui.revealed)).catch(() => {});
  }, 1000);
}

async function guess(ctx, text) {
  const { state: s, code, me } = ctx;
  const n = `n${Date.now().toString(36)}`;
  await ctx.write(`tries/${code}/${s.g}/${s.turn}/${me}/${n}`, { key: norm(text) });
  // La base compare elle-même la réponse au mot : elle n'inscrit que les bonnes.
  const right = await ctx.claim(`found/${s.g}/${s.turn}/${me}`, { at: ctx.now(), try: n });
  if (!right) await ctx.tryWrite(`chat/${s.g}/${s.turn}/${n}${me.slice(0, 6)}`, { uid: me, text });
}

// ---- Écran ----

const nameOf = (s, id) => s.names[id]?.name || "?";

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

function scoreboard({ state: s, room, me }) {
  const drawer = drawerOf(s);
  const found = room.found?.[s.g]?.[s.turn] || {};
  const ids = Object.keys(s.names).sort((a, b) => s.names[a].pawn - s.names[b].pawn);
  return h("section", { class: "felt-zone" },
    h("div", { class: "seats" }, ids.map((id) => h("div", { class: "seat" }, pawn(
      { name: nameOf(s, id), index: s.names[id].pawn, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar },
      {
        isHost: id === room.meta.hostUid, isMe: id === me,
        turn: s.phase !== "end" && id === drawer, done: s.phase === "draw" && !!found[id],
        note: `${s.scores?.[id] || 0} pts`
      }
    ))))
  );
}

function toolbar() {
  const swatches = COLORS.map((color, i) => {
    const swatch = h("button", {
      class: "swatch", type: "button", "aria-label": `Couleur ${i + 1}`, "aria-pressed": String(i === ui.color)
    });
    swatch.style.background = color;
    swatch.addEventListener("click", () => {
      ui.color = i;
      swatches.forEach((other, k) => other.setAttribute("aria-pressed", String(k === i)));
    });
    return swatch;
  });
  const nibs = SIZES.map((size, i) => {
    const nib = h("button", { class: "nib", type: "button", "aria-label": `Épaisseur ${i + 1}`, "aria-pressed": String(i === ui.size) },
      h("span", null));
    nib.firstChild.style.width = nib.firstChild.style.height = `${6 + i * 6}px`;
    nib.addEventListener("click", () => {
      ui.size = i;
      nibs.forEach((other, k) => other.setAttribute("aria-pressed", String(k === i)));
    });
    return nib;
  });
  const undo = h("button", {
    class: "btn btn-mini", type: "button",
    onclick: () => {
      const last = Object.keys(ui.strokes).sort().pop();
      if (last) ui.ctx.write(`${ui.path}/${last}`, null).catch(() => {});
    }
  }, icon("undo"), "Annuler");
  const wipe = h("button", {
    class: "btn btn-mini", type: "button", onclick: () => ui.ctx.write(ui.path, null).catch(() => {})
  }, icon("trash"), "Effacer");
  return h("div", { class: "tools" },
    h("div", { class: "swatches" }, swatches),
    h("div", { class: "tool-row" }, nibs, undo, wipe));
}

function chatter({ state: s, room }) {
  const found = Object.entries(room.found?.[s.g]?.[s.turn] || {}).map(([id, f]) => ({ at: f.at, id, hit: true }));
  const said = Object.entries(room.chat?.[s.g]?.[s.turn] || {})
    .map(([key, m]) => ({ at: parseInt(key.slice(1, 9), 36), id: m.uid, text: m.text }));
  const lines = [...found, ...said].sort((a, b) => a.at - b.at).slice(-8);
  if (!lines.length) return null;
  return h("ul", { class: "chatter", "aria-live": "polite" }, lines.map((line) =>
    line.hit ? h("li", { class: "is-hit" }, icon("check"), h("b", null, nameOf(s, line.id)), " a trouvé !")
      : h("li", null, h("b", null, nameOf(s, line.id)), " : ", line.text)));
}

function pickPanel(ctx) {
  const { state: s, me, isHost } = ctx;
  const drawer = drawerOf(s);
  if (drawer !== me) {
    return [h("h2", null, `${nameOf(s, drawer)} choisit un mot`),
      h("p", { class: "rule" }, "Taille ton crayon : le dessin commence dès qu'il a choisi."),
      isHost && h("div", { class: "host-tools" }, action("Passer son tour", "skip", () => skipTurn(ctx)))];
  }
  // Les mots proposés sont rangés dans la base, lisibles par le seul dessinateur :
  // rafraîchir la page ne les change pas, et chaque relance est comptée.
  const ready = ctx.room.drawer?.[s.g]?.[s.turn] === me;
  const path = `draw/${ctx.code}/${s.g}/${s.turn}/options`;
  const rolls = ctx.watch(path, ready ? "ready" : "wait") || {};
  const drawn = Object.keys(rolls).sort((x, y) => x.slice(1) - y.slice(1));
  const roll = (key) => {
    const words = shuffle(s.words || []).slice(0, 3);
    return ctx.write(`${path}/${key}`, words.join("|")).catch(() => {});
  };
  if (ready && !drawn.length && ui.rolledFor !== ui.key) { ui.rolledFor = ui.key; roll("r0"); }
  const options = drawn.length ? rolls[drawn.at(-1)].split("|") : [];
  const left = Object.keys(s.rolls || {}).length - Math.max(drawn.length, 1);
  return [h("h2", null, "À toi de dessiner"),
    h("p", null, "Choisis le mot que tu feras deviner. Ni lettres ni chiffres dans le dessin !"),
    options.length
      ? h("div", { class: "word-cards" }, options.map((word) => {
        const card = h("button", { class: "word-card", type: "button" }, word);
        card.addEventListener("click", busy(card, () => choose(ctx, word)));
        return card;
      }))
      : h("p", { class: "rule" }, "On pioche tes mots…"),
    options.length > 0 && left > 0 && action(`Changer de mots (encore ${left})`, "undo", () => roll(`r${drawn.length}`))];
}

function drawPanel(ctx) {
  const { state: s, room, me, isHost } = ctx;
  const drawer = drawerOf(s);
  const hint = room.hint?.[s.g]?.[s.turn] || "";
  const mine = room.found?.[s.g]?.[s.turn]?.[me];
  const tools = isHost && h("div", { class: "host-tools" }, action("Arrêter ce dessin", "skip", () => skipTurn(ctx)));

  if (drawer === me) {
    const word = ctx.watch(wordPath(ctx));
    if (ui.hintFor !== ui.key && word) { ui.hintFor = ui.key; feedHints(ctx, word.text); }
    return [h("h2", null, "Fais deviner : ", h("span", { class: "the-word" }, word?.text || "…")),
      hintLine(hint), toolbar(), chatter(ctx), tools];
  }
  if (mine) {
    return [h("h2", null, "Trouvé !"), hintLine(hint),
      h("p", { class: "rule" }, "Chut : laisse les autres chercher."), chatter(ctx), tools];
  }
  if (!s.names[me]) return [h("h2", null, `${nameOf(s, drawer)} dessine`), hintLine(hint), chatter(ctx), tools];

  const input = h("input", {
    id: "guess", class: "field", type: "text", maxlength: "40", autocomplete: "off", autocapitalize: "off",
    placeholder: "Ta réponse", value: ui.draft, oninput: () => { ui.draft = input.value; }
  });
  const send = h("button", { class: "btn btn-brick", type: "submit" }, "Proposer");
  const form = h("form", { class: "join" }, input, send);
  form.addEventListener("submit", busy(send, async () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    ui.draft = "";
    input.value = "";
    await guess(ctx, text);
  }));
  return [h("h2", null, `${nameOf(s, drawer)} dessine`), hintLine(hint), form, chatter(ctx), tools];
}

function recapPanel(ctx) {
  const { state: s } = ctx;
  // Le mot ne devient lisible qu'une fois le tour clos : on relance l'écoute.
  const word = ctx.watch(wordPath(ctx), "recap");
  const gains = s.last?.gains || {};
  const ranked = Object.keys(gains).sort((a, b) => gains[b] - gains[a]);
  if (s.last?.skipped) return [h("h2", null, "Tour passé"), h("p", { class: "rule" }, "Aucun mot n'a été choisi à temps.")];
  return [
    h("h2", null, "Le mot était : ", h("span", { class: "the-word" }, word?.text || "…")),
    ranked.length
      ? h("ul", { class: "roles-list" }, ranked.map((id) => h("li", null, h("span", null, nameOf(s, id)), h("b", null, `+${gains[id]}`))))
      : h("p", { class: "rule" }, "Personne n'a trouvé cette fois.")
  ];
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const ranked = Object.keys(s.names).sort((a, b) => (s.scores?.[b] || 0) - (s.scores?.[a] || 0));
  return [
    h("h2", null, "Classement final"),
    h("p", { class: "verdict" }, `${nameOf(s, ranked[0])} remporte la partie`),
    h("ol", { class: "roles-list podium" }, ranked.map((id) =>
      h("li", null, h("span", null, nameOf(s, id)), h("b", null, `${s.scores?.[id] || 0} pts`)))),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

const PANELS = { pick: pickPanel, draw: drawPanel, recap: recapPanel, end: endPanel };

export function view(ctx) {
  const { state: s, me } = ctx;
  plug(ctx);
  ui.canDraw = s.phase === "draw" && drawerOf(s) === me;
  canvas.classList.toggle("is-mine", ui.canDraw);
  if (!ui.canDraw) live = null;
  return [
    h("div", { class: "col" }, h("header", { class: "sketch-head" },
      h("p", { class: "eyebrow" }, s.phase === "end" ? "What's Drawing ?" : `Dessin ${s.turnNo} sur ${s.total}`),
      h("h1", null, s.phase === "end" ? "Rideau" : "What's Drawing ?",
        (s.phase === "draw" || s.phase === "pick") && [" ", countdown(s.until, ctx.now)])),
    s.phase !== "end" && h("div", { class: "pad-frame" }, canvas)),
    h("div", { class: "col" },
      h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx)),
      scoreboard(ctx))
  ];
}
