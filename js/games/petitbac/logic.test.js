// Vérification des règles du Petit Bac (dans le navigateur : la normalisation vient de dessin/logic.js).
import assert from "node:assert/strict";
import { scoreManche, tallyRefusals, startsWith, pickLetter } from "./logic.js";

assert.ok(startsWith("Élan", "E"), "accents ignorés");
assert.ok(!startsWith("Lama", "E"));
assert.ok(!"KQUWXYZ".includes(pickLetter()));
assert.notEqual(pickLetter("ABCDEFGHIJLMNOPRST"), "A", "lettres déjà jouées évitées");

{ // 10 si unique, 5 si partagée (pluriel et accents ignorés), 0 si vide, mauvaise lettre ou refusée.
  const answers = {
    a: { pays: "Espagne", animal: "Éléphant", metier: "Électricien" },
    b: { pays: "espagne", animal: "Escargot", metier: "Boulanger" },
    c: { pays: "Égypte", animal: "", metier: "Ébéniste" }
  };
  const points = scoreManche({ players: ["a", "b", "c"], cats: ["pays", "animal", "metier"], letter: "E", answers, refused: { "c|metier": true } });
  assert.deepEqual(points.a, { pays: 5, animal: 10, metier: 10 });
  assert.deepEqual(points.b, { pays: 5, animal: 10, metier: 0 });
  assert.deepEqual(points.c, { pays: 10, animal: 0, metier: 0 });
}

{ // Refus à la majorité des autres votants (l'auteur ne compte pas).
  const refused = tallyRefusals({ players: ["a", "b", "c", "d"], votes: { a: ["d|pays"], b: ["d|pays", "a|ville"], c: [], d: [] } });
  assert.deepEqual(refused, { "d|pays": true }, "2 sur 3 contre d ; 1 sur 3 contre a");
}

console.log("petit bac : règles vérifiées");
