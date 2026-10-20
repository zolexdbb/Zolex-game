// Uno : règles pures (rejouables hors navigateur, voir logic.test.js) et boucle de l'hôte.
//
// Une face de carte tient en deux lettres : couleur puis valeur.
//  - couleurs : r, g, b, y (côté clair), o, l, p, n (côté sombre du Flip), w pour un joker ;
//  - valeurs : 0-9, s = passe, r = demi-tour, e = passe tout le monde, x = flip,
//    a = défausse toute la couleur, u = +1, d = +2, q = +4 de couleur, c = +5 ;
//  - jokers : w = joker, f = joker +4, t = joker +2, k = joker pioche-couleur,
//    v = joker demi-tour +4, h = joker +6, z = joker +10, o = roulette.
// Une carte de Flip a deux faces collées : la claire puis la sombre ("r5o7").
const LIGHT = "rgby", DARK = "olpn";
const RECAP_TIME = 10000;
const MERCY = 25; // No Mercy : à 25 cartes en main, on quitte la manche

// Jeux de règles tout prêts. `deck` choisit le paquet, le reste se règle à la main dans le salon.
export const PRESETS = {
  classic: {
    deck: "classic", handSize: 7, turnTime: 0, callUno: true, playDrawn: true, drawUntil: false,
    stack: "off", skipBlocks: false, reverseReturns: false, sevenZero: false, jumpIn: false, mercy: false
  },
  flip: {
    deck: "flip", handSize: 7, turnTime: 0, callUno: true, playDrawn: true, drawUntil: false,
    stack: "off", skipBlocks: false, reverseReturns: false, sevenZero: false, jumpIn: false, mercy: false
  },
  nomercy: {
    deck: "nomercy", handSize: 7, turnTime: 0, callUno: true, playDrawn: true, drawUntil: true,
    stack: "all", skipBlocks: false, reverseReturns: false, sevenZero: true, jumpIn: false, mercy: true
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

// Face visible d'une carte selon le côté joué ("l" ou "d").
export const faceOf = (card, side) => (card.length > 2 && side === "d" ? card.slice(2, 4) : card.slice(0, 2));
export const face = (s, card) => faceOf(card, s.side);
export const isWild = (f) => f[0] === "w";
export const isNumber = (f) => !isWild(f) && f[1] >= "0" && f[1] <= "9";
// Les couleurs jouables du côté en cours.
export const colorsOf = (s) => (s.side === "d" ? DARK : LIGHT);
const DRAWS = { u: 1, d: 2, t: 2, f: 4, q: 4, v: 4, c: 5, h: 6, z: 10 };
// Cartes à piocher infligées par une face (les valeurs des jokers et des cartes de couleur ne se recoupent pas).
export const drawOf = (f) => DRAWS[f[1]] || 0;

function pointsOf(f, deck) {
  if (isNumber(f)) return Number(f[1]);
  if (isWild(f)) return deck === "flip" ? { w: 40, t: 50, k: 60 }[f[1]] : 50;
  return { u: 10, e: 30, q: 30 }[f[1]] || 20;
}

// Chaque paquet, carte par carte, tel qu'il est vendu.
export function buildDeck(kind = "classic") {
  const copies = (list, n) => list.flatMap((card) => Array(n).fill(card));
  if (kind === "flip") {
    const side = (colors, values, wilds) => [
      ...[...colors].flatMap((c) => copies([..."123456789", ...values].map((v) => c + v), 2)),
      ...copies(wilds.map((v) => "w" + v), 4)
    ];
    const light = side(LIGHT, ["u", "r", "s", "x"], ["w", "t"]);
    const dark = shuffle(side(DARK, ["c", "r", "e", "x"], ["w", "k"]));
    return light.map((card, i) => card + dark[i]);
  }
  if (kind === "nomercy") {
    return [
      ...[...LIGHT].flatMap((c) => [
        ...copies([..."0123456789"].map((v) => c + v), 2),
        ...copies([c + "s", c + "r", c + "d", c + "a"], 3),
        ...copies([c + "e", c + "q"], 2)
      ]),
      ...copies(["wv", "wo"], 8), ...copies(["wh", "wz"], 4)
    ];
  }
  return [
    ...[...LIGHT].flatMap((c) => [c + "0", ...copies([..."123456789srd"].map((v) => c + v), 2)]),
    ...copies(["ww", "wf"], 4)
  ];
}

// La carte `i` de la main peut-elle être posée maintenant par ce joueur ?
export function playable(s, uid, hand, i) {
  const card = hand[i], r = s.rules;
  if (!card || s.phase !== "play" || s.gone?.[uid]) return false;
  const f = face(s, card);
  // Hors de son tour : seulement à la volée, avec la carte identique.
  if (s.order[s.turn] !== uid) return !!r.jumpIn && !s.penalty && !s.hunt && !isWild(f) && f === s.top;
  // Joker pioche-couleur ou roulette en attente : il n'y a qu'à piocher.
  if (s.hunt) return false;
  if (s.penalty) {
    const d = drawOf(f);
    // Cumul : on répond par un malus égal, ou plus fort si les règles le permettent ; jamais plus faible.
    if (d) return r.stack === "all" ? d >= s.penKind : r.stack === "same" && d === s.penKind;
    return f[0] === s.color && ((f[1] === "s" && r.skipBlocks) || (f[1] === "r" && r.reverseReturns));
  }
  // Après une pioche, seule la carte piochée (la dernière) peut partir.
  if (s.drawn && i !== hand.length - 1) return false;
  return isWild(f) || f[0] === s.color || f[1] === s.top[1];
}

function draw(game, uid, n, until) {
  const hand = (game.hands[uid] ||= []);
  let got = 0;
  for (; got < n; got++) {
    if (!game.deck.length) {
      // La défausse, sauf la carte du dessus, redevient la pioche.
      game.deck = shuffle(game.pile.slice(0, -1));
      game.pile = game.pile.slice(-1);
    }
    if (!game.deck.length) break;
    const card = game.deck.pop();
    hand.push(card);
    if (until?.(card)) { got++; break; }
  }
  return got;
}

const handPoints = (s, hand) => (hand || []).reduce((sum, c) => sum + pointsOf(face(s, c), s.rules.deck), 0);

function finish(game, winner) {
  const { s, hands } = game;
  Object.assign(s, { phase: "end", winner, penalty: 0, penKind: null, hunt: null, unsaid: null, called: null, drawn: null });
  // Le gagnant ne marque rien, même s'il l'emporte par élimination des autres avec des cartes en main.
  s.left = Object.fromEntries(s.order.map((id) => [id, id === winner ? 0 : s.gone?.[id] ?? handPoints(s, hands[id])]));
}

// Applique l'action d'un joueur à `game` = { s, hands, deck, pile } (modifié sur place).
// Renvoie false, sans rien changer, si l'action n'est pas permise.
export function apply(game, uid, a) {
  const { s, hands } = game;
  const r = s.rules, n = s.order.length, cur = s.order[s.turn];
  const hand = (hands[uid] ||= []);
  const live = s.order.filter((id) => !s.gone?.[id]);
  // Avance d'un ou plusieurs joueurs, en sautant ceux qui ont quitté la manche.
  const step = (k = 1) => {
    for (let j = 0; j < k; j++) do { s.turn = (s.turn + s.dir + n) % n; } while (s.gone?.[s.order[s.turn]]);
  };
  if (s.phase !== "play" || s.gone?.[uid]) return false;
  if (a.t === "auto") a = s.hunt === "?" ? { t: "draw", color: colorsOf(s)[rand(4)] } : { t: s.drawn ? "pass" : "draw" };

  if (a.t === "uno") {
    if (s.unsaid === uid) s.unsaid = null;
    else if (r.callUno && uid === cur && hand.length === 2 && s.called !== uid) s.called = uid;
    else return false;
    s.last = { by: uid, t: "uno" };
  } else if (a.t === "catch") {
    if (!s.unsaid || s.unsaid === uid || !live.includes(uid)) return false;
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
    let got = 0, color = null;
    if (s.hunt) {
      // Pioche jusqu'à tomber sur la couleur : choisie par l'auteur du joker, ou par la victime de la roulette.
      color = s.hunt === "?" ? a.color : s.hunt;
      if (!(color?.length === 1 && colorsOf(s).includes(color))) return false;
      got = draw(game, uid, Infinity, (card) => face(s, card)[0] === color);
      Object.assign(s, { hunt: null, color });
      step();
    } else if (s.penalty) {
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
    s.last = { by: uid, t: "draw", n: got, color };
  } else if (a.t === "play") {
    const card = hand[a.i];
    if (!card || card !== a.card || !playable(s, uid, hand, a.i)) return false;
    const f = face(s, card), v = f[1];
    const picks = isWild(f) && v !== "o"; // la roulette laisse la couleur à sa victime
    if (picks && !(a.color?.length === 1 && colorsOf(s).includes(a.color))) return false;
    const swap = r.sevenZero && v === "7" && hand.length > 1;
    if (swap && (a.target === uid || !live.includes(a.target))) return false;
    const riposte = s.penalty > 0;

    hand.splice(a.i, 1);
    game.pile.push(card);
    s.last = { by: uid, t: "play", card: f, jump: uid !== cur || null, to: swap ? a.target : null };
    Object.assign(s, { top: f, color: picks ? a.color : isWild(f) ? s.color : f[0], drawn: null, turn: s.order.indexOf(uid) });

    // Défausse toute la couleur : les autres cartes de cette couleur filent sous la carte posée.
    if (v === "a") {
      const rest = hand.filter((c) => face(s, c)[0] === f[0]);
      game.pile.splice(-1, 0, ...rest);
      hands[uid] = hand.filter((c) => face(s, c)[0] !== f[0]);
      s.last.n = rest.length;
    }

    if (!hands[uid].length) {
      finish(game, uid);
    } else {
      const d = drawOf(f);
      if (d) {
        // Le joker demi-tour +4 renvoie le malus dans l'autre sens.
        if (v === "v") s.dir = -s.dir;
        s.penalty = (s.penalty || 0) + d;
        s.penKind = d;
        step();
      } else if (riposte) {
        // Passe : le malus file au joueur suivant. Demi-tour : il repart d'où il vient.
        if (v === "r") s.dir = -s.dir;
        step();
      } else if (v === "k" || v === "o") {
        s.hunt = v === "k" ? a.color : "?";
        step();
      } else if (v === "e") {
        // Passe tout le monde : la main revient aussitôt à celui qui l'a posée.
      } else if (v === "x") {
        // Flip : tout se retourne. La pioche, retournée, se lit dans l'autre sens.
        s.side = s.side === "d" ? "l" : "d";
        game.deck.reverse();
        const back = faceOf(card, s.side);
        s.top = back;
        // Un joker au revers garde la couleur demandée, transposée de l'autre côté.
        s.color = isWild(back) ? colorsOf(s)[(LIGHT + DARK).indexOf(f[0]) % 4] : back[0];
        step();
      } else if (v === "s" || (v === "r" && live.length === 2)) {
        step(2);
      } else if (v === "r") {
        s.dir = -s.dir;
        step();
      } else {
        if (swap) [hands[uid], hands[a.target]] = [hands[a.target] || [], hands[uid]];
        if (r.sevenZero && v === "0") {
          const old = live.map((id) => hands[id] || []);
          live.forEach((id, i) => { hands[live[(i + s.dir + live.length) % live.length]] = old[i]; });
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

  // Pitié : qui atteint 25 cartes quitte la manche, ses cartes retournent dans la pioche.
  if (r.mercy && s.phase === "play") {
    for (const id of s.order) {
      if (s.gone?.[id] || (hands[id] || []).length < MERCY) continue;
      (s.gone ||= {})[id] = handPoints(s, hands[id]);
      game.deck = shuffle([...game.deck, ...hands[id]]);
      hands[id] = [];
      if (s.unsaid === id) s.unsaid = null;
      s.last = { ...s.last, out: id };
    }
    const still = s.order.filter((id) => !s.gone?.[id]);
    if (still.length === 1) finish(game, still[0]);
    else if (s.gone?.[s.order[s.turn]]) { s.drawn = null; step(); }
  }

  publish(game);
  s.moves = (s.moves || 0) + 1; // repère d'un coup accepté, pour l'animer et le sonoriser une seule fois
  return true;
}

// Ce que tout le monde voit de la table : le nombre de cartes de chacun, et au
// Flip, l'autre face des cartes (celle que les adversaires ont sous les yeux).
function publish(game) {
  const { s, hands, deck } = game;
  s.counts = Object.fromEntries(s.order.map((id) => [id, (hands[id] || []).length]));
  s.deckCount = deck.length;
  if (s.rules.deck !== "flip") return;
  const other = s.side === "d" ? "l" : "d";
  s.deckPeek = deck.length ? faceOf(deck.at(-1), other) : null;
  s.peeks = Object.fromEntries(s.order.map((id) => [id, (hands[id] || []).map((c) => faceOf(c, other)).join("")]));
}

export function start({ players, settings }) {
  return {
    state: {
      phase: "deal", round: 1,
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
  const size = s.rules.handSize, kind = s.rules.deck || "classic";
  const one = buildDeck(kind).length;
  const decks = Math.ceil((s.order.length * size + 20) / one);
  const deck = shuffle(Array.from({ length: decks }, () => buildDeck(kind)).flat());
  const hands = Object.fromEntries(s.order.map((id) => [id, deck.splice(-size)]));
  // ponytail: la première carte retournée est toujours un chiffre ; les règles
  // officielles appliquent l'effet d'une carte action, à ajouter ici si voulu.
  const [top] = deck.splice(deck.findLastIndex((c) => isNumber(faceOf(c, "l"))), 1);
  return { hands, deck, pile: [top] };
}

// Fin de manche : les points restés en main s'ajoutent au score ; on redonne s'il reste des manches.
export function tally(s, now) {
  s.totals = Object.fromEntries(s.order.map((id) => [id, (s.totals?.[id] || 0) + (s.left?.[id] || 0)]));
  if ((s.round || 1) < (s.rules.rounds || 1)) Object.assign(s, { phase: "recap", until: now + RECAP_TIME });
}

// Commande de l'hôte : redonne sans attendre la fin du décompte.
export const nextRound = (ctx) => ctx.patch({ "state/until": ctx.now() });

const timed = (s, now) => (s.phase === "play" && s.rules.turnTime ? now + s.rules.turnTime * 1000 : null);

// Première donne d'une manche : état remis à neuf, le premier à jouer tourne d'une manche à l'autre.
export function opening(s, game) {
  const round = s.round || 1;
  const top = faceOf(game.pile[0], "l");
  const next = {
    g: s.g, step: s.step, order: s.order, rules: s.rules, names: s.names, round, totals: s.totals || null,
    phase: "play", side: "l", dir: 1, turn: (round - 1) % s.order.length, top, color: top[0], penalty: 0
  };
  publish({ ...game, s: next });
  return next;
}

export async function hostTick(ctx) {
  const { state: s, room, actions, code } = ctx;
  if (!s || !actions || s.phase === "end") return;
  const path = `uno/${code}/${s.g}`;

  if (s.phase === "recap") {
    if (ctx.now() < s.until) return;
    return ctx.patch({ "state/phase": "deal", "state/round": (s.round || 1) + 1, "state/until": null, "state/step": ctx.nextStep() });
  }

  if (s.phase === "deal") {
    const game = deal(s);
    const next = opening(s, game);
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
  if (apply(game, who, action)) {
    game.s.until = timed(game.s, ctx.now());
    if (game.s.phase === "end") tally(game.s, ctx.now());
  }
  game.s.step = ctx.nextStep();
  return ctx.multi({
    [path]: { hands: game.hands, deck: game.deck, pile: game.pile },
    [`rooms/${code}/state`]: game.s
  });
}
