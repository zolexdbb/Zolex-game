// Petit Bac : une lettre, des catégories, tout le monde remplit en même temps.
// Les réponses restent sous enveloppe jusqu'à la fin du chrono, puis la table
// conteste les réponses douteuses avant le décompte des points.
import { norm, shuffle } from "../dessin/logic.js";

export const CATEGORIES = [
  ["pays", "Pays"], ["ville", "Ville"], ["prenom", "Prénom"], ["animal", "Animal"],
  ["metier", "Métier"], ["fruit", "Fruit ou légume"], ["objet", "Objet"], ["marque", "Marque"],
  ["film", "Film ou série"], ["sport", "Sport"], ["couleur", "Couleur"], ["celebrite", "Célébrité"],
  ["plat", "Plat"], ["instrument", "Instrument de musique"], ["corps", "Partie du corps"], ["transport", "Moyen de transport"]
];
export const CATEGORY_NAMES = Object.fromEntries(CATEGORIES);
// Les lettres qui laissent une chance dans toutes les catégories.
const LETTERS = "ABCDEFGHIJLMNOPRSTV";

const STOP_GRACE = 10000; // après un « Stop ! », les autres ont encore 10 s
const SEAL_GRACE = 2500; // le temps pour chaque téléphone d'envoyer ses réponses à l'échéance
const REVIEW_TIME = 45000;
const RECAP_TIME = 12000;
export const MAX_ANSWER = 40;

export function pickLetter(used = "") {
  const free = [...LETTERS].filter((letter) => !used.includes(letter));
  return shuffle(free.length ? free : [...LETTERS])[0];
}

// Une réponse compte si elle n'est pas vide et commence par la lettre (accents ignorés).
export const startsWith = (text, letter) => norm(text).startsWith(letter.toLowerCase());

// Points d'une manche. `answers` : { uid: { cat: texte } } ; `refused` : { "uid|cat": true }.
// 10 points pour une réponse que personne d'autre n'a donnée, 5 si elle est partagée, 0 sinon.
export function scoreManche({ players, cats, letter, answers, refused = {} }) {
  const points = Object.fromEntries(players.map((id) => [id, {}]));
  for (const cat of cats) {
    const valid = {};
    for (const id of players) {
      const text = String(answers[id]?.[cat] || "").trim();
      if (text && startsWith(text, letter) && !refused[`${id}|${cat}`]) valid[id] = norm(text);
    }
    const count = {};
    for (const key of Object.values(valid)) count[key] = (count[key] || 0) + 1;
    for (const id of players) points[id][cat] = valid[id] ? (count[valid[id]] > 1 ? 5 : 10) : 0;
  }
  return points;
}

// Une réponse est refusée quand la majorité des autres joueurs qui ont voté la conteste.
export function tallyRefusals({ players, votes }) {
  const refused = {};
  const voters = players.filter((id) => votes[id]);
  const against = {};
  for (const id of voters) for (const key of votes[id] || []) against[key] = (against[key] || 0) + 1;
  for (const [key, n] of Object.entries(against)) {
    const owner = key.split("|")[0];
    const judges = voters.filter((id) => id !== owner).length;
    if (judges && n * 2 > judges) refused[key] = true;
  }
  return refused;
}

export function start({ players, settings, now }) {
  const order = players.map((p) => p.id);
  const letter = pickLetter();
  return {
    state: {
      phase: "fill", manche: 1, letter, letters: letter, order,
      cats: CATEGORIES.map(([id]) => id).filter((id) => settings.cats?.[id]),
      rules: { time: settings.time, manches: settings.manches },
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }])),
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      until: now + settings.time * 1000
    },
    secrets: {},
    vault: {}
  };
}

const present = (s, room) => s.order.filter((id) => room.players?.[id]);

// Commandes de l'hôte.
export const skipWait = (ctx) => ctx.patch({ "state/until": ctx.now() });

export async function hostTick(ctx) {
  const { room, state: s, actions } = ctx;
  if (!s || s.phase === "end") return;
  const now = ctx.now();
  const players = present(s, room);

  if (s.phase === "fill") {
    // « Stop ! » : le chrono se raccourcit pour tout le monde.
    const stopper = players.find((id) => actions?.[id]?.stop);
    if (stopper && !s.stopBy) {
      return ctx.patch({ "state/stopBy": stopper, "state/until": Math.min(s.until, now + STOP_GRACE) });
    }
    if (!room.closed?.[s.g]?.[s.step]) {
      const done = room.done?.[s.g]?.[s.step] || {};
      if (players.every((id) => done[id]) || now >= s.until + SEAL_GRACE) return ctx.patch({ [`closed/${s.g}/${s.step}`]: true });
      return;
    }
    if (!ctx.sealed) return;
    // Les réponses s'affichent : seules celles qui commencent par la bonne lettre sont gardées telles quelles.
    const answers = {};
    for (const id of players) {
      const sent = ctx.sealed[id]?.answers || {};
      answers[id] = Object.fromEntries(s.cats.map((cat) => [cat, String(sent[cat] || "").replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER)]));
    }
    return ctx.patch({
      "state/phase": "review", "state/answers": answers, "state/until": now + REVIEW_TIME, "state/step": ctx.nextStep()
    });
  }

  if (s.phase === "review") {
    const voted = players.filter((id) => actions?.[id]);
    if (voted.length < players.length && now < s.until) return;
    const votes = Object.fromEntries(voted.map((id) => [id, actions[id].refuse || []]));
    const refused = tallyRefusals({ players, votes });
    const points = scoreManche({ players, cats: s.cats, letter: s.letter, answers: s.answers || {}, refused });
    const changes = {
      "state/phase": "recap", "state/refused": refused, "state/points": points,
      "state/until": now + RECAP_TIME, "state/step": ctx.nextStep()
    };
    for (const id of players) {
      changes[`state/scores/${id}`] = (s.scores?.[id] || 0) + Object.values(points[id]).reduce((a, b) => a + b, 0);
    }
    return ctx.patch(changes);
  }

  if (s.phase === "recap" && now >= s.until) {
    if (s.manche >= s.rules.manches) {
      return ctx.patch({ [`ended/${s.g}`]: true, "state/phase": "end", "state/until": null, "state/step": ctx.nextStep() });
    }
    const letter = pickLetter(s.letters);
    return ctx.patch({
      "state/phase": "fill", "state/manche": s.manche + 1, "state/letter": letter, "state/letters": s.letters + letter,
      "state/answers": null, "state/refused": null, "state/points": null, "state/stopBy": null,
      "state/until": now + s.rules.time * 1000, "state/step": ctx.nextStep()
    });
  }
}
