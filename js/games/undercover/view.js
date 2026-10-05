import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, flipCard } from "../../ui/widgets.js";
import { ROLE_NAMES, ROLE_ICONS, WINNERS, norm, skipTurn, goVote, forceClose, skipGuess, proceed } from "./logic.js";

// État d'affichage propre à cet appareil (carte retournée, brouillons).
const ui = { g: null, open: false, clue: "", guess: "", shown: null };

const ROLE_HINTS = {
  civil: "Il faisait partie de la majorité.",
  undercover: "Son mot n'était pas tout à fait le vôtre.",
  mrwhite: "Il n'avait aucun mot depuis le début."
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
        { name: s.names[id].name, index: s.names[id].pawn, online: !!seated?.online },
        {
          isHost: id === room.meta.hostUid, isMe: id === me, out, turn: id === current,
          done: s.phase === "vote" && room.done?.[s.g]?.[s.step]?.[id],
          note: out ? (shown ? ROLE_NAMES[role] : "sorti") : !seated ? "parti" : null
        }
      ));
    }))
  );
}

function clueBoard({ state: s }) {
  const rounds = Object.keys(s.clues || {}).sort((a, b) => a.slice(1) - b.slice(1));
  if (!rounds.length) return null;
  return h("details", { class: "evidence", open: true },
    h("summary", null, "Pièces à conviction"),
    h("table", null, h("tbody", null,
      s.base.map((id) => h("tr", { class: s.alive?.[id] ? "" : "is-out" },
        h("th", { scope: "row" }, s.names[id].name),
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
  const title = h("h2", null, s.last.left ? `${name} a quitté la table` : `${name} est éliminé`);
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
      h("p", null, "Démasqué, il lui reste une chance : s'il devine le mot des Civils, il gagne la partie à lui seul."),
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

function endPanel(ctx) {
  const { state: s, room, vault, isHost } = ctx;
  const guess = s.winner === "mrwhite" && room.guess?.[s.g]?.[s.last?.uid]?.text;
  return [
    h("h2", null, "Affaire classée"),
    h("p", { class: "verdict" }, WINNERS[s.winner]),
    guess && h("p", null, "Sa réponse : « ", h("b", null, guess), " »."),
    !vault ? h("p", { class: "rule" }, "On ouvre les dossiers…") : [
      h("p", null, "Mot des Civils : ", h("b", null, vault.words.civil), " · mot des Undercover : ", h("b", null, vault.words.undercover)),
      h("ul", { class: "roles-list" }, s.base.map((id) =>
        h("li", { class: `role-${vault.roles[id]}` },
          h("span", null, s.names[id].name),
          h("b", null, roleArt(vault.roles[id]), ROLE_NAMES[vault.roles[id]]))))
    ],
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

const PANELS = { clues: cluesPanel, vote: votePanel, reveal: revealPanel, mrwhite: mrWhitePanel, end: endPanel };

export function view(ctx) {
  const { state: s, me, secret } = ctx;
  if (ui.g !== s.g) Object.assign(ui, { g: s.g, open: false, clue: "", guess: "", shown: null });
  const seated = !!s.names[me];
  return [
    h("header", { class: "case-head" },
      h("p", { class: "eyebrow" }, "Dossier Undercover"),
      h("h1", null, s.phase === "end" ? "Fin de l'enquête" : `Manche ${s.round}`)),
    seated && secret ? secretCard(ctx)
      : !seated && h("p", { class: "rule" }, "Tu es arrivé en cours de partie : observe, tu joueras la prochaine."),
    table(ctx),
    h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx)),
    s.phase !== "end" && clueBoard(ctx)
  ];
}
