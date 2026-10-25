import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown } from "../../ui/widgets.js";
import { chatBox, tableChannel } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { CARDS } from "./cards.js";
import { TEAMS, cardPath, pickCard, skipWait, forbiddenIn, guessMatches, feedKey } from "./logic.js";

// État d'affichage propre à cet appareil : la carte déjà tirée par l'orateur.
const ui = { drawnFor: null, cue: null, judged: new Set(), foundFor: null, clue: "", guess: "", error: "" };
const RESULTS = { found: "Trouvé", taboo: "Tabou !", pass: "Passé" };

const nameOf = (s, id) => s.names[id]?.name || "?";
const person = ({ state: s, room, me }, id) =>
  ({ name: nameOf(s, id), index: s.names[id]?.pawn ?? 0, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar, isMe: id === me });

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

// La carte du moment. L'orateur la tire et la range à part : seuls lui et l'équipe adverse peuvent la lire.
function currentCard(ctx) {
  const { state: s, me } = ctx;
  const path = cardPath(ctx);
  const stored = ctx.watch(path, `${s.speaker}/${s.turn}`);
  if (stored && Number.isInteger(stored.i)) return { i: stored.i, ...CARDS[stored.i] };
  if (me === s.speaker && ui.drawnFor !== path) {
    ui.drawnFor = path;
    ctx.write(path, { i: pickCard(s.used || []) }).catch(() => { ui.drawnFor = null; });
  }
  return null;
}

function cardNode(card) {
  return h("div", { class: "tb-card" },
    h("strong", null, card.word),
    h("ul", null, card.banned.map((word) => h("li", null, word))));
}

// ---- Par écrit ----

// Le fil de la carte en cours : indices de l'orateur et propositions de son équipe, dans l'ordre.
function feed(ctx) {
  const { state: s, room } = ctx;
  const key = feedKey(s);
  const lines = [
    ...Object.entries(room.tclue?.[s.g]?.[key] || {}).map(([id, m]) => ({ id, ...m, clue: true })),
    ...Object.entries(room.tguess?.[s.g]?.[key] || {}).map(([id, m]) => ({ id, ...m }))
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!lines.length) return h("p", { class: "rule" }, "Les indices et les réponses s'afficheront ici.");
  const list = h("ul", { class: "tb-feed", "aria-live": "polite" }, lines.map((line) => h("li", { class: line.clue ? "is-clue" : "is-guess" },
    h("b", null, line.clue ? "Indice" : nameOf(s, line.uid)), " : ", line.text)));
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  return list;
}

// Petit formulaire d'une ligne, qui garde sa saisie quand l'écran est redessiné.
function lineForm({ id, draft, placeholder, max, label, onSend }) {
  const error = h("p", { class: "notice", role: "alert", hidden: !ui.error }, ui.error);
  const input = h("input", {
    id, class: "field", type: "text", maxlength: String(max), autocomplete: "off", autocapitalize: "off",
    placeholder, value: ui[draft], oninput: () => { ui[draft] = input.value; }
  });
  const send = h("button", { class: "btn btn-brick", type: "submit" }, label);
  const form = h("form", { class: "join" }, input, send);
  form.addEventListener("submit", busy(send, async () => {
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text) return input.focus();
    const problem = await onSend(text);
    ui.error = problem || "";
    error.textContent = ui.error;
    error.hidden = !ui.error;
    if (!problem) { ui[draft] = ""; input.value = ""; }
    input.focus();
  }));
  return [form, error];
}

// L'appareil de l'orateur (le seul de son équipe à voir la carte) reconnaît la bonne réponse.
function judgeGuesses(ctx, card) {
  const { state: s, room } = ctx;
  const key = `${s.g}/${feedKey(s)}`;
  if (!card || ui.foundFor === key) return;
  for (const [id, g] of Object.entries(room.tguess?.[s.g]?.[feedKey(s)] || {})) {
    if (ui.judged.has(`${key}/${id}`)) continue;
    ui.judged.add(`${key}/${id}`);
    if (guessMatches(g.text, card.word, s.rules.tolerance)) {
      ui.foundFor = key;
      ctx.act({ result: "found", n: s.card, i: card.i, word: card.word }).catch(() => { ui.foundFor = null; });
      return;
    }
  }
}

