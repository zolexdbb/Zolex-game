import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, countdown, ranking } from "../../ui/widgets.js";
import { chatBox, tableChannel } from "../../ui/chat.js";
import { play } from "../../ui/sound.js";
import { CATEGORY_NAMES, MAX_ANSWER, startsWith, skipWait } from "./logic.js";

// État d'affichage propre à cet appareil : réponses en cours, contestations cochées.
const ui = { key: null, draft: {}, votes: new Set(), auto: null, autoFor: null, cue: null };

const nameOf = (s, id) => s.names[id]?.name || "?";
const person = ({ state: s, room, me }, id) =>
  ({ name: nameOf(s, id), index: s.names[id]?.pawn ?? 0, online: !!room.players?.[id]?.online, avatar: room.players?.[id]?.avatar, isMe: id === me });

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

const filled = (s) => s.cats.every((cat) => startsWith(ui.draft[cat] || "", s.letter));

function fillPanel(ctx) {
  const { state: s, me, mySealed, myAction, room } = ctx;
  const done = room.done?.[s.g]?.[s.step] || {};
  const waiting = s.order.filter((id) => room.players?.[id] && !done[id]).length;
  const stop = s.stopBy && h("p", { class: "bac-stop" }, h("b", null, nameOf(s, s.stopBy)), " a crié « Stop ! » : dépêche-toi !");
  if (!s.order.includes(me)) return [h("h2", null, "Les autres remplissent"), stop, h("p", { class: "rule" }, "Tu joueras la prochaine partie.")];
  if (mySealed) {
    return [h("h2", null, "Réponses envoyées"), stop,
      h("ul", { class: "bac-mine" }, s.cats.map((cat) => h("li", null, h("span", null, CATEGORY_NAMES[cat]), h("b", null, mySealed.answers?.[cat] || "—")))),
      h("p", { class: "rule" }, waiting ? `Encore ${waiting} joueur${waiting > 1 ? "s" : ""} à remplir…` : "On dépouille…")];
  }
  const fields = s.cats.map((cat) => {
    const input = h("input", {
      id: `bac-${cat}`, class: "field", type: "text", maxlength: String(MAX_ANSWER), autocomplete: "off", autocapitalize: "words",
      placeholder: `${s.letter}…`, value: ui.draft[cat] || "",
      oninput: () => {
        ui.draft[cat] = input.value;
        row.classList.toggle("is-off", !!input.value.trim() && !startsWith(input.value, s.letter));
        stopBtn.disabled = !!s.stopBy || !!myAction || !filled(s);
      }
    });
    const row = h("label", { class: `bac-row${ui.draft[cat]?.trim() && !startsWith(ui.draft[cat], s.letter) ? " is-off" : ""}`, for: `bac-${cat}` },
      h("span", null, CATEGORY_NAMES[cat]), input);
    return row;
  });
  const submit = () => ctx.seal({ answers: Object.fromEntries(s.cats.map((cat) => [cat, (ui.draft[cat] || "").trim().slice(0, MAX_ANSWER)])) });
  const sendBtn = action("Envoyer mes réponses", "check", submit, "btn-ink");
  // « Stop ! » : seulement quand toutes les cases sont remplies avec la bonne lettre.
  const stopBtn = action("Stop !", "skip", async () => { await ctx.act({ stop: true }).catch(() => {}); await submit(); }, "btn-brick");
  stopBtn.disabled = !!s.stopBy || !!myAction || !filled(s);
  return [h("h2", null, `Tout avec un ${s.letter}`), stop,
    h("div", { class: "bac-form" }, fields),
    h("div", { class: "bac-actions" }, stopBtn, sendBtn),
    h("p", { class: "rule" }, "À la fin du chrono, ce que tu as écrit part tout seul.")];
}

// Toutes les réponses, catégorie par catégorie, à contester si besoin.
function reviewPanel(ctx) {
  const { state: s, me, myAction, actions, room } = ctx;
  const mine = s.order.includes(me);
  const answers = s.answers || {};
  const blocks = s.cats.map((cat) => h("section", { class: "bac-cat" },
    h("h3", null, CATEGORY_NAMES[cat]),
    h("ul", null, s.order.filter((id) => answers[id]).map((id) => {
      const text = answers[id][cat];
      const off = !text || !startsWith(text, s.letter);
      const key = `${id}|${cat}`;
      const contest = mine && !myAction && id !== me && !off && h("button", {
        class: "btn btn-mini", type: "button", "aria-pressed": String(ui.votes.has(key)),
        onclick: () => { ui.votes.has(key) ? ui.votes.delete(key) : ui.votes.add(key); ctx.refresh(); }
      }, ui.votes.has(key) ? "Contestée" : "Contester");
      return h("li", { class: `${off ? "is-off" : ""}${ui.votes.has(key) ? " is-contested" : ""}` },
        h("span", { class: "who" }, nameOf(s, id)), h("b", null, text || "—"), off && text && h("small", null, "pas la bonne lettre"), contest);
    }))));
  const voted = s.order.filter((id) => room.players?.[id] && (id === me ? myAction : actions?.[id])).length;
  return [h("h2", null, `Le dépouillement · lettre ${s.letter}`),
    h("p", { class: "rule" }, "Conteste les réponses qui ne te semblent pas valables. Une réponse est refusée si la majorité la conteste."),
    h("div", { class: "bac-review" }, blocks),
    mine && (myAction
      ? h("p", { class: "rule" }, "Tes votes sont envoyés. Décompte dès que tout le monde a voté, ou à la fin du chrono.")
      : action(ui.votes.size ? `Valider (${ui.votes.size} contestation${ui.votes.size > 1 ? "s" : ""})` : "Tout me va", "check",
        () => ctx.act({ refuse: [...ui.votes] }), "btn-brick")),
    h("p", { class: "rule" }, `${voted} vote${voted > 1 ? "s" : ""} reçu${voted > 1 ? "s" : ""} · décompte dans `, countdown(s.until, ctx.now))];
}

