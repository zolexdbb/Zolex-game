// Capy Deal : règles pures (rejouables hors partie, voir logic.test.js) et boucle de l'hôte.
//
// Une carte est désignée par son identifiant de paquet ("kaching#2") ; info() en donne le type.
// Les mains, la pioche et la défausse vivent dans deal/{code}/{g} (l'hôte seul les lit tout entières,
// chacun ne lit que sa main). La table est publique, dans l'état :
//  - props[uid][couleur] : propriétés posées ; cabanes[uid][couleur] : cabanes posées sur ce groupe ;
//  - bank[uid] : la réserve ; tokens[uid] : jetons Dette encore en main ; held[uid] : jetons des autres détenus ;
//  - owe : remboursements dus ({ from, to }), à faire au tour suivant du débiteur ;
//  - wait : la réponse attendue d'un joueur (payer, « Non ! », répartir, défausser…), une à la fois.
import { GROUPS, cardTypes, buildDeck } from "./cards.js";

const TYPES = Object.fromEntries(cardTypes().map((t) => [t.id, t]));
export const COLORS = Object.keys(GROUPS);
export const HAND_MAX = 7;
export const ACTIONS_PER_TURN = 3;
export const TOKENS = 3;
export const GOAL = 3; // groupes complets de couleurs différentes pour gagner
const CABANE = 5;

export const info = (card) => TYPES[String(card).split("#")[0]];
// Les couleurs où une carte peut être posée (vide : ce n'est pas une propriété).
export const colorsOf = (card) => {
  const t = info(card);
  return t.kind === "property" ? [t.group] : t.kind === "wild" ? t.groups || COLORS : [];
};
export const needOf = (color) => GROUPS[color].rents.length;
const groupsOf = (s, uid) => s.props?.[uid] || {};
export const complete = (s, uid, color) => (groupsOf(s, uid)[color] || []).length >= needOf(color);
export const completeCount = (s, uid) => COLORS.filter((c) => complete(s, uid, c)).length;
export const cabanesOf = (s, uid, color) => s.cabanes?.[uid]?.[color] || 0;
// Loyer d'un groupe : selon le nombre de cartes posées (plafonné au groupe complet), plus les cabanes.
export function rentOf(s, uid, color) {
  const n = Math.min((groupsOf(s, uid)[color] || []).length, needOf(color));
  return n ? GROUPS[color].rents[n - 1] + CABANE * cabanesOf(s, uid, color) : 0;
}
export const propCards = (s, uid) => Object.values(groupsOf(s, uid)).flat();
export const valueOf = (card) => info(card).value || 0;
export const assetsOf = (s, uid) => [...(s.bank?.[uid] || []), ...propCards(s, uid)];
export const others = (s, uid) => s.order.filter((id) => id !== uid);
export const owesNow = (s, uid) => (s.owe || []).find((d) => d.from === uid);
// Les types de « Pas de bol ».
export const KINDS = { property: ["property", "wild"], action: ["action", "rent"], money: ["money"] };

const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Déplacements de cartes ----

function draw(game, uid, n) {
  const hand = (game.hands[uid] ||= []);
  for (let k = 0; k < n; k++) {
    if (!game.deck.length) {
      game.deck = shuffle(game.pile);
      game.pile = [];
    }
    if (!game.deck.length) return k;
    hand.push(game.deck.pop());
  }
  return n;
}

const takeFrom = (list, card) => {
  const i = list.indexOf(card);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
};

function addProp(s, uid, card, color) {
  const ok = colorsOf(card);
  const c = ok.includes(color) ? color : ok[0];
  ((s.props ||= {})[uid] ||= {});
  (s.props[uid][c] ||= []).push(card);
  return c;
}

function moveCabanes(s, from, to, color) {
  const n = cabanesOf(s, from, color);
  if (!n) return;
  delete s.cabanes[from][color];
  ((s.cabanes ||= {})[to] ||= {});
  s.cabanes[to][color] = (s.cabanes[to][color] || 0) + n;
}

