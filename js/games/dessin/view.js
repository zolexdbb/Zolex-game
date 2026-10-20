import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown, podium } from "../../ui/widgets.js";
import { play, scratch } from "../../ui/sound.js";
import { norm, shuffle, drawerOf, skipTurn } from "./logic.js";

// Deux rangées de crayons : les teintes sombres, puis les claires.
const COLORS = [
  "#1d1a16", "#6f6a62", "#4a2f1d", "#b5452f", "#d9703c", "#d49a2a", "#2f5d46", "#2c8a8a", "#1f3550", "#7a4a8c",
  "#ffffff", "#bdb6a8", "#8a5a3b", "#e8554d", "#f0b98a", "#f2d541", "#7fbf4d", "#6fc3e8", "#3a6fd8", "#e58fb5"
];
const PAPER = "#fffdf6";
const NEAR = 60; // écart de teinte toléré par le seau, pour passer sous le flou du bord des traits
const SIZES = [4, 10, 24];
const W = 800, H = 600;
const MAX_POINTS = 400; // au-delà, le trait est coupé en deux pour rester léger à envoyer

// État d'affichage propre à cet appareil.
const ui = {
  session: null, key: null, path: null, stop: null, strokes: {},
  ctx: null, canDraw: false, color: 0, size: 1, tool: "pen", chatAt: 0, chatEnd: true,
  rolledFor: null, draft: "", revealed: [], hintFor: null, hintTimer: null
};

// ---- La feuille de dessin : un seul canevas, gardé d'un affichage à l'autre ----

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
canvas.className = "pad";
const pen = canvas.getContext("2d", { willReadFrequently: true });
pen.fillStyle = PAPER;
pen.fillRect(0, 0, W, H);
let live = null;
let seq = 0;
let painted = []; // [id, signature] des traits déjà posés sur la feuille

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

// Le seau : colorie la zone d'une seule teinte autour du point, et mord d'un
// pixel sur son bord pour ne pas laisser de liseré clair le long des traits.
function fill(stroke) {
  const [x, y] = String(stroke.f).split(",").map(Number);
  if (!(x >= 0 && x < W && y >= 0 && y < H)) return;
  const image = pen.getImageData(0, 0, W, H), d = image.data;
  const rgb = parseInt((COLORS[stroke.c] || COLORS[0]).slice(1), 16);
  const r = rgb >> 16, g = (rgb >> 8) & 255, b = rgb & 255;
  const start = y * W + x;
  const tr = d[start * 4], tg = d[start * 4 + 1], tb = d[start * 4 + 2];
  if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 12) return;
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
  let top = 0;
  const push = (i) => { if (!seen[i]) { seen[i] = 1; stack[top++] = i; } };
  push(start);
  while (top) {
    const i = stack[--top], o = i * 4;
    const inside = Math.abs(d[o] - tr) + Math.abs(d[o + 1] - tg) + Math.abs(d[o + 2] - tb) <= NEAR;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    if (!inside) continue;
    const col = i % W;
    if (col > 0) push(i - 1);
    if (col < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  pen.putImageData(image, 0, 0);
}

const sign = (stroke) => (stroke.f ? `f/${stroke.c}/${stroke.f}` : `${stroke.c}/${stroke.w}/${stroke.p}`);

// Tant que le début du dessin n'a pas bougé, on ne trace que la suite (le dernier
// trait a pu s'allonger) : rejouer tous les seaux à chaque point serait trop lourd.
function redraw() {
  const ids = Object.keys(ui.strokes).sort();
  const n = painted.length;
  const grown = (id, was, i) => i === n - 1 && !ui.strokes[id].f && sign(ui.strokes[id]).startsWith(was);
  const kept = n <= ids.length && painted.every(([id, was], i) => id === ids[i] && (sign(ui.strokes[id]) === was || grown(id, was, i)));
  let from = n;
  if (!kept) {
    pen.fillStyle = PAPER;
    pen.fillRect(0, 0, W, H);
    from = 0;
  } else if (n && sign(ui.strokes[ids[n - 1]]) !== painted[n - 1][1]) from = n - 1;
  for (const id of ids.slice(from)) (ui.strokes[id].f ? fill : trace)(ui.strokes[id]);
  painted = ids.map((id) => [id, sign(ui.strokes[id])]);
}

function send(force) {
  const now = performance.now();
  if (!force && now - live.sent < 70) return;
  live.sent = now;
  ui.ctx.write(`${ui.path}/${live.id}`, { c: live.c, w: live.w, p: live.pts.join(",") }).catch(() => {});
}

function point(event) {
  const box = canvas.getBoundingClientRect();
  const at = (pos, size, max) => Math.min(max - 1, Math.max(0, Math.round((pos / size) * max)));
  return [at(event.clientX - box.left, box.width, W), at(event.clientY - box.top, box.height, H)];
}

const strokeId = () => `s${Date.now().toString(36)}${String(seq++ % 1000).padStart(3, "0")}`;

function begin(event) {
  live = { id: strokeId(), c: ui.color, w: ui.size, pts: point(event), sent: 0 };
  send(true);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!ui.canDraw) return;
  event.preventDefault();
  if (ui.tool === "fill") {
    return ui.ctx.write(`${ui.path}/${strokeId()}`, { c: ui.color, f: point(event).join(",") }).catch(() => {});
  }
  try { canvas.setPointerCapture(event.pointerId); } catch { /* pointeur déjà relâché */ }
  begin(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (!ui.canDraw || !event.buttons || ui.tool === "fill") return;
  // Un réaffichage de l'écran peut interrompre le trait : on le reprend sans relever le crayon.
  if (!live) return begin(event);
  const [x, y] = point(event);
  const n = live.pts.length;
  trace({ c: live.c, w: live.w, p: [live.pts[n - 2], live.pts[n - 1], x, y].join(",") });
  scratch(.3 + Math.hypot(x - live.pts[n - 2], y - live.pts[n - 1]) / 40);
  live.pts.push(x, y);
  if (live.pts.length >= MAX_POINTS) { send(true); begin(event); } else send(false);
});
for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, () => { scratch(0); if (live) { send(true); live = null; } });
}

