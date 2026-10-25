// Vérification du paquet du Capy Deal, d'après le décompte de la boîte (dans le navigateur).
import assert from "node:assert/strict";
import { GROUPS, STREETS, buildDeck, cardTypes } from "./cards.js";

const deck = buildDeck();
const count = (kind) => deck.filter((c) => c.kind === kind).length;

assert.equal(deck.length, 115, "115 cartes dans la boîte");
assert.equal(count("money"), 18);
assert.equal(count("property"), 28);
assert.equal(count("wild"), 11);
assert.equal(count("action") + count("rent"), 58);
assert.equal(new Set(deck.map((c) => c.uid)).size, deck.length, "chaque carte a un identifiant unique");

// Chaque groupe a autant de rues que de loyers (le dernier loyer = groupe complet).
for (const [group, info] of Object.entries(GROUPS)) {
  assert.equal(STREETS[group].length, info.rents.length, `${info.name} : une rue par carte du groupe`);
}

// Quelques comptes de la boîte.
const copies = (id) => cardTypes().find((t) => t.id === id).count;
assert.equal(copies("non"), 5);
assert.equal(copies("argent-15"), 1);
assert.equal(deck.filter((c) => c.kind === "rent" && c.double).length, 8, "3 loyers doubles jokers + 5 par paire");

console.log("capy deal : paquet vérifié");
