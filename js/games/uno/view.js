import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown, roundTable, ranking } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { playable, isWild, isNumber, drawOf, face, colorsOf, nextRound } from "./logic.js";

// Les familles, aux couleurs de la boîte : [nom, pictogramme]. Les quatre
// dernières sont celles du côté sombre du Flip.
const SUITS = {
  r: ["Brique", "bricks"], g: ["Forêt", "paw"], b: ["Encre", "feather"], y: ["Soleil", "sun"],
  o: ["Braise", "flame"], l: ["Lagon", "wave"], p: ["Pivoine", "flower"], n: ["Nuit", "moon"]
};
const SPECIALS = {
  s: "Passe", r: "Demi-tour", e: "Passe tout le monde", x: "Flip", a: "Défausse la couleur",
  u: "+1", d: "+2", q: "+4", c: "+5"
};
const WILDS = {
  w: "Joker", f: "Joker +4", t: "Joker +2", k: "Joker pioche-couleur", v: "Joker demi-tour +4",
  h: "Joker +6", z: "Joker +10", o: "Roulette des couleurs"
};
const DECKS = { classic: "Uno", flip: "Uno Flip", nomercy: "Uno No Mercy" };
const ORDER = "rgbyolpnw";

// pick : carte en attente d'une couleur ou d'un joueur ; move : dernier coup déjà animé et sonorisé.
// hover : la carte pointée dans la main ; chosen : la carte choisie, affichée en grand en attendant « Jouer ».
// Toutes deux gardées d'un affichage à l'autre, pour qu'elles ne retombent pas quand un autre joueur joue.
const ui = { key: null, pick: null, move: null, movedAt: 0, hover: null, chosen: null };

const nameOf = (s, id) => s.names[id]?.name || "Un joueur";
// Toutes les cartes se lisent par leur face visible (deux lettres, voir logic.js).
const cardName = (f) => (isWild(f) ? WILDS[f[1]] : `${SPECIALS[f[1]] || f[1]} ${SUITS[f[0]][0]}`);
const dark = (s) => s.side === "d";

// Le dessin au centre de la carte.
function art(f) {
  const v = f[1], small = (text) => h("span", null, text);
  const wheel = (cls = "") => h("span", { class: `u-wheel ${cls}` });
  if (isWild(f)) {
    return {
      w: wheel(), f: [wheel(), small("+4")], t: [wheel(), small("+2")], k: [wheel(), small("+?")],
      v: [wheel(), h("span", { class: "u-pair" }, icon("undo"), "+4")], h: [wheel(), small("+6")], z: [wheel(), small("+10")],
      o: [wheel("is-spin"), small("?")]
    }[v];
  }
  return {
    s: icon("skip"), r: icon("undo"), x: icon("flip"), a: icon("stack"),
    e: h("span", { class: "u-pair" }, icon("skip"), icon("skip")),
    u: "+1", d: "+2", q: "+4", c: "+5"
  }[v] ?? v;
}

function cardNode(f, { onclick, cls = "", disabled, side } = {}) {
  const c = f[0];
  const corner = () => h("span", { class: "ucard-corner" }, isWild(f) ? "★" : icon(SUITS[c][1]));
  const attrs = { class: `ucard u-${c}${side === "d" ? " is-dark" : ""} ${cls}`, "aria-label": cardName(f), title: cardName(f) };
  const inside = [corner(), h("span", { class: "ucard-mid" }, art(f)), corner()];
  return onclick
    ? h("button", { ...attrs, type: "button", disabled, onclick }, inside)
    : h("span", { ...attrs, role: "img" }, inside);
}

const send = (ctx, payload) => {
  ui.pick = null;
  ui.chosen = null;
  return ctx.act(payload).catch(() => ctx.refresh()); // l'étape a déjà changé : on réaffiche
};

function story(s) {
  const l = s.last;
  if (!l) return "La première carte est retournée.";
  const who = nameOf(s, l.by);
  if (l.t === "uno") return `${who} annonce « Uno » !`;
  if (l.t === "catch") return `${who} surprend ${nameOf(s, l.to)} sans annonce : 2 cartes.`;
  if (l.t === "pass") return `${who} garde sa carte et passe.`;
  const out = l.out ? ` ${nameOf(s, l.out)} atteint 25 cartes et quitte la manche !` : "";
  if (l.t === "draw") {
    if (l.color) return `${who} pioche jusqu'au ${SUITS[l.color][0]} : ${l.n} carte${l.n > 1 ? "s" : ""}.${out}`;
    return (l.n ? `${who} pioche ${l.n} carte${l.n > 1 ? "s" : ""}.` : `${who} passe : la pioche est vide.`) + out;
  }
  return `${who} pose ${cardName(l.card)}${l.jump ? " à la volée" : ""}`
    + (l.to ? ` et échange sa main avec ${nameOf(s, l.to)}` : "")
    + (l.card[1] === "a" && l.n ? `, et ${l.n} autre${l.n > 1 ? "s" : ""} de la même couleur` : "")
    + (l.card[1] === "x" ? " : tout se retourne !" : "") + "." + out;
}