// Branche la feuille sur le dessin du tour en cours.
function plug(ctx) {
  const s = ctx.state;
  const key = `${s.g}/${s.turn}`;
  ui.ctx = ctx;
  if (ui.session === ctx.session && ui.key === key) return;
  ui.stop?.();
  Object.assign(ui, {
    session: ctx.session, key, path: `strokes/${ctx.code}/${key}`, strokes: {}, draft: "", revealed: [], hintFor: null,
    tool: "pen", chatEnd: true
  });
  live = null;
  redraw();
  ui.stop = ctx.listen(ui.path, (value) => {
    ui.strokes = value || {};
    redraw();
    if (value && !ui.canDraw) scratch(.6); // les devins entendent le crayon du dessinateur
  });
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

// Rangée de boutons dont un seul est enfoncé.
function radios(buttons, current, choose) {
  buttons.forEach((button, i) => {
    button.setAttribute("aria-pressed", String(i === current));
    button.addEventListener("click", () => {
      choose(i);
      buttons.forEach((other, k) => other.setAttribute("aria-pressed", String(k === i)));
    });
  });
  return buttons;
}

function toolbar() {
  const swatches = radios(COLORS.map((color, i) => {
    const swatch = h("button", { class: "swatch", type: "button", "aria-label": `Couleur ${i + 1}` });
    swatch.style.background = color;
    return swatch;
  }), ui.color, (i) => { ui.color = i; });
  const TOOLS = [["pen", "pencil", "Crayon"], ["fill", "bucket", "Seau : remplir une zone"]];
  const tools = radios(TOOLS.map(([, art, label]) => h("button", { class: "nib", type: "button", "aria-label": label, title: label }, icon(art))),
    TOOLS.findIndex(([id]) => id === ui.tool), (i) => {
      ui.tool = TOOLS[i][0];
      canvas.classList.toggle("is-fill", ui.tool === "fill");
    });
  const nibs = radios(SIZES.map((_, i) => {
    const nib = h("button", { class: "nib", type: "button", "aria-label": `Épaisseur ${i + 1}` }, h("span", null));
    nib.firstChild.style.width = nib.firstChild.style.height = `${6 + i * 6}px`;
    return nib;
  }), ui.size, (i) => { ui.size = i; });
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
    h("div", { class: "tool-row" }, tools, h("span", { class: "tool-gap" }), nibs, undo, wipe));
}

