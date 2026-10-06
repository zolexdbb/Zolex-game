import { siteGroups, parseGroups, checkWords } from "../../ui/wordbank.js";

export const ROLE_NAMES = { civil: "Civil", undercover: "Undercover", mrwhite: "Mr White" };
export const ROLE_ICONS = { civil: "person", undercover: "spy", mrwhite: "question" };
export const WINNERS = {
  civils: "Les Civils ont démasqué tout le monde",
  infiltres: "Les infiltrés ont pris le contrôle",
  mrwhite: "Mr White a deviné le mot"
};

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

const civils = (s, n) => n - s.undercover - s.mrWhite;

// Renvoie la raison pour laquelle la partie ne peut pas commencer, ou null.
export function checkSettings(s, n) {
  if (civils(s, n) < 2) return "Il faut au moins 2 Civils autour de la table.";
  if (civils(s, n) <= s.undercover) return "Les Civils doivent être plus nombreux que les Undercover.";
  return checkWords(s, true);
}

export function start({ players, settings }) {
  const ids = shuffle(players.map((p) => p.id));
  const roles = {};
  ids.forEach((id, i) => {
    roles[id] = i < settings.undercover ? "undercover"
      : i < settings.undercover + settings.mrWhite ? "mrwhite" : "civil";
  });
  // Deux mots proches, tirés dans un même groupe : ceux de l'hôte ou ceux du site.
  const pool = settings.source === "perso"
    ? parseGroups(settings.customText).groups.map((group) => group.words)
    : siteGroups(settings);
  const [civilWord, undercoverWord] = shuffle(pool[rand(pool.length)]);

  const secrets = {};
  for (const id of ids) {
    secrets[id] = roles[id] === "mrwhite" ? { mrWhite: true }
      : { word: roles[id] === "civil" ? civilWord : undercoverWord };
  }

  // Mr White ne donne jamais le premier indice.
  const base = shuffle(ids);
  while (roles[base[0]] === "mrwhite") base.push(base.shift());

  return {
    state: {
      phase: "clues", round: 1, base, order: base, turn: 0,
      // tour : tour d'indices dans la manche ; lap : compteur de tours depuis le début.
      tour: 1, lap: 1, tours: settings.clueTours,
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

function winnerOf(left) {
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

function nextRound({ state: s, patch, nextStep }) {
  const base = [...s.base.slice(1), s.base[0]];
  return patch({
    "state/phase": "clues", "state/round": s.round + 1, "state/base": base,
    "state/order": base.filter((id) => s.alive?.[id]), "state/turn": 0,
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

// Commandes de l'hôte.
export const skipTurn = (ctx) => giveClue(ctx, ctx.state.order[ctx.state.turn], "");
export const goVote = (ctx) => ctx.patch({ "state/phase": "vote", "state/turn": 0, "state/step": ctx.nextStep() });
export const forceClose = (ctx) => ctx.patch({ "state/forceClose": true });
export const skipGuess = (ctx) => ctx.patch({ "state/skipGuess": true });
export const proceed = (ctx) => (ctx.state.pending ? finish(ctx, ctx.state.pending) : nextRound(ctx));

export async function hostTick(ctx) {
  const { room, state: s, actions } = ctx;
  if (!s || s.phase === "end") return;
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
