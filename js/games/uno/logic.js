// Uno : règles pures (rejouables hors navigateur, voir logic.test.js) et boucle de l'hôte.
// Une carte tient en deux lettres : couleur (r, g, b, y, ou w pour un joker)
// puis valeur (0-9, s = passe, r = demi-tour, d = +2, w = joker, f = joker +4).
const COLORS = "rgby";

// Jeux de règles tout prêts. Les suivants (Flip, No Mercy) s'ajouteront ici.
export const PRESETS = {
  classic: {
    handSize: 7, turnTime: 0, callUno: true, playDrawn: true, drawUntil: false,
    stack: "off", skipBlocks: false, reverseReturns: false, sevenZero: false, jumpIn: false
  }
};

const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const isWild = (card) => card[0] === "w";
export const drawOf = (card) => (card === "wf" ? 4 : card[1] === "d" ? 2 : 0);
const pointsOf = (card) => (isWild(card) ? 50 : card[1] <= "9" ? Number(card[1]) : 20);

export function buildDeck() {
  const deck = ["ww", "ww", "ww", "ww", "wf", "wf", "wf", "wf"];
  for (const c of COLORS) {
    deck.push(c + "0");
    for (const v of "123456789srd") deck.push(c + v, c + v);
  }
  return deck;
}

// La carte `i` de la main peut-elle être posée maintenant par ce joueur ?
export function playable(s, uid, hand, i) {
  const card = hand[i], r = s.rules;
  if (!card || s.phase !== "play") return false;
  // Hors de son tour : seulement à la volée, avec la carte identique.
  if (s.order[s.turn] !== uid) return !!r.jumpIn && !s.penalty && !isWild(card) && card === s.top;
  if (s.penalty) {
    const d = drawOf(card);
    if (d) return r.stack === "all" || (r.stack === "same" && d === s.penKind);
    return card[0] === s.color && ((card[1] === "s" && r.skipBlocks) || (card[1] === "r" && r.reverseReturns));
  }
  // Après une pioche, seule la carte piochée (la dernière) peut partir.
  if (s.drawn && i !== hand.length - 1) return false;
  return isWild(card) || card[0] === s.color || card[1] === s.top[1];
}

function draw(game, uid, n) {
  const hand = (game.hands[uid] ||= []);
  let got = 0;
  for (; got < n; got++) {
    if (!game.deck.length) {
      // La défausse, sauf la carte du dessus, redevient la pioche.
      game.deck = shuffle(game.pile.slice(0, -1));
      game.pile = game.pile.slice(-1);
    }
    if (!game.deck.length) break;
    hand.push(game.deck.pop());
  }
  return got;
}

// Applique l'action d'un joueur à `game` = { s, hands, deck, pile } (modifié sur place).
// Renvoie false, sans rien changer, si l'action n'est pas permise.
export function apply(game, uid, a) {
  const { s, hands } = game;
  const r = s.rules, n = s.order.length, cur = s.order[s.turn];
  const hand = (hands[uid] ||= []);
  const step = (k = 1) => { s.turn = (s.turn + s.dir * k + 2 * n) % n; };
  if (s.phase !== "play") return false;
  if (a.t === "auto") a = { t: s.drawn ? "pass" : "draw" };

  if (a.t === "uno") {
    if (s.unsaid === uid) s.unsaid = null;
    else if (r.callUno && uid === cur && hand.length === 2 && s.called !== uid) s.called = uid;
    else return false;
    s.last = { by: uid, t: "uno" };
  } else if (a.t === "catch") {
    if (!s.unsaid || s.unsaid === uid || !s.order.includes(uid)) return false;
    draw(game, s.unsaid, 2);
    s.last = { by: uid, t: "catch", to: s.unsaid };
    s.unsaid = null;
  } else if (a.t === "pass") {
    if (uid !== cur || !s.drawn) return false;
    s.drawn = null;
    s.unsaid = null;
    s.last = { by: uid, t: "pass" };
    step();
  } else if (a.t === "draw") {
    if (uid !== cur || s.drawn) return false;
    let got = 0;
    if (s.penalty) {
      got = draw(game, uid, s.penalty);
      s.penalty = 0;
      s.penKind = null;
      step();
    } else {
      do {
        if (!draw(game, uid, 1)) break;
        got++;
      } while (r.drawUntil && !playable(s, uid, hand, hand.length - 1));
      if (got && (r.playDrawn || r.drawUntil) && playable(s, uid, hand, hand.length - 1)) s.drawn = true;
      else step();
    }
    s.unsaid = null;
    s.called = null;
    s.last = { by: uid, t: "draw", n: got };
  } else if (a.t === "play") {
    const card = hand[a.i];
    if (!card || card !== a.card || !playable(s, uid, hand, a.i)) return false;
    const wild = isWild(card);
    if (wild && !(a.color?.length === 1 && COLORS.includes(a.color))) return false;
    const swap = r.sevenZero && card[1] === "7" && hand.length > 1;
    if (swap && (a.target === uid || !s.order.includes(a.target))) return false;
    const riposte = s.penalty > 0;

    hand.splice(a.i, 1);
    game.pile.push(card);
    s.last = { by: uid, t: "play", card, jump: uid !== cur || null, to: swap ? a.target : null };
    Object.assign(s, { top: card, color: wild ? a.color : card[0], drawn: null, turn: s.order.indexOf(uid) });

    if (!hand.length) {
      Object.assign(s, { phase: "end", winner: uid, penalty: 0, unsaid: null, called: null });
      s.left = Object.fromEntries(s.order.map((id) => [id, (hands[id] || []).reduce((sum, c) => sum + pointsOf(c), 0)]));
    } else {
      const d = drawOf(card), v = card[1];
      if (d) {
        s.penalty = (s.penalty || 0) + d;
        s.penKind = d;
        step();
      } else if (riposte) {
        // Passe : le malus file au joueur suivant. Demi-tour : il repart d'où il vient.
        if (v === "r") s.dir = -s.dir;
        step();
      } else if (v === "s" || (v === "r" && n === 2)) {
        step(2);
      } else if (v === "r") {
        s.dir = -s.dir;
        step();
      } else {
        if (swap) [hands[uid], hands[a.target]] = [hands[a.target] || [], hand];
        if (r.sevenZero && v === "0") {
          const old = s.order.map((id) => hands[id] || []);
          s.order.forEach((id, i) => { hands[s.order[(i + s.dir + n) % n]] = old[i]; });
        }
        step();
      }
      // Le malus attend : c'est au joueur visé de piocher lui-même (ou de riposter si les règles le permettent).
      s.unsaid = r.callUno && hands[uid].length === 1 && s.called !== uid ? uid : null;
      s.called = null;
    }
  } else {
    return false;
  }

  s.counts = Object.fromEntries(s.order.map((id) => [id, (hands[id] || []).length]));
  s.deckCount = game.deck.length;
  s.moves = (s.moves || 0) + 1; // repère d'un coup accepté, pour l'animer et le sonoriser une seule fois
  return true;
}