// Retire une propriété posée ; renvoie sa couleur, ou null si elle n'y est pas.
function removeProp(s, uid, card) {
  const groups = groupsOf(s, uid);
  for (const [color, list] of Object.entries(groups)) {
    if (takeFrom(list, card)) {
      if (!list.length) delete groups[color];
      return color;
    }
  }
  return null;
}

// Une propriété change de propriétaire, dans la même couleur. Un groupe vidé emporte ses cabanes.
function moveProp(s, from, to, card) {
  const color = removeProp(s, from, card);
  if (!color) return false;
  addProp(s, to, card, color);
  if (!groupsOf(s, from)[color]) moveCabanes(s, from, to, color);
  return true;
}

function moveBank(s, from, to, card) {
  if (!takeFrom(s.bank?.[from] || [], card)) return false;
  ((s.bank ||= {})[to] ||= []).push(card);
  return true;
}

// Paiement : réserve et propriétés choisies passent au créancier. Tout donné sans couvrir la
// somme : un jeton Dette, remboursé d'une carte de la main au prochain tour du débiteur.
function settle(s, from, to, cards, amount) {
  let paid = 0;
  for (const card of cards) {
    if (moveBank(s, from, to, card) || moveProp(s, from, to, card)) paid += valueOf(card);
  }
  if (paid < amount && (s.tokens?.[from] || 0) > 0) giveToken(s, from, to);
  return paid;
}

function giveToken(s, from, to) {
  s.tokens[from]--;
  ((s.held ||= {})[to] ||= []).push(from);
  (s.owe ||= []).push({ from, to });
}

// Paiement automatique (joueur absent) : la réserve d'abord, les plus petites valeurs d'abord.
export function autoPay(s, uid, amount) {
  const pick = [], sorted = (list) => [...list].sort((a, b) => valueOf(a) - valueOf(b));
  let sum = 0;
  for (const card of [...sorted(s.bank?.[uid] || []), ...sorted(propCards(s, uid))]) {
    if (sum >= amount) break;
    pick.push(card);
    sum += valueOf(card);
  }
  return pick;
}

// ---- Tours ----

function nextTurn(game) {
  const { s } = game;
  if (s.again) s.again = null;
  else s.turn = (s.turn + 1) % s.order.length;
  Object.assign(s, { left: ACTIONS_PER_TURN, drawn: null, wait: null });
}

function endTurn(game) {
  const { s, hands } = game;
  const cur = s.order[s.turn];
  const extra = (hands[cur] || []).length - HAND_MAX;
  if (extra > 0) s.wait = { kind: "discard", who: cur, n: extra };
  else nextTurn(game);
}

function checkWin(s) {
  const winner = s.order.find((id) => completeCount(s, id) >= GOAL);
  if (winner) Object.assign(s, { phase: "end", winner, wait: null });
}

// ---- Effets des cartes action ----

// Ce qu'il faut préparer en jouant la carte : cibles et paramètres. Renvoie null si le coup est impossible.
function prepare(s, by, card, a) {
  const t = info(card), opp = others(s, by);
  const one = () => (opp.includes(a.target) ? [a.target] : null);
  if (t.kind === "rent") {
    const allowed = t.rent === "all" ? COLORS : t.rent;
    if (!allowed.includes(a.color) || !rentOf(s, by, a.color)) return null;
    return { effect: "pay", targets: opp, amount: rentOf(s, by, a.color) * (t.double ? 2 : 1), color: a.color };
  }
  switch (t.id) {
    case "kaching": return one() && { effect: "pay", targets: one(), amount: 10 };
    case "pasdebol": return one() && KINDS[a.type] && { effect: "pasdebol", targets: one(), type: a.type };
    case "fisc": return one() && { effect: "fisc", targets: one() };
    case "saisie": return one() && { effect: "saisie", targets: one() };
    case "arnaque": return one() && (s.bank?.[by] || []).length && { effect: "arnaque", targets: one() };
    case "groscoup": return one() && complete(s, a.target, a.color) && { effect: "groscoup", targets: one(), color: a.color };
    case "ardoise": return one() && (s.tokens?.[a.target] || 0) > 0 && { effect: "ardoise", targets: one() };
    case "krach":
    case "cambriolage": {
      const where = t.id === "krach" ? (id, c) => propCards(s, id).includes(c) : (id, c) => (s.bank?.[id] || []).includes(c);
      const picks = (a.picks || []).filter(([id, c]) => opp.includes(id) && where(id, c));
      if (!picks.length || new Set(picks.map(([id]) => id)).size !== picks.length) return null;
      return { effect: t.id, targets: picks.map(([id]) => id), picks };
    }
    case "rafle": {
      if (!COLORS.includes(a.color)) return null;
      const targets = opp.filter((id) => propCards(s, id).some((c) => colorsOf(c).includes(a.color)));
      return targets.length ? { effect: "rafle", targets, color: a.color } : null;
    }
    default: return null;
  }
}

