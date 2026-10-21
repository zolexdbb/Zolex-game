// Undercover en local : pas de réseau, le téléphone passe de main en main.
// Une partie se joue en plusieurs rounds, dont les points s'additionnent.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { pawn, stepper, flipCard } from "../ui/widgets.js";
import { WORD_DEFAULTS, wordSetup } from "../ui/wordbank.js";
import { soundControl, play } from "../ui/sound.js";
import { cleanName } from "../room.js";
import { validName, NAME_RULE } from "../ui/profile.js";
import { roleArt, campLabel, seriesBoard, pairFlag } from "../games/undercover/view.js";
import {
  ROLE_NAMES, WINNERS, POINTS, dealRoles, pairKey, avoidPairs, avoidedPairs, firstNotWhite, winnerOf, wins, civils, checkSettings, norm
} from "../games/undercover/logic.js";

const SAVE_KEY = "local-undercover";
const ROLE_HINTS = {
  civil: "Son mot était celui de la majorité.",
  undercover: "Son mot n'était pas tout à fait le vôtre.",
  mrwhite: "Aucun mot depuis le début de la partie."
};

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

// Partie en cours. `screen` dit où l'on en est.
let game = null;
let show = () => {};
let leave = () => {};

const saved = load();
const setup = {
  names: saved.names || [],
  settings: { undercover: 1, mrWhite: 0, ...WORD_DEFAULTS, ...saved.settings },
  scores: {}, history: [], draft: "", error: ""
};
const persist = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ names: setup.names, settings: setup.settings })); } catch { /* stockage plein ou bloqué */ }
};

const person = (i) => ({ name: setup.names[i], index: i, online: true });
// Une nouvelle partie repart de zéro : plus de score, plus de résumé.
const resetEvening = () => { setup.scores = {}; setup.history = []; };
const render = () => show(screen());
const go = (patch) => { Object.assign(game, patch); render(); };
const button = (label, onclick, cls = "btn-brick", art = null) =>
  h("button", { class: `btn ${cls}`, type: "button", onclick }, art && icon(art), label);

export function startLocal({ show: showView, onExit }) {
  show = showView;
  leave = onExit;
  game = null;
  render();
}

// ---- Les écrans ----

function screen() {
  const body = !game ? setupScreen() : {
    pass: passScreen, clues: cluesScreen, vote: voteScreen, reveal: revealScreen, guess: guessScreen, end: endScreen, final: finalScreen
  }[game.screen]();
  const final = game?.screen === "final";
  // Round en cours : on peut l'abandonner. Round fini : on rentre simplement à l'accueil.
  const playing = game && game.screen !== "end" && !final;
  const title = !game ? "Les joueurs" : final ? "Fin de la partie" : game.screen === "end" ? "Fin de l'enquête" : `Manche ${game.round}`;
  return h("main", { class: `mat${final ? "" : " mat-narrow"} theme-undercover local-game` },
    h("header", { class: "case-head" },
      h("p", { class: "eyebrow" }, game && !final ? `Undercover · locale · round ${game.no}` : "Undercover · locale"),
      h("h1", null, title)),
    h("section", { class: `sheet${final ? " finale series-final" : ""}` }, body),
    h("footer", { class: "table-foot" },
      button(playing ? "Abandonner le round" : "Retour à l'accueil", () => {
        if (playing && !confirm("Abandonner le round en cours ?")) return;
        if (playing) { game = null; render(); } else { game = null; leave(); }
      }, "btn-cream", "leave")),
    soundControl());
}

function setupScreen() {
  const n = setup.names.length;
  const set = (settings) => { setup.settings = settings; persist(); render(); };
  const input = h("input", {
    id: "local-name", class: "field", type: "text", maxlength: "20", autocomplete: "off",
    placeholder: "Pseudo du joueur", value: setup.draft, oninput: () => { setup.draft = input.value; }
  });
  const form = h("form", { class: "join" }, input, h("button", { class: "btn btn-ink", type: "submit" }, "Ajouter"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = cleanName(input.value);
    setup.error = !validName(name) ? NAME_RULE
      : setup.names.some((other) => other.toLowerCase() === name.toLowerCase()) ? "Ce pseudo est déjà pris."
      : n >= 20 ? "20 joueurs au plus." : "";
    if (!setup.error) { setup.names.push(name); setup.draft = ""; resetEvening(); persist(); }
    render();
  });
  const blocker = n < 3 ? `Il faut au moins 3 joueurs (encore ${3 - n}).` : checkSettings(setup.settings, n);
  const s = setup.settings;
  return [
    h("p", { class: "rule" }, "Un seul téléphone pour tout le monde : chacun regarde sa carte à son tour, puis les indices se disent à voix haute."),
    form,
    setup.error && h("p", { class: "notice", role: "alert" }, setup.error),
    h("ul", { class: "local-players" }, setup.names.map((name, i) => h("li", null,
      pawn(person(i)),
      h("button", {
        class: "btn btn-mini", type: "button", "aria-label": `Retirer ${name}`,
        onclick: () => { setup.names.splice(i, 1); resetEvening(); persist(); render(); }
      }, icon("cross"))))),
    stepper({ label: "Undercover", value: s.undercover, min: 1, max: 3, onChange: (undercover) => set({ ...s, undercover }) }),
    stepper({ label: "Mr White", value: s.mrWhite, min: 0, max: 1, onChange: (mrWhite) => set({ ...s, mrWhite }) }),
    h("p", { class: "rule" }, `${Math.max(civils(s, n), 0)} Civil(s), ${s.undercover} Undercover, ${s.mrWhite} Mr White.`),
    wordSetup({ gameId: "local-undercover", grouped: true, settings: s, isHost: true, setSettings: set }),
    h("button", { class: "btn btn-brick btn-big", type: "button", disabled: !!blocker, onclick: newGame }, icon("play"), "Distribuer les cartes"),
    blocker && h("p", { class: "rule" }, blocker)
  ];
}

