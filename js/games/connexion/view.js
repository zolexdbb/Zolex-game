import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, token, countdown, ranking } from "../../ui/widgets.js";
import { chatBox, tableChannel } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { norm } from "../dessin/logic.js";
import { needed, bonus, skipWait } from "./logic.js";

// État d'affichage propre à cet appareil.
const ui = { draft: "", cue: null, error: "" };

const nameOf = (s, id) => s.names[id]?.name || "?";
const person = ({ state: s, room, me }, id) =>
  ({ name: nameOf(s, id), index: s.names[id]?.pawn ?? 0, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar, isMe: id === me });

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

// Les mots à relier, punaisés au tableau et reliés par un fil.
function linkBoard({ state: s }) {
  return h("section", { class: "cx-board", "aria-label": "Mots à relier" },
    h("p", { class: "eyebrow" }, s.phase === "reveal" ? (s.last?.over ? "Fin de la manche" : "À relier au prochain tour")
      : s.tour === 1 ? "Les mots de départ" : `Les mots du tour ${s.tour - 1}`),
    h("ul", { class: "cx-notes" }, (s.link || []).map((word, i) =>
      h("li", { class: "cx-note", style: `--tilt: ${i % 2 ? 2 : -2}deg` }, h("span", { class: "cx-pin", "aria-hidden": "true" }), word))));
}

function writePanel(ctx) {
  const { state: s, me, mySealed, room } = ctx;
  const done = room.done?.[s.g]?.[s.step] || {};
  const players = s.order.filter((id) => room.players?.[id]);
  const waiting = players.filter((id) => !done[id]).length;
  const title = h("h2", null, `Tour ${s.tour} sur ${s.rules.maxTours}`);
  if (!s.order.includes(me)) return [title, h("p", { class: "rule" }, "Tu regardes cette manche : tu joueras la prochaine partie.")];
  if (mySealed) {
    return [title, h("p", null, "Ton mot est posé, face cachée : ", h("b", null, mySealed.word), "."),
      h("p", { class: "rule" }, waiting ? `Encore ${waiting} joueur${waiting > 1 ? "s" : ""} à écrire…` : "On retourne les cartes…")];
  }
  const input = h("input", {
    id: "cx-word", class: "field", type: "text", maxlength: "30", autocomplete: "off", autocapitalize: "off",
    placeholder: "Un mot qui relie", value: ui.draft, oninput: () => { ui.draft = input.value; }
  });
  const send = h("button", { class: "btn btn-brick", type: "submit" }, "Poser");
  const form = h("form", { class: "join" }, input, send);
  const error = h("p", { class: "notice", role: "alert", hidden: !ui.error }, ui.error);
  form.addEventListener("submit", busy(send, async () => {
    const word = input.value.replace(/\s+/g, " ").trim();
    if (!word || !norm(word)) return input.focus();
    // Mot déjà dit : refusé tout de suite, plutôt que de perdre son tour.
    if (s.used?.[norm(word)]) {
      ui.error = `« ${s.used[norm(word)]} » a déjà été dit dans cette manche.`;
      error.textContent = ui.error;
      error.hidden = false;
      return input.focus();
    }
    ui.error = "";
    await ctx.seal({ word });
    ui.draft = "";
  }));
  const need = needed(players.length, s.rules.majority);
  return [title,
    h("p", null, h("b", null, "Écris un mot qui relie ceux du tableau."),
      need === players.length ? " Il faut que tout le monde écrive le même." : ` Il faut que ${need} joueurs écrivent le même.`),
    form, error];
}

// Les mots du tour, regroupés : les mots identiques côte à côte.
function revealPanel(ctx) {
  const { state: s, isHost } = ctx;
  const words = s.rounds?.[`r${s.tour}`] || {};
  const groups = new Map();
  for (const id of s.order) {
    const word = words[id];
    const key = word ? norm(word) : "";
    if (!groups.has(key)) groups.set(key, { word, ids: [] });
    groups.get(key).ids.push(id);
  }
  const sorted = [...groups.values()].sort((a, b) => (!a.word) - (!b.word) || b.ids.length - a.ids.length);
  const last = s.last || {};
  const verdict = last.agreed
    ? h("p", { class: "verdict" }, `Connexion ! En ${s.tour} tour${s.tour > 1 ? "s" : ""} (+${bonus(s.tour)} pour tous)`)
    : last.over ? h("p", { class: "verdict" }, `Pas d'accord en ${s.tour} tours`)
    : h("p", { class: "rule" }, last.best >= 2 ? "Ça se rapproche… Le tour suivant relie les mots qui viennent d'être dits." : "Chacun de son côté ! On relie maintenant les mots qui viennent d'être dits.");
  const refused = Object.entries(last.refused || {});
  return [
    h("h2", null, `Tour ${s.tour} · révélation`),
    verdict,
    h("ul", { class: "cx-groups" }, sorted.map((group) => h("li", { class: `cx-group${group.word ? "" : " is-empty"}${group.ids.length >= 2 && group.word ? " is-match" : ""}` },
      h("strong", null, group.word || "(rien)"),
      h("span", { class: "cx-who" }, group.ids.map((id) => token(person(ctx, id)))),
      group.ids.length >= 2 && group.word && h("small", null, `×${group.ids.length}`)))),
    refused.length > 0 && h("p", { class: "rule" }, "Déjà dit, donc refusé : ", refused.map(([id, word]) => `${nameOf(s, id)} (« ${word} »)`).join(", "), "."),
    h("p", { class: "rule" }, last.over ? (s.manche < s.rules.manches ? "Manche suivante dans " : "Classement dans ") : "Tour suivant dans ", countdown(s.until, ctx.now)),
    isHost && action(last.over ? "Continuer" : "Tour suivant", "play", () => skipWait(ctx))
  ];
}

