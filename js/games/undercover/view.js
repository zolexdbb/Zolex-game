import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, token, flipCard, ranking, countdown } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { pairKey, avoidPairs, ROLE_NAMES, ROLE_ICONS, WINNERS, POINTS, wins, norm, skipTurn, goVote, forceClose, skipGuess, proceed, nextGame } from "./logic.js";

// État d'affichage propre à cet appareil (carte retournée, brouillons).
const ui = { g: null, open: false, clue: "", guess: "", shown: null };

const ROLE_HINTS = {
  civil: "Son mot était celui de la majorité.",
  undercover: "Son mot n'était pas tout à fait le vôtre.",
  mrwhite: "Aucun mot depuis le début de la partie."
};

export function roleArt(role) {
  return h("span", { class: `role-art role-art-${role}` }, icon(ROLE_ICONS[role]));
}

function hostTools(...buttons) {
  return h("div", { class: "host-tools" }, h("span", { class: "eyebrow" }, "Main de l'hôte"), buttons);
}

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

function secretCard({ secret }) {
  const front = secret.mrWhite
    ? [h("small", null, "Tu es"), roleArt("mrwhite"), h("strong", null, "Mr White"), h("small", null, "Aucun mot pour toi. Écoute, bluffe, devine.")]
    : [h("small", null, "Ton mot secret"), h("strong", null, secret.word), h("small", null, "Civil ou Undercover ? À toi de le découvrir.")];
  return flipCard({
    open: ui.open, cls: "card-secret", label: "Ta carte secrète",
    back: [h("span", { class: "stamp-big" }, "Confidentiel"), h("small", null, "Touche pour consulter, à l'abri des regards")],
    front,
    onToggle: (event) => {
      ui.open = !ui.open;
      event.currentTarget.classList.toggle("is-open", ui.open);
      event.currentTarget.setAttribute("aria-pressed", String(ui.open));
    }
  });
}

function table({ state: s, room, me }) {
  const current = s.phase === "clues" ? s.order[s.turn] : null;
  const ids = Object.keys(s.names).sort((a, b) => s.names[a].pawn - s.names[b].pawn);
  return h("section", { class: "felt-zone" },
    h("div", { class: "seats" }, ids.map((id) => {
      const seated = room.players?.[id];
      const role = room.reveals?.[s.g]?.[id];
      const out = !s.alive?.[id];
      // La carte en cours de retournement n'est pas annoncée avant l'heure.
      const shown = role && !(s.phase === "reveal" && !s.resolved && s.last?.uid === id);
      return h("div", { class: "seat" }, pawn(
        { name: s.names[id].name, index: s.names[id].pawn, online: !!seated?.online, avatar: seated?.avatar },
        {
          isHost: id === room.meta.hostUid, isMe: id === me, out, turn: id === current,
          // Le dernier indice reste affiché jusqu'à ce qu'un autre joueur parle.
          bubble: s.spoke?.uid === id && s.phase !== "end" ? s.spoke.text || "(passe)" : null,
          done: s.phase === "vote" && room.done?.[s.g]?.[s.step]?.[id],
          note: out ? (shown ? ROLE_NAMES[role] : "hors jeu") : !seated ? "a quitté" : null
        }
      ));
    }))
  );
}

function clueBoard({ state: s, room }) {
  const rounds = Object.keys(s.clues || {}).sort((a, b) => a.slice(1) - b.slice(1));
  if (!rounds.length) return null;
  return h("details", { class: "evidence", open: true },
    h("summary", null, "Pièces à conviction"),
    h("table", null, h("tbody", null,
      s.base.map((id) => h("tr", { class: s.alive?.[id] ? "" : "is-out" },
        h("th", { scope: "row" },
          token({ name: s.names[id].name, index: s.names[id].pawn, avatar: room.players?.[id]?.avatar }), s.names[id].name),
        h("td", null, rounds.map((r) => s.clues[r][id]).map((clue) =>
          clue == null ? null : h("span", { class: "clue" }, clue || "(passe)")))
      ))
    ))
  );
}