// L'effet sur une cible, une fois qu'elle l'a accepté (sans « Non ! » ou après un « Non ! » contré).
function resolve(game, w, target) {
  const { s, hands } = game;
  const { by } = w;
  if (w.effect === "pasdebol") {
    const keep = [], take = [];
    for (const c of hands[target] || []) (KINDS[w.type].includes(info(c).kind) ? take : keep).push(c);
    hands[target] = keep;
    (hands[by] ||= []).push(...take);
    return take.length;
  } else if (w.effect === "krach") {
    const pick = w.picks.find(([id]) => id === target);
    if (pick) moveProp(s, target, by, pick[1]);
  } else if (w.effect === "cambriolage") {
    const pick = w.picks.find(([id]) => id === target);
    if (pick) moveBank(s, target, by, pick[1]);
  } else if (w.effect === "arnaque") {
    s.bank ||= {};
    [s.bank[by], s.bank[target]] = [s.bank[target] || [], s.bank[by] || []];
  } else if (w.effect === "groscoup") {
    for (const c of [...(groupsOf(s, target)[w.color] || [])]) moveProp(s, target, by, c);
  } else if (w.effect === "rafle") {
    for (const c of propCards(s, target).filter((c) => colorsOf(c).includes(w.color))) {
      const from = removeProp(s, target, c);
      addProp(s, by, c, w.color);
      if (from && !groupsOf(s, target)[from]) moveCabanes(s, target, by, from);
    }
    moveCabanes(s, target, by, w.color);
  } else if (w.effect === "ardoise") {
    if ((s.tokens?.[target] || 0) > 0) giveToken(s, target, by);
  }
  return null;
}

// Une cible en a fini avec l'effet ; quand toutes ont fini, la main revient au joueur du tour.
function finish(game, target) {
  const { s } = game;
  delete s.wait.targets[target];
  if (!Object.keys(s.wait.targets).length) s.wait = null;
  checkWin(s);
}

// Joue une carte action (le joueur du tour, ou un créancier qui doit jouer la carte reçue).
function playAction(game, by, card, a) {
  const { s } = game;
  const t = info(card);
  if (t.id === "non") return false; // « Non ! » ne se joue qu'en réponse
  if (t.id === "allez") {
    draw(game, by, Math.max(0, HAND_MAX - (game.hands[by] || []).length));
  } else if (t.id === "rejouer") {
    s.again = true;
  } else if (t.id === "cabane") {
    const n = (groupsOf(s, by)[a.color] || []).length;
    if (!n || cabanesOf(s, by, a.color) >= n) return false;
    ((s.cabanes ||= {})[by] ||= {});
    s.cabanes[by][a.color] = cabanesOf(s, by, a.color) + 1;
  } else {
    const plan = prepare(s, by, card, a);
    if (!plan) return false;
    // Toutes les cibles répondent en même temps : chacune « answer », puis « counter » si elle dit « Non ! ».
    s.wait = { kind: "effect", ...plan, card, by, targets: Object.fromEntries(plan.targets.map((id) => [id, "answer"])) };
  }
  game.pile.push(card);
  return true;
}

// ---- Les coups ----

