// Vérification des règles du Uno : `node js/games/uno/logic.test.js`
import assert from "node:assert/strict";
import { PRESETS, buildDeck, deal, apply, playable, isWild, tally, faceOf, opening } from "./logic.js";

const table = (rules, hands, top, extra = {}) => ({
  s: {
    phase: "play", order: Object.keys(hands), turn: 0, dir: 1, top, color: top[0], penalty: 0,
    rules: { ...PRESETS.classic, ...rules }, ...extra
  },
  hands, deck: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"], pile: [top]
});
const play = (g, uid, card, more) => apply(g, uid, { t: "play", i: g.hands[uid].indexOf(card), card, ...more });

assert.equal(buildDeck().length, 108);
assert.equal(buildDeck("flip").length, 112);
assert.equal(buildDeck("nomercy").length, 168);
assert.ok(buildDeck("flip").every((c) => c.length === 4 && "rgbyw".includes(c[0]) && "olpnw".includes(c[2])));

{ // Donne : 7 cartes chacun, un chiffre retourné.
  const s = { order: ["a", "b", "c"], rules: PRESETS.classic };
  const g = deal(s);
  assert.deepEqual(Object.values(g.hands).map((h) => h.length), [7, 7, 7]);
  assert.ok(g.pile[0][1] <= "9" && !isWild(g.pile[0]));
  assert.equal(g.deck.length, 108 - 22);
}

{ // Classique : le joueur visé par le +2 pioche lui-même, sans riposte possible, puis saute son tour.
  const g = table({}, { a: ["rd", "r1"], b: ["gd", "g1"], c: ["y1", "y2"] }, "r5");
  assert.ok(!play(g, "b", "g1"), "pas son tour");
  assert.ok(!play(g, "a", "y9"), "carte absente");
  assert.ok(play(g, "a", "rd"));
  assert.equal(g.s.order[g.s.turn], "b");
  assert.ok(!play(g, "b", "gd"), "pas de cumul en classique");
  assert.equal(g.s.unsaid, "a", "Uno non annoncé");
  assert.ok(apply(g, "c", { t: "catch" }));
  assert.equal(g.hands.a.length, 3);
  assert.ok(apply(g, "b", { t: "draw" }));
  assert.equal(g.hands.b.length, 4);
  assert.equal(g.s.order[g.s.turn], "c");
}

{ // Cumul, puis demi-tour qui renvoie le malus.
  const g = table({ stack: "all", reverseReturns: true }, { a: ["rd", "r1", "r2"], b: ["wf", "g1", "g2"], c: ["gr", "y2", "y3"] }, "r5");
  play(g, "a", "rd");
  assert.equal(g.s.penalty, 2);
  assert.ok(!play(g, "b", "g1"), "il faut riposter ou piocher");
  assert.ok(play(g, "b", "wf", { color: "g" }));
  assert.equal(g.s.penalty, 6);
  assert.ok(play(g, "c", "gr"));
  assert.equal(g.s.order[g.s.turn], "b");
  assert.ok(apply(g, "b", { t: "draw" }));
  assert.equal(g.hands.b.length, 8);
  assert.equal(g.s.order[g.s.turn], "a");
}

{ // Cumul mélangé : +4 sur +2, mais jamais +2 sur +4.
  const g = table({ stack: "all" }, { a: ["wf", "r1", "r2"], b: ["rd", "g1", "g2"], c: ["y1", "y2"] }, "r5");
  assert.ok(play(g, "a", "wf", { color: "r" }));
  assert.ok(!play(g, "b", "rd"), "pas de +2 sur un +4");
  assert.ok(apply(g, "b", { t: "draw" }));
  assert.equal(g.hands.b.length, 7);
}