const FLY = 450;
// Place laissée à une carte qu'on ne peut pas jouer, par rapport à une carte jouable.
const TIGHT = 0.3;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Cartes piochées par le dernier coup : elles partent une par une, à `gapOf` ms d'écart.
const drawnBy = (l) => (l?.t === "draw" && l.n ? [l.by, l.n] : l?.t === "catch" ? [l.to, 2] : [null, 0]);
const gapOf = (n) => Math.min(170, 1500 / n);

// Une carte posée part du pion de son joueur ; une carte piochée quitte la pioche
// pour rejoindre le sien. L'écran pouvant être redessiné en plein vol, l'animation
// reprend là où elle en était.
function fly(s, seatOf, top, deck) {
  const l = s.last;
  if (!l || still()) return;
  const elapsed = performance.now() - ui.movedAt;
  const [drawer, count] = drawnBy(l);
  const gap = gapOf(count);
  if (elapsed >= FLY + Math.max(count - 1, 0) * gap) return;
  const ghosts = Array.from({ length: count }, () => deck.appendChild(h("span", { class: "ucard u-back u-ghost" })));
  requestAnimationFrame(() => {
    if (!top.isConnected) return;
    const run = (card, id, frames, delay = 0) => {
      const seat = seatOf(id);
      if (!seat) return;
      const a = seat.querySelector(".pawn-disc").getBoundingClientRect(), b = card.getBoundingClientRect();
      const at = `translate(${a.x + a.width / 2 - b.x - b.width / 2}px, ${a.y + a.height / 2 - b.y - b.height / 2}px) scale(.3)`;
      card.animate(frames(at), { duration: FLY, delay, fill: "backwards", easing: "cubic-bezier(.3, .7, .3, 1)" }).currentTime = elapsed;
    };
    if (l.t === "play") run(top, l.by, (at) => [{ transform: `${at} rotate(-50deg)`, opacity: .3 }, { transform: "rotate(-4deg)", opacity: 1 }]);
    ghosts.forEach((ghost, i) =>
      run(ghost, drawer, (at) => [{ transform: "none", opacity: 1 }, { opacity: 1, offset: .8 }, { transform: at, opacity: 0 }], i * gap));
  });
}

