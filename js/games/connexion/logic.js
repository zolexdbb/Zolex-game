// Connexion : tout le monde écrit en secret un mot qui relie les mots du tour
// précédent ; on révèle tout en même temps, jusqu'à ce que la table dise le même
// mot. Un mot déjà dit dans la manche ne compte plus.
import { siteGroups, parseWords } from "../../ui/wordbank.js";
import { norm, shuffle, levenshtein } from "../dessin/logic.js";

const REVEAL_TIME = 6000;
const END_TIME = 9000;
const MAX_LENGTH = 30;

// Mots de départ possibles : ceux de l'hôte, ou ceux des thèmes cochés du site.
const pool = (settings) => (settings.source === "perso"
  ? parseWords(settings.customText).words
  : [...new Set(siteGroups(settings).flat())]);

// Deux mots de départ, pris dans des familles différentes quand c'est possible
// (relier « Chat » et « Chien » serait trop facile).
export function startWords(settings) {
  if (settings.source === "perso") return shuffle(pool(settings)).slice(0, 2);
  const [a, b] = shuffle(siteGroups(settings));
  return b ? [shuffle(a)[0], shuffle(b)[0]] : shuffle(a).slice(0, 2);
}

// Combien de joueurs doivent écrire le même mot pour gagner la manche.
export const needed = (n, majority) => (majority ? Math.max(2, Math.ceil((2 * n) / 3)) : n);

// Deux réponses sont « le même mot » si elles ne diffèrent que d'une faute (deux dès 8 lettres).
// Jusqu'à 5 lettres, il faut l'orthographe exacte : sinon « chat » et « char » se confondraient.
export function sameWord(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const n = Math.max(x.length, y.length);
  if (n <= 5) return false;
  return levenshtein(x, y) <= (n >= 8 ? 2 : 1);
}

// Regroupe les réponses proches. `words` : { uid: mot | null } → [{ ids, words }].
export function cluster(words, ids) {
  const groups = [];
  for (const id of ids) {
    if (!words[id]) continue;
    const near = groups.filter((g) => g.words.some((w) => sameWord(w, words[id])));
    // Les groupes déjà formés d'abord : le mot affiché reste le premier écrit.
    const merged = { ids: [], words: [] };
    for (const g of near) {
      merged.ids.push(...g.ids);
      merged.words.push(...g.words);
      groups.splice(groups.indexOf(g), 1);
    }
    merged.ids.push(id);
    merged.words.push(words[id]);
    groups.push(merged);
  }
  return groups;
}

// Juge un tour. `answers` : { uid: texte brut } ; `used` : { forme normalisée: mot affiché } déjà dits.
// Renvoie les mots retenus (null = vide ou refusé), le mot le plus partagé, l'accord et les points du tour.
export function judge({ players, answers, used, majority }) {
  const words = {}, refused = {};
  const said = Object.values(used);
  for (const id of players) {
    const raw = String(answers[id] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
    if (!raw || !norm(raw)) { words[id] = null; continue; }
    // Un mot déjà dit, même mal orthographié, ne compte plus.
    if (said.some((w) => sameWord(w, raw))) { words[id] = null; refused[id] = raw; continue; }
    words[id] = raw;
  }
  const groups = cluster(words, players);
  const best = Math.max(0, ...groups.map((g) => g.ids.length));
  const top = groups.filter((g) => g.ids.length === best);
  const agreed = best >= 2 && best >= needed(players.length, majority) ? top[0].words[0] : null;
  const points = {};
  // Dans l'ordre de la table, pour que le résultat ne dépende pas de l'ordre des fusions.
  if (best >= 2) for (const id of players) if (top.some((g) => g.ids.includes(id))) points[id] = 1;
  return { words, refused, best, agreed, points, groups };
}

// Bonus de manche gagnée : plus l'accord vient vite, plus il rapporte.
export const bonus = (tour) => Math.max(1, 10 - tour);

export function start({ players, settings, now }) {
  const order = shuffle(players.map((p) => p.id));
  const first = startWords(settings);
  return {
    state: {
      phase: "write", manche: 1, tour: 1, order,
      rules: { tourTime: settings.tourTime, maxTours: settings.maxTours, manches: settings.manches, majority: !!settings.majority },
      // Les mots possibles pour les manches suivantes, comme la liste des mots de Devine le dessin.
      words: pool(settings), link: first, start: first,
      used: Object.fromEntries(first.map((word) => [norm(word), word])),
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }])),
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      until: now + settings.tourTime * 1000
    },
    secrets: {},
    vault: {}
  };
}

