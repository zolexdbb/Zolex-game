// Vérification des règles du Uno : `node js/games/uno/logic.test.js`
import assert from "node:assert/strict";
import { PRESETS, buildDeck, deal, apply, playable, isWild } from "./logic.js";

const table = (rules, hands, top, extra = {}) => ({
  s: {
    phase: "play", order: Object.keys(hands), turn: 0, dir: 1, top, color: top[0], penalty: 0,
    rules: { ...PRESETS.classic, ...rules }, ...extra
  },
  hands, deck: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"], pile: [top]
});
const play = (g, uid, card, more) => apply(g, uid, { t: "play", i: g.hands[uid].indexOf(card), card, ...more });

assert.equal(buildDeck().length, 108);

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

// Parties entières au hasard : aucune carte ne se perd, la partie se termine.
for (const rules of [{}, { stack: "all", skipBlocks: true, reverseReturns: true, drawUntil: true, sevenZero: true, jumpIn: true }]) {
  for (let round = 0; round < 40; round++) {
    const s = { phase: "play", order: ["a", "b", "c", "d"], turn: 0, dir: 1, penalty: 0, rules: { ...PRESETS.classic, ...rules } };
    const g = { s, ...deal(s) };
    Object.assign(s, { top: g.pile[0], color: g.pile[0][0] });
    for (let moves = 0; s.phase === "play"; moves++) {
      assert.ok(moves < 20000, "partie sans fin");
      const tries = s.order.flatMap((id) => (g.hands[id] || []).map((card, i) => [id, i, card])).filter(([id, i]) => playable(s, id, g.hands[id], i));
      const cur = s.order[s.turn];
      if (tries.length) {
        const [id, i, card] = tries[moves % tries.length];
        assert.ok(apply(g, id, { t: "play", i, card, color: "rgby"[moves % 4], target: s.order.find((o) => o !== id) }));
      } else {
        assert.ok(apply(g, cur, { t: "auto" }));
      }
      const total = Object.values(g.hands).flat().length + g.deck.length + g.pile.length;
      assert.equal(total, 108);
      assert.ok(s.turn >= 0 && s.turn < 4);
    }
    assert.equal((g.hands[s.winner] || []).length, 0);
  }
}

console.log("uno : règles vérifiées");
