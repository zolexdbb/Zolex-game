// Vérification des règles de Devine le dessin (dans le navigateur : la banque de mots dépend du DOM).
import assert from "node:assert/strict";
import { gainFor, levenshtein, isClose } from "./logic.js";

// Points : 100 au départ, 20 à la fin, et une pente forte au début.
assert.equal(gainFor(0), 100);
assert.equal(gainFor(1), 20);
assert.ok(gainFor(0.1) < 82 && gainFor(0.1) > 74, "environ 78 à 10 % du temps");
assert.ok(gainFor(0) - gainFor(0.1) > gainFor(0.5) - gainFor(0.6), "les premiers secondes comptent plus que les dernières");
for (let t = 0; t < 1; t += 0.05) assert.ok(gainFor(t) >= gainFor(t + 0.05), "décroissant");

// Distance entre deux mots.
assert.equal(levenshtein("girafe", "girafe"), 0);
assert.equal(levenshtein("girafe", "giraffe"), 1);
assert.equal(levenshtein("chat", "chien"), 3);

// « Presque ! » : une lettre de travers (deux pour les mots longs), accents et pluriel ignorés.
assert.ok(isClose("girafon", "Girafe") === false, "deux lettres sur un mot court");
assert.ok(isClose("giraffe", "Girafe"));
assert.ok(isClose("elefant", "Éléphant"), "deux erreurs permises sur un mot de 8 lettres");
assert.ok(!isClose("eleve", "Éléphant"), "trop loin");
assert.ok(isClose("elephan", "Éléphant"));
assert.ok(isClose("hipopotame", "Hippopotame"));
assert.ok(isClose("hipopotam", "Hippopotame"), "deux erreurs sur un mot long");
assert.ok(!isClose("girafes", "Girafe"), "bonne réponse au pluriel : pas « presque », c'est trouvé");

console.log("devine le dessin : règles vérifiées");