function cluesPanel(ctx) {
  const { state: s, me, isHost, myAction } = ctx;
  const current = s.order[s.turn];
  const name = s.names[current].name;
  const title = h("h2", null, `Manche ${s.round} · indices, tour ${s.tour} sur ${s.tours}`);
  const toVote = action("Passer directement au vote", "check", () => goVote(ctx));

  if (current !== me) {
    return [title,
      h("p", null, h("b", null, name), " cherche un mot pour décrire le sien sans le trahir."),
      isHost && hostTools(action(`Passer le tour de ${name}`, "skip", () => skipTurn(ctx)), toVote)];
  }
  if (myAction) return [title, h("p", { class: "rule" }, "Ton indice est posé sur la table.")];

  const input = h("input", {
    id: "clue", class: "field", type: "text", maxlength: "30", autocomplete: "off",
    placeholder: "Un seul mot", value: ui.clue, oninput: () => { ui.clue = input.value; }
  });
  const send = h("button", { class: "btn btn-brick", type: "submit" }, "Poser l'indice");
  const form = h("form", { class: "join" }, input, send);
  form.addEventListener("submit", busy(send, async () => {
    const clue = input.value.trim();
    if (!clue) return input.focus();
    await ctx.act({ clue });
    ui.clue = "";
  }));
  return [title,
    h("p", null, h("b", null, "C'est à toi."), " Donne un mot en rapport avec le tien : assez précis pour rassurer les Civils, assez flou pour ne rien offrir à Mr White."),
    form,
    isHost && hostTools(toVote)];
}

function votePanel(ctx) {
  const { state: s, room, me, isHost, mySealed } = ctx;
  const title = h("h2", null, `Manche ${s.round} · le vote`);
  const done = room.done?.[s.g]?.[s.step] || {};
  const waiting = Object.keys(s.alive).filter((id) => !done[id]).length;
  const tools = isHost && hostTools(action("Clôturer le vote", "check", () => forceClose(ctx)));

  if (!s.alive?.[me]) return [title, h("p", { class: "rule" }, "Les joueurs encore en jeu désignent un suspect."), tools];
  if (mySealed) {
    return [title,
      h("p", null, "Ton bulletin est dans l'urne : tu accuses ", h("b", null, s.names[mySealed.target]?.name || "?"), "."),
      h("p", { class: "rule" }, waiting ? `Encore ${waiting} bulletin(s) attendu(s).` : "Dépouillement…"),
      tools];
  }
  return [title,
    h("p", null, "Qui n'a pas le même mot que les autres ? Les bulletins restent secrets jusqu'au dépouillement, et un vote donné ne se reprend pas."),
    h("div", { class: "vote-list" },
      s.order.filter((id) => id !== me && s.alive[id]).map((id) =>
        action(s.names[id].name, null, () => ctx.seal({ target: id }), "btn-ink"))),
    tools];
}

function votesRecap({ state: s }) {
  if (!s.votes) return null;
  return h("ul", { class: "ballots" }, Object.entries(s.votes).map(([from, to]) =>
    h("li", null, s.names[from].name, " accuse ", h("b", null, s.names[to].name))));
}

function roleCard(ctx, role) {
  const key = `${ctx.state.g}/${ctx.state.last.uid}`;
  const deal = ui.shown !== key;
  ui.shown = key;
  return flipCard({
    open: true, deal, cls: `card-role role-${role}`,
    back: h("span", { class: "stamp-big" }, "Confidentiel"),
    front: [h("small", null, ctx.state.names[ctx.state.last.uid].name, " était"), roleArt(role), h("strong", null, ROLE_NAMES[role]), h("small", null, ROLE_HINTS[role])]
  });
}