// Le son du coup qui vient d'arriver.
function cue(s, me) {
  const l = s.last;
  if (s.phase === "end" || s.phase === "recap") return play("win");
  if (s.phase !== "play") return;
  if (!l) return play("shuffle");
  const harsh = l.card && (drawOf(l.card) || "ko".includes(l.card[1]) && isWild(l.card));
  play(l.card?.[1] === "x" ? "shuffle" : { play: harsh ? "malus" : "card", draw: "draw", uno: "uno", catch: "catch" }[l.t]);
  // Une pioche de plusieurs cartes s'entend carte par carte.
  if (l.t === "draw") for (let i = 1; i < Math.min(l.n, 10); i++) setTimeout(() => play("draw"), i * gapOf(l.n));
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
      isHost: id === room.meta.hostUid, isMe: id === me, turn: id === cur, out: !!s.gone?.[id],
      bubble: s.phase === "play" && s.counts?.[id] === 1 && s.unsaid !== id ? "Uno !" : null,
      note: s.gone?.[id] != null ? "éliminé"
        : `${s.counts?.[id] ?? "…"} carte${s.counts?.[id] === 1 ? "" : "s"}${s.rules.rounds > 1 ? ` · ${s.totals?.[id] || 0} pts` : ""}`
    }
  ));
  const flip = s.rules.deck === "flip";
  const other = dark(s) ? "l" : "d";
  const top = s.phase === "play" && cardNode(s.top, { cls: "is-top", side: s.side });
  // Au Flip, la pioche montre l'autre face de sa première carte, comme dans la boîte.
  const deck = top && (flip && s.deckPeek
    ? cardNode(s.deckPeek, { cls: "u-deck", side: other })
    : h("span", { class: "ucard u-back u-deck", role: "img" }));
  if (deck) {
    deck.setAttribute("aria-label", `Pioche : ${s.deckCount} cartes`);
    deck.append(h("span", { class: "u-count" }, String(s.deckCount ?? "")));
  }
  const hunt = s.hunt && (s.hunt === "?" ? "Roulette : la victime choisit une couleur et pioche jusqu'à elle"
    : `Pioche jusqu'au ${SUITS[s.hunt][0]}`);
  if (top) fly(s, (id) => seats[around.indexOf(id)], top, deck);
  const round = roundTable(seats, s.phase === "play" ? [
      h("div", { class: "piles" },
        deck, top),
      h("div", { class: "u-status" },
        h("small", { class: `suit-chip u-${s.color}` }, icon(SUITS[s.color][1]), SUITS[s.color][0]),
        s.penalty > 0 && h("strong", { class: "malus", title: "Malus en attente" }, `+${s.penalty}`),
        hunt && h("strong", { class: "malus", title: hunt }, s.hunt === "?" ? "?" : icon(SUITS[s.hunt][1])))
    ] : h("strong", null, s.phase === "end" ? "Fin" : s.phase === "recap" ? "Manche" : "Uno"), Math.PI / 2);
  // La main des autres, dos visible, posée sur la table devant leur pion.
  if (s.phase === "play" && n <= 10) around.forEach((id, i) => {
    if (id === me || s.gone?.[id]) return;
    const angle = (2 * Math.PI * i) / n + Math.PI / 2;
    // Au Flip, on voit l'autre face des cartes adverses ; sinon, leur dos.
    const faces = flip ? (s.peeks?.[id] || "").match(/../g) || [] : [];
    const fan = h("div", { class: "u-fan", "aria-hidden": "true" },
      Array.from({ length: Math.min(s.counts?.[id] || 0, flip ? 12 : 8) }, (_, k) => (faces[k]
        ? h("span", { class: `ucard u-${faces[k][0]}${other === "d" ? " is-dark" : ""}` },
          h("span", { class: "ucard-mid" }, isWild(faces[k]) ? "★" : isNumber(faces[k]) ? faces[k][1] : "!"))
        : h("span", { class: "ucard u-back" }))));
    [...fan.children].forEach((card, k, all) => { card.style.rotate = `${(k - (all.length - 1) / 2) * 7}deg`; });
    fan.style.left = `${50 + 25 * Math.cos(angle)}%`;
    fan.style.top = `${50 + 24.5 * Math.sin(angle)}%`;
    fan.style.setProperty("--turn", `${angle - Math.PI / 2}rad`);
    round.append(fan);
  });
  return h("section", { class: "felt-zone" },
    round,
    s.phase === "play" && h("p", { class: "rule" }, `Sens du jeu : ${s.dir > 0 ? "horaire ↻" : "inverse ↺"} · ${story(s)}`));
}

// Les quatre familles du côté en cours.
const suitButtons = (s, pick, disabled) => [...colorsOf(s)].map((color) =>
  h("button", { class: `btn suit-btn u-${color}${dark(s) ? " is-dark" : ""}`, type: "button", disabled, onclick: () => pick(color) },
    icon(SUITS[color][1]), SUITS[color][0]));

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
        ? suitButtons(s, (color) => send(ctx, { ...base, color }))
        : s.order.filter((id) => id !== me && !s.gone?.[id]).map((id) => btn(`${nameOf(s, id)} (${s.counts?.[id] ?? 0})`, { ...base, target: id })),
      h("button", { class: "btn btn-mini", type: "button", onclick: () => { ui.pick = null; ctx.refresh(); } }, "Annuler"));
  }
  // Roulette : la victime choisit la couleur qu'elle va chercher dans la pioche.
  if (mine && s.hunt === "?") {
    return h("div", { class: "u-actions" },
      h("b", null, "Roulette ! Quelle couleur vas-tu chercher ?"),
      suitButtons(s, (color) => send(ctx, { t: "draw", color }), waiting));
  }
  return h("div", { class: "u-actions" },
    mine && (s.hunt ? btn(`Piocher jusqu'au ${SUITS[s.hunt][0]}`, { t: "draw" }, "btn-brick")
      : s.penalty > 0 ? btn(`Piocher ${s.penalty} cartes`, { t: "draw" }, "btn-brick")
      : s.drawn ? btn("Garder et passer", { t: "pass" })
      : btn("Piocher", { t: "draw" })),
    (s.unsaid === me || (s.rules.callUno && mine && hand.length === 2 && s.called !== me)) && btn("Uno !", { t: "uno" }, "btn-ink"),
    s.unsaid && s.unsaid !== me && s.order.includes(me) && btn(`Contre-Uno : ${nameOf(s, s.unsaid)}`, { t: "catch" }, "btn-brick"));
}

