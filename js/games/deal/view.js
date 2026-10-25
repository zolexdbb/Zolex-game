// Capy Deal : l'écran de jeu. La table ronde (chacun devant ses cartes posées), la pioche et la
// dernière carte au centre, la réponse attendue, puis la main en éventail.
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, ranking } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { GROUPS } from "./cards.js";
import { dealCard, cardBack, rulesCard, rich } from "./card-view.js";
import { man } from "./capy.js";
import {
  info, colorsOf, needOf, complete, completeCount, rentOf, cabanesOf, propCards, valueOf, assetsOf,
  others, owesNow, KINDS, COLORS, GOAL
} from "./logic.js";

// chosen : carte de la main affichée en grand ; plan : cible, couleur, type et choix du coup en préparation ;
// zone : joueur dont la zone est ouverte en grand ; pay, keep, give, drop : choix d'une réponse en cours.
// heard : dernière étape déjà sonorisée.
const ui = { key: null, heard: null, chosen: null, plan: {}, zone: null, rules: false, pay: [], keep: null, give: {}, drop: [] };
const reset = () => Object.assign(ui, { chosen: null, plan: {}, pay: [], keep: null, give: {}, drop: [] });

const nameOf = (s, id) => s.names?.[id]?.name || "Un joueur";
const who = (s, id, me) => (id === me ? "toi" : nameOf(s, id));
const cardName = (card) => {
  const t = info(card);
  return t.kind === "money" ? `${t.value} mandarines` : t.kind === "wild" ? "un joker propriété" : t.name;
};
const coins = (n) => [String(n), man()];
const send = (ctx, payload) => { reset(); return ctx.act(payload).catch(() => ctx.refresh()); };
const sum = (cards) => cards.reduce((n, c) => n + valueOf(c), 0);

// ---- La table ----

// Une pile de propriétés d'une couleur, avec son compteur aux couleurs du groupe.
function stack(s, id, color, cards) {
  const full = complete(s, id, color), g = GROUPS[color];
  return h("div", { class: "d-stack", title: g.name },
    cards.map((c) => dealCard(info(c), { cls: "is-mini" })),
    h("span", { class: `d-chip${full ? " is-full" : ""}`, style: `--chip: ${g.color}; --chip-ink: ${g.ink}` },
      `${Math.min(cards.length, needOf(color))}/${needOf(color)}`, full && " ★"));
}

const debt = (s, id, cls = "") => h("span", { class: `d-debt pawn-${(s.names?.[id]?.pawn ?? 0) % 8} ${cls}`, title: `Jeton Dette de ${nameOf(s, id)}` },
  nameOf(s, id).charAt(0).toUpperCase());

// Ce qu'un joueur a posé devant lui : propriétés par couleur, réserve en tas, jetons.
function front(ctx, id) {
  const { state: s } = ctx;
  const groups = Object.entries(s.props?.[id] || {});
  const bank = s.bank?.[id] || [], tokens = s.tokens?.[id] ?? 0, held = s.held?.[id] || [];
  return h("button", { class: "d-front", type: "button", title: "Voir en grand", onclick: () => { ui.zone = id; ctx.refresh(); } },
    h("div", { class: "d-props" }, groups.length ? groups.map(([color, cards]) => stack(s, id, color, cards)) : h("span", { class: "d-empty" }, "Aucune propriété")),
    h("div", { class: "d-goods" },
      h("div", { class: "d-pile", title: "Réserve" },
        bank.length ? dealCard(info(bank.at(-1)), { cls: "is-mini" }) : h("span", { class: "d-hole" }),
        h("span", { class: "d-badge" }, String(bank.length)), h("span", { class: "d-sum" }, coins(sum(bank)))),
      h("div", { class: "d-pile", title: "Ses jetons Dette" },
        h("div", { class: "d-dstack" }, tokens ? Array.from({ length: Math.min(tokens, 3) }, () => debt(s, id)) : h("span", { class: "d-hole is-round" })),
        h("span", { class: "d-badge" }, String(tokens)), h("span", { class: "d-tiny" }, "dette")),
      held.length > 0 && h("div", { class: "d-pile", title: "Jetons des autres" },
        h("div", { class: "d-held" }, held.map((from) => debt(s, from, "is-small"))), h("span", { class: "d-tiny" }, "dû par"))));
}