function writtenPanel(ctx, role, card, send, tally) {
  const { state: s, me, myAction } = ctx;
  const stamp = () => `${Date.now().toString(36)}${me.slice(0, 4)}`;
  if (role === "speaker") {
    judgeGuesses(ctx, card);
    return [h("h2", null, "Fais deviner, par écrit !"),
      card ? cardNode(card) : h("p", { class: "rule" }, "On tire une carte…"),
      card && lineForm({
        id: "tb-clue", draft: "clue", placeholder: "Ton indice", max: 80, label: "Envoyer",
        onSend: async (text) => {
          const hit = forbiddenIn(text, card, s.rules.tolerance);
          if (hit) return `Mot interdit : « ${hit} ». Reformule !`;
          return (await ctx.tryWrite(`tclue/${s.g}/${feedKey(s)}/${stamp()}`, { uid: me, text })) ? null : "Indice non envoyé, réessaie.";
        }
      }),
      feed(ctx),
      h("div", { class: "tb-actions" }, !myAction && action("Passer cette carte", "skip", send("pass"))),
      tally];
  }
  if (role === "mate") {
    return [h("h2", null, "Devine !"),
      h("p", { class: "rule" }, `Lis les indices de ${nameOf(s, s.speaker)} et tape tes réponses : la bonne est reconnue toute seule.`),
      feed(ctx),
      lineForm({
        id: "tb-guess", draft: "guess", placeholder: "Ta réponse", max: 40, label: "Proposer",
        onSend: async (text) => ((await ctx.tryWrite(`tguess/${s.g}/${feedKey(s)}/${stamp()}`, { uid: me, text })) ? null : "Réponse non envoyée, réessaie.")
      }),
      tally];
  }
  if (role === "watch") {
    return [h("h2", null, `${nameOf(s, s.speaker)} écrit ses indices`),
      card ? cardNode(card) : h("p", { class: "rule" }, "L'orateur tire une carte…"),
      h("p", { class: "rule" }, "Le site refuse lui-même les indices interdits : regarde-les chercher !"),
      feed(ctx), tally];
  }
  return [h("h2", null, `Les ${TEAMS[s.turn]} jouent`), feed(ctx), tally];
}

function playPanel(ctx) {
  const { state: s, me, myAction } = ctx;
  const role = me === s.speaker ? "speaker" : s.team?.[me] === s.turn ? "mate" : s.team?.[me] ? "watch" : "guest";
  const card = role === "speaker" || role === "watch" ? currentCard(ctx) : null;
  const send = (result) => () => ctx.act({ result, n: s.card, i: card?.i ?? -1, word: card?.word || "" });
  const count = (result) => (s.log || []).filter((l) => l.result === result).length;
  const tally = h("p", { class: "tb-tally" },
    h("span", { class: "is-found" }, `${count("found")} trouvé${count("found") > 1 ? "s" : ""}`),
    h("span", { class: "is-taboo" }, `${count("taboo")} tabou`),
    h("span", null, `${count("pass")} passé${count("pass") > 1 ? "s" : ""}`));
  if (s.rules.mode === "written") return writtenPanel(ctx, role, card, send, tally);
  if (role === "speaker") {
    return [h("h2", null, "Fais deviner à ton équipe !"),
      card ? cardNode(card) : h("p", { class: "rule" }, "On tire une carte…"),
      h("div", { class: "tb-actions" },
        action("Trouvé !", "check", send("found"), "btn-ink"),
        action("Passer", "skip", send("pass"))),
      tally];
  }
  if (role === "watch") {
    return [h("h2", null, `Surveille ${nameOf(s, s.speaker)} !`),
      card ? cardNode(card) : h("p", { class: "rule" }, "L'orateur tire une carte…"),
      h("p", { class: "rule" }, "S'il dit un mot interdit (ou le mot lui-même), crie « Tabou ! »."),
      !myAction && card && action("Tabou !", "cross", send("taboo"), "btn-brick btn-big"),
      tally];
  }
  if (role === "mate") {
    return [h("h2", null, "Devine !"),
      h("p", { class: "tb-big" }, h("b", null, nameOf(s, s.speaker)), " te fait deviner des mots. Réponds à voix haute !"),
      tally];
  }
  return [h("h2", null, `Les ${TEAMS[s.turn]} jouent`), tally];
}

