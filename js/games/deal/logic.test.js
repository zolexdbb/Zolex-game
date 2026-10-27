// Vérification des règles du Capy Deal (dans le navigateur).
import assert from "node:assert/strict";
import { apply, autoMove, deal, completeCount, rentOf, assetsOf, propCards, valueOf, info, waitingFor, HAND_MAX } from "./logic.js";

// Une table de trois joueurs : a joue, avec les mains et la table données.
function table(hands, extra = {}) {
  return {
    s: {
      phase: "play", order: ["a", "b", "c"], turn: 0, left: 3, drawn: true,
      tokens: { a: 3, b: 3, c: 3 }, props: {}, bank: {}, ...extra
    },
    hands: { a: [], b: [], c: [], ...hands },
    deck: Array.from({ length: 20 }, (_, i) => `argent-1#${i + 10}`),
    pile: []
  };
}
// Le bouton qu'un joueur toucherait quand il n'a pas d'autre choix : « D'accord », « Tant pis »,
// ou tout donner quand il ne peut pas couvrir la somme. null : il a un vrai choix à faire.
function obvious(g, who) {
  const { s, hands } = g, w = s.wait;
  if (!w || w.kind !== "effect") return null;
  if ((hands[who] || []).some((c) => info(c).id === "non")) return null;
  if (who === w.by) {
    const target = Object.keys(w.targets).find((id) => w.targets[id] === "counter");
    return target ? { t: "ok", target } : null;
  }
  if (w.effect === "pay") {
    const all = assetsOf(s, who);
    return all.reduce((n, c) => n + valueOf(c), 0) <= w.amount ? { t: "pay", cards: all } : null;
  }
  if (w.effect === "fisc" || w.effect === "saisie") {
    return (w.effect === "fisc" ? s.bank?.[who] || [] : propCards(s, who)).length <= 1 ? { t: "ok" } : null;
  }
  return { t: "ok" };
}
// Joue, puis laisse chacun toucher le bouton évident quand il n'a pas le choix.
function run(g, uid, a) {
  const ok = apply(g, uid, a);
  for (let k = 0; k < 20; k++) {
    const moves = waitingFor(g.s).map((who) => [who, obvious(g, who)]).filter(([, next]) => next);
    if (!moves.length || !moves.some(([who, next]) => apply(g, who, next))) break;
  }
  return ok;
}

{ // La donne : 5 cartes chacun, 3 jetons, 115 - 15 cartes dans la pioche.
  const g = deal({ g: "g1", step: "0", order: ["a", "b", "c"], names: {} });
  assert.equal(g.hands.a.length, 5);
  assert.equal(g.deck.length, 100);
  assert.equal(g.s.tokens.b, 3);
}

{ // Début de tour : 2 cartes, 5 si la main est vide. Puis 3 actions au plus.
  const g = table({ a: ["argent-5#1", "argent-2#1", "argent-3#1", "argent-4#1"] }, { drawn: null });
  assert.ok(apply(g, "a", { t: "draw" }));
  assert.equal(g.hands.a.length, 6);
  for (const card of ["argent-5#1", "argent-2#1", "argent-3#1"]) assert.ok(apply(g, "a", { t: "bank", card }));
  assert.ok(!apply(g, "a", { t: "bank", card: "argent-4#1" }), "plus d'action");
  const empty = table({}, { drawn: null });
  apply(empty, "a", { t: "draw" });
  assert.equal(empty.hands.a.length, 5);
}

{ // Propriétés, joker et victoire à 3 groupes complets.
  const g = table({ a: ["prop-brun-2#1", "joker-ciel-brun#1", "prop-bleu-2#1"] }, {
    props: { a: { brun: ["prop-brun-1#1"], vert: ["prop-vert-1#1", "prop-vert-2#1", "prop-vert-3#1"], bleu: ["prop-bleu-1#1"] } }
  });
  assert.ok(!apply(g, "a", { t: "prop", card: "joker-ciel-brun#1", color: "rouge" }), "mauvaise couleur");
  assert.ok(apply(g, "a", { t: "prop", card: "prop-brun-2#1", color: "brun" }));
  assert.equal(completeCount(g.s, "a"), 2);
  assert.ok(apply(g, "a", { t: "prop", card: "prop-bleu-2#1", color: "bleu" }));
  assert.equal(g.s.phase, "end");
  assert.equal(g.s.winner, "a");
}

