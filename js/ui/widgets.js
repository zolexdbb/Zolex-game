import { h } from "./dom.js";
import { icon } from "./icons.js";
import { avatarNode } from "./avatar.js";
import { tick } from "./sound.js";

const PAWN_COLORS = 8;

// Compteur à deux boutons, façon roue de score. `format` : affichage de la valeur.
export function stepper({ label, value, min, max, disabled, onChange, by = 1, format = String }) {
  const step = (delta, name, text) =>
    h("button", {
      class: "btn btn-round", type: "button", "aria-label": `${text} : ${label}`,
      disabled: disabled || value + delta < min || value + delta > max,
      onclick: () => onChange(value + delta)
    }, icon(name));
  return h("div", { class: "stepper" },
    h("span", { class: "stepper-label" }, label),
    step(-by, "minus", "Moins"),
    h("output", { class: "stepper-value" }, format(value)),
    step(by, "plus", "Plus")
  );
}

// Petit jeton d'un joueur, pour le reconnaître dans une liste.
export function token(player) {
  const face = avatarNode(player.avatar);
  return h("span", { class: `token pawn-${player.index % PAWN_COLORS}${face ? " has-avatar" : ""}`, "aria-hidden": "true" },
    face || player.name.charAt(0).toUpperCase());
}

// Pion d'un joueur. `player` : { name, index, online, avatar }.
// `bubble` : ce qu'il vient de dire, affiché au-dessus de lui.
export function pawn(player, { isHost, isMe, out, turn, done, note, bubble } = {}) {
  const face = avatarNode(player.avatar);
  const cls = ["pawn", `pawn-${player.index % PAWN_COLORS}`,
    !player.online && "is-away", out && "is-out", turn && "is-turn"].filter(Boolean).join(" ");
  return h("div", { class: cls },
    bubble != null && h("span", { class: "pawn-bubble" }, bubble),
    h("div", { class: `pawn-disc${face ? " has-avatar" : ""}` },
      isHost && h("span", { class: "pawn-crown", title: "Hôte de la table" }, icon("crown")),
      done && h("span", { class: "pawn-done", title: "A joué" }, icon("check")),
      face || h("span", { "aria-hidden": "true" }, player.name.charAt(0).toUpperCase())
    ),
    h("span", { class: "pawn-name" }, player.name, isMe && h("em", null, " (toi)")),
    note ? h("span", { class: "pawn-away" }, note) : !player.online && h("span", { class: "pawn-away" }, "hors ligne")
  );
}

// Joueurs assis en cercle autour d'une table. `seats` : nœuds dans l'ordre du
// tour de table ; `center` : ce qui est posé au milieu ; `start` : angle du premier siège (en haut par défaut).
export function roundTable(seats, center, start = -Math.PI / 2) {
  const n = seats.length;
  return h("section", { class: `round${n > 10 ? " is-crowded" : ""}` },
    h("div", { class: "round-top" }, center),
    seats.map((seat, i) => {
      const angle = (2 * Math.PI * i) / n + start;
      const spot = h("div", { class: "round-seat" }, seat);
      spot.style.left = `${50 + 43 * Math.cos(angle)}%`;
      spot.style.top = `${50 + 41 * Math.sin(angle)}%`;
      return spot;
    })
  );
}

// Compte à rebours jusqu'à `until` (heure donnée par `now`).
export function countdown(until, now) {
  const el = h("span", { class: "countdown" });
  const draw = () => {
    const left = Math.max(0, Math.ceil((until - now()) / 1000));
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    tick(until, left);
  };
  draw();
  const timer = setInterval(() => (el.isConnected ? draw() : clearInterval(timer)), 500);
  return el;
}

// Carte à jouer recto/verso. `onToggle` absent : carte non cliquable.
export function flipCard({ open, back, front, cls = "", label, onToggle, deal }) {
  const faces = h("span", { class: "card-inner" },
    h("span", { class: "card-face card-back" }, back),
    h("span", { class: "card-face card-front" }, front));
  const classes = `card ${cls}${open ? " is-open" : ""}${deal ? " is-dealt" : ""}`;
  return onToggle
    ? h("button", { class: classes, type: "button", "aria-pressed": String(!!open), "aria-label": label, onclick: onToggle }, faces)
    : h("div", { class: classes }, faces);
}

