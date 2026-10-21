import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { TEAMS, other, total, teamOf, revealedCount, checkClue } from "./logic.js";

// État d'affichage propre à cet appareil : l'indice en cours d'écriture.
const ui = { word: "", n: 1, error: "", cue: null };

const nameOf = (s, id) => s.names[id]?.name || "?";
const person = ({ state: s, room, me }, id) =>
  ({ name: nameOf(s, id), index: s.names[id]?.pawn ?? 0, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar, isMe: id === me });
const COLOR_NAMES = { r: "rouge", b: "bleu", n: "neutre", a: "l'assassin" };

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

// La grille : retournée pour tout le monde, colorée en filigrane pour les maîtres-espions.
function grid(ctx) {
  const { state: s, me, secret, vault, myAction } = ctx;
  const key = s.phase === "end" ? vault?.key : secret?.key;
  const team = teamOf(s, me);
  const canTouch = s.phase === "guess" && team === s.turn && me !== s.spy[team] && !myAction;
  return h("div", { class: "cn-grid", role: "grid" }, s.grid.map((word, i) => {
    const cell = `c${i}`;
    const shown = s.revealed?.[cell];
    const hint = !shown && key?.[cell];
    const cls = `cn-card${shown ? ` is-shown is-${shown}` : ""}${hint ? ` hint-${hint}` : ""}${s.last?.cell === cell ? " is-last" : ""}`;
    const label = shown ? `${word} : ${COLOR_NAMES[shown]}` : word;
    return canTouch && !shown
      ? h("button", { class: cls, type: "button", "aria-label": `Toucher ${word}`, onclick: () => ctx.act({ cell: i }).catch(() => ctx.refresh()) }, h("span", null, word))
      : h("div", { class: cls, role: "gridcell", "aria-label": label }, h("span", null, word));
  }));
}

function cluePanel(ctx) {
  const { state: s, me, myAction } = ctx;
  const spy = s.spy[s.turn];
  if (me !== spy) {
    return [h("h2", null, `Le maître-espion des ${TEAMS[s.turn]} réfléchit`),
      h("p", { class: "rule" }, `${nameOf(s, spy)} cherche un indice qui relie plusieurs mots de son équipe.`)];
  }
  if (myAction) return [h("h2", null, "Indice envoyé"), h("p", { class: "rule" }, "On vérifie qu'il n'est pas sur la grille…")];
  const input = h("input", {
    id: "cn-clue", class: "field", type: "text", maxlength: "30", autocomplete: "off", autocapitalize: "off",
    placeholder: "Un seul mot", value: ui.word, oninput: () => { ui.word = input.value; }
  });
  const number = h("select", { id: "cn-n", class: "field cn-n", "aria-label": "Nombre de mots", onchange: () => { ui.n = Number(number.value); } },
    Array.from({ length: 9 }, (_, i) => h("option", { value: String(i + 1), selected: ui.n === i + 1 }, String(i + 1))));
  const send = h("button", { class: "btn btn-brick", type: "submit" }, "Donner l'indice");
  const error = h("p", { class: "notice", role: "alert", hidden: !ui.error }, ui.error);
  const form = h("form", { class: "join cn-clue" }, input, number, send);
  form.addEventListener("submit", busy(send, async () => {
    const word = input.value.trim();
    ui.error = checkClue(s, word) || "";
    error.textContent = ui.error;
    error.hidden = !ui.error;
    if (ui.error) return input.focus();
    await ctx.act({ word, n: ui.n });
    ui.word = "";
  }));
  return [h("h2", null, `À toi, maître-espion des ${TEAMS[s.turn]}`),
    h("p", { class: "rule" }, "Les cases teintées sont celles de ton équipe. Un mot, et le nombre de cases qu'il désigne. Évite l'assassin (en noir) !"),
    form, error];
}

function guessPanel(ctx) {
  const { state: s, me, myAction } = ctx;
  const team = teamOf(s, me);
  const mine = team === s.turn && me !== s.spy[team];
  return [
    h("p", { class: `cn-clue-shown team-${s.turn}` }, h("span", null, `Indice des ${TEAMS[s.turn]}`), h("strong", null, s.clue?.word), h("b", null, String(s.clue?.n))),
    h("p", { class: "rule" }, `Encore ${s.left} essai${s.left > 1 ? "s" : ""} au plus.`,
      mine ? " Touche une case de la grille, ou passe la main." : ` Les ${TEAMS[s.turn]} cherchent…`),
    mine && !myAction && action("Passer la main", "skip", () => ctx.act({ pass: true }))
  ];
}

function story(s) {
  const l = s.last;
  if (!l) return null;
  if (l.pass) return `${nameOf(s, l.by)} passe la main.`;
  return `${nameOf(s, l.by)} a touché « ${s.grid[l.cell.slice(1)]} » : ${COLOR_NAMES[l.color]}.`;
}

function teamsBoard(ctx) {
  const { state: s, room, me } = ctx;
  return h("section", { class: "cn-teams" }, ["r", "b"].map((team) => h("div", { class: `cn-team team-${team}${s.turn === team && s.phase !== "end" ? " is-turn" : ""}` },
    h("h3", null, TEAMS[team], h("b", null, `${total(s, team) - revealedCount(s, team)} à trouver`)),
    h("div", { class: "cn-members" }, s.teams[team].map((id) => h("div", { class: "seat" }, pawn(person(ctx, id), {
      isHost: id === room.meta.hostUid, isMe: id === me, note: id === s.spy[team] ? "maître-espion" : null
    })))))));
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  return [
    h("p", { class: `cn-winner team-${s.winner}` }, `Victoire des ${TEAMS[s.winner]}`),
    s.assassin && h("p", { class: "verdict" }, `Les ${TEAMS[other(s.winner)]} ont touché l'assassin !`),
    h("p", { class: "rule" }, "La carte-clé est retournée : toutes les cases montrent leur couleur."),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

export function view(ctx) {
  const { state: s, me } = ctx;
  const cue = `${s.g}/${s.step}/${s.phase}`;
  if (ui.cue !== cue) {
    if (s.last?.color === "a" || s.phase === "end") play("win");
    else if (s.last?.cell && s.phase !== "end") play("card");
    if (s.phase === "clue") ui.error = "";
    ui.cue = cue;
  }
  const team = teamOf(s, me);
  const role = !team ? "Tu regardes la partie." : me === s.spy[team] ? `Tu es maître-espion des ${TEAMS[team]}.` : `Tu joues avec les ${TEAMS[team]}.`;
  const panel = s.phase === "end" ? endPanel(ctx) : s.phase === "clue" ? cluePanel(ctx) : guessPanel(ctx);
  return [
    h("div", { class: "col cn-main" },
      h("header", { class: "cn-head" },
        h("p", { class: "eyebrow" }, `Nom de code · ${role}`),
        h("h1", { class: s.phase === "end" ? `team-${s.winner}` : `team-${s.turn}` },
          s.phase === "end" ? "Fin de la mission" : `Au tour des ${TEAMS[s.turn]}`)),
      grid(ctx),
      story(s) && h("p", { class: "cn-story" }, story(s))),
    h("div", { class: "col" },
      h("section", { class: "sheet" }, panel),
      teamsBoard(ctx),
      chatBox(ctx))
  ];
}