function recapPanel(ctx) {
  const { state: s, isHost } = ctx;
  const answers = s.answers || {}, points = s.points || {}, refused = s.refused || {};
  const total = (id) => Object.values(points[id] || {}).reduce((a, b) => a + b, 0);
  return [h("h2", null, `Manche ${s.manche} · les points`),
    h("div", { class: "bac-review" }, s.cats.map((cat) => h("section", { class: "bac-cat" },
      h("h3", null, CATEGORY_NAMES[cat]),
      h("ul", null, s.order.filter((id) => answers[id]).map((id) => h("li", { class: refused[`${id}|${cat}`] ? "is-refused" : "" },
        h("span", { class: "who" }, nameOf(s, id)), h("b", null, answers[id][cat] || "—"),
        h("em", { class: `pts pts-${points[id]?.[cat] || 0}` }, `+${points[id]?.[cat] || 0}`))))))),
    h("ol", { class: "roles-list" }, [...s.order].sort((a, b) => total(b) - total(a)).map((id) =>
      h("li", null, h("span", null, nameOf(s, id)), h("b", null, `+${total(id)} · ${s.scores?.[id] || 0} pts`)))),
    h("p", { class: "rule" }, s.manche >= s.rules.manches ? "Classement final dans " : "Lettre suivante dans ", countdown(s.until, ctx.now)),
    isHost && action("Continuer", "play", () => skipWait(ctx))];
}

function endPanel(ctx) {
  const { state: s, isHost } = ctx;
  const score = (id) => s.scores?.[id] || 0;
  return [
    h("h2", null, `Classement final · ${s.rules.manches} lettre${s.rules.manches > 1 ? "s" : ""} (${[...s.letters].join(", ")})`),
    ranking({ ids: s.order, score, person: (id) => person(ctx, id), label: (id) => `${score(id)} pts`, key: `${s.g}/final`, big: true }),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

function playersBoard(ctx) {
  const { state: s, room, me } = ctx;
  const done = room.done?.[s.g]?.[s.step] || {};
  return h("section", { class: "felt-zone" },
    h("div", { class: "seats" }, s.order.map((id) => h("div", { class: "seat" }, pawn(person(ctx, id), {
      isHost: id === room.meta.hostUid, isMe: id === me, done: s.phase === "fill" && !!done[id], note: `${s.scores?.[id] || 0} pts`
    })))));
}

// À l'échéance, les réponses en cours partent d'elles-mêmes.
function autoSend(ctx) {
  const { state: s, mySealed, me } = ctx;
  const key = `${s.g}/${s.step}/${s.until}`;
  if (s.phase !== "fill" || mySealed || !s.order.includes(me) || ui.autoFor === key) return;
  ui.autoFor = key;
  clearTimeout(ui.auto);
  const stepKey = `${s.g}/${s.step}`;
  ui.auto = setTimeout(() => {
    // Toujours au même tour de remplissage, et rien d'envoyé depuis ?
    if (ui.stepNow !== stepKey || ui.sealedFor === stepKey) return;
    ctx.seal({ answers: Object.fromEntries(s.cats.map((cat) => [cat, (ui.draft[cat] || "").trim().slice(0, MAX_ANSWER)])) }).catch(() => {});
  }, Math.max(0, s.until - ctx.now() - 800));
}

export function view(ctx) {
  const { state: s } = ctx;
  const key = `${s.g}/${s.manche}`;
  if (ui.key !== key) Object.assign(ui, { key, draft: {}, votes: new Set() });
  const cue = `${key}/${s.phase}`;
  if (ui.cue !== cue) {
    if (s.phase === "fill") play("shuffle");
    if (s.phase === "review") play("reveal");
    if (s.phase === "end") play("win");
    ui.cue = cue;
  }
  ui.stepNow = `${s.g}/${s.step}`;
  if (ctx.mySealed) ui.sealedFor = ui.stepNow;
  autoSend(ctx);
  const talk = chatBox(ctx, {
    channels: [tableChannel(ctx, s.phase !== "fill")],
    note: "Pendant qu'on remplit, la discussion se tait : elle reprend au dépouillement."
  });
  if (s.phase === "end") {
    return [
      h("header", { class: "bac-head" }, h("p", { class: "eyebrow" }, "Petit Bac"), h("h1", null, "Fin de la partie")),
      h("section", { class: "sheet finale" }, endPanel(ctx)),
      h("div", { class: "finale" }, talk)
    ];
  }
  const panel = { fill: fillPanel, review: reviewPanel, recap: recapPanel }[s.phase];
  return [
    h("div", { class: "col" },
      h("header", { class: "bac-head" },
        h("p", { class: "eyebrow" }, `Petit Bac · manche ${s.manche} sur ${s.rules.manches}`),
        h("div", { class: "bac-letter", "aria-label": `Lettre ${s.letter}` }, s.letter),
        s.phase === "fill" && countdown(s.until, ctx.now)),
      h("section", { class: "sheet" }, panel?.(ctx))),
    h("div", { class: "col" }, playersBoard(ctx), talk)
  ];
}
