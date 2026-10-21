import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { token, countdown, ranking } from "../../ui/widgets.js";
import { play, scratch } from "../../ui/sound.js";
import { chatBox, tableChannel } from "../../ui/chat.js";
import { norm, shuffle, drawerOf, skipTurn, isClose } from "./logic.js";

// Deux rangées de crayons : les teintes sombres, puis les claires.
const COLORS = [
  "#1d1a16", "#6f6a62", "#4a2f1d", "#b5452f", "#d9703c", "#d49a2a", "#2f5d46", "#2c8a8a", "#1f3550", "#7a4a8c",
  "#ffffff", "#bdb6a8", "#8a5a3b", "#e8554d", "#f0b98a", "#f2d541", "#7fbf4d", "#6fc3e8", "#3a6fd8", "#e58fb5"
];
const PAPER = "#fffdf6";
const NEAR = 60; // écart de teinte toléré par le seau, pour passer sous le flou du bord des traits
const SIZES = [2, 5, 10, 24];
// Couleur d'un trait : un crayon de la boîte (indice), une couleur libre (#rrggbb) ou la gomme ("e").
const inkOf = (c) => (c === "e" ? PAPER : typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[c] || COLORS[0]);
const W = 800, H = 600;
const MAX_POINTS = 400; // au-delà, le trait est coupé en deux pour rester léger à envoyer

// État d'affichage propre à cet appareil.
const ui = {
  session: null, key: null, path: null, stop: null, strokes: {},
  ctx: null, canDraw: false, color: 0, size: 2, tool: "pen", chatAt: 0, chatEnd: true, big: false,
  rolledFor: null, draft: "", whisper: "", revealed: [], hintFor: null, hintTimer: null, options: [], autoFor: null, autoTimer: null
};

// Outils de la boîte : [id, icône, nom, raccourci].
const TOOLS = [
  ["pen", "pencil", "Crayon", "B"], ["fill", "bucket", "Seau : remplir une zone", "G"],
  ["line", "line", "Trait droit", "L"], ["rect", "rect", "Rectangle", "R"], ["oval", "oval", "Ellipse", "O"],
  ["eraser", "eraser", "Gomme (ou clic droit)", "E"], ["picker", "picker", "Pipette : prendre une couleur du dessin", "I"]
];
const SHAPES = { line: "l", rect: "r", oval: "o" };

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
  pen.strokeStyle = inkOf(stroke.c);
  pen.lineWidth = SIZES[stroke.w] || SIZES[1];
  pen.lineCap = pen.lineJoin = "round";
  pen.beginPath();
  // Formes : deux coins (ou les deux bouts du trait) suffisent.
  if (stroke.k && p.length >= 4) {
    const [x1, y1, x2, y2] = p;
    if (stroke.k === "l") { pen.moveTo(x1, y1); pen.lineTo(x2, y2); }
    if (stroke.k === "r") pen.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (stroke.k === "o") pen.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, 2 * Math.PI);
    return pen.stroke();
  }
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
  const rgb = parseInt(inkOf(stroke.c).slice(1), 16);
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

const sign = (stroke) => (stroke.f ? `f/${stroke.c}/${stroke.f}` : `${stroke.c}/${stroke.w}/${stroke.k || ""}/${stroke.p}`);

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

// `erase` : trait de gomme (clic droit, ou outil Gomme).
function begin(event, erase = live?.c === "e") {
  live = { id: strokeId(), c: erase ? "e" : ui.color, w: ui.size, pts: point(event), sent: 0 };
  send(true);
}