function handZone(ctx) {
  const { state: s, me } = ctx;
  if (!s.order.includes(me)) return h("p", { class: "rule" }, "Tu regardes cette partie : tu joueras la prochaine.");
  if (s.gone?.[me] != null) return h("p", { class: "rule" }, "Pas de pitié : 25 cartes, tu quittes la manche. Regarde les autres s'entre-déchirer.");
  const hand = ctx.watch(`uno/${ctx.code}/${s.g}/hands/${me}`) || [];
  const mine = s.order[s.turn] === me;
  const waiting = !!ctx.myAction;
  const choose = (i) => {
    const card = hand[i], f = face(s, card);
    const need = isWild(f) && f[1] !== "o" ? "color" : s.rules.sevenZero && f[1] === "7" && hand.length > 1 ? "target" : null;
    if (!need) return send(ctx, { t: "play", i, card });
    ui.pick = { i, card, need };
    ctx.refresh();
  };
  const seen = {};
  const cards = hand.map((card, i) => ({ card, i }))
    .map((x) => ({ ...x, f: face(s, x.card) }))
    .sort((a, b) => ORDER.indexOf(a.f[0]) - ORDER.indexOf(b.f[0]) || a.f.localeCompare(b.f))
    // key : la carte et son rang parmi ses doubles, pour distinguer deux cartes identiques.
    .map((x) => ({ ...x, key: `${x.card}#${(seen[x.card] = (seen[x.card] || 0) + 1)}` }));
  // Les cartes que je viens de piocher (les dernières de la main) arrivent une par une.
  const [drawer, count] = drawnBy(s.last);
  const fresh = drawer === me ? count : 0;
  const gap = gapOf(fresh);
  const elapsed = performance.now() - ui.movedAt;
  const reveal = fresh > 0 && !still() && elapsed < FLY + fresh * gap + 260;
  // Ce qui se joue (à mon tour : les cartes jouables ; sinon : la couleur en jeu) prend de la place
  // dans l'éventail, le reste se tasse (poids TIGHT). Rien à mettre en avant : toutes pareilles.
  const marks = cards.map(({ f, i }) => {
    const ok = !waiting && playable(s, me, hand, i);
    return { ok, state: ok ? " is-playable" : mine ? " is-dim" : f[0] === s.color ? " is-color" : "" };
  });
  const any = marks.some((m) => m.ok || m.state === " is-color");
  const weight = marks.map((m) => (!any || m.ok || m.state === " is-color" ? 1 : TIGHT));
  const total = cards.length;
  const sum = weight.slice(0, -1).reduce((a, b) => a + b, 0) || 1;
  // Inclinaison maximale des bords : moins forte pour une grosse main, pour laisser la place aux cartes.
  const tilt = Math.min(18, total * 2, 180 / total);
  let before = 0;
  const nodes = cards.map(({ f, i, key }, k) => {
    const { ok, state } = marks[k];
    const node = cardNode(f, {
      side: s.side, onclick: () => choose(i), disabled: !ok,
      cls: `${state}${ui.pick?.i === i ? " is-picked" : ""}${ui.hover === key ? " is-hover" : ""}${ui.chosen === key ? " is-chosen" : ""}`
    });
    // Place dans l'éventail, selon la place réellement prise : le milieu droit, les bords penchés et un peu plus bas.
    const angle = total > 1 ? (before / sum * 2 - 1) * tilt : 0;
    node.style.setProperty("--fan", `${angle}deg`);
    node.style.setProperty("--lift", `${Math.abs(angle) * 0.5}px`);
    // --wt : la part de cette carte que la suivante laisse voir.
    if (k > 0) node.style.setProperty("--wt", weight[k - 1]);
    before += weight[k];
    node.dataset.card = key;
    const nth = i - (hand.length - fresh);
    if (reveal && nth >= 0) {
      node.animate([{ opacity: 0, translate: "0 -46px", scale: ".5" }, { opacity: 1 }],
        { duration: 260, delay: FLY * .7 + nth * gap, fill: "backwards", easing: "ease-out" }).currentTime = elapsed;
    }
    return node;
  });
  // Au doigt, ou à la souris dans une grosse main, on ne joue pas d'un seul geste : la carte choisie
  // s'affiche en grand, et c'est « Jouer » (ou un second geste sur elle) qui la pose.
  const confirm = matchMedia("(pointer: coarse)").matches || total > CROWD;
  const picked = confirm && cards.find(({ key }) => key === ui.chosen);
  const pickedOk = picked && marks[cards.indexOf(picked)].ok;
  const preview = confirm && h("div", { class: "u-preview" }, picked
    ? [cardNode(picked.f, { side: s.side, cls: `u-big${pickedOk ? " is-playable" : ""}` }),
      h("div", { class: "u-preview-side" },
        pickedOk
          ? h("button", { class: "btn btn-brick btn-big", type: "button", onclick: () => choose(picked.i) }, "Jouer")
          : h("p", { class: "rule" }, mine ? "Pas jouable maintenant" : "Ce n'est pas ton tour"),
        h("button", { class: "btn btn-mini", type: "button", onclick: () => { ui.chosen = null; ctx.refresh(); } }, "Fermer"))]
    : h("p", { class: "rule" }, "Choisis une carte pour la voir en grand, puis joue-la."));
  return h("section", { class: "felt-zone" },
    controls(ctx, hand),
    preview,
    fanOf(nodes, total > 1 ? tilt : 0, sum, confirm, () => ctx.refresh()));
}