// Podium de fin de partie. `steps` : jusqu'à trois marches, de la plus haute à la
// plus basse, chacune { players: [{ name, index, online, avatar, isMe }], note }.
// `key` désigne la partie : les marches ne montent qu'une fois, même si l'écran est redessiné.
const risen = { key: null, at: 0 };
// `rank` (facultatif) : la place affichée sur la marche, quand des ex æquo décalent le compte.
export function podium(steps, key, big = false) {
  if (risen.key !== key) Object.assign(risen, { key, at: performance.now() });
  const box = h("div", { class: `podium${big ? " is-big" : ""}`, role: "list" }, steps.slice(0, 3).map((step, i) => {
    const rank = step.rank ?? i + 1;
    const el = h("div", { class: `podium-step is-${i + 1}`, role: "listitem", "aria-label": `${rank}${rank === 1 ? "re" : "e"} place` },
      h("div", { class: "podium-who" }, step.players.map((p) => pawn(p, { isMe: p.isMe }))),
      step.note && h("b", { class: "podium-note" }, step.note),
      h("div", { class: "podium-block" }, rank === 1 ? icon("crown") : String(rank)));
    el.style.flexGrow = Math.min(3, step.players.length || 1);
    return el;
  }));
  box.style.setProperty("--since", `${Math.round(risen.at - performance.now())}ms`);
  return box;
}

// Classement avec ex æquo : les joueurs à égalité partagent la même place
// (1, 2, 2, 4…) et la même marche du podium. `low` : le plus petit score gagne.
export function standings(ids, score, low = false) {
  const sorted = [...ids].sort((a, b) => (low ? score(a) - score(b) : score(b) - score(a)));
  const groups = [];
  sorted.forEach((id, i) => {
    const last = groups.at(-1);
    if (last && score(last.ids[0]) === score(id)) last.ids.push(id);
    else groups.push({ rank: i + 1, ids: [id] });
  });
  return groups;
}

// Le classement complet : podium pour les trois premières places, liste pour la suite.
// `person(id)` donne le pion d'un joueur, `label(id)` son score affiché.
export function ranking({ ids, score, person, label, low = false, key, big = false }) {
  const groups = standings(ids, score, low);
  const top = groups.slice(0, 3), rest = groups.slice(3);
  return [
    podium(top.map((group) => ({ rank: group.rank, players: group.ids.map(person), note: label(group.ids[0]) })), key, big),
    rest.length > 0 && h("ol", { class: "roles-list ranks" }, rest.flatMap((group) => group.ids.map((id) =>
      h("li", null, h("span", null, h("b", null, `${group.rank}. `), person(id).name), h("b", null, label(id))))))
  ];
}

// Composition des équipes par l'hôte. `ids` : les équipes (["r", "b"] par défaut) ;
// `teams` : { uid: "r" | "b" | … } ; `spies` : { r, b, … } (facultatif : sans lui, pas de
// maître-espion à désigner). Toucher un joueur l'envoie dans l'équipe suivante ; l'étoile
// en fait le maître-espion.
export function teamPicker({ players, teams = {}, spies, isHost, onChange, ids = ["r", "b"], names = { r: "Rouges", b: "Bleus" } }) {
  // Un joueur pas encore placé (ou placé dans une équipe qui n'existe plus) est réparti à tour de rôle.
  const current = Object.fromEntries(players.map((p, i) => [p.id, ids.includes(teams[p.id]) ? teams[p.id] : ids[i % ids.length]]));
  const after = (team) => ids[(ids.indexOf(team) + 1) % ids.length];
  const shuffleAll = () => {
    const mixed = [...players].sort(() => Math.random() - 0.5);
    const next = Object.fromEntries(mixed.map((p, i) => [p.id, ids[i % ids.length]]));
    onChange({ teams: next, spies: spies && Object.fromEntries(ids.map((team, i) => [team, mixed[i]?.id || null])) });
  };
  const column = (team) => h("div", { class: `team-col team-${team}` },
    h("h4", null, `${names[team]} · ${players.filter((p) => current[p.id] === team).length}`),
    players.filter((p) => current[p.id] === team).map((p) => h("div", { class: "team-row" },
      h("button", {
        class: "btn btn-mini", type: "button", disabled: !isHost, title: `Passer chez les ${names[after(team)]}`,
        onclick: () => onChange({ teams: { ...current, [p.id]: after(team) }, spies })
      }, token(p), h("span", null, p.name), " ⇄"),
      spies && h("button", {
        class: `btn btn-mini team-spy${spies[team] === p.id ? " is-on" : ""}`, type: "button", disabled: !isHost,
        title: "Maître-espion", "aria-pressed": String(spies[team] === p.id),
        onclick: () => onChange({ teams: current, spies: { ...spies, [team]: p.id } })
      }, "★"))));
  return h("div", { class: "team-picker" },
    h("div", { class: `team-cols is-${ids.length}` }, ids.map(column)),
    isHost && h("button", { class: "btn btn-mini", type: "button", onclick: shuffleAll }, "Au hasard"));
}
