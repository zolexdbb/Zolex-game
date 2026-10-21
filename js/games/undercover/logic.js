import { siteGroups, parseGroups, checkWords } from "../../ui/wordbank.js";

export const ROLE_NAMES = { civil: "Civil", undercover: "Undercover", mrwhite: "Mr White" };
export const ROLE_ICONS = { civil: "person", undercover: "spy", mrwhite: "question" };
export const WINNERS = {
  civils: "Les Civils ont démasqué tout le monde",
  infiltres: "Les infiltrés ont pris le contrôle",
  mrwhite: "Mr White a deviné le mot"
};
// Points gagnés par chaque joueur du camp vainqueur, partie après partie.
export const POINTS = { civil: 2, undercover: 10, mrwhite: 6 };
const NEXT_TIME = 15000;

const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Forme comparable d'un mot : sans accents, casse ni ponctuation.
export const norm = (text) =>
  String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const civils = (s, n) => n - s.undercover - s.mrWhite;

// Tours d'indices d'une manche. Réglage 0 = auto : environ 6 indices entendus avant
// chaque vote, quel que soit le nombre de joueurs (sinon Mr White en entend 2n à n joueurs).
export const toursFor = (setting, alive) =>
  setting > 0 ? setting : Math.min(4, Math.max(1, Math.ceil(6 / Math.max(1, alive - 1))));

// Renvoie la raison pour laquelle la partie ne peut pas commencer, ou null.
export function checkSettings(s, n) {
  if (civils(s, n) < 2) return "Il faut au moins 2 Civils autour de la table.";
  if (civils(s, n) <= s.undercover) return "Les Civils doivent être plus nombreux que les Undercover.";
  return checkWords(s, true);
}

// Paires signalées « trop éloignées » par les joueurs : gardées sur l'appareil qui
// distribue (l'hôte, ou le téléphone de la partie locale), elles ne sortent plus.
const AVOID_KEY = "undercover-avoid";
export const pairKey = (a, b) => [norm(a), norm(b)].sort().join("~").slice(0, 80);
export function avoidedPairs() {
  try { return new Set(JSON.parse(localStorage.getItem(AVOID_KEY)) || []); } catch { return new Set(); }
}
export function avoidPairs(keys) {
  const set = avoidedPairs();
  const before = set.size;
  for (const key of keys) set.add(key);
  if (set.size === before) return;
  try { localStorage.setItem(AVOID_KEY, JSON.stringify([...set].slice(-500))); } catch { /* stockage plein ou bloqué */ }
}

// Deux mots proches tirés dans une même famille, en évitant les paires signalées.
export function drawPair(pool, avoid = avoidedPairs()) {
  let pair = null;
  for (let tries = 0; tries < 50; tries++) {
    pair = shuffle(pool[rand(pool.length)]);
    if (!avoid.has(pairKey(pair[0], pair[1]))) break;
  }
  return pair;
}

// La donne, sans réseau : rôles, mots et ordre de parole (Mr White jamais premier).
// Sert à la partie en ligne comme à la partie sur un seul téléphone.
export function dealRoles(playerIds, settings) {
  const ids = shuffle(playerIds);
  const roles = {};
  ids.forEach((id, i) => {
    roles[id] = i < settings.undercover ? "undercover"
      : i < settings.undercover + settings.mrWhite ? "mrwhite" : "civil";
  });
  // Deux mots proches, tirés dans un même groupe : ceux de l'hôte ou ceux du site.
  const pool = settings.source === "perso"
    ? parseGroups(settings.customText).groups.map((group) => group.words)
    : siteGroups(settings);
  const [civilWord, undercoverWord] = drawPair(pool);
  return { ids, roles, civilWord, undercoverWord, base: firstNotWhite(shuffle(ids), roles) };
}

// Fait tourner l'ordre jusqu'à ce que Mr White ne soit pas en tête.
export function firstNotWhite(order, roles) {
  const out = [...order];
  for (let i = 0; i < out.length && roles[out[0]] === "mrwhite"; i++) out.push(out.shift());
  return out;
}