{ // Loyer : chaque joueur paie selon le nombre posé ; une cabane ajoute 5.
  const g = table({ a: ["loyer-rose-orange#1", "cabane#1"], b: [], c: [] }, {
    props: { a: { rose: ["prop-rose-1#1", "prop-rose-2#1"] } },
    bank: { b: ["argent-5#1"], c: ["argent-1#1", "argent-1#2"] }
  });
  assert.equal(rentOf(g.s, "a", "rose"), 2);
  assert.ok(run(g, "a", { t: "play", card: "cabane#1", color: "rose" }));
  assert.equal(rentOf(g.s, "a", "rose"), 7);
  assert.ok(run(g, "a", { t: "play", card: "loyer-rose-orange#1", color: "rose" }));
  // b a 5 : tout donné, pas assez → un jeton Dette. c a 2 : pareil.
  assert.deepEqual(g.s.bank.a, ["argent-5#1", "argent-1#1", "argent-1#2"]);
  assert.equal(g.s.tokens.b, 2);
  assert.deepEqual(g.s.held.a, ["b", "c"]);
  assert.equal(g.s.wait, null);
}

{ // Payer : il faut couvrir la somme, ou tout donner ; on ne rend pas la monnaie.
  const g = table({ a: ["kaching#1"] }, { bank: { b: ["argent-10#1", "argent-5#1", "argent-1#1"] } });
  assert.ok(run(g, "a", { t: "play", card: "kaching#1", target: "b" }));
  assert.deepEqual(waitingFor(g.s), ["b"], "b a le choix de quoi payer");
  assert.ok(!apply(g, "b", { t: "pay", cards: ["argent-5#1"] }), "pas assez");
  assert.ok(run(g, "b", { t: "pay", cards: ["argent-10#1"] }));
  assert.deepEqual(g.s.bank.a, ["argent-10#1"]);
}

{ // « Non ! » annule ; un « Non ! » de l'auteur le contre.
  const g = table({ a: ["kaching#1", "non#1"], b: ["non#2"] }, { bank: { b: ["argent-10#1"] } });
  run(g, "a", { t: "play", card: "kaching#1", target: "b" });
  assert.deepEqual(waitingFor(g.s), ["b"]);
  assert.ok(apply(g, "b", { t: "non", card: "non#2" }));
  assert.deepEqual(waitingFor(g.s), ["a"], "a peut contrer");
  assert.ok(!apply(g, "a", { t: "non", card: "non#1", target: "c" }), "c n'a rien contré");
  assert.ok(run(g, "a", { t: "non", card: "non#1", target: "b" }));
  // b n'a plus de « Non ! » et doit tout donner (10 = la somme).
  assert.deepEqual(g.s.bank.a, ["argent-10#1"]);
}

{ // Dette : au tour suivant, rembourser d'une carte de la main avant tout, et le créancier la joue aussitôt.
  const g = table({ b: ["argent-3#1", "prop-rose-1#1"] }, { turn: 1, tokens: { a: 3, b: 2, c: 3 }, held: { a: ["b"] }, owe: [{ from: "b", to: "a" }] });
  assert.ok(!apply(g, "b", { t: "bank", card: "argent-3#1" }), "la dette d'abord");
  assert.ok(!apply(g, "b", { t: "end" }), "on ne fuit pas sa dette");
  assert.ok(apply(g, "b", { t: "repay", card: "prop-rose-1#1" }));
  assert.equal(g.s.tokens.b, 3, "le jeton revient");
  assert.deepEqual(waitingFor(g.s), ["a"]);
  assert.ok(!apply(g, "a", { t: "bank" }), "une propriété ne va pas en réserve");
  assert.ok(apply(g, "a", { t: "prop", color: "rose" }));
  assert.deepEqual(g.s.props.a.rose, ["prop-rose-1#1"]);
  assert.equal(g.s.left, 2, "rembourser compte comme une action");
}