// La main des autres : le dos de leurs cartes, en éventail.
function backs(n) {
  const fan = h("div", { class: "d-backs", "aria-hidden": "true" }, Array.from({ length: Math.min(n, 8) }, () => cardBack("is-mini")));
  [...fan.children].forEach((c, k, all) => { c.style.rotate = `${(k - (all.length - 1) / 2) * 7}deg`; });
  return fan;
}

// Les places autour de la table : toi en bas, puis les autres dans l'ordre du tour.
const PLACES = { 2: ["bottom", "top"], 3: ["bottom", "left", "right"], 4: ["bottom", "left", "top", "right"], 5: ["bottom", "left", "top-left", "top-right", "right"] };

function table(ctx) {
  const { state: s, room, me } = ctx;
  const n = s.order.length, shift = Math.max(s.order.indexOf(me), 0);
  const around = s.order.map((_, i) => s.order[(i + shift) % n]);
  const places = PLACES[n] || PLACES[5];
  const cur = s.order[s.turn], waiting = s.wait?.who;
  const seats = around.map((id, i) => h("div", { class: `d-seat is-${places[i]}` },
    h("div", { class: "d-who" },
      pawn({ name: nameOf(s, id), index: s.names[id].pawn, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar },
        { isMe: id === me, turn: id === cur, isHost: id === room.meta.hostUid, bubble: id === waiting && id !== cur ? "…" : null,
          note: `${s.counts?.[id] ?? 0} carte${s.counts?.[id] === 1 ? "" : "s"} · ${completeCount(s, id)}/${GOAL} ★` }),
      id !== me && backs(s.counts?.[id] || 0)),
    front(ctx, id)));
  const deck = h("div", { class: "d-pile is-deck", title: "Pioche" }, cardBack(), h("span", { class: "d-badge" }, String(s.deckCount ?? 0)));
  return h("section", { class: `d-round is-${n}` },
    h("div", { class: "d-wood" }, deck, s.top ? dealCard(info(s.top)) : h("span", { class: "d-hole is-big" })),
    seats);
}

// ---- Les sons : ceux du Uno, une fois par coup ----

// Les cartes qui font payer ou qui volent sonnent comme un malus.
const HARSH = ["kaching", "pasdebol", "fisc", "saisie", "krach", "cambriolage", "arnaque", "groscoup", "rafle", "ardoise"];

function cue(ctx) {
  const { state: s, me } = ctx;
  const key = `${s.g}/${s.step}`;
  if (ui.heard === key) return;
  ui.heard = key;
  if (s.phase === "end") return play("win");
  const l = s.last;
  if (s.phase !== "play") return;
  if (!l) return play("shuffle");
  const t = l.card && info(l.card);
  const sound = {
    draw: "draw", bank: "card", prop: "card", move: "card", repay: "card", discard: "card", fisc: "card", saisie: "card",
    play: t && (t.kind === "rent" || HARSH.includes(t.id)) ? "malus" : "card", non: "catch", cancel: "catch",
    pay: l.short ? "malus" : "card", hit: l.effect === "pasdebol" ? "draw" : "card"
  }[l.t];
  if (sound) play(sound);
  // Une pioche de plusieurs cartes s'entend carte par carte.
  if (l.t === "draw") for (let i = 1; i < Math.min(l.n, 5); i++) setTimeout(() => play("draw"), i * 110);
  if (s.order[s.turn] === me && !s.wait && (l.t === "end" || l.t === "discard") && l.by !== me) setTimeout(() => play("turn"), 400);
}

// ---- Le journal : le dernier coup, en une phrase ----

