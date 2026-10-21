// Vérification des cartes et des règles de Taboo (dans le navigateur).
import assert from "node:assert/strict";
import { CARDS } from "./cards.js";
import { pickCard, POINTS } from "./logic.js";

assert.ok(CARDS.length >= 150, "au moins 150 cartes");
const words = new Set();
for (const card of CARDS) {
  assert.equal(card.banned.length, 5, `5 mots interdits : ${card.word}`);
  assert.ok(card.banned.every(Boolean), `pas de mot interdit vide : ${card.word}`);
  assert.ok(!card.banned.some((b) => b.toLowerCase() === card.word.toLowerCase()), `le mot n'est pas dans ses interdits : ${card.word}`);
  assert.ok(!words.has(card.word.toLowerCase()), `carte en double : ${card.word}`);
  words.add(card.word.toLowerCase());
}
// Les cartes déjà sorties ne reviennent pas tant qu'il en reste.
const used = CARDS.map((_, i) => i).slice(1);
assert.equal(pickCard(used), 0);
assert.deepEqual(POINTS, { found: 1, taboo: -1, pass: 0 });

console.log(`taboo : ${CARDS.length} cartes vérifiées`);