function revealPanel(ctx) {
  const { state: s, room, isHost } = ctx;
  const name = s.names[s.last.uid].name;
  const role = room.reveals?.[s.g]?.[s.last.uid];
  const title = h("h2", null, s.last.left ? `${name} a quitté la table` : `Le vote désigne ${name}`);
  if (!s.resolved || !role) return [title, h("p", { class: "rule" }, "On retourne sa carte…")];
  return [title,
    s.last.tie && h("p", { class: "rule" }, "Égalité des voix : le sort a tranché."),
    roleCard(ctx, role),
    s.last.wrongGuess && h("p", null, "Mr White a tenté « ", h("b", null, s.last.wrongGuess), " » : ce n'était pas le mot des Civils."),
    votesRecap(ctx),
    isHost
      ? action(s.pending ? "Annoncer le verdict" : "Manche suivante", "play", () => proceed(ctx), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte lance la suite.")];
}

function mrWhitePanel(ctx) {
  const { state: s, room, me, isHost } = ctx;
  const who = s.last.uid;
  const name = s.names[who].name;
  const title = h("h2", null, `${name} était Mr White`);
  const sent = room.guess?.[s.g]?.[who];
  if (who !== me) {
    return [title,
      h("p", null, "Mr White est démasqué, mais garde une chance : deviner le mot des Civils, c'est gagner la partie en solo."),
      votesRecap(ctx),
      isHost && !sent && hostTools(action("Passer (Mr White ne répond pas)", "skip", () => skipGuess(ctx)))];
  }
  if (sent) return [title, h("p", { class: "rule" }, "Ta réponse est partie. Verdict imminent…")];

  const input = h("input", {
    id: "guess", class: "field", type: "text", maxlength: "40", autocomplete: "off",
    placeholder: "Le mot des Civils", value: ui.guess, oninput: () => { ui.guess = input.value; }
  });
  const send = h("button", { class: "btn btn-brick", type: "submit" }, "Tenter");
  const form = h("form", { class: "join" }, input, send);
  form.addEventListener("submit", busy(send, async () => {
    const text = input.value.trim();
    if (!text) return input.focus();
    await ctx.tryWrite(`guess/${s.g}/${me}`, { text, key: norm(text) });
  }));
  return [title, h("p", null, h("b", null, "Dernière chance."), " Quel était le mot des Civils ? Une seule proposition."), form];
}

// « Paire trop éloignée » : la paire ne sortira plus aux tables de cet hôte.
export function pairFlag(done, send) {
  if (done) return h("p", { class: "rule pair-flag" }, "Merci : cette paire ne sortira plus.");
  const button = h("button", { class: "btn btn-mini pair-flag", type: "button" }, "Paire trop éloignée ?");
  button.addEventListener("click", busy(button, send));
  return button;
}

// Le camp qui l'emporte, dit en clair : quels rôles gagnent ensemble cette partie.
const CAMPS = { civils: "Victoire des Civils", mrwhite: "Victoire de Mr White" };
export const campLabel = (winner, mixed) => CAMPS[winner] || (mixed ? "Victoire des infiltrés : Undercover et Mr White" : "Victoire des Undercover");
function campTitle(s, vault) {
  const roles = new Set(s.base.map((id) => vault?.roles[id]));
  return campLabel(s.winner, roles.has("mrwhite") && roles.has("undercover"));
}

// Fin d'une série de parties : le classement en grand, puis le résumé de chaque partie.
// Partagé avec la partie locale. `person(id)` : pion d'un joueur ;
// `history` : [{ no, winner, mixed, civil, undercover, winners: [noms] }] ;
// `unit` : le nom de chaque partie jouée (« partie » en ligne, « round » en local).
export function seriesBoard({ ids, score, person, history, key, count = history.length, what = "la série", unit = "partie" }) {
  const Unit = unit[0].toUpperCase() + unit.slice(1);
  const best = Math.max(...ids.map(score));
  const leaders = ids.filter((id) => score(id) === best);
  return [
    h("h2", null, `Classement final · ${count} ${unit}${count > 1 ? "s" : ""}`),
    h("p", { class: "verdict" }, leaders.length > 1
      ? `Ex aequo : ${leaders.map((id) => person(id).name).join(", ").replace(/, ([^,]*)$/, " et $1")}`
      : `${person(leaders[0]).name} remporte ${what}`),
    ranking({ ids, score, person, label: (id) => `${score(id)} pts`, key, big: true }),
    history.length > 0 && [
      h("h2", null, `Résumé des ${unit}s`),
      h("ol", { class: "series-recap" }, history.map((game) => h("li", { class: `camp-${game.winner}` },
        h("span", { class: "eyebrow" }, `${Unit} ${game.no}`),
        h("strong", null, campLabel(game.winner, game.mixed)),
        h("span", null, h("b", null, game.civil), " contre ", h("b", null, game.undercover)),
        h("small", null, "Gagnants : ", game.winners.join(", ")))))
    ]
  ];
}

function finalPanel(ctx) {
  const { state: s, room, me, isHost } = ctx;
  const series = s.series;
  return [
    seriesBoard({
      ids: Object.keys(s.names), score: (id) => series.scores?.[id] || 0, history: series.history || [],
      count: series.of, key: `${s.g}/final`,
      person: (id) => ({ name: s.names[id].name, index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me })
    }),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

function endPanel(ctx) {
  const { state: s, room, vault, me, isHost } = ctx;
  const guess = s.winner === "mrwhite" && room.guess?.[s.g]?.[s.last?.uid]?.text;
  const series = s.series || { no: 1, of: 1, scores: {} };
  const person = (id) => ({ name: s.names[id].name, index: s.names[id].pawn, online: true, avatar: room.players?.[id]?.avatar, isMe: id === me });
  const winners = vault ? s.base.filter((id) => wins(s.winner, vault.roles[id])) : [];
  const score = (id) => series.scores?.[id] || 0;
  const ranked = Object.keys(s.names).sort((a, b) => score(b) - score(a));
  return [
    h("h2", null, series.of > 1 ? `Partie ${series.no} sur ${series.of} · affaire classée` : "Affaire classée"),
    h("p", { class: "verdict" }, WINNERS[s.winner]),
    guess && h("p", null, "Sa réponse : « ", h("b", null, guess), " »."),
    !vault ? h("p", { class: "rule" }, "On ouvre les dossiers…") : [
      h("div", { class: `camp-banner camp-${s.winner}` },
        h("strong", null, campTitle(s, vault)),
        h("div", { class: "camp-pawns" }, winners.map((id) => pawn(person(id), {
          isMe: id === me, note: series.of > 1 ? `+${POINTS[vault.roles[id]]} pts` : ROLE_NAMES[vault.roles[id]]
        })))),
      h("p", null, "Mot des Civils : ", h("b", null, vault.words.civil), " · mot des Undercover : ", h("b", null, vault.words.undercover)),
      pairFlag(!!room.flags?.[pairKey(vault.words.civil, vault.words.undercover)],
        () => ctx.tryWrite(`flags/${pairKey(vault.words.civil, vault.words.undercover)}`, true)),
      h("ul", { class: "roles-list" }, s.base.map((id) =>
        h("li", { class: `role-${vault.roles[id]}` },
          h("span", null, s.names[id].name),
          h("b", null, roleArt(vault.roles[id]), ROLE_NAMES[vault.roles[id]]))))
    ],
    // Série de parties : le score cumulé (le classement final a son propre écran).
    series.of > 1 && s.scored && [
      h("h2", null, `Score de la série · après ${series.no} partie${series.no > 1 ? "s" : ""} sur ${series.of}`),
      h("ol", { class: "roles-list" }, ranked.map((id) => h("li", null, h("span", null, s.names[id].name), h("b", null, `${score(id)} pts`)))),
      s.until && h("p", null, "Partie suivante dans ", countdown(s.until, ctx.now), " : nouveaux rôles, nouveaux mots."),
      isHost && action("Distribuer tout de suite", "play", () => nextGame(ctx), "btn-brick")],
    series.of === 1 && (isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon."))
  ];
}

const PANELS = { clues: cluesPanel, vote: votePanel, reveal: revealPanel, mrwhite: mrWhitePanel, end: endPanel };

export function view(ctx) {
  const { state: s, me, secret } = ctx;
  if (ui.g !== s.g) Object.assign(ui, { g: s.g, open: false, clue: "", guess: "", shown: null });
  const seated = !!s.names[me];
  // L'hôte distribue les mots : il retient les paires signalées par la table.
  if (ctx.isHost && ctx.room.flags) avoidPairs(Object.keys(ctx.room.flags));
  // Dernière partie d'une série, comptes faits : le classement prend toute la place.
  if (s.phase === "end" && s.series?.of > 1 && s.series.no >= s.series.of && s.scored) {
    return [
      h("header", { class: "case-head" }, h("p", { class: "eyebrow" }, "Dossier Undercover"), h("h1", null, "Fin de la série")),
      h("section", { class: "sheet finale series-final" }, finalPanel(ctx)),
      h("div", { class: "finale" }, chatBox(ctx))
    ];
  }
  return [
    h("div", { class: "col" }, h("header", { class: "case-head" },
      h("p", { class: "eyebrow" }, s.series?.of > 1 ? `Dossier Undercover · partie ${s.series.no} sur ${s.series.of}` : "Dossier Undercover"),
      h("h1", null, s.phase === "end" ? "Fin de l'enquête" : `Manche ${s.round}`)),
    // La partie finie, tout est révélé : la carte secrète n'a plus rien à cacher.
    s.phase === "end" ? null : seated && secret ? secretCard(ctx)
      : !seated && h("p", { class: "rule" }, "La partie a commencé sans toi : observe, tu joueras la prochaine."),
    table(ctx)),
    h("div", { class: "col" },
      h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx)),
      s.phase !== "end" && clueBoard(ctx),
      chatBox(ctx))
  ];
}