function readyPanel(ctx) {
  const { state: s, me, myAction } = ctx;
  if (me === s.speaker) {
    return [h("h2", null, `À toi de parler pour les ${TEAMS[s.turn]}`),
      h("p", null, `Tu as ${s.rules.time} secondes pour faire deviner le plus de mots possible. `,
        s.rules.mode === "written" ? "Tape tes indices : ceux qui contiennent un mot interdit sont refusés." : "Ne dis jamais les mots interdits !"),
      !myAction && action("C'est parti !", "play", () => ctx.act({ go: true }), "btn-brick btn-big")];
  }
  return [h("h2", null, `${nameOf(s, s.speaker)} va parler pour les ${TEAMS[s.turn]}`),
    h("p", { class: "rule" }, s.team?.[me] === s.turn ? "Prépare-toi à deviner !"
      : s.rules.mode === "written" ? "Tu verras la carte et les indices de l'autre équipe." : "Prépare-toi à surveiller les mots interdits.")];
}

function logList(log) {
  if (!log?.length) return h("p", { class: "rule" }, "Aucune carte jouée.");
  return h("ul", { class: "tb-log" }, log.map((l) => h("li", { class: `is-${l.result}` }, h("span", null, l.word || "?"), h("b", null, RESULTS[l.result]))));
}

function recapPanel(ctx) {
  const { state: s, isHost } = ctx;
  const last = s.history?.at(-1);
  const points = (last?.log || []).reduce((sum, l) => sum + ({ found: 1, taboo: -1 }[l.result] || 0), 0);
  return [h("h2", null, `Fin du tour de ${nameOf(s, last?.speaker)}`),
    h("p", { class: "verdict" }, `${points >= 0 ? "+" : ""}${points} pour les ${TEAMS[last?.team || s.turn]}`),
    logList(last?.log),
    h("p", { class: "rule" }, "Tour suivant dans ", countdown(s.until, ctx.now)),
    isHost && action("Continuer", "play", () => skipWait(ctx))];
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const winner = s.scores.r === s.scores.b ? null : s.scores.r > s.scores.b ? "r" : "b";
  return [
    h("p", { class: `tb-winner${winner ? ` team-${winner}` : ""}` }, winner ? `Victoire des ${TEAMS[winner]}` : "Égalité !"),
    h("p", { class: "verdict" }, `Rouges ${s.scores.r} · Bleus ${s.scores.b}`),
    h("h2", null, "Les tours"),
    h("ol", { class: "tb-history" }, (s.history || []).map((turn) => h("li", { class: `team-${turn.team}` },
      h("span", { class: "eyebrow" }, `${TEAMS[turn.team]} · ${nameOf(s, turn.speaker)}`),
      logList(turn.log)))),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

function teamsBoard(ctx) {
  const { state: s, room, me } = ctx;
  return h("section", { class: "tb-teams" }, ["r", "b"].map((team) => h("div", { class: `tb-team team-${team}${s.turn === team && s.phase !== "end" ? " is-turn" : ""}` },
    h("h3", null, TEAMS[team], h("b", null, `${s.scores?.[team] || 0} pts`)),
    h("div", { class: "tb-members" }, s.teams[team].map((id) => h("div", { class: "seat" }, pawn(person(ctx, id), {
      isHost: id === room.meta.hostUid, isMe: id === me, turn: s.phase !== "end" && id === s.speaker
    })))))));
}

export function view(ctx) {
  const { state: s } = ctx;
  const cue = `${s.g}/${s.turnNo}/${s.phase}/${s.card}`;
  if (ui.cue !== cue) {
    const last = s.log?.at(-1)?.result;
    if (s.phase === "play" && last) play(last === "taboo" ? "malus" : last === "found" ? "found" : "card");
    if (s.phase === "recap" || s.phase === "end") play("win");
    ui.cue = cue;
  }
  const panel = { ready: readyPanel, play: playPanel, recap: recapPanel, end: endPanel }[s.phase];
  // Pendant un tour, on ne tape pas les réponses : tout se dit à voix haute.
  const talk = chatBox(ctx, { channels: [tableChannel(ctx, s.phase !== "play")], note: s.rules.mode === "written" ? "Pendant un tour, la discussion se tait : on ne souffle pas. Elle reprend après." : "Pendant un tour, tout se dit à voix haute : la discussion reprend après." });
  return [
    h("div", { class: "col" },
      h("header", { class: "tb-head" },
        h("p", { class: "eyebrow" }, `Taboo · Rouges ${s.scores.r} – Bleus ${s.scores.b}`),
        h("h1", { class: `team-${s.phase === "end" ? "" : s.turn}` },
          s.phase === "end" ? "Fin de la partie" : `Tour des ${TEAMS[s.turn]}`, " ", s.phase === "play" && countdown(s.until, ctx.now))),
      h("section", { class: "sheet" }, panel?.(ctx))),
    h("div", { class: "col" }, teamsBoard(ctx), talk)
  ];
}