{ // Manches : le score se cumule, et la partie ne s'arrête qu'à la dernière.
  const s = { phase: "end", order: ["a", "b"], left: { a: 0, b: 12 }, totals: { a: 5, b: 1 }, round: 1, rules: { rounds: 2 } };
  tally(s, 1000);
  assert.deepEqual(s.totals, { a: 5, b: 13 });
  assert.equal(s.phase, "recap");
  Object.assign(s, { phase: "end", round: 2 });
  tally(s, 1000);
  assert.equal(s.phase, "end");
}

{ // 7 : échange de mains. 0 : les mains tournent. À la volée.
  const g = table({ sevenZero: true, jumpIn: true }, { a: ["r7", "r0", "r1"], b: ["g1", "g2"], c: ["r7", "y3", "y4", "r0"] }, "r5");
  assert.ok(!play(g, "a", "r7"), "il faut désigner un joueur");
  assert.ok(play(g, "a", "r7", { target: "b" }));
  assert.deepEqual(g.hands.a, ["g1", "g2"]);
  assert.ok(play(g, "c", "r7", { target: "a" }), "à la volée");
  assert.deepEqual(g.hands.c, ["g1", "g2"]);
  assert.equal(g.s.order[g.s.turn], "a");
  assert.ok(play(g, "a", "r0"));
  assert.deepEqual(g.hands.b, ["y3", "y4"]);
}

{ // Pioche : carte jouable gardée en main le temps de choisir, sinon le tour passe.
  const g = table({}, { a: ["g1", "g2"], b: ["g3", "g4"] }, "r5");
  g.deck = ["b8", "r9"];
  apply(g, "a", { t: "draw" });
  assert.equal(g.s.drawn, true);
  assert.ok(!playable(g.s, "a", g.hands.a, 0));
  assert.ok(play(g, "a", "r9"));
  apply(g, "b", { t: "draw" });
  assert.equal(g.s.order[g.s.turn], "a");
}

{ // Flip : le côté sombre prend la main, et l'autre face de la défausse devient la carte à suivre.
  const g = table(PRESETS.flip, { a: ["rxo5", "g1p2", "b2l3"], b: ["r3o9", "y4n4"], c: ["y5p5", "g6l6"] }, "r7", { side: "l" });
  assert.ok(play(g, "a", "rxo5"));
  assert.equal(g.s.side, "d");
  assert.equal(g.s.top, "o5");
  assert.equal(g.s.color, "o");
  assert.ok(playable(g.s, "b", g.hands.b, 0), "o9 sur o5");
  assert.ok(!playable(g.s, "b", g.hands.b, 1), "n4 sur o5");
  assert.equal(g.s.peeks.b, "r3y4", "les adversaires voient l'autre face");
}

{ // Flip sombre : joker pioche-couleur, puis passe tout le monde.
  const g = table(PRESETS.flip, { a: ["r1wk", "r2oe", "r3o3"], b: ["r4l1", "r5o2"] }, "r9o9", { side: "d", top: "o9", color: "o" });
  g.deck = ["g1l2", "g2n1", "g3p4", "g4o8", "g5l5"];
  assert.ok(play(g, "a", "r1wk", { color: "o" }));
  assert.equal(g.s.hunt, "o");
  assert.ok(!playable(g.s, "b", g.hands.b, 1), "il faut piocher");
  assert.ok(apply(g, "b", { t: "draw" }));
  assert.equal(g.hands.b.length, 4, "pioche jusqu'au orange");
  assert.equal(g.s.order[g.s.turn], "a");
  assert.ok(play(g, "a", "r2oe"));
  assert.equal(g.s.order[g.s.turn], "a", "passe tout le monde");
}