// Qui doit jouer maintenant : les cibles d'un effet (toutes à la fois), l'auteur s'il doit répondre
// à un « Non ! », le joueur attendu (défausse, carte reçue), sinon celui dont c'est le tour.
export function waitingFor(s) {
  const w = s.wait;
  if (!w) return [s.order[s.turn]];
  if (w.kind !== "effect") return [w.who];
  const stages = Object.entries(w.targets || {});
  const list = stages.filter(([, stage]) => stage === "answer").map(([id]) => id);
  if (stages.some(([, stage]) => stage === "counter")) list.push(w.by);
  return list;
}

// Applique le coup `a` du joueur `uid` à game = { s, hands, deck, pile } (modifié sur place).
// Renvoie false, sans rien changer d'utile, si le coup n'est pas permis.
export function apply(game, uid, a) {
  const { s, hands } = game;
  if (s.phase !== "play" || !a) return false;
  const cur = s.order[s.turn];
  const hand = (hands[uid] ||= []);
  const w = s.wait;
  const done = (last) => { s.last = { by: uid, ...last }; checkWin(s); return true; };

  // Début de tour : 2 cartes, ou 5 si la main est vide.
  if (a.t === "draw") {
    if (uid !== cur || w || s.drawn) return false;
    const n = draw(game, uid, hand.length ? 2 : 5);
    s.drawn = true;
    return done({ t: "draw", n });
  }
  if (!s.drawn) return false;

  if (w) {
    if (w.kind !== "effect" && uid !== w.who) return false;
    if (w.kind === "discard") {
      const cards = a.cards || [];
      if (cards.length !== w.n || new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return false;
      for (const c of cards) { takeFrom(hand, c); game.pile.push(c); }
      nextTurn(game);
      return done({ t: "discard", n: cards.length });
    }
    if (w.kind === "place") {
      // Le créancier doit jouer aussitôt la carte reçue : en réserve, posée, ou jouée.
      const card = w.card, t = info(card);
      s.wait = null;
      let ok = false;
      if (a.t === "bank") ok = t.kind !== "property" && t.kind !== "wild";
      else if (a.t === "prop") ok = colorsOf(card).includes(a.color) && !!addProp(s, uid, card, a.color);
      else if (a.t === "play") ok = (t.kind === "action" || t.kind === "rent") && t.id !== "rejouer" && playAction(game, uid, card, a);
      if (a.t === "bank" && ok) ((s.bank ||= {})[uid] ||= []).push(card);
      if (!ok) { s.wait = w; return false; }
      return done({ t: a.t, card, placed: true });
    }
    // Effet en cours : chaque cible répond pour elle-même ; l'auteur répond aux « Non ! », cible par cible.
    const targets = w.targets || {};
    const takeNon = () => {
      if (info(a.card)?.id !== "non" || !takeFrom(hand, a.card)) return false;
      game.pile.push(a.card);
      return true;
    };
    if (uid === w.by) {
      if (targets[a.target] !== "counter") return false;
      if (a.t === "non") {
        if (!takeNon()) return false;
        targets[a.target] = "answer";
        return done({ t: "non", to: a.target });
      }
      if (a.t !== "ok") return false;
      // L'auteur accepte le « Non ! » : l'effet est annulé pour cette cible.
      finish(game, a.target);
      return done({ t: "cancel", to: a.target });
    }
    if (targets[uid] !== "answer") return false;
    if (a.t === "non") {
      if (!takeNon()) return false;
      targets[uid] = "counter";
      return done({ t: "non", to: w.by });
    }
    if (w.effect === "pay") {
      if (a.t !== "pay") return false;
      const cards = a.cards || [], mine = assetsOf(s, uid);
      if (new Set(cards).size !== cards.length || !cards.every((c) => mine.includes(c))) return false;
      const sum = cards.reduce((n, c) => n + valueOf(c), 0);
      if (sum < w.amount && cards.length < mine.length) return false; // il faut couvrir la somme, ou tout donner
      const paid = settle(s, uid, w.by, cards, w.amount);
      finish(game, uid);
      return done({ t: "pay", to: w.by, paid, short: paid < w.amount });
    }
    if (w.effect === "fisc" || w.effect === "saisie") {
      // Garde une carte, répartit le reste entre les autres joueurs, bâtiments compris.
      const pool = w.effect === "fisc" ? [...(s.bank?.[uid] || [])] : propCards(s, uid);
      if (pool.length > 1) {
        if (a.t !== "split" || !pool.includes(a.keep)) return false;
        const give = a.give || [], rest = pool.filter((c) => c !== a.keep), mates = others(s, uid);
        if (give.length !== rest.length || !rest.every((c) => give.some(([card]) => card === c))
          || !give.every(([, to]) => mates.includes(to))) return false;
        if (w.effect === "saisie") {
          // Les cabanes d'un groupe vont au premier joueur qui en reçoit une carte.
          const first = {};
          for (const [card, to] of give) first[colorsOf(card).find((c) => (groupsOf(s, uid)[c] || []).includes(card))] ||= to;
          for (const [color, to] of Object.entries(first)) moveCabanes(s, uid, to, color);
        }
        for (const [card, to] of give) (w.effect === "fisc" ? moveBank : moveProp)(s, uid, to, card);
      } else if (a.t !== "ok" && a.t !== "split") return false;
      finish(game, uid);
      return done({ t: w.effect, n: Math.max(0, pool.length - 1) });
    }
    if (a.t !== "ok") return false;
    const got = resolve(game, w, uid);
    finish(game, uid);
    return done({ t: "hit", effect: w.effect, to: w.by, got });
  }

  if (uid !== cur) return false;
  // Une dette se rembourse avant tout le reste, d'une carte de la main : ça compte comme une action.
  const debt = owesNow(s, uid);
  if (debt && a.t !== "repay" && (a.t !== "end" || (hand.length && s.left > 0))) return false;
  if (a.t === "repay") {
    if (!debt || !takeFrom(hand, a.card) || s.left < 1) return false;
    s.owe.splice(s.owe.indexOf(debt), 1);
    takeFrom(s.held[debt.to], uid);
    s.tokens[uid]++;
    s.left--;
    s.wait = { kind: "place", who: debt.to, card: a.card, from: uid };
    return done({ t: "repay", to: debt.to });
  }
  if (a.t === "end") {
    endTurn(game);
    return done({ t: "end" });
  }
  if (a.t === "move") {
    // Déplacer un joker propriété d'un groupe à l'autre : gratuit.
    if (!colorsOf(a.card).includes(a.color) || info(a.card).kind !== "wild") return false;
    const from = removeProp(s, uid, a.card);
    if (!from) return false;
    addProp(s, uid, a.card, a.color);
    if (!groupsOf(s, uid)[from]) moveCabanes(s, uid, uid, from);
    return done({ t: "move", card: a.card, color: a.color });
  }
  if (!hand.includes(a.card) || s.left < 1) return false;
  const t = info(a.card);
  if (a.t === "bank") {
    if (t.kind === "property" || t.kind === "wild") return false;
    takeFrom(hand, a.card);
    ((s.bank ||= {})[uid] ||= []).push(a.card);
    s.left--;
    return done({ t: "bank", card: a.card });
  }
  if (a.t === "prop") {
    if (!colorsOf(a.card).includes(a.color)) return false;
    takeFrom(hand, a.card);
    addProp(s, uid, a.card, a.color);
    s.left--;
    return done({ t: "prop", card: a.card, color: a.color });
  }
  if (a.t === "play") {
    if (t.kind !== "action" && t.kind !== "rent") return false;
    takeFrom(hand, a.card);
    if (!playAction(game, uid, a.card, a)) { hand.push(a.card); return false; }
    s.left--;
    const last = { t: "play", card: a.card, color: a.color || null, target: a.target || null };
    // « Rejouer » se joue en dernier : le tour s'arrête, et le même joueur rejoue aussitôt.
    if (t.id === "rejouer") endTurn(game);
    return done(last);
  }
  return false;
}

// Coup joué d'office pour `uid` : la pioche de début de tour, et tout ce qu'un joueur absent devrait faire.
// Un joueur présent répond toujours lui-même, même sans autre choix : il voit ainsi ce qu'on lui joue.
export function autoMove(game, uid, gone) {
  const { s, hands } = game;
  const w = s.wait;
  if (!w && !s.drawn && uid === s.order[s.turn]) return { t: "draw" };
  if (!gone) return null;
  if (!w) {
    const debt = owesNow(s, uid);
    return debt && (hands[uid] || []).length && s.left > 0 ? { t: "repay", card: hands[uid][0] } : { t: "end" };
  }
  if (w.kind === "discard") return { t: "discard", cards: (hands[uid] || []).slice(0, w.n) };
  if (w.kind === "place") {
    const colors = colorsOf(w.card);
    return colors.length ? { t: "prop", color: colors[0] } : { t: "bank" };
  }
  if (uid === w.by) {
    const target = Object.keys(w.targets || {}).find((id) => w.targets[id] === "counter");
    return target ? { t: "ok", target } : null;
  }
  if (w.effect === "pay") return { t: "pay", cards: autoPay(s, uid, w.amount) };
  if (w.effect === "fisc" || w.effect === "saisie") {
    const pool = w.effect === "fisc" ? s.bank?.[uid] || [] : propCards(s, uid);
    if (pool.length <= 1) return { t: "ok" };
    const mates = others(s, uid);
    return { t: "split", keep: pool[0], give: pool.slice(1).map((c, i) => [c, mates[i % mates.length]]) };
  }
  return { t: "ok" };
}

// Ce que tout le monde voit : le nombre de cartes en main de chacun et dans la pioche.
function publish(game) {
  const { s, hands, deck } = game;
  s.counts = Object.fromEntries(s.order.map((id) => [id, (hands[id] || []).length]));
  s.deckCount = deck.length;
  s.top = game.pile.at(-1) || null;
}

export function start({ players }) {
  return {
    state: {
      phase: "deal",
      order: shuffle(players.map((p) => p.id)),
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }]))
    },
    // Les mains changent à chaque coup : elles vivent dans deal/{code}/{g}, pas dans les enveloppes.
    secrets: {},
    vault: {}
  };
}

