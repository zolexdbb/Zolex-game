// Vérification des règles de Connexion (dans le navigateur : la banque de mots dépend du DOM).
import assert from "node:assert/strict";
import { judge, needed, bonus, sameWord } from "./logic.js";

const used = { chat: "Chat", chien: "Chien" };
const players = ["a", "b", "c"];

{ // Mot déjà dit refusé, pluriel et accents ignorés ; pas d'accord à 2 sur 3 sans la majorité.
  const v = judge({ players, answers: { a: "Chats", b: "Animal", c: "animal" }, used });
  assert.equal(v.words.a, null, "chat déjà dit");
  assert.equal(v.refused.a, "Chats");
  assert.equal(v.best, 2);
  assert.equal(v.agreed, null, "il faut les trois");
  assert.deepEqual(v.points, { b: 1, c: 1 }, "un point aux deux qui se rejoignent");
}

{ // Majorité : 2 sur 3 suffisent ; accents et casse ignorés.
  const v = judge({ players, answers: { a: "Éléphant", b: "elephants", c: "Souris" }, used, majority: true });
  assert.equal(v.agreed, "Éléphant", "le mot tel qu'il a été écrit");
}

{ // Accord de tous.
  const v = judge({ players, answers: { a: "Croquette", b: "croquettes", c: "CROQUETTE" }, used });
  assert.equal(v.agreed, "Croquette");
  assert.equal(Object.keys(v.points).length, 3);
}

{ // Réponses vides : pas d'accord possible, personne ne marque.
  const v = judge({ players, answers: { a: "", b: "  ", c: "Os" }, used });
  assert.equal(v.agreed, null);
  assert.deepEqual(v.points, {});
}

assert.equal(needed(3, false), 3);
assert.equal(needed(3, true), 2);
assert.equal(needed(6, true), 4);
assert.equal(needed(2, true), 2);
assert.equal(bonus(1), 9);
assert.equal(bonus(12), 1);

// Fautes d'orthographe : à une faute près (deux dès 8 lettres), sauf pour les mots courts.
assert.ok(sameWord("Ornithorinque", "ornithorynque"));
assert.ok(!sameWord("chat", "char"), "mots courts : orthographe exacte");
{ const v = judge({ players, answers: { a: "Marmotte", b: "marmote", c: "Marmottes" }, used });
  assert.equal(v.agreed, "Marmotte"); }
{ const v = judge({ players, answers: { a: "Chiens", b: "Lapin", c: "Lapins" }, used: { chien: "Chien" } });
  assert.equal(v.words.a, null, "faute ou pluriel d'un mot déjà dit : refusé"); }

console.log("connexion : règles vérifiées");
