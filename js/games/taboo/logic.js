// Taboo : deux équipes. À son tour, un orateur fait deviner un maximum de mots à
// son équipe (à voix haute, dans la même pièce ou en appel) sans prononcer les
// cinq mots interdits. L'équipe adverse voit la carte et surveille : « Tabou ! ».
// La carte n'est lisible que par l'orateur et l'équipe adverse (database.rules.json, taboo/).
import { shuffle } from "../dessin/logic.js";
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

// Points d'un coup : trouvé +1, tabou -1, passé 0.
export const POINTS = { found: 1, taboo: -1, pass: 0 };

export function start({ players, settings }) {
  const ids = shuffle(players.map((p) => p.id));
  const teams = { r: [], b: [] };
  ids.forEach((id, i) => teams[i % 2 ? "b" : "r"].push(id));
  const turn = shuffle(["r", "b"])[0];
  return {
    state: {
      phase: "ready", turn, turnNo: 1, card: 0, teams,
      team: Object.fromEntries(ids.map((id) => [id, teams.r.includes(id) ? "r" : "b"])),
      speaker: teams[turn][0], next: { r: turn === "r" ? 1 : 0, b: turn === "b" ? 1 : 0 },
      rules: { time: settings.time, turns: settings.turns },
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