export function start({ players, settings }) {
  const { ids, roles, civilWord, undercoverWord, base } = dealRoles(players.map((p) => p.id), settings);

  const secrets = {};
  for (const id of ids) {
    secrets[id] = roles[id] === "mrwhite" ? { mrWhite: true }
      : { word: roles[id] === "civil" ? civilWord : undercoverWord };
  }

  return {
    state: {
      phase: "clues", round: 1, base, order: base, turn: 0,
      series: { no: 1, of: settings.games || 1, scores: {} },
      // tour : tour d'indices dans la manche ; lap : compteur de tours depuis le début.
      tour: 1, lap: 1, tours: toursFor(settings.clueTours, ids.length), clueTours: settings.clueTours || 0,
      alive: Object.fromEntries(ids.map((id) => [id, true])),
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }])),
      totals: { civil: civils(settings, ids.length), undercover: settings.undercover, mrwhite: settings.mrWhite }
    },
    secrets,
    vault: { roles, words: { civil: civilWord, undercover: undercoverWord }, civilKey: norm(civilWord) }
  };
}

// Rôles encore en jeu, déduits des cartes déjà retournées.
function remaining(s, room, extra) {
  const left = { ...s.totals };
  for (const role of Object.values({ ...room.reveals?.[s.g], ...extra })) left[role]--;
  return left;
}

export function winnerOf(left) {
  if (left.undercover + left.mrwhite === 0) return "civils";
  if (left.civil <= 1) return "infiltres";
  return null;
}

function giveClue({ state: s, patch, nextStep }, who, clue) {
  const last = s.turn + 1 >= s.order.length;
  const again = last && s.tour < s.tours;
  return patch({
    [`state/clues/c${s.lap}/${who}`]: clue,
    "state/spoke": { uid: who, text: clue },
    "state/turn": last ? 0 : s.turn + 1,
    "state/tour": again ? s.tour + 1 : s.tour,
    "state/lap": again ? s.lap + 1 : s.lap,
    "state/phase": last && !again ? "vote" : "clues",
    "state/step": nextStep()
  });
}

function eliminate({ state: s, patch, nextStep }, who, last, votes) {
  return patch({
    [`out/${s.g}/${who}`]: true,
    "state/phase": "reveal",
    "state/last": { uid: who, ...last },
    "state/votes": votes || null,
    "state/resolved": null,
    "state/forceClose": null,
    "state/step": nextStep()
  });
}

// Le camp vainqueur, rôle par rôle.
export const wins = (winner, role) => (winner === "civils" ? role === "civil" : winner === "mrwhite" ? role === "mrwhite" : role !== "civil");

// Ordre de parole d'une nouvelle manche : tiré au hasard, et la base de données
// refuse que Mr White parle en premier (l'hôte ne connaît pas les rôles).
async function speakingOrder(ctx, round) {
  const { state: s } = ctx;
  const order = shuffle(s.base.filter((id) => s.alive?.[id]));
  for (let i = 0; i < order.length; i++) {
    if (await ctx.tryWrite(`starter/${s.g}/r${round}`, order[i])) return [...order.slice(i), ...order.slice(0, i)];
  }
  return order;
}

async function nextRound(ctx) {
  const { state: s, patch, nextStep } = ctx;
  const order = await speakingOrder(ctx, s.round + 1);
  return patch({
    "state/phase": "clues", "state/round": s.round + 1,
    "state/order": order, "state/turn": 0, "state/tours": toursFor(s.clueTours ?? s.tours, order.length),
    "state/tour": 1, "state/lap": s.lap + 1,
    "state/last": null, "state/votes": null, "state/resolved": null,
    "state/pending": null, "state/forceClose": null, "state/skipGuess": null,
    "state/step": nextStep()
  });
}

function finish({ state: s, patch, nextStep }, winner) {
  return patch({
    [`ended/${s.g}`]: true,
    "state/phase": "end", "state/winner": winner, "state/step": nextStep()
  });
}

function resolve({ state: s, patch }, left, extra = {}) {
  return patch({
    "state/phase": "reveal", "state/resolved": true, [`state/alive/${s.last.uid}`]: null,
    "state/pending": winnerOf(left), "state/skipGuess": null, ...extra
  });
}

// Fin d'une partie : le camp vainqueur marque, puis la partie suivante est distribuée.
async function afterEnd(ctx) {
  const { state: s, vault } = ctx;
  const series = s.series || { no: 1, of: 1, scores: {} };
  if (!s.scored) {
    if (!vault) return;
    const scores = { ...series.scores };
    const winners = s.base.filter((id) => wins(s.winner, vault.roles[id]));
    for (const id of winners) scores[id] = (scores[id] || 0) + POINTS[vault.roles[id]];
    // Résumé de la partie, montré à la fin de la série.
    const roles = Object.values(vault.roles);
    const recap = {
      no: series.no, winner: s.winner, civil: vault.words.civil, undercover: vault.words.undercover,
      winners: winners.map((id) => s.names[id].name), mixed: roles.includes("mrwhite") && roles.includes("undercover")
    };
    return ctx.patch({
      "state/scored": true, "state/series": { ...series, scores, history: [...(series.history || []), recap] },
      "state/until": series.no < series.of ? ctx.now() + NEXT_TIME : null
    });
  }
  if (series.no >= series.of || !s.until || ctx.now() < s.until) return;
  const next = { series: { ...series, no: series.no + 1 } };
  // Plus assez de joueurs pour continuer : la série s'arrête là.
  if (!(await ctx.redeal(next))) return ctx.patch({ "state/series/of": series.no, "state/until": null });
}

