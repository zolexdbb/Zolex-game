import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown, roundTable } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { playable, isWild, drawOf } from "./logic.js";

// Les quatre familles, aux couleurs de la boîte : [nom, pictogramme].
const SUITS = { r: ["Brique", "bricks"], g: ["Forêt", "paw"], b: ["Encre", "feather"], y: ["Soleil", "sun"] };
const SPECIALS = { s: "Passe", r: "Demi-tour", d: "+2", w: "Joker", f: "Joker +4" };
const ORDER = "rgbyw";

// pick : carte en attente d'une couleur ou d'un joueur ; move : dernier coup déjà animé et sonorisé.
const ui = { key: null, pick: null, move: null, movedAt: 0 };

const nameOf = (s, id) => s.names[id]?.name || "Un joueur";
const cardName = (card) => (isWild(card) ? SPECIALS[card[1]] : `${SPECIALS[card[1]] || card[1]} ${SUITS[card[0]][0]}`);

function cardNode(card, { onclick, cls = "", disabled } = {}) {
  const [c, v] = card;
  const wheel = () => h("span", { class: "u-wheel" });
  const mid = v === "s" ? icon("skip") : v === "r" ? icon("undo") : v === "d" ? "+2"
    : v === "w" ? wheel() : v === "f" ? [wheel(), h("span", null, "+4")] : v;
  const corner = () => h("span", { class: "ucard-corner" }, isWild(card) ? "★" : icon(SUITS[c][1]));
  const attrs = { class: `ucard u-${c} ${cls}`, "aria-label": cardName(card), title: cardName(card) };
  const inside = [corner(), h("span", { class: "ucard-mid" }, mid), corner()];
  return onclick
    ? h("button", { ...attrs, type: "button", disabled, onclick }, inside)
    : h("span", { ...attrs, role: "img" }, inside);
}

const send = (ctx, payload) => {
  ui.pick = null;
  return ctx.act(payload).catch(() => ctx.refresh()); // l'étape a déjà changé : on réaffiche
};

function story(s) {
  const l = s.last;
  if (!l) return "La première carte est retournée.";
  const who = nameOf(s, l.by);
  if (l.t === "uno") return `${who} annonce « Uno » !`;
  if (l.t === "catch") return `${who} surprend ${nameOf(s, l.to)} sans annonce : 2 cartes.`;
  if (l.t === "pass") return `${who} garde sa carte et passe.`;
  if (l.t === "draw") return l.n ? `${who} pioche ${l.n} carte${l.n > 1 ? "s" : ""}.` : `${who} passe : la pioche est vide.`;
  return `${who} pose ${cardName(l.card)}${l.jump ? " à la volée" : ""}`
    + (l.to ? ` et échange sa main avec ${nameOf(s, l.to)}` : "") + ".";
}

const FLY = 450;