// La couleur du pixel touché, en #rrggbb.
function pickColor(event) {
  const [x, y] = point(event);
  const [r, g, b] = pen.getImageData(x, y, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Retire le dernier trait posé.
function undoLast() {
  const last = Object.keys(ui.strokes).sort().pop();
  if (last) ui.ctx.write(`${ui.path}/${last}`, null).catch(() => {});
}

// Forme en cours : la feuille d'avant est gardée pour redessiner l'aperçu à chaque mouvement.
let shape = null;

canvas.addEventListener("pointerdown", (event) => {
  if (!ui.canDraw) return;
  event.preventDefault();
  // Clic droit maintenu : on gomme, quel que soit l'outil.
  if (event.button === 2 || ui.tool === "eraser") {
    try { canvas.setPointerCapture(event.pointerId); } catch { /* pointeur déjà relâché */ }
    return begin(event, true);
  }
  if (ui.tool === "picker") {
    ui.color = pickColor(event);
    ui.tool = "pen";
    return ui.ctx.refresh();
  }
  if (ui.tool === "fill") {
    return ui.ctx.write(`${ui.path}/${strokeId()}`, { c: ui.color, f: point(event).join(",") }).catch(() => {});
  }
  try { canvas.setPointerCapture(event.pointerId); } catch { /* pointeur déjà relâché */ }
  if (SHAPES[ui.tool]) {
    shape = { k: SHAPES[ui.tool], c: ui.color, w: ui.size, from: point(event), to: point(event), under: pen.getImageData(0, 0, W, H) };
    return;
  }
  begin(event);
});
// Pas de menu au clic droit sur la feuille : il sert de gomme.
canvas.addEventListener("contextmenu", (event) => { if (ui.canDraw) event.preventDefault(); });
canvas.addEventListener("pointermove", (event) => {
  if (!ui.canDraw || !event.buttons || ui.tool === "fill" || ui.tool === "picker") return;
  if (shape) {
    shape.to = point(event);
    pen.putImageData(shape.under, 0, 0);
    trace({ ...shape, p: [...shape.from, ...shape.to].join(",") });
    return;
  }
  if (SHAPES[ui.tool] && !live) return;
  // Un réaffichage de l'écran peut interrompre le trait : on le reprend sans relever le crayon.
  if (!live) return begin(event, event.buttons === 2 || ui.tool === "eraser");
  const [x, y] = point(event);
  const n = live.pts.length;
  trace({ c: live.c, w: live.w, p: [live.pts[n - 2], live.pts[n - 1], x, y].join(",") });
  scratch(.3 + Math.hypot(x - live.pts[n - 2], y - live.pts[n - 1]) / 40);
  live.pts.push(x, y);
  if (live.pts.length >= MAX_POINTS) { send(true); begin(event); } else send(false);
});
for (const type of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(type, () => {
    scratch(0);
    if (live) { send(true); live = null; }
    if (shape) {
      const { k, c, w, from, to } = shape;
      shape = null;
      if (type === "pointerup" && (from[0] !== to[0] || from[1] !== to[1])) {
        ui.ctx.write(`${ui.path}/${strokeId()}`, { c, w, k, p: [...from, ...to].join(",") }).catch(() => {});
      } else redraw();
    }
  });
}

// Raccourcis du dessinateur (sauf pendant la saisie d'un texte).
document.addEventListener("keydown", (event) => {
  if (!ui.canDraw || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  const tool = TOOLS.find(([, , , k]) => k.toLowerCase() === key);
  if ((event.ctrlKey || event.metaKey) && key === "z") undoLast();
  else if (event.ctrlKey || event.metaKey) return;
  else if (tool) ui.tool = tool[0];
  else if (/^[1-4]$/.test(key)) ui.size = Number(key) - 1;
  else if (key === "[" || key === "]") ui.color = ((Number.isInteger(ui.color) ? ui.color : 0) + (key === "]" ? 1 : COLORS.length - 1)) % COLORS.length;
  else if (key === "escape" && ui.big) ui.big = false;
  else return;
  event.preventDefault();
  ui.ctx.refresh();
});

// Branche la feuille sur le dessin du tour en cours.
function plug(ctx) {
  const s = ctx.state;
  const key = `${s.g}/${s.turn}`;
  ui.ctx = ctx;
  if (ui.session === ctx.session && ui.key === key) return;
  ui.stop?.();
  Object.assign(ui, {
    session: ctx.session, key, path: `strokes/${ctx.code}/${key}`, strokes: {}, draft: "", revealed: [], hintFor: null,
    tool: "pen", chatEnd: true, whisper: "", options: []
  });
  shape = null;
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

// Une case par lettre : vide tant qu'elle est cachée, la lettre en capitale d'imprimerie
// une fois dévoilée (pas d'écriture manuscrite ici : l, I et 1 ne doivent pas se confondre).
function hintLine(text) {
  return h("p", { class: "hint", "aria-label": `Mot à trouver : ${text.replace(/_/g, "?")}` },
    [...text].map((char) => char === " " ? h("span", { class: "gap", "aria-hidden": "true" })
      : /[\p{L}\p{N}_]/u.test(char) ? h("span", { class: `slot${char === "_" ? " is-hidden" : ""}`, "aria-hidden": "true" }, char === "_" ? "" : char)
      : h("span", { class: "mark", "aria-hidden": "true" }, char)));
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

// Ceux qui ont trouvé (et le dessinateur) parlent entre eux, à l'abri des autres.
const innerPath = (ctx) => `inner/${ctx.code}/${ctx.state.g}/${ctx.state.turn}`;
const whisper = (ctx, text) =>
  ctx.write(`${innerPath(ctx)}/w${Date.now().toString(36)}${ctx.me.slice(0, 6)}`, { uid: ctx.me, text: text.slice(0, 60) });

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
  }), ui.color, (i) => { ui.color = i; custom.setAttribute("aria-pressed", "false"); });
  // 21ᵉ crayon : n'importe quelle couleur, avec le nuancier du système (roue, spectre).
  const free = typeof ui.color === "string";
  const picker = h("input", {
    type: "color", value: free ? ui.color : "#e8554d", "aria-label": "Choisir une couleur libre",
    oninput: () => { ui.color = picker.value; custom.style.background = picker.value; swatches.forEach((sw) => sw.setAttribute("aria-pressed", "false")); custom.setAttribute("aria-pressed", "true"); }
  });
  const custom = h("label", { class: "swatch swatch-custom", title: "Couleur libre", "aria-pressed": String(free) }, picker, h("span", { "aria-hidden": "true" }, "+"));
  if (free) custom.style.background = ui.color;
  const tools = radios(TOOLS.map(([, art, label, key]) =>
    h("button", { class: "nib", type: "button", "aria-label": label, title: `${label} (${key})` }, icon(art))),
  TOOLS.findIndex(([id]) => id === ui.tool), (i) => {
    ui.tool = TOOLS[i][0];
    canvas.classList.toggle("is-fill", ui.tool === "fill");
    canvas.classList.toggle("is-picker", ui.tool === "picker");
  });
  const nibs = radios(SIZES.map((_, i) => {
    const nib = h("button", { class: "nib", type: "button", "aria-label": `Épaisseur ${i + 1}`, title: `Épaisseur ${i + 1} (${i + 1})` }, h("span", null));
    nib.firstChild.style.width = nib.firstChild.style.height = `${[3, 6, 11, 20][i]}px`;
    return nib;
  }), ui.size, (i) => { ui.size = i; });
  const undo = h("button", { class: "btn btn-mini", type: "button", title: "Annuler (Ctrl+Z)", onclick: undoLast }, icon("undo"), "Annuler");
  const wipe = h("button", {
    class: "btn btn-mini", type: "button", onclick: () => ui.ctx.write(ui.path, null).catch(() => {})
  }, icon("trash"), "Effacer");
  return h("div", { class: "tools" },
    h("div", { class: "swatches" }, swatches, custom),
    h("div", { class: "tool-row" }, tools),
    h("div", { class: "tool-row" }, nibs, undo, wipe),
    h("p", { class: "tool-keys" }, "Ctrl+Z : annuler · clic droit : gommer · B, G, L, R, O, E, I : outils · 1 à 4 : épaisseur · [ ] : couleur"));
}

// Tout ce qui s'est dit depuis le début de la partie, dessin après dessin : la
// liste défile, et reste où le joueur l'a laissée quand l'écran est redessiné.
function chatter(ctx) {
  const { state: s, room } = ctx;
  const lines = [];
  for (let no = 1; no <= s.turnNo; no++) {
    const turn = `t${no}`;
    const found = Object.entries(room.found?.[s.g]?.[turn] || {}).map(([id, f]) => ({ at: f.at, id, hit: true }));
    const close = room.close?.[s.g]?.[turn] || {};
    const said = Object.entries(room.chat?.[s.g]?.[turn] || {})
      .map(([key, m]) => ({ at: parseInt(key.slice(1, 9), 36), id: m.uid, text: m.text, close: !!close[key] }));
    const inner = no === s.turnNo ? innerLines(ctx) : [];
    if (!found.length && !said.length && !inner.length) continue;
    lines.push({ title: `Dessin ${no} · ${nameOf(s, s.order[(no - 1) % s.order.length])}` },
      ...[...found, ...said, ...inner].sort((a, b) => a.at - b.at));
  }
  if (!lines.length) return null;
  const list = h("ul", { class: "chatter", tabindex: "0", "aria-label": "Historique des réponses" }, lines.map((line) =>
    line.title ? h("li", { class: "is-turn" }, line.title)
      : line.hit ? h("li", { class: "is-hit" }, icon("check"), h("b", null, nameOf(s, line.id)), " a trouvé !")
        : h("li", { class: line.inner ? "is-inner" : line.close ? "is-close" : "" }, h("b", null, nameOf(s, line.id)), line.inner ? " (entre initiés)" : "", " : ", line.text,
          line.close && h("em", { class: "close-tag" }, "presque !"))));
  list.addEventListener("scroll", () => {
    ui.chatAt = list.scrollTop;
    ui.chatEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 12;
  });
  requestAnimationFrame(() => { list.scrollTop = ui.chatEnd ? list.scrollHeight : ui.chatAt; });
  return list;
}

// Ce que se disent ceux qui ont trouvé : lisible par eux et le dessinateur seulement.
function innerLines(ctx) {
  const { state: s, room, me } = ctx;
  const allowed = drawerOf(s) === me || !!room.found?.[s.g]?.[s.turn]?.[me];
  if (!allowed || s.phase === "pick") return [];
  const said = ctx.watch(innerPath(ctx), "in") || {};
  return Object.entries(said).map(([key, m]) => ({ at: parseInt(key.slice(1, 9), 36), id: m.uid, text: m.text, inner: true }));
}

function whisperForm(ctx) {
  const input = h("input", {
    id: "whisper", class: "field", type: "text", maxlength: "60", autocomplete: "off",
    placeholder: "Parler aux autres qui ont trouvé", value: ui.whisper, oninput: () => { ui.whisper = input.value; }
  });
  const send = h("button", { class: "btn btn-ink", type: "submit" }, "Dire");
  const form = h("form", { class: "join" }, input, send);
  form.addEventListener("submit", busy(send, async () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    ui.whisper = "";
    input.value = "";
    await whisper(ctx, text);
  }));
  return form;
}