function story(ctx) {
  const { state: s, me } = ctx;
  const l = s.last;
  if (!l) return "La partie commence";
  const mine = l.by === me;
  // Le sujet et son verbe : « Tom pioche », « tu pioches ».
  const say = (verb, yours = `${verb}s`) => (mine ? `Tu ${yours}` : `${nameOf(s, l.by)} ${verb}`);
  const to = l.to && who(s, l.to, me);
  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  switch (l.t) {
    case "draw": return `${say("pioche")} ${plural(l.n, "carte")}`;
    case "bank": return `${say("met", "mets")} ${cardName(l.card)} en réserve`;
    case "prop": return `${say("pose")} ${cardName(l.card)}`;
    case "move": return `${say("déplace")} un joker vers le ${GROUPS[l.color].name.toLowerCase()}`;
    case "play": return `${say("joue")} ${cardName(l.card)}${l.target ? ` contre ${who(s, l.target, me)}` : ""}`;
    case "non": return `${say("dit", "dis")} « Non ! »`;
    case "cancel": return "L'action est annulée";
    case "pay": {
      const debtNote = l.short ? " et donne un jeton Dette" : "";
      return l.to === me ? `${nameOf(s, l.by)} te paie ${l.paid}${debtNote}` : `${say("paie")} ${l.paid} à ${to}${debtNote}`;
    }
    case "repay": return l.to === me ? `${nameOf(s, l.by)} te rembourse d'une carte` : `${say("rembourse")} ${to} d'une carte`;
    case "fisc": case "saisie": return `${say("répartit", "répartis")} ${plural(l.n, "carte")}`;
    case "hit": return l.effect === "pasdebol" ? `${l.to === me ? "Tu prends" : `${to} prend`} ${plural(l.got, "carte")}` : `${say("subit", "subis")} l'effet`;
    case "discard": return `${say("défausse")} ${plural(l.n, "carte")}`;
    case "end": return `${say("finit", "finis")} son tour`.replace("Tu finis son", "Tu finis ton");
    default: return "";
  }
}

// ---- Préparer un coup : cible, couleur, type, choix chez chacun ----

// Ce qu'il faut choisir pour jouer une carte action, et si le coup est prêt.
function needs(s, by, card, plan) {
  const t = info(card), opp = others(s, by);
  const list = { target: null, color: null, type: false, picks: null };
  if (t.kind === "rent") list.color = (t.rent === "all" ? COLORS : t.rent).filter((c) => rentOf(s, by, c) > 0);
  else if (["kaching", "pasdebol", "fisc", "saisie", "arnaque", "ardoise"].includes(t.id)) list.target = opp.filter((id) => t.id !== "ardoise" || (s.tokens?.[id] || 0) > 0);
  if (t.id === "groscoup") {
    list.target = opp.filter((id) => COLORS.some((c) => complete(s, id, c)));
    list.color = plan.target ? COLORS.filter((c) => complete(s, plan.target, c)) : [];
  }
  if (t.id === "pasdebol") list.type = true;
  if (t.id === "rafle") list.color = COLORS.filter((c) => opp.some((id) => propCards(s, id).some((x) => colorsOf(x).includes(c))));
  if (t.id === "cabane") list.color = COLORS.filter((c) => (s.props?.[by]?.[c] || []).length > cabanesOf(s, by, c));
  if (t.id === "krach") list.picks = opp.filter((id) => propCards(s, id).length).map((id) => [id, propCards(s, id)]);
  if (t.id === "cambriolage") list.picks = opp.filter((id) => (s.bank?.[id] || []).length).map((id) => [id, s.bank[id]]);
  if (t.id === "arnaque" && !(s.bank?.[by] || []).length) list.blocked = "Ta réserve est vide.";
  const ready = !list.blocked
    && (!list.target || list.target.includes(plan.target))
    && (!list.color || list.color.includes(plan.color))
    && (!list.type || KINDS[plan.type])
    && (!list.picks || Object.keys(plan.picks || {}).length > 0);
  const empty = (list.target && !list.target.length) || (list.color && !list.color.length) || (list.picks && !list.picks.length);
  return { ...list, ready, empty };
}

const choice = (label, on, onclick, style) => h("button", { class: "filter-chip", type: "button", "aria-pressed": String(on), onclick, style }, label);

