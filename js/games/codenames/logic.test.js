// Vérification des règles de Code Name (dans le navigateur : la banque de mots dépend du DOM).
import assert from "node:assert/strict";
import { makeKey, makeTeams, afterReveal, checkClue, total, teamsCheck, next, GRIDS } from "./logic.js";

{ // Carte-clé : 9 pour l'équipe qui commence, 8 pour l'autre, 7 neutres, 1 assassin.
  const key = makeKey(["b", "r"]);
  const count = (c) => key.filter((x) => x === c).length;
  assert.deepEqual([count("b"), count("r"), count("n"), count("a")], [9, 8, 7, 1]);
}

{ // Équipes équilibrées, un maître-espion dans chacune.
  const { teams, spy } = makeTeams(["a", "b", "c", "d", "e"]);
  assert.ok(Math.abs(teams.r.length - teams.b.length) <= 1);
  assert.ok(teams.r.includes(spy.r) && teams.b.includes(spy.b));
}

{ // Composition de l'hôte respectée ; nouveau venu dans l'équipe la moins nombreuse ; espion absent remplacé.
  const { teams, spy } = makeTeams(["a", "b", "c", "d", "e"], { a: "r", b: "r", c: "r", d: "b" }, { r: "b", b: "z" });
  assert.deepEqual([...teams.r].sort(), ["a", "b", "c"]);
  assert.deepEqual([...teams.b].sort(), ["d", "e"]);
  assert.equal(spy.r, "b");
  assert.ok(teams.b.includes(spy.b), "espion absent remplacé");
  assert.equal(teamsCheck({ teams: { a: "r", b: "r", c: "r", d: "b" } }, 4), "Il faut au moins 2 joueurs dans chaque équipe.");
  assert.equal(teamsCheck({ teams: { a: "r", b: "r", c: "b", d: "b" } }, 4), null);
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
assert.deepEqual(afterReveal(s, "r", "a", { c0: "a" }), { winner: "b", assassin: true, out: "r" });
assert.deepEqual(afterReveal(s, "r", "n", { c0: "n" }), { switch: true });
assert.deepEqual(afterReveal(s, "r", "r", { c0: "r" }), {});
const eightBlue = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, "b"]));
assert.deepEqual(afterReveal(s, "r", "b", eightBlue), { winner: "b" }, "les bleus finissent leur grille pendant le tour rouge");

// --- 3 et 4 équipes ---
for (const [n, neutral] of [[3, 10], [4, 8]]) { // La grille grandit : 9 + 8 par équipe, 1 assassin, le reste neutre.
  const order = ["g", "r", "y", "b"].slice(0, n);
  const key = makeKey(order);
  const count = (c) => key.filter((x) => x === c).length;
  assert.equal(key.length, GRIDS[n].size);
  assert.deepEqual(order.map(count), [9, ...Array(n - 1).fill(8)]);
  assert.deepEqual([count("n"), count("a")], [neutral, 1]);
}

{ // Répartition sur 4 équipes : 2 joueurs chacune, un maître-espion dans chaque.
  const { teams, spy } = makeTeams(["a", "b", "c", "d", "e", "f", "g", "h"], {}, {}, 4);
  assert.deepEqual(Object.keys(teams), ["r", "b", "g", "y"]);
  for (const team of Object.keys(teams)) {
    assert.equal(teams[team].length, 2);
    assert.ok(teams[team].includes(spy[team]));
  }
  // Une composition faite pour 4 équipes, relancée à 3 : les jaunes sont répartis ailleurs.
  const three = makeTeams(["a", "b", "c", "d", "e", "f"], { a: "r", b: "b", c: "g", d: "y", e: "y", f: "r" }, {}, 3);
  assert.deepEqual(Object.keys(three.teams), ["r", "b", "g"]);
  assert.equal(Object.values(three.teams).flat().length, 6);
}

{ // Assez de joueurs : 2 par équipe.
  assert.equal(teamsCheck({ teamCount: 3 }, 5), "Il faut au moins 6 joueurs pour 3 équipes.");
  assert.equal(teamsCheck({ teamCount: 4 }, 7), "Il faut au moins 8 joueurs pour 4 équipes.");
  assert.equal(teamsCheck({ teamCount: 3 }, 6), null);
  assert.equal(teamsCheck({ teamCount: 3, teams: { a: "r", b: "r", c: "b", d: "b", e: "g", f: "r" } }, 6), "Il faut au moins 2 joueurs dans chaque équipe.");
}

{ // L'assassin élimine l'équipe, le tour saute les éliminés, la dernière équipe restante gagne.
  const s4 = { first: "g", order: ["g", "r", "y", "b"], out: null, grid: Array(42).fill("x"), revealed: {} };
  assert.equal(total(s4, "g"), 9);
  assert.equal(total(s4, "y"), 8);
  assert.deepEqual(afterReveal(s4, "r", "a", { c0: "a" }), { out: "r", assassin: true, switch: true });
  assert.equal(next(s4, "r", { r: true }), "y");
  assert.equal(next(s4, "g", { r: true }), "y", "les rouges éliminés sont sautés");
  assert.equal(next(s4, "b", { g: true }), "r", "le tour repart du début");
  const two = { ...s4, out: { r: true, y: true } };
  assert.deepEqual(afterReveal(two, "b", "a", { c0: "a" }), { winner: "g", assassin: true, out: "b" });
  // Une équipe qui retourne toutes ses cases gagne, même pendant le tour d'une autre.
  const eightYellow = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`c${i}`, "y"]));
  assert.deepEqual(afterReveal(s4, "b", "y", eightYellow), { winner: "y" });
  // Une équipe éliminée ne gagne plus, même si ses cases sont toutes retournées.
  assert.deepEqual(afterReveal({ ...s4, out: { y: true } }, "b", "y", eightYellow), { switch: true });
}

console.log("code name : règles vérifiées");
