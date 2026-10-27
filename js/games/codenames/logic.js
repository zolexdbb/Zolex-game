// Codenames : de 2 à 4 équipes, une grille de mots et une carte-clé que seuls les
// maîtres-espions connaissent. L'hôte lui-même ne la voit pas : pour retourner
// une case, il propose une couleur et la base n'accepte que la bonne (voir
// database.rules.json, rooms/$code/cards).
import { siteGroups, parseWords } from "../../ui/wordbank.js";
import { norm, shuffle } from "../dessin/logic.js";

export const TEAMS = { r: "Rouges", b: "Bleus", g: "Verts", y: "Jaunes" };
export const TEAM_IDS = ["r", "b", "g", "y"];
// Deux équipes seulement (le Taboo) : l'autre équipe.
export const other = (team) => (team === "r" ? "b" : "r");
// Les couleurs que l'hôte essaie pour retourner une case : équipes, neutre, assassin.
const COLORS = [...TEAM_IDS, "n", "a"];

// La grille selon le nombre d'équipes : chacune garde 8 cases (9 pour celle qui commence).
export const GRIDS = { 2: { size: 25, cols: 5 }, 3: { size: 36, cols: 6 }, 4: { size: 42, cols: 7 } };
export const teamCountOf = (settings) => (GRIDS[settings.teamCount] ? settings.teamCount : 2);

const pool = (settings) => [...new Set(settings.source === "perso"
  ? parseWords(settings.customText).words
  : siteGroups(settings).flat())];

export const enoughWords = (settings) => pool(settings).length >= GRIDS[teamCountOf(settings)].size;

// Les équipes en jeu, dans l'ordre du tour (les anciennes parties n'ont pas d'ordre : 2 équipes).
export const orderOf = (s) => s.order || [s.first, other(s.first)];
// Nombre de cases de chaque équipe : celle qui commence en a une de plus.
export const total = (s, team) => (team === s.first ? 9 : 8);
// L'équipe suivante, en sautant celles que l'assassin a éliminées.
export function next(s, team, out = s.out || {}) {
  const order = orderOf(s);
  for (let k = 1; k <= order.length; k++) {
    const candidate = order[(order.indexOf(team) + k) % order.length];
    if (!out[candidate]) return candidate;
  }
  return team;
}

// La carte-clé : 9 cases pour la première équipe, 8 pour chacune des autres, 1 assassin, le reste neutre.
export function makeKey(order, size = GRIDS[order.length].size) {
  const teams = order.flatMap((team, i) => Array(i ? 8 : 9).fill(team));
  return shuffle([...teams, "a", ...Array(size - teams.length - 1).fill("n")]);
}

// Répartit les joueurs entre `count` équipes : selon la composition de l'hôte si elle existe.
// Un joueur arrivé après va dans l'équipe la moins nombreuse ; un maître-espion absent est
// remplacé par le premier de son équipe. La partie démarre ainsi toujours avec des équipes jouables.
export function makeTeams(ids, wanted = {}, spies = {}, count = 2) {
  const used = TEAM_IDS.slice(0, count);
  const teams = Object.fromEntries(used.map((team) => [team, []]));
  for (const id of shuffle(ids).sort((a, b) => !used.includes(wanted[a]) - !used.includes(wanted[b]))) {
    const team = used.includes(wanted[id]) ? wanted[id] : used.reduce((low, t) => (teams[t].length < teams[low].length ? t : low));
    teams[team].push(id);
  }
  const spy = Object.fromEntries(used.map((team) => [team, teams[team].includes(spies?.[team]) ? spies[team] : teams[team][0]]));
  return { teams, spy };
}

// Il faut au moins 2 joueurs par équipe (un maître-espion et quelqu'un pour deviner).
export function teamsCheck(settings, n) {
  const count = teamCountOf(settings);
  if (n < 2 * count) return `Il faut au moins ${2 * count} joueurs pour ${count} équipes.`;
  if (!settings.teams) return null;
  const sides = Object.values(settings.teams);
  if (sides.length < n) return null; // des joueurs pas encore placés : ils seront répartis au lancement
  const size = (t) => sides.filter((x) => x === t).length;
  return TEAM_IDS.slice(0, count).some((t) => size(t) < 2) ? "Il faut au moins 2 joueurs dans chaque équipe." : null;
}

export const teamOf = (s, id) => orderOf(s).find((team) => s.teams[team]?.includes(id)) || null;
export const revealedCount = (s, color) => Object.values(s.revealed || {}).filter((c) => c === color).length;

// Un indice valable : un seul mot, qui n'est pas (ni ne contient) un mot de la grille encore caché.
export function checkClue(s, word) {
  const key = norm(word);
  if (!key) return "Écris un indice.";
  if (/\s/.test(word.trim())) return "Un seul mot pour l'indice.";
  const hidden = s.grid.filter((_, i) => !s.revealed?.[`c${i}`]);
  // Pas le mot lui-même, ni un mot de la même famille (« chaton » pour « chat ») ; on ne
  // compare les débuts de mots qu'à partir de 4 lettres, pour ne pas bloquer « os » partout.
  const close = (w) => w === key || (w.length >= 4 && key.length >= 4 && (w.startsWith(key) || key.startsWith(w)));
  if (hidden.some((w) => close(norm(w)))) return "L'indice ne peut pas être un mot de la grille.";
  return null;
}

