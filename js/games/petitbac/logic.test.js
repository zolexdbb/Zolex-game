// Vérification des règles du Petit Bac (dans le navigateur : la normalisation vient de dessin/logic.js).
import assert from "node:assert/strict";
import { scoreManche, tallyRefusals, startsWith, isValid, pickLetter, hostTick } from "./logic.js";

assert.ok(startsWith("Élan", "E"), "accents ignorés");
assert.ok(!startsWith("Lama", "E"));
assert.ok(!"KQUWXYZ".includes(pickLetter()));
assert.notEqual(pickLetter("ABCDEFGHIJLMNOPRST"), "A", "lettres déjà jouées évitées");

{ // 20 si seul à répondre, 10 si unique, 5 si partagée (pluriel et accents ignorés), 0 si vide, mauvaise lettre ou refusée.
  const answers = {
    a: { pays: "Espagne", animal: "Éléphant", metier: "Électricien" },
    b: { pays: "espagne", animal: "Escargot", metier: "Boulanger" },
    c: { pays: "Égypte", animal: "", metier: "Ébéniste" }
  };
  const points = scoreManche({ players: ["a", "b", "c"], cats: ["pays", "animal", "metier"], letter: "E", answers, refused: { "c|metier": true } });
  assert.deepEqual(points.a, { pays: 5, animal: 10, metier: 20 }, "seul métier valable : 20");
  assert.deepEqual(points.b, { pays: 5, animal: 10, metier: 0 });
  assert.deepEqual(points.c, { pays: 10, animal: 0, metier: 0 });
}

{ // Refus à la majorité des autres joueurs (l'auteur ne compte pas).
  const refused = tallyRefusals({ players: ["a", "b", "c", "d"], votes: { a: ["d|pays"], b: ["d|pays", "a|ville"], c: [], d: [] } });
  assert.deepEqual(refused, { "d|pays": true }, "2 sur 3 contre d ; 1 sur 3 contre a");
}

{ // Ne pas voter, c'est accepter : un seul votant sur 5 ne refuse rien.
  const refused = tallyRefusals({ players: ["a", "b", "c", "d", "e"], votes: { a: ["b|pays", "c|ville"] } });
  assert.deepEqual(refused, {});
  // On ne se conteste pas soi-même.
  assert.deepEqual(tallyRefusals({ players: ["a", "b", "c"], votes: { a: ["a|pays"], b: ["a|pays"] } }), {});
}

{ // À 2 joueurs, une contestation rend la réponse douteuse : 5 points au plus, pas 0.
  const refused = tallyRefusals({ players: ["a", "b"], votes: { a: ["b|pays", "b|ville"] } });
  assert.deepEqual(refused, { "b|pays": "doute", "b|ville": "doute" });
  const answers = { a: { pays: "Mali", ville: "Metz" }, b: { pays: "Maroc", ville: "Metz" } };
  const points = scoreManche({ players: ["a", "b"], cats: ["pays", "ville"], letter: "M", answers, refused });
  assert.deepEqual(points.b, { pays: 5, ville: 5 });
  assert.deepEqual(points.a, { pays: 10, ville: 5 });
  // Seul à répondre mais douteux : toujours 5 au plus.
  const lone = scoreManche({ players: ["a", "b"], cats: ["pays"], letter: "M", answers: { a: { pays: "" }, b: { pays: "Maroc" } }, refused: { "b|pays": "doute" } });
  assert.equal(lone.b.pays, 5);
}

{ // Une seule lettre ne compte pas.
  assert.ok(!isValid("M", "M"));
  assert.ok(!isValid("M.", "M"));
  assert.ok(isValid("Mû", "M"));
  const points = scoreManche({ players: ["a"], cats: ["animal"], letter: "M", answers: { a: { animal: "M" } } });
  assert.equal(points.a.animal, 0);
}

// Dépouillement et points sans chrono : on attend tout le monde, ou que l'hôte force.
{
  const noUndefined = (value) => JSON.stringify(value, (k, v) => { if (v === undefined) throw new Error(`undefined : ${k}`); return v; });
  const run = async (state, actions, now = 1000) => {
    let patch = null;
    await hostTick({
      state, actions, now: () => now, nextStep: () => "9",
      room: { players: { a: {}, b: {}, c: {} } },
      patch: async (changes) => { noUndefined(changes); patch = changes; }
    });
    return patch;
  };
  const base = { g: 1, step: "2", order: ["a", "b", "c"], cats: ["pays"], letter: "M", letters: "M", manche: 1,
    rules: { time: 60, manches: 2 }, scores: { a: 0, b: 0, c: 0 }, answers: { a: { pays: "Mali" }, b: { pays: "Maroc" }, c: { pays: "" } } };
  const review = { ...base, phase: "review", until: null };
  assert.equal(await run(review, { a: { refuse: [] }, b: { refuse: [] } }, 10 ** 13), null, "un vote manque, pas de chrono : on attend");
  const counted = await run(review, { a: { refuse: [] }, b: { refuse: [] }, c: { refuse: [] } });
  assert.equal(counted["state/phase"], "recap");
  assert.equal(counted["state/until"], null, "pas de chrono aux points");
  assert.equal((await run({ ...review, until: 500 }, { a: { refuse: [] } }))["state/phase"], "recap", "l'hôte clôt le vote");
  const recap = { ...base, phase: "recap", until: null };
  assert.equal(await run(recap, { a: { ready: true } }, 10 ** 13), null, "on attend que tout le monde soit prêt");
  const next = await run(recap, { a: { ready: true }, b: { ready: true }, c: { ready: true } });
  assert.equal(next["state/phase"], "fill");
  assert.equal(next["state/until"], 1000 + 60000, "le remplissage garde son chrono");
  assert.equal((await run({ ...recap, until: 500 }, {}))["state/phase"], "fill", "l'hôte continue sans attendre");
  assert.equal((await run({ ...recap, manche: 2 }, { a: { ready: true }, b: { ready: true }, c: { ready: true } }))["state/phase"], "end");
}

console.log("petit bac : règles vérifiées");
