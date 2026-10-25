// Taboo : deux équipes. À son tour, un orateur fait deviner un maximum de mots à
// son équipe (à voix haute, dans la même pièce ou en appel) sans prononcer les
// cinq mots interdits. L'équipe adverse voit la carte et surveille : « Tabou ! ».
// La carte n'est lisible que par l'orateur et l'équipe adverse (database.rules.json, taboo/).
import { shuffle, norm, levenshtein } from "../dessin/logic.js";
import { makeTeams } from "../codenames/logic.js";
import { CARDS } from "./cards.js";

export const TEAMS = { r: "Rouges", b: "Bleus" };
export const other = (team) => (team === "r" ? "b" : "r");
const RECAP_TIME = 9000;

export const cardPath = (ctx) => `taboo/${ctx.code}/${ctx.state.g}/t${ctx.state.turnNo}c${ctx.state.card}`;

// Une carte au hasard, parmi celles qui ne sont pas encore sorties.
export function pickCard(used = []) {
  const free = CARDS.map((_, i) => i).filter((i) => !used.includes(i));
  return shuffle(free.length ? free : CARDS.map((_, i) => i))[0];
}

// ---- Par écrit : vérifications avec tolérance aux fautes ----

// Deux mots « pareils » selon la tolérance : 0 = exact ; 1 = une faute (deux dès 8 lettres) ;
// 2 = deux fautes. Jamais de faute tolérée sous 5 lettres (« mer » et « mur » restent différents).
// Accents, majuscules et pluriel ne comptent jamais.
export function near(a, b, tolerance) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const n = Math.max(x.length, y.length);
  if (!tolerance || n <= 4) return false;
  return levenshtein(x, y) <= (tolerance === 1 ? (n >= 8 ? 2 : 1) : 2);
}

// Le mot interdit (ou le mot à deviner) trouvé dans un indice, ou null. Refuse aussi une faute
// volontaire (« sabble »), un mot de la même famille (« plagistes » pour « plage ») et un interdit
// en plusieurs mots (« salle de bain ») caché dans l'indice.
// Racine d'un mot pour repérer sa famille : « plage » → « plag », qui attrape « plagiste ».
const stem = (k) => k.replace(/e$/, "");

export function forbiddenIn(clue, card, tolerance) {
  const whole = norm(clue);
  const pieces = String(clue).split(/[\s'’-]+/).filter((piece) => norm(piece));
  for (const banned of [card.word, ...card.banned]) {
    const k = norm(banned);
    if (k.length >= 4 && whole.includes(k)) return banned;
    for (const piece of pieces) {
      const p = norm(piece);
      const a = stem(p), b = stem(k);
      if (near(piece, banned, tolerance) || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))) return banned;
    }
  }
  return null;
}

// Une proposition de l'équipe est-elle le mot à deviner ?
export const guessMatches = (guess, word, tolerance) => near(guess, word, tolerance);

// Où ranger le fil écrit d'une carte : indices de l'orateur et propositions de son équipe.
export const feedKey = (s) => `t${s.turnNo}c${s.card}`;

// Points d'un coup : trouvé +1, tabou -1, passé 0.
export const POINTS = { found: 1, taboo: -1, pass: 0 };

export function start({ players, settings }) {
  const ids = shuffle(players.map((p) => p.id));
  // Équipes composées par l'hôte dans le salon, ou au hasard.
  const { teams } = makeTeams(ids, settings.teams);
  const turn = shuffle(["r", "b"])[0];
  return {
    state: {
      phase: "ready", turn, turnNo: 1, card: 0, teams,
      team: Object.fromEntries(ids.map((id) => [id, teams.r.includes(id) ? "r" : "b"])),
      speaker: teams[turn][0], next: { r: turn === "r" ? 1 : 0, b: turn === "b" ? 1 : 0 },
      rules: { time: settings.time, turns: settings.turns, mode: settings.mode || "oral", tolerance: settings.tolerance ?? 1 },
      scores: { r: 0, b: 0 }, done: { r: 0, b: 0 },
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }]))
    },
    secrets: {},
    vault: {}
  };
}

// Le prochain orateur d'une équipe, en sautant les joueurs partis.
function nextSpeaker(s, room, team) {
  const list = s.teams[team];
  for (let k = 0; k < list.length; k++) {
    const i = ((s.next?.[team] || 0) + k) % list.length;
    if (room.players?.[list[i]]) return { id: list[i], next: i + 1 };
  }
  return null;
}

// Commandes de l'hôte.
export const skipWait = (ctx) => ctx.patch({ "state/until": ctx.now() });

export async function hostTick(ctx) {
  const { state: s, room, actions } = ctx;
  if (!s || s.phase === "end") return;
  const now = ctx.now();

  if (s.phase === "ready") {
    if (!room.players?.[s.speaker]) {
      const pick = nextSpeaker(s, room, s.turn);
      if (pick) return ctx.patch({ "state/speaker": pick.id, [`state/next/${s.turn}`]: pick.next });
      return;
    }
    if (!actions?.[s.speaker]?.go) {
      if (actions && Object.keys(actions).length) return ctx.patch({ "state/step": ctx.nextStep() });
      return;
    }
    return ctx.patch({
      "state/phase": "play", "state/card": 1, "state/log": null,
      "state/until": now + s.rules.time * 1000, "state/step": ctx.nextStep()
    });
  }

  if (s.phase === "play") {
    if (now >= s.until) {
      return ctx.patch({
        "state/phase": "recap", "state/until": now + RECAP_TIME, [`state/done/${s.turn}`]: (s.done?.[s.turn] || 0) + 1,
        "state/history": [...(s.history || []), { team: s.turn, speaker: s.speaker, log: s.log || [] }],
        "state/step": ctx.nextStep()
      });
    }
    if (!actions) return;
    // Seul l'orateur dit « trouvé » ou « passe » ; seule l'équipe adverse peut crier « Tabou ! ».
    const valid = Object.entries(actions).find(([id, a]) => a.n === s.card && (
      (id === s.speaker && (a.result === "found" || a.result === "pass"))
      || (s.team?.[id] && s.team[id] !== s.turn && a.result === "taboo")));
    if (!valid) {
      if (Object.keys(actions).length) return ctx.patch({ "state/step": ctx.nextStep() });
      return;
    }
    const [by, a] = valid;
    const word = String(a.word || "").slice(0, 40);
    return ctx.patch({
      [`state/scores/${s.turn}`]: (s.scores?.[s.turn] || 0) + POINTS[a.result],
      "state/log": [...(s.log || []), { word, result: a.result, by }],
      "state/used": [...(s.used || []), Number(a.i) || 0],
      "state/card": s.card + 1, "state/step": ctx.nextStep()
    });
  }

  if (s.phase === "recap" && now >= s.until) {
    if (s.done.r >= s.rules.turns && s.done.b >= s.rules.turns) {
      return ctx.patch({ "state/phase": "end", "state/until": null, "state/step": ctx.nextStep() });
    }
    const team = other(s.turn);
    const pick = nextSpeaker(s, room, team);
    if (!pick) return ctx.patch({ "state/phase": "end", "state/until": null, "state/step": ctx.nextStep() });
    return ctx.patch({
      "state/phase": "ready", "state/turn": team, "state/turnNo": s.turnNo + 1, "state/card": 0, "state/log": null,
      "state/speaker": pick.id, [`state/next/${team}`]: pick.next, "state/until": null, "state/step": ctx.nextStep()
    });
  }
}