// Les joueurs encore assis à la table.
const present = (s, room) => s.order.filter((id) => room.players?.[id]);

function newManche(ctx) {
  const { state: s } = ctx;
  const pick = shuffle(s.words || []);
  const first = pick.slice(0, 2);
  return ctx.patch({
    "state/phase": "write", "state/manche": s.manche + 1, "state/tour": 1, "state/rounds": null, "state/last": null,
    "state/link": first, "state/start": first, "state/used": Object.fromEntries(first.map((word) => [norm(word), word])),
    "state/until": ctx.now() + s.rules.tourTime * 1000, "state/step": ctx.nextStep()
  });
}

// Commande de l'hôte : passer la révélation (ou la fin de manche) sans attendre.
export const skipWait = (ctx) => ctx.patch({ "state/until": ctx.now() });

export async function hostTick(ctx) {
  const { room, state: s } = ctx;
  if (!s || s.phase === "end") return;
  const now = ctx.now();
  const players = present(s, room);

  if (s.phase === "write") {
    // Les mots restent sous enveloppe jusqu'à la clôture du tour, même pour l'hôte.
    if (!room.closed?.[s.g]?.[s.step]) {
      const done = room.done?.[s.g]?.[s.step] || {};
      if (players.every((id) => done[id]) || now >= s.until) return ctx.patch({ [`closed/${s.g}/${s.step}`]: true });
      return;
    }
    if (!ctx.sealed) return;
    const answers = Object.fromEntries(players.map((id) => [id, ctx.sealed[id]?.word]));
    const verdict = judge({ players, answers, used: s.used || {}, majority: s.rules.majority });
    const changes = {
      "state/phase": "reveal", [`state/rounds/r${s.tour}`]: verdict.words,
      "state/last": { agreed: verdict.agreed, best: verdict.best, refused: verdict.refused },
      "state/until": now + REVEAL_TIME, "state/step": ctx.nextStep()
    };
    for (const id of players) {
      if (verdict.words[id]) changes[`state/used/${norm(verdict.words[id])}`] = verdict.words[id];
    }
    // Les mots à relier au tour suivant : ceux qui viennent d'être dits (sinon, les mêmes qu'avant).
    const fresh = [...new Map(players.filter((id) => verdict.words[id]).map((id) => [norm(verdict.words[id]), verdict.words[id]])).values()];
    if (fresh.length) changes["state/link"] = fresh;
    const gain = { ...verdict.points };
    const over = verdict.agreed || s.tour >= s.rules.maxTours;
    if (verdict.agreed) for (const id of players) gain[id] = (gain[id] || 0) + bonus(s.tour);
    for (const [id, points] of Object.entries(gain)) changes[`state/scores/${id}`] = (s.scores?.[id] || 0) + points;
    if (over) {
      changes["state/history"] = [...(s.history || []), {
        no: s.manche, start: s.start, tours: s.tour, word: verdict.agreed || null
      }];
      changes["state/until"] = now + END_TIME;
      changes["state/last"].over = true;
    }
    return ctx.patch(changes);
  }

  if (s.phase === "reveal") {
    if (now < s.until) return;
    if (!s.last?.over) {
      return ctx.patch({
        "state/phase": "write", "state/tour": s.tour + 1,
        "state/until": now + s.rules.tourTime * 1000, "state/step": ctx.nextStep()
      });
    }
    if (s.manche < s.rules.manches) return newManche(ctx);
    return ctx.patch({ [`ended/${s.g}`]: true, "state/phase": "end", "state/until": null, "state/step": ctx.nextStep() });
  }
}