// Le choix du mot s'affiche sur la feuille elle-même.
function pickOverlay(ctx) {
  const { state: s, me, isHost } = ctx;
  const drawer = drawerOf(s);
  if (drawer !== me) {
    return [h("h2", null, `${nameOf(s, drawer)} choisit un mot`),
      h("p", { class: "rule" }, "Taille ton crayon : le dessin commence dès qu'il a choisi."),
      isHost && action("Passer son tour", "skip", () => skipTurn(ctx))];
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
  // À l'échéance, un des mots proposés est choisi au hasard : le tour n'est pas perdu.
  ui.options = options;
  if (options.length && ui.autoFor !== ui.key) {
    ui.autoFor = ui.key;
    clearTimeout(ui.autoTimer);
    const turn = s.turn;
    ui.autoTimer = setTimeout(() => {
      const now = ui.ctx.state;
      if (now.turn !== turn || now.phase !== "pick" || !ui.options.length) return;
      choose(ui.ctx, ui.options[Math.floor(Math.random() * ui.options.length)]).catch(() => {});
    }, Math.max(0, s.until - ctx.now() - 800));
  }
  return [h("h2", null, "À toi de dessiner"),
    h("p", null, "Choisis ton mot. Sans choix à la fin du temps, un des trois est tiré au hasard."),
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
  const mine = room.found?.[s.g]?.[s.turn]?.[me];
  const tools = isHost && h("div", { class: "host-tools" }, action("Arrêter ce dessin", "skip", () => skipTurn(ctx)));

  if (drawer === me) {
    return [h("h2", null, "Tu dessines"),
      h("p", { class: "rule" }, "Ceux qui ont trouvé peuvent te parler ici, sans que les autres le voient."),
      whisperForm(ctx), tools];
  }
  if (mine) {
    return [h("h2", null, "Trouvé !"),
      h("p", { class: "rule" }, "Chut pour les autres : ici, seuls ceux qui ont trouvé et le dessinateur te lisent."),
      whisperForm(ctx), tools];
  }
  if (!s.names[me]) return [h("h2", null, `${nameOf(s, drawer)} dessine`), tools];

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
  return [h("h2", null, `${nameOf(s, drawer)} dessine`), form, tools];
}

function recapPanel(ctx) {
  const { state: s } = ctx;
  const gains = s.last?.gains || {};
  const ranked = Object.keys(gains).sort((a, b) => gains[b] - gains[a]);
  if (s.last?.skipped) return [h("h2", null, "Tour passé"), h("p", { class: "rule" }, "Le dessinateur n'a pas répondu à temps.")];
  return [
    h("h2", null, "Points du tour"),
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
    ranking({
      ids: Object.keys(s.names), score, key: s.g, label: (id) => `${score(id)} pts`,
      person: (id) => ({ name: nameOf(s, id), index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me })
    }),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

// Pendant le choix du mot, la colonne de droite ne garde que l'historique.
const pickSide = (ctx) => [h("h2", null, "Choix du mot"),
  h("p", { class: "rule" }, drawerOf(ctx.state) === ctx.me ? "Choisis ton mot sur la feuille."
    : `${nameOf(ctx.state, drawerOf(ctx.state))} choisit son mot.`)];
const PANELS = { pick: pickSide, draw: drawPanel, recap: recapPanel, end: endPanel };

// Les joueurs, dans l'ordre de passage au crayon : qui dessine, qui suit, qui a trouvé, et les points.
function playersBoard({ state: s, room, me }) {
  const n = s.order.length, at = (s.turnNo - 1) % n;
  const found = room.found?.[s.g]?.[s.turn] || {};
  let next = null;
  for (let k = s.turnNo + 1; k <= s.total && !next; k++) if (room.players?.[s.order[(k - 1) % n]]) next = s.order[(k - 1) % n];
  const ids = [...s.order, ...Object.keys(s.names).filter((id) => !s.order.includes(id))];
  return h("section", { class: "draw-players", "aria-label": "Joueurs et points" },
    h("ol", null, ids.map((id, i) => {
      const status = i === at ? h("span", { class: "tag is-now" }, icon("pencil"), "dessine")
        : s.phase === "draw" && found[id] ? h("span", { class: "tag is-found" }, icon("check"), "trouvé")
        : id === next ? h("span", { class: "tag" }, "ensuite") : null;
      return h("li", { class: `${i === at ? "is-now" : ""}${room.players?.[id] ? "" : " is-gone"}` },
        h("b", { class: "rank" }, s.order.includes(id) ? `${i + 1}.` : ""),
        token({ name: nameOf(s, id), index: s.names[id]?.pawn ?? i, avatar: room.players?.[id]?.avatar }),
        h("span", { class: "who" }, nameOf(s, id), id === me && h("em", null, " (toi)"), id === room.meta.hostUid && icon("crown")),
        status,
        h("b", { class: "pts" }, `${s.scores?.[id] || 0} pts`));
    })));
}

// Au-dessus du dessin : le mot (pour le dessinateur) ou les tirets à deviner.
// L'appareil du dessinateur (le seul qui connaît le mot) signale les réponses à une lettre près.
const closeSeen = new Set();
function judgeClose(ctx, word) {
  const { state: s, room, code } = ctx;
  for (const [key, m] of Object.entries(room.chat?.[s.g]?.[s.turn] || {})) {
    const id = `${s.g}/${s.turn}/${key}`;
    if (closeSeen.has(id) || room.close?.[s.g]?.[s.turn]?.[key]) continue;
    closeSeen.add(id);
    if (isClose(m.text, word)) ctx.write(`rooms/${code}/close/${s.g}/${s.turn}/${key}`, true).catch(() => {});
  }
}

function wordBar(ctx) {
  const { state: s, room, me } = ctx;
  if (s.phase === "recap") {
    const word = ctx.watch(wordPath(ctx), "recap");
    return h("div", { class: "word-bar" }, s.last?.skipped ? h("span", null, "Tour passé")
      : [h("span", null, "Le mot était : "), h("span", { class: "the-word" }, word?.text || "…")]);
  }
  if (s.phase !== "draw") return null;
  const hint = room.hint?.[s.g]?.[s.turn] || "";
  if (drawerOf(s) === me) {
    const word = ctx.watch(wordPath(ctx));
    if (ui.hintFor !== ui.key && word) { ui.hintFor = ui.key; feedHints(ctx, word.text); }
    if (word) judgeClose(ctx, word.text);
    // Le mot seul ; les lettres déjà dévoilées aux autres passent en vert.
    const shown = [...hint];
    return h("div", { class: "word-bar" }, h("span", null, "Fais deviner : "),
      h("span", { class: "the-word", title: "En vert : les lettres que les autres voient déjà" },
        word ? [...word.text].map((char, i) => h("span", { class: shown[i] && shown[i] !== "_" && /[\p{L}\p{N}]/u.test(char) ? "is-shown" : "" }, char)) : "…"));
  }
  return h("div", { class: "word-bar" }, hintLine(hint));
}

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
      h("header", { class: "sketch-head" }, h("p", { class: "eyebrow" }, "Devine le dessin"), h("h1", null, "Rideau")),
      h("section", { class: "sheet finale" }, endPanel(ctx)),
      h("div", { class: "finale" }, chatBox(ctx))
    ];
  }
  // La feuille prend toute la place ; le mot, les réponses et les scores tiennent dans une colonne étroite.
  const big = ui.big && ui.canDraw;
  const grow = h("button", {
    class: "btn btn-mini pad-grow", type: "button", "aria-pressed": String(big),
    onclick: () => { ui.big = !ui.big; ctx.refresh(); }
  }, icon(big ? "shrink" : "expand"), big ? "Réduire" : "Agrandir");
  return [
    h("div", { class: `col sketch-main${big ? " is-big" : ""}` },
      h("header", { class: "sketch-head is-slim" },
        h("h1", null, `Dessin ${s.turnNo} sur ${s.total}`), timed && countdown(s.until, ctx.now)),
      wordBar(ctx),
      // Sur ordinateur, la boîte de crayons se range en colonne à côté de la feuille.
      h("div", { class: `pad-row${ui.canDraw ? " has-tools" : ""}` },
        h("div", { class: "pad-frame" }, canvas,
          s.phase === "pick" && h("div", { class: "pad-over" }, pickOverlay(ctx)),
          ui.canDraw && grow),
        ui.canDraw && toolbar())),
    h("div", { class: "col sketch-side" },
      playersBoard(ctx),
      h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx), chatter(ctx)),
      // La discussion de la table se tait pendant un dessin : on n'y souffle pas la réponse.
      chatBox(ctx, {
        channels: [tableChannel(ctx, s.phase !== "draw")],
        note: "Pendant un dessin, on n'écrit que ses réponses : la discussion reprend entre deux dessins."
      }))
  ];
}