{ // Pas de bol : toutes les cartes d'un type de la main de la cible.
  const g = table({ a: ["pasdebol#1"], b: ["argent-1#1", "prop-rose-1#1", "joker-orange-rose#1", "kaching#1"] });
  run(g, "a", { t: "play", card: "pasdebol#1", target: "b", type: "property" });
  assert.deepEqual(g.hands.b, ["argent-1#1", "kaching#1"]);
  assert.deepEqual(g.hands.a, ["prop-rose-1#1", "joker-orange-rose#1"]);
}

{ // Fisc : la cible garde 1 carte de réserve et répartit le reste entre les autres.
  const g = table({ a: ["fisc#1"] }, { bank: { b: ["argent-5#1", "argent-3#1", "argent-1#1"] } });
  run(g, "a", { t: "play", card: "fisc#1", target: "b" });
  assert.ok(!apply(g, "b", { t: "split", keep: "argent-5#1", give: [["argent-3#1", "b"], ["argent-1#1", "c"]] }), "pas à soi-même");
  assert.ok(run(g, "b", { t: "split", keep: "argent-5#1", give: [["argent-3#1", "a"], ["argent-1#1", "c"]] }));
  assert.deepEqual(g.s.bank, { a: ["argent-3#1"], b: ["argent-5#1"], c: ["argent-1#1"] });
}

{ // Saisie : garde 1 propriété, le reste part avec les cabanes.
  const g = table({ a: ["saisie#1"] }, { props: { b: { rose: ["prop-rose-1#1", "prop-rose-2#1"], gare: ["prop-gare-1#1"] } }, cabanes: { b: { rose: 1 } } });
  run(g, "a", { t: "play", card: "saisie#1", target: "b" });
  assert.ok(run(g, "b", { t: "split", keep: "prop-gare-1#1", give: [["prop-rose-1#1", "c"], ["prop-rose-2#1", "a"]] }));
  assert.deepEqual(g.s.props.b, { gare: ["prop-gare-1#1"] });
  assert.equal(g.s.cabanes.c.rose, 1, "la cabane suit le premier receveur du groupe");
}

{ // Krach immo et Cambriolage : une carte choisie chez chaque joueur.
  const g = table({ a: ["krach#1", "cambriolage#1"] }, {
    props: { b: { rose: ["prop-rose-1#1"] }, c: { gare: ["prop-gare-1#1", "prop-gare-2#1"] } },
    bank: { b: ["argent-5#1"], c: ["argent-2#1", "argent-4#1"] }
  });
  assert.ok(run(g, "a", { t: "play", card: "krach#1", picks: [["b", "prop-rose-1#1"], ["c", "prop-gare-2#1"]] }));
  assert.deepEqual(g.s.props.a, { rose: ["prop-rose-1#1"], gare: ["prop-gare-2#1"] });
  assert.ok(run(g, "a", { t: "play", card: "cambriolage#1", picks: [["b", "argent-5#1"], ["c", "argent-4#1"]] }));
  assert.deepEqual(g.s.bank.a, ["argent-5#1", "argent-4#1"]);
}

{ // Gros coup (groupe complet, cabane comprise), Rafle (une couleur chez tous, jokers compris), Arnaque.
  const g = table({ a: ["groscoup#1", "rafle#1", "arnaque#1"] }, {
    props: { b: { brun: ["prop-brun-1#1", "prop-brun-2#1"], gare: ["joker-gare-cie#1"] }, c: { gare: ["prop-gare-1#1"] } },
    cabanes: { b: { brun: 1 } }, bank: { a: ["argent-1#1"], b: ["argent-10#1"] }
  });
  assert.ok(!apply(g, "a", { t: "play", card: "groscoup#1", target: "c", color: "gare" }), "groupe incomplet");
  assert.ok(run(g, "a", { t: "play", card: "groscoup#1", target: "b", color: "brun" }));
  assert.equal(g.s.cabanes.a.brun, 1);
  assert.ok(run(g, "a", { t: "play", card: "rafle#1", color: "gare" }));
  assert.deepEqual(g.s.props.a.gare, ["joker-gare-cie#1", "prop-gare-1#1"]);
  assert.equal(g.s.left, 1);
  assert.ok(run(g, "a", { t: "play", card: "arnaque#1", target: "b" }));
  assert.deepEqual(g.s.bank, { a: ["argent-10#1"], b: ["argent-1#1"] });
}

