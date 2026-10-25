// Vérification des cartes et des règles de Taboo (dans le navigateur).
import assert from "node:assert/strict";
import { CARDS } from "./cards.js";
import { pickCard, POINTS, forbiddenIn, guessMatches, near } from "./logic.js";

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

// Par écrit : indices interdits refusés, même avec une faute ou un mot de la même famille.
const card = { word: "Plage", banned: ["Sable", "Mer", "Soleil", "Vacances", "Serviette"] };
assert.equal(forbiddenIn("on y bronze en été", card, 1), null);
assert.equal(forbiddenIn("du sabble chaud", card, 1), "Sable", "une faute ne contourne pas l'interdit");
assert.equal(forbiddenIn("les plagistes", card, 1), "Plage", "même famille");
assert.equal(forbiddenIn("La MER", card, 0), "Mer", "majuscules ignorées");
assert.equal(forbiddenIn("une salle de bain", { word: "Douche", banned: ["Eau", "Laver", "Salle de bain", "Savon", "Shampoing"] }, 1), "Salle de bain", "interdit en plusieurs mots");
assert.equal(forbiddenIn("on y va en mars", card, 1), null, "mots courts : pas de faute tolérée (mars n'est pas mer)");
// Réponses : tolérance réglable, jamais sur les mots courts.
assert.ok(guessMatches("hipopotame", "Hippopotame", 1));
assert.ok(!guessMatches("hipopotame", "Hippopotame", 0), "stricte");
assert.ok(guessMatches("Plages", "Plage", 0), "pluriel et majuscules ignorés même en strict");
assert.ok(guessMatches("plaje", "Plage", 1), "à partir de 5 lettres, une faute passe");
assert.ok(!guessMatches("lune", "Lame", 2), "4 lettres : orthographe exacte");
assert.ok(guessMatches("crocodil", "Crocodile", 1));
assert.ok(guessMatches("cocrodile", "Crocodile", 2));
assert.ok(!near("mer", "mur", 2), "jamais de faute sur 3 lettres");

console.log(`taboo : ${CARDS.length} cartes vérifiées`);