function newGame() {
  const ids = setup.names.map((_, i) => String(i));
  const deal = dealRoles(ids, setup.settings);
  game = {
    ...deal, round: 1, no: setup.history.length + 1, order: deal.base, alive: Object.fromEntries(ids.map((id) => [id, true])),
    reveals: {}, screen: "pass", passAt: 0, open: false, last: null, winner: null, guess: ""
  };
  play("shuffle");
  render();
}

// Le téléphone passe de main en main : chacun découvre sa carte, seul.
function passScreen() {
  const id = game.ids[game.passAt];
  const name = setup.names[id];
  const role = game.roles[id];
  if (!game.open) {
    return [
      h("h2", null, `Carte ${game.passAt + 1} sur ${game.ids.length}`),
      h("div", { class: "local-pass" }, pawn(person(Number(id))),
        h("p", null, "Passe le téléphone à ", h("b", null, name), ". Les autres détournent les yeux !")),
      button(`Je suis ${name} : voir ma carte`, () => go({ open: true }), "btn-brick btn-big", "eye")
    ];
  }
  const front = role === "mrwhite"
    ? [h("small", null, "Tu es"), roleArt("mrwhite"), h("strong", null, "Mr White"), h("small", null, "Aucun mot pour toi. Écoute, bluffe, devine.")]
    : [h("small", null, "Ton mot secret"), h("strong", null, role === "civil" ? game.civilWord : game.undercoverWord),
      h("small", null, "Civil ou Undercover ? À toi de le découvrir.")];
  const last = game.passAt + 1 >= game.ids.length;
  return [
    h("h2", null, name),
    flipCard({ open: true, deal: true, cls: "card-secret", back: h("span", { class: "stamp-big" }, "Confidentiel"), front }),
    button(last ? "C'est retenu : on commence" : "C'est retenu : cacher et passer", () =>
      go(last ? { screen: "clues", open: false } : { passAt: game.passAt + 1, open: false }), "btn-ink btn-big", "check")
  ];
}

function cluesScreen() {
  return [
    h("h2", null, "Les indices, à voix haute"),
    h("p", null, "Chacun dit un mot en rapport avec le sien, dans cet ordre. Faites autant de tours que vous voulez."),
    h("ol", { class: "local-order" }, game.order.map((id) => h("li", null, pawn(person(Number(id)))))),
    button("Passer au vote", () => go({ screen: "vote", pick: null }), "btn-brick btn-big", "check")
  ];
}

// La table décide à voix haute, puis désigne le joueur éliminé sur l'écran.
function voteScreen() {
  const alive = game.order.filter((id) => game.alive[id]);
  return [
    h("h2", null, "Le vote"),
    h("p", null, "Votez à main levée, puis touchez le joueur éliminé."),
    h("div", { class: "vote-list" }, alive.map((id) => h("button", {
      class: "btn btn-ink", type: "button", "aria-pressed": String(game.pick === id), onclick: () => go({ pick: id })
    }, setup.names[id]))),
    game.pick != null && button(`Éliminer ${setup.names[game.pick]}`, () => eliminate(game.pick), "btn-brick btn-big", "target")
  ];
}

function eliminate(id) {
  game.alive[id] = false;
  game.reveals[id] = game.roles[id];
  game.last = { id, wrong: null };
  play("reveal");
  go({ screen: game.roles[id] === "mrwhite" ? "guess" : "reveal", guess: "" });
}

function left() {
  const count = { civil: 0, undercover: 0, mrwhite: 0 };
  for (const id of game.ids) if (game.alive[id]) count[game.roles[id]]++;
  return count;
}

function finish(winner) {
  for (const id of game.ids) {
    if (wins(winner, game.roles[id])) setup.scores[id] = (setup.scores[id] || 0) + POINTS[game.roles[id]];
  }
  // Résumé du round, pour l'écran de fin de partie (même format que la partie en ligne).
  const roles = Object.values(game.roles);
  setup.history.push({
    no: game.no, winner, civil: game.civilWord, undercover: game.undercoverWord,
    winners: game.ids.filter((id) => wins(winner, game.roles[id])).map((id) => setup.names[id]),
    mixed: roles.includes("mrwhite") && roles.includes("undercover")
  });
  play("win");
  go({ screen: "end", winner });
}