export function start({ players, settings }) {
  return {
    state: {
      phase: "deal", turn: 0, dir: 1,
      order: shuffle(players.map((p) => p.id)),
      rules: { ...PRESETS.classic, ...settings },
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }]))
    },
    // Les mains changent à chaque tour : elles vivent dans uno/{code}/{g}, pas dans les enveloppes.
    secrets: {},
    vault: {}
  };
}

export function deal(s) {
  const size = s.rules.handSize;
  const decks = Math.ceil((s.order.length * size + 20) / 108);
  const deck = shuffle(Array.from({ length: decks }, buildDeck).flat());
  const hands = Object.fromEntries(s.order.map((id) => [id, deck.splice(-size)]));
  // ponytail: la première carte retournée est toujours un chiffre ; les règles
  // officielles appliquent l'effet d'une carte action, à ajouter ici si voulu.
  const [top] = deck.splice(deck.findLastIndex((c) => c[1] <= "9"), 1);
  return { hands, deck, pile: [top] };
}

const timed = (s, now) => (s.phase === "play" && s.rules.turnTime ? now + s.rules.turnTime * 1000 : null);

export async function hostTick(ctx) {
  const { state: s, room, actions, code } = ctx;
  if (!s || !actions || s.phase === "end") return;
  const path = `uno/${code}/${s.g}`;

  if (s.phase === "deal") {
    const game = deal(s);
    const next = { ...s, phase: "play", top: game.pile[0], color: game.pile[0][0], penalty: 0, deckCount: game.deck.length };
    next.counts = Object.fromEntries(s.order.map((id) => [id, game.hands[id].length]));
    next.until = timed(next, ctx.now());
    return ctx.multi({ [path]: game, [`rooms/${code}/state`]: next });
  }

  // Une action par étape : celle du joueur dont c'est le tour d'abord, sinon une pose à la volée.
  const cur = s.order[s.turn];
  let who = actions[cur] ? cur : Object.keys(actions)[0];
  let action = actions[who];
  if (!who) {
    // Joueur parti, ou temps écoulé : l'hôte pioche (ou passe) à sa place.
    if (room.players?.[cur] && !(s.until && ctx.now() >= s.until)) return;
    who = cur;
    action = { t: "auto" };
  }
  const data = await ctx.read(path);
  if (!data) return;
  const game = { s: structuredClone(s), hands: data.hands || {}, deck: data.deck || [], pile: data.pile || [] };
  // Une action refusée fait quand même avancer l'étape, pour libérer son auteur.
  if (apply(game, who, action)) game.s.until = timed(game.s, ctx.now());
  game.s.step = ctx.nextStep();
  return ctx.multi({
    [path]: { hands: game.hands, deck: game.deck, pile: game.pile },
    [`rooms/${code}/state`]: game.s
  });
}