// Au-delà de CROWD cartes, même à la souris, un clic choisit la carte au lieu de la jouer.
const CROWD = 12;
// Un toucher à moins de SNAP pixels d'une carte qui se joue la choisit, même tombé sur le tas.
const SNAP = 24;

// L'éventail. Le pointeur ne vise pas les cartes elles-mêmes (elles bougent quand on les survole,
// ce qui faisait sauter d'une carte à l'autre) : chaque carte a une place fixe, mesurée avant tout
// survol ; une carte qui se joue, posée devant le tas, compte en entier, les autres par leur bande visible.
// Souris : le survol lève la carte, un clic la joue (avec confirm : la choisit, comme le doigt).
// Doigt : toucher ou glisser choisit la carte, qui reste levée et s'affiche en grand (onPick).
// Un second geste sur la carte déjà choisie la joue.
function fanOf(nodes, tilt, sum, confirm, onPick) {
  const hand = h("div", { class: "hand", role: "group", "aria-label": "Ta main", style: `--sum: ${sum}; --tilt: ${tilt / 18}` }, nodes);
  let boxes = null, downX = 0, before = null, kind = "mouse";
  const measure = () => {
    boxes ||= nodes.map((node) => {
      const r = node.getBoundingClientRect(), dx = parseFloat(getComputedStyle(node).translate) || 0;
      return { left: r.left - dx, right: r.right - dx, front: node.matches(".is-playable, .is-color") };
    });
    return boxes;
  };
  const at = (x, finger) => {
    const all = measure();
    // Les cartes qui se jouent passent devant le tas : sous le pointeur, elles l'emportent.
    const front = all.findLastIndex((b) => b.front && x >= b.left && x < b.right);
    if (front >= 0) return nodes[front];
    if (finger) {
      let best = -1, near = SNAP;
      all.forEach((b, k) => {
        const gap = x < b.left ? b.left - x : x - b.right;
        if (b.front && gap < near) { near = gap; best = k; }
      });
      if (best >= 0) return nodes[best];
    }
    let k = 0;
    while (k < all.length - 1 && x >= all[k + 1].left) k++;
    return nodes[k];
  };
  const point = (node) => {
    for (const other of nodes) other.classList.toggle("is-hover", other === node);
    ui.hover = node?.dataset.card ?? null;
  };
  // Le geste sur la carte déjà choisie la joue ; sinon il la choisit.
  const pick = (node) => {
    if (node.dataset.card === before) return node.click();
    ui.chosen = node.dataset.card;
    onPick();
  };
  const finger = (e) => e.pointerType !== "mouse";
  hand.addEventListener("pointerdown", (e) => { downX = e.clientX; before = ui.chosen; kind = e.pointerType; });
  hand.addEventListener("pointermove", (e) => nodes.length && (!finger(e) || e.buttons || e.pressure) && point(at(e.clientX, finger(e))));
  hand.addEventListener("pointerleave", (e) => { if (!finger(e)) { point(null); boxes = null; } });
  hand.addEventListener("pointerup", (e) => {
    if (!finger(e) || !nodes.length) return;
    const node = at(e.clientX, true);
    ui.hover = null;
    // Le doigt a glissé : on choisit la carte où il s'arrête, sans jamais la jouer.
    if (Math.abs(e.clientX - downX) > 12) before = null;
    pick(node);
  });
  hand.addEventListener("click", (e) => {
    if (e.target.closest(".ucard") || !nodes.length) return; // clavier : le bouton s'en charge
    if (kind !== "mouse") return; // le doigt : pointerup s'en charge
    const node = at(e.clientX);
    if (confirm) pick(node); else node.click();
  });
  return hand;
}

