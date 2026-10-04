import { h } from "./dom.js";
import { icon } from "./icons.js";

const PAWN_COLORS = 8;

// Compteur à deux boutons, façon roue de score.
export function stepper({ label, value, min, max, disabled, onChange }) {
  const step = (delta, name, text) =>
    h("button", {
      class: "btn btn-round", type: "button", "aria-label": `${text} : ${label}`,
      disabled: disabled || value + delta < min || value + delta > max,
      onclick: () => onChange(value + delta)
    }, icon(name));
  return h("div", { class: "stepper" },
    h("span", { class: "stepper-label" }, label),
    step(-1, "minus", "Moins"),
    h("output", { class: "stepper-value" }, String(value)),
    step(1, "plus", "Plus")
  );
}

// Pion d'un joueur. `player` : { name, index, online }.
export function pawn(player, { isHost, isMe, out, turn, done, note } = {}) {
  const cls = ["pawn", `pawn-${player.index % PAWN_COLORS}`,
    !player.online && "is-away", out && "is-out", turn && "is-turn"].filter(Boolean).join(" ");
  return h("div", { class: cls },
    h("div", { class: "pawn-disc" },
      isHost && h("span", { class: "pawn-crown", title: "Hôte de la table" }, icon("crown")),
      done && h("span", { class: "pawn-done", title: "A joué" }, icon("check")),
      h("span", { "aria-hidden": "true" }, player.name.charAt(0).toUpperCase())
    ),
    h("span", { class: "pawn-name" }, player.name, isMe && h("em", null, " (toi)")),
    note ? h("span", { class: "pawn-away" }, note) : !player.online && h("span", { class: "pawn-away" }, "absent")
  );
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
