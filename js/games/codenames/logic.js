// Codenames : deux équipes, une grille de 25 mots et une carte-clé que seuls les
// deux maîtres-espions connaissent. L'hôte lui-même ne la voit pas : pour retourner
// une case, il propose une couleur et la base n'accepte que la bonne (voir
// database.rules.json, rooms/$code/cards).
import { siteGroups, parseWords } from "../../ui/wordbank.js";
import { norm, shuffle } from "../dessin/logic.js";

export const SIZE = 25;
export const TEAMS = { r: "Rouges", b: "Bleus" };
export const other = (team) => (team === "r" ? "b" : "r");
const COLORS = ["r", "b", "n", "a"]; // rouge, bleu, neutre, assassin

const pool = (settings) => [...new Set(settings.source === "perso"
  ? parseWords(settings.customText).words
  : siteGroups(settings).flat())];

export const enoughWords = (settings) => pool(settings).length >= SIZE;

// Nombre de cases de chaque équipe : celle qui commence en a une de plus.
export const total = (s, team) => (team === s.first ? 9 : 8);

// La carte-clé : 9 cases pour l'équipe qui commence, 8 pour l'autre, 7 neutres, 1 assassin.
export function makeKey(first) {
  return shuffle([...Array(9).fill(first), ...Array(8).fill(other(first)), ...Array(7).fill("n"), "a"]);
}

// Répartit les joueurs : selon la composition de l'hôte si elle existe. Un joueur arrivé
// après va dans l'équipe la moins nombreuse ; un maître-espion absent est remplacé par
// le premier de son équipe. La partie démarre ainsi toujours avec deux équipes jouables.
export function makeTeams(ids, wanted = {}, spies = {}) {
  const teams = { r: [], b: [] };
  for (const id of shuffle(ids).sort((a, b) => !wanted[a] - !wanted[b])) {
    const team = wanted[id] === "r" || wanted[id] === "b" ? wanted[id] : teams.r.length <= teams.b.length ? "r" : "b";
    teams[team].push(id);
  }
  const spy = {
    r: teams.r.includes(spies?.r) ? spies.r : teams.r[0],
    b: teams.b.includes(spies?.b) ? spies.b : teams.b[0]
  };
  return { teams, spy };
}

// Il faut au moins 2 joueurs par équipe (un maître-espion et quelqu'un pour deviner).
export function teamsCheck(settings, n) {
  if (!settings.teams) return null;
  const sides = Object.values(settings.teams);
  if (sides.length < n) return null; // des joueurs pas encore placés : ils seront répartis au lancement
  const count = (t) => sides.filter((x) => x === t).length;
  return count("r") < 2 || count("b") < 2 ? "Il faut au moins 2 joueurs dans chaque équipe." : null;
}

export const teamOf = (s, id) => (s.teams.r.includes(id) ? "r" : s.teams.b.includes(id) ? "b" : null);
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

// Effet d'une case retournée de la couleur `color` pendant le tour de `team`.
// Renvoie { winner } si la partie s'arrête, { switch: true } si la main passe, ou {} si l'équipe continue.
export function afterReveal(s, team, color, revealed) {
  const count = (c) => Object.values(revealed).filter((x) => x === c).length;
  if (color === "a") return { winner: other(team), assassin: true };
  if (count("r") >= total(s, "r")) return { winner: "r" };
  if (count("b") >= total(s, "b")) return { winner: "b" };
  if (color !== team) return { switch: true };
  return {};
}

export function start({ players, settings }) {
  const ids = players.map((p) => p.id);
  const { teams, spy } = makeTeams(ids, settings.teams, settings.spies);
  const first = shuffle(["r", "b"])[0];
  const grid = shuffle(pool(settings)).slice(0, SIZE);
  const key = Object.fromEntries(makeKey(first).map((color, i) => [`c${i}`, color]));
  return {
    state: {
      phase: "clue", turn: first, first, grid, teams, spy, revealed: {}, clue: null, left: 0, clueNo: 0,
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }]))
    },
    // Seuls les deux maîtres-espions reçoivent la carte-clé.
    secrets: { [spy.r]: { key }, [spy.b]: { key } },
    vault: { key }
  };
}

const switchTeam = (s) => ({ "state/phase": "clue", "state/turn": other(s.turn), "state/clue": null, "state/left": 0 });

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
    if (!(Number(act.cell) >= 0 && Number(act.cell) < SIZE) || s.revealed?.[cell]) return ctx.patch({ "state/step": ctx.nextStep() });
    let color = ctx.room.cards?.[s.g]?.[cell];
    for (const candidate of COLORS) {
      if (color) break;
      if (await ctx.tryWrite(`cards/${s.g}/${cell}`, candidate)) color = candidate;
    }
    if (!color) return;
    const revealed = { ...s.revealed, [cell]: color };
    const outcome = afterReveal(s, s.turn, color, revealed);
    const changes = { [`state/revealed/${cell}`]: color, "state/last": { by: who, cell, color }, "state/step": ctx.nextStep() };
    if (outcome.winner) {
      return ctx.patch({ ...changes, [`ended/${s.g}`]: true, "state/phase": "end", "state/winner": outcome.winner, "state/assassin": outcome.assassin || null });
    }
    if (outcome.switch || s.left <= 1) return ctx.patch({ ...changes, ...switchTeam(s) });
    return ctx.patch({ ...changes, "state/left": s.left - 1 });
  }
}