{ // No Mercy : cumul croissant, joker demi-tour +4, défausse de couleur, roulette.
  const g = table(PRESETS.nomercy, { a: ["rd", "wz", "r1"], b: ["wv", "rq", "g1"], c: ["ra", "r4", "r5", "y2"] }, "r9");
  assert.ok(play(g, "a", "rd"));
  assert.ok(play(g, "b", "wv", { color: "r" }));
  assert.equal(g.s.penalty, 6);
  assert.equal(g.s.order[g.s.turn], "a", "le demi-tour renvoie le malus");
  assert.ok(playable(g.s, "a", g.hands.a, g.hands.a.indexOf("wz")), "+10 sur +4");
  assert.ok(!playable(g.s, "a", ["rd"], 0), "pas de +2 sur +4");
  assert.ok(play(g, "a", "wz", { color: "r" }));
  assert.equal(g.s.penalty, 16);
  assert.equal(g.s.order[g.s.turn], "c", "le sens reste inversé");
  assert.ok(apply(g, "c", { t: "draw" }));
  assert.equal(g.s.order[g.s.turn], "b");
  const h = table(PRESETS.nomercy, { a: ["ra", "r4", "r5", "y2"], b: ["wo", "g1"] }, "r9");
  assert.ok(play(h, "a", "ra"));
  assert.deepEqual(h.hands.a, ["y2"], "toute la couleur part");
  assert.equal(h.pile.at(-1), "ra");
  assert.ok(play(h, "b", "wo"));
  assert.equal(h.s.hunt, "?");
  h.deck = ["g7", "b3", "y9"];
  assert.ok(!apply(h, "a", { t: "draw" }), "la victime choisit la couleur");
  assert.ok(apply(h, "a", { t: "draw", color: "b" }));
  assert.equal(h.hands.a.length, 3);
  assert.equal(h.s.color, "b");
}

{ // No Mercy : à 25 cartes, on quitte la manche ; le dernier en lice gagne.
  const g = table(PRESETS.nomercy, { a: ["wh", "r1"], b: Array(20).fill("g1"), c: ["y3", "y4"] }, "r9");
  g.deck = Array(30).fill("b2");
  assert.ok(play(g, "a", "wh", { color: "r" }));
  assert.ok(apply(g, "b", { t: "draw" }));
  assert.equal(g.s.gone.b, 20 + 6 * 2, "ses points sont comptés");
  assert.equal(g.hands.b.length, 0);
  assert.equal(g.s.order[g.s.turn], "c");
  assert.ok(g.deck.length >= 26);
}

// Parties entières au hasard : aucune carte ne se perd, la partie se termine.
for (const rules of [{}, { stack: "all", skipBlocks: true, reverseReturns: true, drawUntil: true, sevenZero: true, jumpIn: true }, PRESETS.flip, { ...PRESETS.flip, jumpIn: true, stack: "all" }, PRESETS.nomercy, { ...PRESETS.nomercy, jumpIn: true, skipBlocks: true }]) {
  for (let round = 0; round < 40; round++) {
    const base = { order: ["a", "b", "c", "d"], rules: { ...PRESETS.classic, ...rules } };
    const dealt = deal(base);
    const s = opening(base, dealt);
    const g = { s, ...dealt };
    const size = buildDeck(s.rules.deck).length;
    for (let moves = 0; s.phase === "play"; moves++) {
      assert.ok(moves < 20000, "partie sans fin");
      const tries = s.order.flatMap((id) => (g.hands[id] || []).map((card, i) => [id, i, card])).filter(([id, i]) => playable(s, id, g.hands[id], i));
      const cur = s.order[s.turn];
      if (tries.length) {
        const [id, i, card] = tries[moves % tries.length];
        const colors = s.side === "d" ? "olpn" : "rgby";
        assert.ok(apply(g, id, { t: "play", i, card, color: colors[moves % 4], target: s.order.find((o) => o !== id && !s.gone?.[o]) }));
      } else {
        assert.ok(apply(g, cur, { t: "auto" }));
      }
      const total = Object.values(g.hands).flat().length + g.deck.length + g.pile.length;
      assert.equal(total, size);
      assert.ok(s.turn >= 0 && s.turn < 4 && (s.phase !== "play" || !s.gone?.[s.order[s.turn]]));
    }
    assert.ok(!(g.hands[s.winner] || []).length || s.order.every((id) => id === s.winner || s.gone?.[id]));
  }
}

console.log("uno : règles vérifiées");