function builder(ctx, by, card, go) {
  const { state: s, me } = ctx;
  const plan = ui.plan;
  const need = needs(s, by, card, plan);
  const set = (patch) => { Object.assign(plan, patch); ctx.refresh(); };
  const payload = () => ({ t: "play", target: plan.target, color: plan.color, type: plan.type,
    picks: plan.picks ? Object.entries(plan.picks) : undefined });
  return h("div", { class: "d-build" },
    need.blocked && h("p", { class: "d-note-line" }, need.blocked),
    need.empty && h("p", { class: "d-note-line" }, "Impossible pour l'instant : personne ou rien à viser."),
    need.target?.length > 0 && h("div", { class: "filters" }, h("b", null, "Qui ? "),
      need.target.map((id) => choice(nameOf(s, id), plan.target === id, () => set({ target: id, color: null })))),
    need.color?.length > 0 && h("div", { class: "filters" }, h("b", null, "Couleur ? "),
      need.color.map((c) => choice(info(card).kind === "rent" ? [GROUPS[c].name, " · ", ...coins(rentOf(s, by, c) * (info(card).double ? 2 : 1))] : GROUPS[c].name,
        plan.color === c, () => set({ color: c }), `--chip: ${GROUPS[c].color}`))),
    need.type && h("div", { class: "filters" }, h("b", null, "Quoi ? "),
      [["property", "Propriétés"], ["action", "Actions"], ["money", "Argent"]].map(([k, label]) => choice(label, plan.type === k, () => set({ type: k })))),
    need.picks?.map(([id, cards]) => h("div", { class: "d-picks" }, h("b", null, `Chez ${nameOf(s, id)} : `),
      h("div", { class: "d-pick-row" }, cards.map((c) => h("button", {
        class: `d-pick${plan.picks?.[id] === c ? " is-on" : ""}`, type: "button", title: cardName(c),
        onclick: () => set({ picks: { ...(plan.picks || {}), [id]: plan.picks?.[id] === c ? undefined : c } })
      }, dealCard(info(c), { cls: "is-mini" })))))),
    h("button", { class: "btn btn-brick", type: "button", disabled: !need.ready || !!ctx.myAction, onclick: () => {
      const p = payload();
      if (p.picks) p.picks = p.picks.filter(([, c]) => c);
      go(p);
    } }, "Jouer cette carte"));
}

// ---- La carte choisie dans la main, en grand, avec ce qu'on peut en faire ----

function explain(s, me, card) {
  const t = info(card);
  if (t.kind === "property" || t.kind === "wild") {
    // Le joker toutes couleurs n'a pas de groupe à détailler.
    if (t.kind === "wild" && !t.groups) return [h("li", null, "Se pose dans n'importe quel groupe. Ne vaut rien en réserve.")];
    return colorsOf(card).map((c) => h("li", null,
      `${GROUPS[c].name} : tu en as ${(s.props?.[me]?.[c] || []).length}/${needOf(c)}, loyer actuel `, ...coins(rentOf(s, me, c))));
  }
  if (t.kind === "money") return [h("li", null, "Se pose dans ta réserve pour payer plus tard.")];
  return [h("li", null, rich(t.text)), h("li", null, "Ou en réserve, pour sa valeur : ", ...coins(t.value), ".")];
}