{ // Ardoise : la cible donne un jeton ; Allez allez : jusqu'à 7 ; Rejouer : le même joueur rejoue.
  const g = table({ a: ["ardoise#1", "allez#1", "rejouer#1"] });
  run(g, "a", { t: "play", card: "ardoise#1", target: "c" });
  assert.deepEqual(g.s.owe, [{ from: "c", to: "a" }]);
  run(g, "a", { t: "play", card: "allez#1" });
  assert.equal(g.hands.a.length, HAND_MAX);
  run(g, "a", { t: "play", card: "rejouer#1" });
  assert.equal(g.s.turn, 0, "toujours a");
  assert.equal(g.s.drawn, null, "nouveau tour : il repioche");
}

{ // Fin de tour au-delà de 7 cartes : défausse.
  const g = table({ a: Array.from({ length: 9 }, (_, i) => `argent-1#${i + 1}`) });
  apply(g, "a", { t: "end" });
  assert.equal(g.s.wait.kind, "discard");
  assert.ok(apply(g, "a", { t: "discard", cards: ["argent-1#1", "argent-1#2"] }));
  assert.equal(g.s.turn, 1);
}

{ // Un effet sur tous les joueurs : chacun répond en même temps, pour lui seul.
  const g = table({ a: ["loyer-rose-orange#1", "non#1"], b: ["non#2"], c: [] }, {
    props: { a: { rose: ["prop-rose-1#1", "prop-rose-2#1"] } },
    bank: { b: ["argent-2#1"], c: ["argent-3#1"] }
  });
  apply(g, "a", { t: "play", card: "loyer-rose-orange#1", color: "rose" });
  assert.deepEqual(waitingFor(g.s).sort(), ["b", "c"], "b et c répondent ensemble");
  // c paie pendant que b dit « Non ! » : l'un n'attend pas l'autre.
  assert.ok(apply(g, "c", { t: "pay", cards: ["argent-3#1"] }));
  assert.ok(apply(g, "b", { t: "non", card: "non#2" }));
  assert.deepEqual(waitingFor(g.s), ["a"], "seul le « Non ! » de b reste à régler");
  assert.ok(!apply(g, "c", { t: "pay", cards: [] }), "c a déjà fini");
  assert.ok(apply(g, "a", { t: "ok", target: "b" }));
  assert.equal(g.s.wait, null);
  assert.deepEqual(g.s.bank.a, ["argent-3#1"]);
}

{ // Un joueur présent répond toujours lui-même, même sans autre choix ; seule la pioche de début de tour se fait seule.
  const g = table({ a: ["kaching#1"] }, { bank: { b: ["argent-1#1"] } });
  apply(g, "a", { t: "play", card: "kaching#1", target: "b" });
  assert.equal(autoMove(g, "b", false), null, "b voit le Ka-ching ! et paie lui-même");
  const start = table({}, { drawn: null });
  assert.deepEqual(autoMove(start, "a", false), { t: "draw" });
}

{ // Joueur absent : l'hôte paie à sa place, réserve d'abord.
  const g = table({ a: ["kaching#1"], b: ["non#1"] }, { bank: { b: ["argent-10#1", "argent-15#1"] } });
  apply(g, "a", { t: "play", card: "kaching#1", target: "b" });
  const auto = autoMove(g, "b", true);
  assert.deepEqual(auto, { t: "pay", cards: ["argent-10#1"] });
  assert.equal(assetsOf(g.s, "b").length, 2);
}

console.log("capy deal : règles vérifiées");