const person = ({ state: s, room, me }, id) =>
  ({ name: nameOf(s, id), index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me });

const verdict = (s) => (s.order.every((id) => id === s.winner || s.gone?.[id] != null) && s.gone
  ? `${nameOf(s, s.winner)} reste seul en lice` : `${nameOf(s, s.winner)} n'a plus de carte`);

// Entre deux manches : les points de la manche, le cumul, et la suite qui arrive.
function recapPanel(ctx) {
  const { state: s, isHost } = ctx;
  const ranked = [...s.order].sort((a, b) => (s.totals?.[a] || 0) - (s.totals?.[b] || 0));
  return h("section", { class: "sheet finale" },
    h("h2", null, `Fin de la manche ${s.round} sur ${s.rules.rounds}`),
    h("p", { class: "verdict" }, verdict(s)),
    h("p", { class: "rule" }, "Les points restés en main s'ajoutent au score : le moins possible, c'est le mieux."),
    h("ol", { class: "roles-list" }, ranked.map((id) =>
      h("li", null, h("span", null, nameOf(s, id)), h("b", null, `+${s.left?.[id] || 0} · ${s.totals?.[id] || 0} pts`)))),
    h("p", null, "Manche suivante dans ", countdown(s.until, ctx.now)),
    isHost && h("button", { class: "btn btn-brick", type: "button", onclick: () => nextRound(ctx) }, icon("play"), "Distribuer tout de suite"));
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const score = (id) => s.totals?.[id] ?? s.left?.[id] ?? 0;
  const ranked = [...s.order].sort((a, b) => score(a) - score(b));
  const many = s.rules.rounds > 1;
  const again = h("button", { class: "btn btn-brick btn-big", type: "button", onclick: () => ctx.backToLobby() }, icon("play"), "Rejouer");
  return h("section", { class: "sheet finale" },
    h("h2", null, many ? "Classement final" : "Fin de la manche"),
    h("p", { class: "verdict" }, many ? `${nameOf(s, ranked[0])} remporte la partie` : verdict(s)),
    ranking({ ids: s.order, score, low: true, person: (id) => person(ctx, id), label: (id) => `${score(id)} pts`, key: s.g }),
    h("p", { class: "rule" }, many ? `Points restés en main, cumulés sur ${s.rules.rounds} manches : le moins possible, c'est le mieux.`
      : "Points restés en main : le moins possible, c'est le mieux."),
    isHost ? again : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon."));
}

export function view(ctx) {
  const { state: s, me } = ctx;
  const key = `${s.g}/${s.step}`;
  if (ui.key !== key) { ui.key = key; ui.pick = null; }
  const move = `${s.g}/${s.round}/${s.phase}/${s.moves || 0}`;
  if (ui.move !== move) { Object.assign(ui, { move, movedAt: performance.now() }); cue(s, me); }
  const cur = s.order[s.turn];
  const title = s.phase === "deal" ? "On distribue…" : s.phase === "end" ? "Rideau" : s.phase === "recap" ? "Fin de la manche"
    : cur === me ? "À toi de jouer" : `Au tour de ${nameOf(s, cur)}`;
  // Un seul bloc sur toute la largeur du tapis : la table au centre, la main dessous.
  return h("div", { class: `uno-board${s.phase === "play" && dark(s) ? " is-dark" : ""}` },
    h("header", { class: "uno-head" },
      h("p", { class: "eyebrow" }, `${DECKS[s.rules.deck] || "Uno"}${s.rules.rounds > 1 ? ` · manche ${s.round} sur ${s.rules.rounds}` : ""}`),
      h("h1", null, title, s.phase === "play" && s.until && [" ", countdown(s.until, ctx.now)])),
    table(ctx),
    s.phase === "play" && handZone(ctx),
    s.phase === "recap" && recapPanel(ctx),
    s.phase === "end" && endPanel(ctx),
    s.phase !== "deal" && chatBox(ctx));
}