// Tout ce qui s'est dit depuis le début de la partie, dessin après dessin : la
// liste défile, et reste où le joueur l'a laissée quand l'écran est redessiné.
function chatter({ state: s, room }) {
  const lines = [];
  for (let no = 1; no <= s.turnNo; no++) {
    const turn = `t${no}`;
    const found = Object.entries(room.found?.[s.g]?.[turn] || {}).map(([id, f]) => ({ at: f.at, id, hit: true }));
    const said = Object.entries(room.chat?.[s.g]?.[turn] || {})
      .map(([key, m]) => ({ at: parseInt(key.slice(1, 9), 36), id: m.uid, text: m.text }));
    if (!found.length && !said.length) continue;
    lines.push({ title: `Dessin ${no} · ${nameOf(s, s.order[(no - 1) % s.order.length])}` },
      ...[...found, ...said].sort((a, b) => a.at - b.at));
  }
  if (!lines.length) return null;
  const list = h("ul", { class: "chatter", tabindex: "0", "aria-label": "Historique des réponses" }, lines.map((line) =>
    line.title ? h("li", { class: "is-turn" }, line.title)
      : line.hit ? h("li", { class: "is-hit" }, icon("check"), h("b", null, nameOf(s, line.id)), " a trouvé !")
        : h("li", null, h("b", null, nameOf(s, line.id)), " : ", line.text)));
  list.addEventListener("scroll", () => {
    ui.chatAt = list.scrollTop;
    ui.chatEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 12;
  });
  requestAnimationFrame(() => { list.scrollTop = ui.chatEnd ? list.scrollHeight : ui.chatAt; });
  return list;
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
      hintLine(hint), tools];
  }
  if (mine) {
    return [h("h2", null, "Trouvé !"), hintLine(hint),
      h("p", { class: "rule" }, "Chut : laisse les autres chercher."), tools];
  }
  if (!s.names[me]) return [h("h2", null, `${nameOf(s, drawer)} dessine`), hintLine(hint), tools];

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
  return [h("h2", null, `${nameOf(s, drawer)} dessine`), hintLine(hint), form, tools];
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
  const { state: s, room, me, isHost } = ctx;
  const score = (id) => s.scores?.[id] || 0;
  const ranked = Object.keys(s.names).sort((a, b) => score(b) - score(a));
  return [
    h("h2", null, "Classement final"),
    h("p", { class: "verdict" }, `${nameOf(s, ranked[0])} remporte la partie`),
    podium(ranked.slice(0, 3).map((id) => ({
      players: [{ name: nameOf(s, id), index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me }],
      note: `${score(id)} pts`
    })), s.g),
    ranked.length > 3 && h("ol", { class: "roles-list ranks" }, ranked.slice(3).map((id) =>
      h("li", null, h("span", null, nameOf(s, id)), h("b", null, `${score(id)} pts`)))),
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
  const cue = `${ui.key}/${s.phase}`;
  const found = Object.keys(ctx.room.found?.[s.g]?.[s.turn] || {}).length;
  if (ui.cue !== cue) {
    ui.cue = cue;
    if (s.phase === "recap") play("reveal");
    if (s.phase === "end") play("win");
  } else if (found > ui.found) play("found");
  ui.found = found;
  canvas.classList.toggle("is-mine", ui.canDraw);
  canvas.classList.toggle("is-fill", ui.canDraw && ui.tool === "fill");
  if (!ui.canDraw) live = null;
  const timed = s.phase === "draw" || s.phase === "pick";
  if (s.phase === "end") {
    return [
      h("header", { class: "sketch-head" }, h("p", { class: "eyebrow" }, "What's Drawing ?"), h("h1", null, "Rideau")),
      h("section", { class: "sheet finale" }, endPanel(ctx))
    ];
  }
  // La feuille prend toute la place ; le mot, les réponses et les scores tiennent dans une colonne étroite.
  return [
    h("div", { class: "col sketch-main" },
      h("header", { class: "sketch-head is-slim" },
        h("h1", null, `Dessin ${s.turnNo} sur ${s.total}`), timed && countdown(s.until, ctx.now)),
      h("div", { class: "pad-frame" }, canvas),
      ui.canDraw && toolbar()),
    h("div", { class: "col sketch-side" },
      h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx), chatter(ctx)),
      scoreboard(ctx))
  ];
}