function revealScreen() {
  const { id, wrong } = game.last;
  const role = game.roles[id];
  const winner = winnerOf(left());
  return [
    h("h2", null, `${setup.names[id]} est éliminé`),
    flipCard({
      open: true, deal: true, cls: `card-role role-${role}`, back: h("span", { class: "stamp-big" }, "Confidentiel"),
      front: [h("small", null, setup.names[id], " était"), roleArt(role), h("strong", null, ROLE_NAMES[role]), h("small", null, ROLE_HINTS[role])]
    }),
    wrong && h("p", null, "Mr White a tenté « ", h("b", null, wrong), " » : ce n'était pas le mot des Civils."),
    winner
      ? button("Annoncer le verdict", () => finish(winner), "btn-brick btn-big", "play")
      : button("Manche suivante", () => {
        // Nouvel ordre de parole : on tourne d'un cran, sans jamais laisser Mr White commencer.
        const turned = [...game.order.slice(1), game.order[0]].filter((x) => game.alive[x]);
        go({ screen: "clues", round: game.round + 1, order: firstNotWhite(turned, game.roles) });
      }, "btn-brick btn-big", "play")
  ];
}

// Mr White démasqué tape sa proposition sur le téléphone.
function guessScreen() {
  const id = game.last.id;
  const input = h("input", {
    id: "local-guess", class: "field", type: "text", maxlength: "40", autocomplete: "off",
    placeholder: "Le mot des Civils", value: game.guess, oninput: () => { game.guess = input.value; }
  });
  const form = h("form", { class: "join" }, input, h("button", { class: "btn btn-brick", type: "submit" }, "Tenter"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return input.focus();
    if (norm(text) === norm(game.civilWord)) return finish("mrwhite");
    game.last.wrong = text;
    go({ screen: "reveal" });
  });
  return [
    h("h2", null, `${setup.names[id]} était Mr White`),
    h("p", null, "Passe-lui le téléphone : s'il devine le mot des Civils, il gagne seul la partie."),
    form,
    button("Il renonce", () => go({ screen: "reveal" }), "btn-cream")
  ];
}

// Fin d'un round : le camp gagnant, les mots, les rôles, et le score de la partie en liste.
function endScreen() {
  const winners = game.ids.filter((id) => wins(game.winner, game.roles[id]));
  const roles = Object.values(game.roles);
  const score = (id) => setup.scores[id] || 0;
  const ranked = [...game.ids].sort((a, b) => score(b) - score(a));
  const played = setup.history.length;
  return [
    h("h2", null, `Round ${game.no} · affaire classée`),
    h("p", { class: "verdict" }, WINNERS[game.winner]),
    h("div", { class: `camp-banner camp-${game.winner}` },
      h("strong", null, campLabel(game.winner, roles.includes("mrwhite") && roles.includes("undercover"))),
      h("div", { class: "camp-pawns" }, winners.map((id) => pawn(person(Number(id)), { note: `+${POINTS[game.roles[id]]} pts` })))),
    h("p", null, "Mot des Civils : ", h("b", null, game.civilWord), " · mot des Undercover : ", h("b", null, game.undercoverWord)),
    pairFlag(avoidedPairs().has(pairKey(game.civilWord, game.undercoverWord)),
      async () => { avoidPairs([pairKey(game.civilWord, game.undercoverWord)]); render(); }),
    h("ul", { class: "roles-list" }, game.ids.map((id) => h("li", { class: `role-${game.roles[id]}` },
      h("span", null, setup.names[id]), h("b", null, roleArt(game.roles[id]), ROLE_NAMES[game.roles[id]])))),
    h("h2", null, `Score de la partie · après ${played} round${played > 1 ? "s" : ""}`),
    h("ol", { class: "roles-list" }, ranked.map((id) => h("li", null, h("span", null, setup.names[id]), h("b", null, `${score(id)} pts`)))),
    button("Round suivant", newGame, "btn-brick btn-big", "play"),
    button("Terminer la partie", () => go({ screen: "final" }), "btn-ink", "crown"),
    button("Changer les joueurs", () => { game = null; render(); }, "btn-cream")
  ];
}

// Fin de la partie : le même écran que la fin d'une série en ligne.
function finalScreen() {
  return [
    seriesBoard({
      ids: game.ids, score: (id) => setup.scores[id] || 0, person: (id) => person(Number(id)),
      history: setup.history, key: `local-final-${setup.history.length}`, what: "la partie", unit: "round"
    }),
    button("Nouvelle partie avec les mêmes joueurs", () => { resetEvening(); newGame(); }, "btn-brick btn-big", "play"),
    button("Changer les joueurs", () => { resetEvening(); game = null; render(); }, "btn-cream")
  ];
}