function preview(ctx) {
  const { state: s, me } = ctx;
  const hand = ctx.watch(`deal/${ctx.code}/${s.g}/hands/${me}`) || [];
  const card = hand.includes(ui.chosen) ? ui.chosen : null;
  if (!card) return h("p", { class: "d-hint" }, "Touche une carte de ta main pour la voir en grand.");
  const t = info(card), cur = s.order[s.turn];
  const mine = cur === me && !s.wait && s.drawn && !ctx.myAction;
  const debt = owesNow(s, me);
  const can = mine && s.left > 0;
  const buttons = [];
  if (mine && debt) {
    buttons.push(h("button", { class: "btn btn-brick", type: "button", onclick: () => send(ctx, { t: "repay", card }) }, `Donner à ${nameOf(s, debt.to)}`));
  } else if (can) {
    if (t.kind === "property") buttons.push(h("button", { class: "btn btn-brick", type: "button", onclick: () => send(ctx, { t: "prop", card, color: t.group }) }, "Poser devant moi"));
    if (t.kind === "wild") buttons.push(h("div", { class: "filters" }, h("b", null, "Poser en : "),
      colorsOf(card).map((c) => choice(GROUPS[c].name, false, () => send(ctx, { t: "prop", card, color: c }), `--chip: ${GROUPS[c].color}`))));
    if (t.kind !== "property" && t.kind !== "wild") buttons.push(h("button", { class: "btn btn-cream", type: "button", onclick: () => send(ctx, { t: "bank", card }) }, "En réserve"));
    if ((t.kind === "action" || t.kind === "rent") && t.id !== "non") buttons.push(builder(ctx, me, card, (p) => send(ctx, { ...p, card })));
  }
  return h("div", { class: "d-preview" },
    dealCard(t, { cls: "is-big" }),
    h("div", { class: "d-preview-side" },
      h("h3", null, cardName(card)),
      h("ul", { class: "d-explain" }, explain(s, me, card)),
      t.id === "non" && h("p", { class: "d-note-line" }, "Se joue quand on agit contre toi : le bouton apparaît à ce moment-là."),
      buttons,
      mine && debt && h("p", { class: "d-note-line" }, `Tu dois d'abord rembourser ${nameOf(s, debt.to)} : choisis la carte à lui donner.`),
      h("button", { class: "btn btn-mini", type: "button", onclick: () => { reset(); ctx.refresh(); } }, "Fermer")));
}

// ---- Les réponses attendues ----