// Effet d'une case retournée de la couleur `color` pendant le tour de `team`. Renvoie
// { winner } si la partie s'arrête, { out } si l'équipe touche l'assassin (éliminée),
// { switch: true } si la main passe, ou {} si l'équipe continue.
export function afterReveal(s, team, color, revealed) {
  const count = (c) => Object.values(revealed).filter((x) => x === c).length;
  if (color === "a") {
    const out = { ...(s.out || {}), [team]: true };
    const alive = orderOf(s).filter((t) => !out[t]);
    return alive.length === 1 ? { winner: alive[0], assassin: true, out: team } : { out: team, assassin: true, switch: true };
  }
  const done = orderOf(s).find((t) => !s.out?.[t] && count(t) >= total(s, t));
  if (done) return { winner: done };
  if (color !== team) return { switch: true };
  return {};
}

export function start({ players, settings }) {
  const ids = players.map((p) => p.id);
  const count = teamCountOf(settings);
  const { teams, spy } = makeTeams(ids, settings.teams, settings.spies, count);
  const order = shuffle(TEAM_IDS.slice(0, count));
  const { size, cols } = GRIDS[count];
  const grid = shuffle(pool(settings)).slice(0, size);
  const key = Object.fromEntries(makeKey(order, size).map((color, i) => [`c${i}`, color]));
  return {
    state: {
      phase: "clue", turn: order[0], first: order[0], order, out: null, cols, grid, teams, spy, revealed: {}, clue: null, left: 0, clueNo: 0,
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }]))
    },
    // Seuls les maîtres-espions reçoivent la carte-clé.
    secrets: Object.fromEntries(Object.values(spy).map((id) => [id, { key }])),
    vault: { key }
  };
}

const switchTeam = (s, out = s.out) => ({ "state/phase": "clue", "state/turn": next(s, s.turn, out || {}), "state/clue": null, "state/left": 0 });

export async function hostTick(ctx) {
  const { state: s, actions } = ctx;
  if (!s || s.phase === "end" || !actions) return;

  if (s.phase === "clue") {
    const spy = s.spy[s.turn];
    const sent = actions[spy];
    if (!sent) return;
    const word = String(sent.word || "").replace(/\s+/g, " ").trim().slice(0, 30);
    const n = Math.min(9, Math.max(1, Math.floor(Number(sent.n) || 1)));
    // Un indice refusé libère seulement le maître-espion, qui peut en proposer un autre.
    if (checkClue(s, word)) return ctx.patch({ "state/step": ctx.nextStep() });
    // Nouveau numéro d'indice : les pastilles de l'indice précédent ne s'affichent plus.
    return ctx.patch({
      "state/phase": "guess", "state/clue": { word, n, team: s.turn }, "state/left": n + 1,
      "state/clueNo": (s.clueNo || 0) + 1, "state/step": ctx.nextStep()
    });
  }

  if (s.phase === "guess") {
    // Le premier joueur de l'équipe dont c'est le tour qui touche une case (ou passe) décide.
    const guessers = s.teams[s.turn].filter((id) => id !== s.spy[s.turn]);
    const who = guessers.find((id) => actions[id]);
    if (!who) {
      if (Object.keys(actions).length) return ctx.patch({ "state/step": ctx.nextStep() });
      return;
    }
    const act = actions[who];
    if (act.pass) return ctx.patch({ ...switchTeam(s), "state/last": { by: who, pass: true }, "state/step": ctx.nextStep() });
    const cell = `c${Math.floor(Number(act.cell))}`;
    if (!(Number(act.cell) >= 0 && Number(act.cell) < s.grid.length) || s.revealed?.[cell]) return ctx.patch({ "state/step": ctx.nextStep() });
    let color = ctx.room.cards?.[s.g]?.[cell];
    for (const candidate of COLORS) {
      if (color) break;
      if (await ctx.tryWrite(`cards/${s.g}/${cell}`, candidate)) color = candidate;
    }
    if (!color) return;
    const revealed = { ...s.revealed, [cell]: color };
    const outcome = afterReveal(s, s.turn, color, revealed);
    const changes = { [`state/revealed/${cell}`]: color, "state/last": { by: who, cell, color }, "state/step": ctx.nextStep() };
    // L'assassin élimine l'équipe qui le touche ; les autres continuent.
    const out = outcome.out ? { ...(s.out || {}), [outcome.out]: true } : s.out;
    if (outcome.out) changes[`state/out/${outcome.out}`] = true;
    if (outcome.winner) {
      return ctx.patch({ ...changes, [`ended/${s.g}`]: true, "state/phase": "end", "state/winner": outcome.winner, "state/assassin": outcome.assassin ? outcome.out : null });
    }
    if (outcome.switch || s.left <= 1) return ctx.patch({ ...changes, ...switchTeam(s, out) });
    return ctx.patch({ ...changes, "state/left": s.left - 1 });
  }
}