// La donne : 5 cartes chacun, puis le premier joueur pioche ses 2 cartes de début de tour.
export function deal(s) {
  const deck = shuffle(buildDeck().map((c) => c.uid));
  const hands = Object.fromEntries(s.order.map((id) => [id, deck.splice(-5)]));
  const next = {
    g: s.g, step: s.step, order: s.order, names: s.names, phase: "play", turn: 0,
    left: ACTIONS_PER_TURN, drawn: null, tokens: Object.fromEntries(s.order.map((id) => [id, TOKENS]))
  };
  const game = { s: next, hands, deck, pile: [] };
  publish(game);
  return game;
}

export async function hostTick(ctx) {
  const { state: s, room, actions, code } = ctx;
  if (!s || !actions || s.phase === "end") return;
  const path = `deal/${code}/${s.g}`;

  if (s.phase === "deal") {
    const game = deal(s);
    return ctx.multi({ [path]: { hands: game.hands, deck: game.deck, pile: game.pile }, [`rooms/${code}/state`]: game.s });
  }

  const data = await ctx.read(path);
  if (!data) return;
  const game = { s: structuredClone(s), hands: data.hands || {}, deck: data.deck || [], pile: data.pile || [] };
  // Toutes les réponses arrivées à cette étape sont appliquées ensemble (un effet sur tous les joueurs
  // se décide en même temps), avec celles des joueurs absents. Une action qu'on n'attendait pas libère
  // seulement l'étape.
  let acted = false;
  for (const uid of waitingFor(s)) {
    const action = actions[uid] || autoMove(game, uid, !room.players?.[uid]);
    if (action) { apply(game, uid, action); acted = true; }
  }
  if (!acted && !Object.keys(actions).length) return;
  publish(game);
  game.s.step = ctx.nextStep();
  return ctx.multi({
    [path]: { hands: game.hands, deck: game.deck, pile: game.pile },
    [`rooms/${code}/state`]: game.s
  });
}