function prompt(ctx) {
  const { state: s, me } = ctx;
  const w = s.wait;
  const cur = s.order[s.turn];
  if (!w) {
    if (cur !== me) return h("p", { class: "d-status" }, s.drawn ? `${nameOf(s, cur)} joue…` : `${nameOf(s, cur)} pioche…`);
    const debt = owesNow(s, me);
    if (debt) return h("p", { class: "d-status is-me" }, `Tu dois rembourser ${nameOf(s, debt.to)} : choisis une carte de ta main à lui donner.`);
    return null;
  }
  if (w.who !== me) {
    const what = w.kind === "discard" ? "défausser" : w.kind === "place" ? "jouer la carte reçue" : w.stage === "counter" ? "répondre au « Non ! »" : "répondre";
    return h("p", { class: "d-status" }, `On attend ${nameOf(s, w.who)} : ${what}…`);
  }
  if (ctx.myAction) return h("p", { class: "d-status is-me" }, "C'est envoyé…");
  const hand = ctx.watch(`deal/${ctx.code}/${s.g}/hands/${me}`) || [];
  const non = hand.find((c) => info(c).id === "non");
  const nonBtn = non && h("button", { class: "btn btn-ink", type: "button", onclick: () => send(ctx, { t: "non", card: non }) }, "Non !");

  if (w.kind === "discard") {
    const ready = ui.drop.length === w.n;
    return h("section", { class: "d-ask" }, h("h3", null, `Trop de cartes : défausse-en ${w.n}`),
      h("p", { class: "d-note-line" }, `Touche ${w.n} carte${w.n > 1 ? "s" : ""} de ta main (${ui.drop.length} choisie${ui.drop.length > 1 ? "s" : ""}).`),
      h("button", { class: "btn btn-brick", type: "button", disabled: !ready, onclick: () => send(ctx, { t: "discard", cards: ui.drop }) }, "Défausser"));
  }
  if (w.kind === "place") {
    const t = info(w.card);
    return h("section", { class: "d-ask" }, h("h3", null, `${nameOf(s, w.from)} te rembourse : joue cette carte tout de suite`),
      h("div", { class: "d-preview" }, dealCard(t, { cls: "is-big" }), h("div", { class: "d-preview-side" },
        t.kind !== "property" && t.kind !== "wild" && h("button", { class: "btn btn-cream", type: "button", onclick: () => send(ctx, { t: "bank" }) }, "En réserve"),
        colorsOf(w.card).length > 0 && h("div", { class: "filters" }, h("b", null, "Poser en : "),
          colorsOf(w.card).map((c) => choice(GROUPS[c].name, false, () => send(ctx, { t: "prop", color: c }), `--chip: ${GROUPS[c].color}`))),
        (t.kind === "action" || t.kind === "rent") && !["non", "rejouer"].includes(t.id) && builder(ctx, me, w.card, (p) => send(ctx, p)))));
  }
  const card = info(w.card);
  if (w.stage === "counter") {
    return h("section", { class: "d-ask" }, h("h3", null, `${nameOf(s, w.target)} te dit « Non ! »`),
      h("p", { class: "d-note-line" }, `Ton ${card.name} est annulé contre ${nameOf(s, w.target)}, sauf si tu réponds par un « Non ! ».`),
      h("div", { class: "d-row" }, nonBtn, h("button", { class: "btn btn-cream", type: "button", onclick: () => send(ctx, { t: "ok" }) }, "Tant pis")));
  }
  const head = h("h3", null, `${nameOf(s, w.by)} joue ${card.name} contre toi`);
  if (w.effect === "pay") {
    const mine = assetsOf(s, me), total = sum(ui.pay), all = ui.pay.length === mine.length;
    const toggle = (c) => { ui.pay = ui.pay.includes(c) ? ui.pay.filter((x) => x !== c) : [...ui.pay, c]; ctx.refresh(); };
    return h("section", { class: "d-ask" }, head,
      h("p", { class: "d-note-line" }, "Tu dois payer ", ...coins(w.amount), " avec ta réserve ou tes propriétés. On ne rend pas la monnaie ; si tout ne suffit pas, tu donnes un jeton Dette."),
      h("div", { class: "d-pick-row" }, mine.map((c) => h("button", { class: `d-pick${ui.pay.includes(c) ? " is-on" : ""}`, type: "button", title: cardName(c), onclick: () => toggle(c) },
        dealCard(info(c), { cls: "is-mini" })))),
      h("div", { class: "d-row" },
        h("button", { class: "btn btn-brick", type: "button", disabled: total < w.amount && !all, onclick: () => send(ctx, { t: "pay", cards: ui.pay }) }, "Payer ", ...coins(total)),
        nonBtn));
  }
  if (w.effect === "fisc" || w.effect === "saisie") {
    const pool = w.effect === "fisc" ? s.bank?.[me] || [] : propCards(s, me);
    const mates = others(s, me);
    const ready = ui.keep && pool.filter((c) => c !== ui.keep).every((c) => ui.give[c]);
    return h("section", { class: "d-ask" }, head,
      h("p", { class: "d-note-line" }, w.effect === "fisc" ? "Garde 1 carte de ta réserve et donne chacune des autres à un joueur."
        : "Garde 1 propriété et donne chacune des autres (cabanes comprises) à un joueur."),
      h("div", { class: "d-split" }, pool.map((c) => h("div", { class: `d-split-row${ui.keep === c ? " is-kept" : ""}` },
        dealCard(info(c), { cls: "is-mini" }),
        choice("Je garde", ui.keep === c, () => { ui.keep = c; delete ui.give[c]; ctx.refresh(); }),
        ui.keep !== c && mates.map((id) => choice(nameOf(s, id), ui.give[c] === id, () => { ui.give[c] = id; ctx.refresh(); }))))),
      h("div", { class: "d-row" },
        h("button", { class: "btn btn-brick", type: "button", disabled: !ready, onclick: () => send(ctx, { t: "split", keep: ui.keep,
          give: pool.filter((c) => c !== ui.keep).map((c) => [c, ui.give[c]]) }) }, "Répartir"),
        nonBtn));
  }
  const what = {
    pasdebol: `Il prend toutes tes cartes « ${{ property: "propriétés", action: "actions", money: "argent" }[w.type]} » en main.`,
    krach: "Il te prend la propriété qu'il a choisie.", cambriolage: "Il te prend la carte de réserve qu'il a choisie.",
    arnaque: "Il échange sa réserve contre la tienne.", groscoup: `Il te prend tout ton groupe ${GROUPS[w.color]?.name.toLowerCase()}, cabanes comprises.`,
    rafle: `Il te prend toutes tes propriétés ${GROUPS[w.color]?.name.toLowerCase()}, jokers compris.`,
    ardoise: "Tu lui donnes un jeton Dette : à ton prochain tour, tu le rembourses d'une carte de ta main."
  }[w.effect];
  return h("section", { class: "d-ask" }, head, h("p", { class: "d-note-line" }, what),
    h("div", { class: "d-row" }, nonBtn, h("button", { class: "btn btn-cream", type: "button", onclick: () => send(ctx, { t: "ok" }) }, "D'accord")));
}