// Commandes de l'hôte.
export const nextGame = (ctx) => ctx.patch({ "state/until": ctx.now() });
export const skipTurn = (ctx) => giveClue(ctx, ctx.state.order[ctx.state.turn], "");
export const goVote = (ctx) => ctx.patch({ "state/phase": "vote", "state/turn": 0, "state/step": ctx.nextStep() });
export const forceClose = (ctx) => ctx.patch({ "state/forceClose": true });
export const skipGuess = (ctx) => ctx.patch({ "state/skipGuess": true });
export const proceed = (ctx) => (ctx.state.pending ? finish(ctx, ctx.state.pending) : nextRound(ctx));

export async function hostTick(ctx) {
  const { room, state: s, actions } = ctx;
  if (!s) return;
  if (s.phase === "end") return afterEnd(ctx);
  const alive = Object.keys(s.alive || {});

  if (s.phase === "clues" || s.phase === "vote") {
    // Un joueur qui a quitté la table sort du jeu, sa carte est retournée.
    const gone = alive.find((id) => !room.players?.[id]);
    if (gone) return eliminate(ctx, gone, { left: true });
  }

  if (s.phase === "clues") {
    const who = s.order[s.turn];
    const clue = actions?.[who]?.clue;
    if (typeof clue === "string") return giveClue(ctx, who, clue.replace(/\s+/g, " ").trim().slice(0, 30));
    return;
  }

  if (s.phase === "vote") {
    // Les bulletins restent sous enveloppe, même pour l'hôte, jusqu'à la clôture.
    if (!room.closed?.[s.g]?.[s.step]) {
      const done = room.done?.[s.g]?.[s.step] || {};
      if (alive.every((id) => done[id]) || s.forceClose) return ctx.patch({ [`closed/${s.g}/${s.step}`]: true });
      return;
    }
    if (!ctx.sealed) return;
    const votes = {};
    for (const id of alive) {
      const target = ctx.sealed[id]?.target;
      if (typeof target === "string" && target !== id && s.alive[target]) votes[id] = target;
    }
    if (!Object.keys(votes).length) return nextRound(ctx);
    const tally = {};
    for (const target of Object.values(votes)) tally[target] = (tally[target] || 0) + 1;
    const top = Math.max(...Object.values(tally));
    const tied = Object.keys(tally).filter((id) => tally[id] === top);
    return eliminate(ctx, tied[rand(tied.length)], tied.length > 1 ? { tie: true } : {}, votes);
  }

  if (s.phase === "reveal" && !s.resolved) {
    // L'hôte ne connaît pas le rôle : la base n'accepte que la bonne réponse,
    // et seulement pour un joueur déjà sorti.
    const who = s.last.uid;
    let role = room.reveals?.[s.g]?.[who];
    if (!role) {
      for (const candidate of Object.keys(ROLE_NAMES)) {
        if (await ctx.tryWrite(`reveals/${s.g}/${who}`, candidate)) { role = candidate; break; }
      }
      if (!role) return;
    }
    if (role === "mrwhite" && !s.last.left) {
      return ctx.patch({ "state/phase": "mrwhite", [`state/alive/${who}`]: null });
    }
    return resolve(ctx, remaining(s, room, { [who]: role }));
  }

  if (s.phase === "mrwhite") {
    const who = s.last.uid;
    const guess = room.guess?.[s.g]?.[who];
    if (!guess && !s.skipGuess && room.players?.[who]) return;
    let right = false;
    if (guess) {
      right = room.verdict?.[s.g]?.[who];
      if (right == null) {
        right = await ctx.tryWrite(`verdict/${s.g}/${who}`, true);
        if (!right) await ctx.tryWrite(`verdict/${s.g}/${who}`, false);
      }
    }
    if (right) return finish(ctx, "mrwhite");
    return resolve(ctx, remaining(s, room), { "state/last/wrongGuess": guess?.text || null });
  }
}