// La frise de la manche : un tour par ligne.
function timeline({ state: s }) {
  const tours = Object.keys(s.rounds || {}).sort((a, b) => a.slice(1) - b.slice(1));
  if (!tours.length) return null;
  return h("details", { class: "cx-timeline", open: true },
    h("summary", null, "La manche, tour par tour"),
    h("ol", null,
      h("li", { class: "is-start" }, h("b", null, "Départ"), h("span", null, (s.start || []).join(" · "))),
      tours.map((tour) => {
        const words = s.rounds[tour] || {};
        const count = {};
        for (const word of Object.values(words)) if (word) count[norm(word)] = (count[norm(word)] || 0) + 1;
        return h("li", null, h("b", null, `Tour ${tour.slice(1)}`),
          h("span", null, s.order.map((id) => h("em", { class: words[id] && count[norm(words[id])] >= 2 ? "is-match" : words[id] ? "" : "is-empty", title: nameOf(s, id) },
            words[id] || "—"))));
      })));
}

function usedWords({ state: s }) {
  const used = Object.values(s.used || {});
  return h("details", { class: "cx-used" },
    h("summary", null, `Mots déjà dits (${used.length})`),
    h("p", null, used.join(" · ")));
}

function playersBoard(ctx) {
  const { state: s, room, me } = ctx;
  const done = room.done?.[s.g]?.[s.step] || {};
  return h("section", { class: "felt-zone" },
    h("div", { class: "seats" }, s.order.map((id) => h("div", { class: "seat" }, pawn(person(ctx, id), {
      isHost: id === room.meta.hostUid, isMe: id === me,
      done: s.phase === "write" && !!done[id],
      note: `${s.scores?.[id] || 0} pts`
    })))));
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const score = (id) => s.scores?.[id] || 0;
  const won = (s.history || []).filter((m) => m.word).length;
  return [
    h("h2", null, `Classement final · ${s.rules.manches} manche${s.rules.manches > 1 ? "s" : ""}`),
    h("p", { class: "verdict" }, `${won} connexion${won > 1 ? "s" : ""} réussie${won > 1 ? "s" : ""} sur ${(s.history || []).length}`),
    ranking({ ids: s.order, score, person: (id) => person(ctx, id), label: (id) => `${score(id)} pts`, key: `${s.g}/final`, big: true }),
    h("h2", null, "Résumé des manches"),
    h("ol", { class: "cx-recap" }, (s.history || []).map((m) => h("li", { class: m.word ? "is-won" : "is-lost" },
      h("span", { class: "eyebrow" }, `Manche ${m.no}`),
      h("span", null, h("b", null, m.start?.[0]), " + ", h("b", null, m.start?.[1])),
      h("strong", null, m.word ? `Trouvé : ${m.word}` : "Pas d'accord"),
      h("small", null, `${m.tours} tour${m.tours > 1 ? "s" : ""}`)))),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

export function view(ctx) {
  const { state: s } = ctx;
  const cue = `${s.g}/${s.manche}/${s.tour}/${s.phase}`;
  if (ui.cue !== cue) {
    if (s.phase === "reveal") play(s.last?.agreed ? "win" : "reveal");
    if (s.phase === "end") play("win");
    if (s.phase === "write") ui.error = "";
    ui.cue = cue;
  }
  // Pendant l'écriture, la discussion se tait : on ne souffle pas son mot aux autres.
  const talk = chatBox(ctx, {
    channels: [tableChannel(ctx, s.phase !== "write")],
    note: "Pendant qu'on écrit, la discussion se tait : elle reprend à la révélation."
  });
  if (s.phase === "end") {
    return [
      h("header", { class: "cx-head" }, h("p", { class: "eyebrow" }, "Connexion"), h("h1", null, "Fin de la partie")),
      h("section", { class: "sheet finale" }, endPanel(ctx)),
      h("div", { class: "finale" }, talk)
    ];
  }
  return [
    h("div", { class: "col" },
      h("header", { class: "cx-head" },
        h("p", { class: "eyebrow" }, `Connexion · manche ${s.manche} sur ${s.rules.manches}`),
        h("h1", null, s.phase === "write" ? "Relie les mots" : "Révélation", " ", s.phase === "write" && countdown(s.until, ctx.now))),
      linkBoard(ctx),
      h("section", { class: "sheet" }, s.phase === "write" ? writePanel(ctx) : revealPanel(ctx))),
    h("div", { class: "col" },
      playersBoard(ctx),
      timeline(ctx),
      usedWords(ctx),
      talk)
  ];
}