// ---- La main ----

function handZone(ctx) {
  const { state: s, me } = ctx;
  const hand = ctx.watch(`deal/${ctx.code}/${s.g}/hands/${me}`) || [];
  const dropping = s.wait?.kind === "discard" && s.wait.who === me;
  const n = hand.length, mid = (n - 1) / 2;
  return h("div", { class: "d-hand", role: "group", "aria-label": "Ta main" }, hand.map((card, k) => {
    // Sur téléphone, la main montre les cartes « en main » (titre et couleur en gros) ; le détail s'ouvre au toucher.
    const small = matchMedia("(max-width: 700px)").matches ? " is-mini" : "";
    const node = dealCard(info(card), { cls: `${ui.chosen === card ? "is-chosen" : ""}${ui.drop.includes(card) ? " is-dropped" : ""}${small}` });
    const angle = n > 1 ? (k - mid) * Math.min(5, 28 / n) : 0;
    node.style.setProperty("--fan", `${angle}deg`);
    node.style.setProperty("--lift", `${Math.abs(angle) * .8}px`);
    const pick = () => {
      if (dropping) ui.drop = ui.drop.includes(card) ? ui.drop.filter((c) => c !== card) : [...ui.drop, card];
      else { ui.chosen = ui.chosen === card ? null : card; ui.plan = {}; }
      ctx.refresh();
    };
    return h("button", { class: "d-hand-card", type: "button", "aria-label": cardName(card), onclick: pick }, node);
  }));
}

// ---- Une zone en grand ----

// Un groupe dans la zone en grand : compteur, loyer, cabanes, cartes ; ses jokers se déplacent à ton tour.
function zoomGroup(ctx, id, color, cards, myTurn) {
  const { state: s } = ctx;
  const g = GROUPS[color], full = complete(s, id, color), huts = cabanesOf(s, id, color);
  const moves = (c) => myTurn && info(c).kind === "wild" && h("div", { class: "filters" },
    colorsOf(c).filter((x) => x !== color).map((x) =>
      choice(`→ ${GROUPS[x].name}`, false, () => send(ctx, { t: "move", card: c, color: x }), `--chip: ${GROUPS[x].color}`)));
  return h("div", { class: "d-zoom-group" },
    h("div", { class: "d-zoom-label" },
      h("span", { class: `d-chip${full ? " is-full" : ""}`, style: `--chip: ${g.color}; --chip-ink: ${g.ink}` },
        `${g.name} ${Math.min(cards.length, needOf(color))}/${needOf(color)}`, full && " ★"),
      h("span", null, "Loyer ", ...coins(rentOf(s, id, color))),
      huts > 0 && h("span", null, `· ${huts} cabane${huts > 1 ? "s" : ""}`)),
    h("div", { class: "d-zoom-cards" }, cards.map((c) => h("div", { class: "d-zoom-card" }, dealCard(info(c)), moves(c)))));
}

