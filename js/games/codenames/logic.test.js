// Vérification des règles de Nom de code (dans le navigateur : la banque de mots dépend du DOM).
import assert from "node:assert/strict";
import { makeKey, makeTeams, afterReveal, checkClue, total } from "./logic.js";

{ // Carte-clé : 9 pour l'équipe qui commence, 8 pour l'autre, 7 neutres, 1 assassin.
  const key = makeKey("b");
  const count = (c) => key.filter((x) => x === c).length;
  assert.deepEqual([count("b"), count("r"), count("n"), count("a")], [9, 8, 7, 1]);
}

{ // Équipes équilibrées, un maître-espion dans chacune.
  const { teams, spy } = makeTeams(["a", "b", "c", "d", "e"]);
  assert.ok(Math.abs(teams.r.length - teams.b.length) <= 1);
  assert.ok(teams.r.includes(spy.r) && teams.b.includes(spy.b));
}

const s = { first: "r", grid: ["Chat", "Chien", "Maison", ...Array(22).fill("x")], revealed: {} };
assert.equal(total(s, "r"), 9);
assert.equal(total(s, "b"), 8);

// Indice : un seul mot, absent de la grille.
assert.ok(checkClue(s, "chats"), "pluriel d'un mot de la grille");
assert.ok(checkClue(s, "deux mots"), "deux mots");
assert.equal(checkClue(s, "Animal"), null);
assert.equal(checkClue({ ...s, revealed: { c0: "r" } }, "chat"), null, "mot déjà retourné : permis");

// Suites d'une case retournée.
assert.deepEqual(afterReveal(s, "r", "a", { c0: "a" }), { winner: "b", assassin: true });
assert.deepEqual(afterReveal(s, "r", "n", { c0: "n" }), { switch: true });
assert.deepEqual(afterReveal(s, "r", "r", { c0: "r" }), {});
const eightBlue = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, "b"]));
assert.deepEqual(afterReveal(s, "r", "b", eightBlue), { winner: "b" }, "les bleus finissent leur grille pendant le tour rouge");

console.log("nom de code : règles vérifiées");
