// Vérification de la banque de mots : `node js/words/words.test.js`
import assert from "node:assert/strict";
import { GROUPS, PACKS } from "./index.js";

const norm = (word) => word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Mots au singulier qui finissent quand même par s ou x.
const SINGULAR = /(as|is|os|us|ys|ès|ox|ix|ex|ux|tennis|bras|bus|ours|vis|radis|panais|souris|verglas|matelas|cadenas|compas|colis|palais|marais|hautbois|tetris|kratos|paris|londres|vegas|angeles|legends|stars|clans|skylines|souls|guys|birds|invaders|surfers|bros|dogs|sports|strikers|sims|titans|geass|freddy's|pilates|pattes|ondes|avions|cheveux|dents|dos|pommes|raisins|vacances|feuilles|toux|démons|dauphinois|notes|dames|échecs|gras|pass|roblox|jackbox|box|lynx|bmx|picross|crs|gps|nintendo ds|pes)$/i;

assert.ok(GROUPS.length >= 150, "au moins 150 familles");
for (const group of GROUPS) {
  assert.ok(group.length >= 3 && group.length <= 6, `famille de 3 à 6 mots : ${group}`);
  for (const word of group) assert.ok(!/[sx]$/i.test(word) || SINGULAR.test(word), `pluriel ? ${word}`);
}
const seen = new Map();
for (const word of GROUPS.flat()) {
  assert.ok(!seen.has(norm(word)), `mot en double : ${word}`);
  seen.set(norm(word), true);
}

// Packs à thème : des noms propres (souvent en s ou x), donc pas de contrôle de pluriel ;
// assez de familles pour plusieurs parties, et aucun mot en double dans un même pack.
for (const pack of PACKS) {
  assert.ok(pack.groups.length >= 30, `${pack.name} : au moins 30 familles`);
  const inPack = new Set();
  for (const group of pack.groups) {
    assert.ok(group.length >= 3 && group.length <= 6, `${pack.name} : famille de 3 à 6 mots : ${group}`);
    for (const word of group) {
      assert.ok(!inPack.has(norm(word)), `${pack.name} : mot en double : ${word}`);
      inPack.add(norm(word));
    }
  }
}
assert.equal(new Set(PACKS.map((pack) => pack.id)).size, PACKS.length, "identifiants de packs uniques");

console.log(`mots : ${GROUPS.length} familles et ${PACKS.length} packs vérifiés`);
