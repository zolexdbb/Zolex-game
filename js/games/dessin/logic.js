import { siteGroups, parseWords } from "../../ui/wordbank.js";

const PICK_TIME = 30000;
const GRACE = 4000; // le dessinateur choisit lui-même un mot au hasard à l'échéance : on lui en laisse le temps
const RECAP_TIME = 7000;

const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Forme comparable d'une réponse : sans accents, casse, ponctuation ni pluriel final.
export const norm = (text) =>
  String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/[sx]$/, "");

export const drawerOf = (s) => s.order[(s.turnNo - 1) % s.order.length];

// Points d'un devin selon le temps écoulé t (de 0 à 1) : la courbe logarithmique
// sépare nettement les premiers qui trouvent, puis se tasse (100 au départ, 20 à la fin).
export const gainFor = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return 20 + Math.round(80 * (1 - Math.log(1 + 9 * x) / Math.log(10)));
};

// Distance d'édition : lettres ajoutées, retirées ou changées pour passer d'un mot à l'autre.
export function levenshtein(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

// « Presque ! » : une lettre de travers (deux pour un mot de 8 lettres ou plus).
export function isClose(guess, word) {
  const a = norm(guess), b = norm(word);
  if (!a || !b || a === b) return false;
  return levenshtein(a, b) <= (b.length >= 8 ? 2 : 1);
}

export function start({ players, settings, now }) {
  const order = shuffle(players.map((p) => p.id));
  // Tirages de mots autorisés par dessin : le premier, plus les relances.
  const rolls = Object.fromEntries(Array.from({ length: settings.rerolls + 1 }, (_, i) => [`r${i}`, true]));
  return {
    state: {
      phase: "pick", turn: "t1", turnNo: 1, total: order.length * settings.rounds,
      order, drawTime: settings.drawTime, until: now + PICK_TIME, rolls,
      // Les mots qui peuvent sortir : ceux de l'hôte, ou les thèmes cochés du site.
      words: settings.source === "perso" ? parseWords(settings.customText).words : [...new Set(siteGroups(settings).flat())],
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }])),
      scores: Object.fromEntries(order.map((id) => [id, 0]))
    },
    // Aucun secret distribué : le mot est choisi par le dessinateur lui-même.
    secrets: {},
    vault: {}
  };
}

function nextTurn(ctx) {
  const { room, state: s } = ctx;
  let no = s.turnNo + 1;
  // Un joueur parti ne dessine pas.
  while (no <= s.total && !room.players?.[s.order[(no - 1) % s.order.length]]) no++;
  if (no > s.total) {
    return ctx.patch({ [`ended/${s.g}`]: true, "state/phase": "end", "state/until": null, "state/step": ctx.nextStep() });
  }
  return ctx.patch({
    "state/phase": "pick", "state/turn": `t${no}`, "state/turnNo": no,
    "state/until": ctx.now() + PICK_TIME, "state/startAt": null, "state/last": null, "state/grace": null,
    "state/step": ctx.nextStep()
  });
}

// Clôt le dessin : plus aucune réponse n'est acceptée, le mot devient lisible par tous.
async function closeTurn(ctx, found, skipped) {
  const s = ctx.state;
  const drawer = drawerOf(s);
  await ctx.tryWrite(`marks/${s.g}/${s.turn}-done`, true);
  const gains = {};
  for (const id of s.order) {
    if (id === drawer || !found[id]) continue;
    gains[id] = gainFor((found[id].at - (s.startAt || s.until - s.drawTime * 1000)) / (s.drawTime * 1000));
  }
  const finders = Object.keys(gains).length;
  if (finders) gains[drawer] = Math.min(100, 25 * finders);
  const changes = {
    "state/phase": "recap", "state/until": ctx.now() + (skipped ? 2500 : RECAP_TIME),
    "state/last": { gains: finders ? gains : null, skipped: skipped || null }
  };
  for (const [id, points] of Object.entries(gains)) changes[`state/scores/${id}`] = (s.scores?.[id] || 0) + points;
  return ctx.patch(changes);
}

// Commande de l'hôte : met fin au tour en cours.
export const skipTurn = (ctx) => ctx.patch({ "state/until": ctx.now() });

export async function hostTick(ctx) {
  const { room, state: s } = ctx;
  if (!s || s.phase === "end") return;
  const drawer = drawerOf(s);
  const now = ctx.now();

  if (s.phase === "pick") {
    if (!room.players?.[drawer]) return closeTurn(ctx, {}, true);
    if (now >= s.until) {
      // Temps écoulé : l'appareil du dessinateur pioche un des mots proposés. S'il ne répond pas, on passe.
      if (!s.grace && room.players[drawer].online) return ctx.patch({ "state/until": now + GRACE, "state/grace": true });
      if (!room.hint?.[s.g]?.[s.turn]) return closeTurn(ctx, {}, true);
    }
    // Le dessinateur du tour est inscrit une fois pour toutes : c'est ce qui lui
    // ouvre, à lui seul, le droit de choisir le mot et de dessiner.
    if (!room.drawer?.[s.g]?.[s.turn]) return ctx.tryWrite(`drawer/${s.g}/${s.turn}`, drawer);
    if (room.hint?.[s.g]?.[s.turn]) {
      return ctx.patch({ "state/phase": "draw", "state/startAt": now, "state/until": now + s.drawTime * 1000 });
    }
    return;
  }

  if (s.phase === "draw") {
    const found = room.found?.[s.g]?.[s.turn] || {};
    const waiting = s.order.some((id) => id !== drawer && room.players?.[id] && !found[id]);
    if (now < s.until && room.players?.[drawer] && waiting) return;
    return closeTurn(ctx, found, false);
  }

  if (s.phase === "recap" && now >= s.until) return nextTurn(ctx);
}