function zoom(ctx) {
  const { state: s, me } = ctx;
  const id = ui.zone;
  const close = () => { ui.zone = null; ctx.refresh(); };
  const myTurn = id === me && s.order[s.turn] === me && !s.wait && s.drawn && !owesNow(s, me) && !ctx.myAction;
  const groups = Object.entries(s.props?.[id] || {});
  const bank = s.bank?.[id] || [];
  return h("div", { class: "d-zoom", onclick: (e) => e.target === e.currentTarget && close() },
    h("section", { class: "sheet d-zoom-in" },
      h("div", { class: "d-row is-head" }, h("h2", null, id === me ? "Ta zone" : `Zone de ${nameOf(s, id)}`),
        h("button", { class: "btn btn-mini", type: "button", onclick: close }, "Fermer")),
      h("p", { class: "d-note-line" }, `${completeCount(s, id)}/${GOAL} groupes complets · ${s.counts?.[id] ?? 0} cartes en main`),
      h("h3", null, "Propriétés"),
      groups.length ? groups.map(([color, cards]) => zoomGroup(ctx, id, color, cards, myTurn))
        : h("p", { class: "d-note-line" }, "Aucune propriété posée."),
      h("h3", null, "Réserve · ", ...coins(sum(bank))),
      bank.length ? h("div", { class: "d-zoom-cards" }, bank.map((c) => dealCard(info(c)))) : h("p", { class: "d-note-line" }, "Réserve vide."),
      h("h3", null, "Jetons Dette"),
      h("p", { class: "d-row" }, `Encore ${s.tokens?.[id] ?? 0} jeton${(s.tokens?.[id] ?? 0) > 1 ? "s" : ""} à donner.`,
        (s.held?.[id] || []).length > 0 && [" Détient : ", (s.held[id]).map((from) => debt(s, from))])));
}

function rulesSheet(ctx) {
  const close = () => { ui.rules = false; ctx.refresh(); };
  return h("div", { class: "d-zoom", onclick: (e) => e.target === e.currentTarget && close() },
    h("div", { class: "d-rules-box" }, rulesCard(), h("button", { class: "btn btn-cream", type: "button", onclick: close }, "Fermer")));
}

// ---- Fin de partie ----

function endPanel(ctx) {
  const { state: s, room, isHost, me } = ctx;
  const person = (id) => ({ name: nameOf(s, id), index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me });
  const score = (id) => completeCount(s, id);
  return h("section", { class: "sheet finale" },
    h("h2", null, "Partie terminée"),
    h("p", { class: "verdict" }, `${nameOf(s, s.winner)} pose ${GOAL} groupes complets`),
    ranking({ ids: s.order, score, person, label: (id) => `${score(id)} groupe${score(id) > 1 ? "s" : ""}`, key: s.g }),
    isHost ? h("button", { class: "btn btn-brick btn-big", type: "button", onclick: () => ctx.backToLobby() }, icon("play"), "Rejouer")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon."));
}

export function view(ctx) {
  const { state: s, me } = ctx;
  const key = `${s.g}/${s.wait?.kind || ""}/${s.wait?.who || ""}/${s.wait?.target || ""}/${s.turn}`;
  if (ui.key !== key) { ui.key = key; Object.assign(ui, { pay: [], keep: null, give: {}, drop: [] }); }
  if (s.phase === "deal") return h("div", { class: "deal-board" }, h("p", { class: "rule" }, "On distribue…"));
  cue(ctx);
  const cur = s.order[s.turn];
  const mine = cur === me && !s.wait && s.drawn && s.phase === "play";
  const playing = s.order.includes(me);
  return h("div", { class: "deal-board" },
    h("header", { class: "d-head" },
      h("p", { class: "eyebrow" }, story(ctx)),
      h("h1", null, s.phase === "end" ? "Rideau" : cur === me ? "À toi de jouer" : `Au tour de ${nameOf(s, cur)}`,
        mine && [" ", h("span", { class: "d-pill" }, `${s.left} action${s.left > 1 ? "s" : ""}`)])),
    table(ctx),
    s.phase === "play" && playing && [prompt(ctx), preview(ctx), handZone(ctx),
      h("div", { class: "d-row is-bar" },
        h("button", { class: "btn btn-cream", type: "button", onclick: () => { ui.rules = true; ctx.refresh(); } }, "Règles"),
        mine && h("button", { class: "btn btn-brick", type: "button", disabled: !!ctx.myAction || (!!owesNow(s, me) && s.left > 0),
          onclick: () => send(ctx, { t: "end" }) }, "Finir mon tour"))],
    s.phase === "play" && !playing && h("p", { class: "rule" }, "Tu regardes cette partie : tu joueras la prochaine."),
    s.phase === "end" && endPanel(ctx),
    ui.zone && s.order.includes(ui.zone) && zoom(ctx),
    ui.rules && rulesSheet(ctx),
    chatBox(ctx));
}