// Une carte posée part du pion de son joueur ; une carte piochée quitte la pioche
// pour rejoindre le sien. L'écran pouvant être redessiné en plein vol, l'animation
// reprend là où elle en était.
function fly(s, seatOf, top, deck) {
  const l = s.last;
  if (!l || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const elapsed = performance.now() - ui.movedAt;
  if (elapsed >= FLY) return;
  const drawer = l.t === "draw" && l.n ? l.by : l.t === "catch" ? l.to : null;
  const ghost = drawer && deck.appendChild(h("span", { class: "ucard u-back u-ghost" }));
  requestAnimationFrame(() => {
    if (!top.isConnected) return;
    const run = (card, id, frames) => {
      const seat = seatOf(id);
      if (!seat) return;
      const a = seat.querySelector(".pawn-disc").getBoundingClientRect(), b = card.getBoundingClientRect();
      const at = `translate(${a.x + a.width / 2 - b.x - b.width / 2}px, ${a.y + a.height / 2 - b.y - b.height / 2}px) scale(.3)`;
      card.animate(frames(at), { duration: FLY, easing: "cubic-bezier(.3, .7, .3, 1)" }).currentTime = elapsed;
    };
    if (l.t === "play") run(top, l.by, (at) => [{ transform: `${at} rotate(-50deg)`, opacity: .3 }, { transform: "rotate(-4deg)", opacity: 1 }]);
    if (ghost) run(ghost, drawer, (at) => [{ transform: "none", opacity: 1 }, { opacity: 1, offset: .8 }, { transform: at, opacity: 0 }]);
  });
}

// Le son du coup qui vient d'arriver.
function cue(s, me) {
  const l = s.last;
  if (s.phase === "end") return play("win");
  if (s.phase !== "play") return;
  if (!l) return play("shuffle");
  play({ play: drawOf(l.card || "") ? "malus" : "card", draw: "draw", uno: "uno", catch: "catch" }[l.t]);
  if (s.order[s.turn] === me && l.by !== me) setTimeout(() => play("turn"), 400);
}

// La table ronde : les joueurs dans l'ordre du tour, toi toujours en bas, pioche et défausse au milieu.
function table({ state: s, room, me }) {
  const cur = s.phase === "play" && s.order[s.turn];
  const n = s.order.length;
  const shift = Math.max(s.order.indexOf(me), 0);
  const around = s.order.map((_, i) => s.order[(i + shift) % n]);
  const seats = around.map((id) => pawn(
    { name: nameOf(s, id), index: s.names[id].pawn, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar },
    {
      isHost: id === room.meta.hostUid, isMe: id === me, turn: id === cur,
      bubble: s.phase === "play" && s.counts?.[id] === 1 && s.unsaid !== id ? "Uno !" : null,
      note: `${s.counts?.[id] ?? "…"} carte${s.counts?.[id] === 1 ? "" : "s"}`
    }
  ));
  const top = s.phase === "play" && cardNode(s.top, { cls: "is-top" });
  const deck = top && h("span", { class: "ucard u-back", role: "img", "aria-label": `Pioche : ${s.deckCount} cartes` },
    h("span", { class: "ucard-mid" }, String(s.deckCount ?? "")));
  if (top) fly(s, (id) => seats[around.indexOf(id)], top, deck);
  return h("section", { class: "felt-zone" },
    roundTable(seats, s.phase === "play" ? [
      h("div", { class: "piles" },
        deck, top),
      h("small", { class: `suit-chip u-${s.color}` }, icon(SUITS[s.color][1]), SUITS[s.color][0]),
      s.penalty > 0 && h("strong", { class: "malus", title: "Malus en attente" }, `+${s.penalty}`)
    ] : h("strong", null, s.phase === "end" ? "Fin" : "Uno"), Math.PI / 2),
    s.phase === "play" && h("p", { class: "rule" }, `Sens du jeu : ${s.dir > 0 ? "horaire ↻" : "inverse ↺"} · ${story(s)}`));
}

function controls(ctx, hand) {
  const { state: s, me } = ctx;
  const mine = s.order[s.turn] === me;
  const waiting = !!ctx.myAction;
  const btn = (label, payload, cls = "btn-cream") =>
    h("button", { class: `btn ${cls}`, type: "button", disabled: waiting, onclick: () => send(ctx, payload) }, label);

  if (ui.pick) {
    const base = { t: "play", i: ui.pick.i, card: ui.pick.card };
    return h("div", { class: "u-actions" },
      h("b", null, ui.pick.need === "color" ? "Quelle famille ?" : "Avec qui échanger ta main ?"),
      ui.pick.need === "color"
        ? Object.entries(SUITS).map(([color, [name, art]]) =>
          h("button", { class: `btn suit-btn u-${color}`, type: "button", onclick: () => send(ctx, { ...base, color }) }, icon(art), name))
        : s.order.filter((id) => id !== me).map((id) => btn(`${nameOf(s, id)} (${s.counts?.[id] ?? 0})`, { ...base, target: id })),
      h("button", { class: "btn btn-mini", type: "button", onclick: () => { ui.pick = null; ctx.refresh(); } }, "Annuler"));
  }
  return h("div", { class: "u-actions" },
    mine && (s.penalty > 0 ? btn(`Piocher ${s.penalty} cartes`, { t: "draw" }, "btn-brick")
      : s.drawn ? btn("Garder et passer", { t: "pass" })
      : btn("Piocher", { t: "draw" })),
    (s.unsaid === me || (s.rules.callUno && mine && hand.length === 2 && s.called !== me)) && btn("Uno !", { t: "uno" }, "btn-ink"),
    s.unsaid && s.unsaid !== me && s.order.includes(me) && btn(`Contre-Uno : ${nameOf(s, s.unsaid)}`, { t: "catch" }, "btn-brick"));
}

function handZone(ctx) {
  const { state: s, me } = ctx;
  if (!s.order.includes(me)) return h("p", { class: "rule" }, "Tu regardes cette partie : tu joueras la prochaine.");
  const hand = ctx.watch(`uno/${ctx.code}/${s.g}/hands/${me}`) || [];
  const mine = s.order[s.turn] === me;
  const waiting = !!ctx.myAction;
  const choose = (i) => {
    const card = hand[i];
    const need = isWild(card) ? "color" : s.rules.sevenZero && card[1] === "7" && hand.length > 1 ? "target" : null;
    if (!need) return send(ctx, { t: "play", i, card });
    ui.pick = { i, card, need };
    ctx.refresh();
  };
  const cards = hand.map((card, i) => ({ card, i }))
    .sort((a, b) => ORDER.indexOf(a.card[0]) - ORDER.indexOf(b.card[0]) || a.card.localeCompare(b.card));
  return h("section", { class: "felt-zone" },
    controls(ctx, hand),
    h("div", { class: "hand", role: "group", "aria-label": "Ta main" }, cards.map(({ card, i }) => {
      const ok = !waiting && playable(s, me, hand, i);
      return cardNode(card, {
        onclick: () => choose(i), disabled: !ok,
        cls: `${ok ? "is-playable" : mine ? "is-dim" : ""}${ui.pick?.i === i ? " is-picked" : ""}`
      });
    })));
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const ranked = [...s.order].sort((a, b) => (s.left?.[a] || 0) - (s.left?.[b] || 0));
  const again = h("button", { class: "btn btn-brick btn-big", type: "button", onclick: () => ctx.backToLobby() }, icon("play"), "Rejouer");
  return h("section", { class: "sheet" },
    h("h2", null, "Fin de la manche"),
    h("p", { class: "verdict" }, `${nameOf(s, s.winner)} n'a plus de carte`),
    h("p", { class: "rule" }, "Points restés en main : le moins possible, c'est le mieux."),
    h("ol", { class: "roles-list" }, ranked.map((id) =>
      h("li", null, h("span", null, nameOf(s, id)), h("b", null, `${s.left?.[id] || 0} pts`)))),
    isHost ? again : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon."));
}

export function view(ctx) {
  const { state: s, me } = ctx;
  const key = `${s.g}/${s.step}`;
  if (ui.key !== key) { ui.key = key; ui.pick = null; }
  const move = `${s.g}/${s.phase}/${s.moves || 0}`;
  if (ui.move !== move) { Object.assign(ui, { move, movedAt: performance.now() }); cue(s, me); }
  const cur = s.order[s.turn];
  const title = s.phase === "deal" ? "On distribue…" : s.phase === "end" ? "Rideau"
    : cur === me ? "À toi de jouer" : `Au tour de ${nameOf(s, cur)}`;
  // Un seul bloc sur toute la largeur du tapis : la table au centre, la main dessous.
  return h("div", { class: "uno-board" },
    h("header", { class: "uno-head" },
      h("p", { class: "eyebrow" }, "Uno"),
      h("h1", null, title, s.phase === "play" && s.until && [" ", countdown(s.until, ctx.now)])),
    table(ctx),
    s.phase === "play" && handZone(ctx),
    s.phase === "end" && endPanel(ctx),
    s.phase !== "deal" && chatBox(ctx));
}
