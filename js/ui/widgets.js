import { h } from "./dom.js";
import { icon } from "./icons.js";
import { avatarNode } from "./avatar.js";
import { tick } from "./sound.js";

const PAWN_COLORS = 8;

// Compteur à deux boutons, façon roue de score.
export function stepper({ label, value, min, max, disabled, onChange, by = 1 }) {
  const step = (delta, name, text) =>
    h("button", {
      class: "btn btn-round", type: "button", "aria-label": `${text} : ${label}`,
      disabled: disabled || value + delta < min || value + delta > max,
      onclick: () => onChange(value + delta)
    }, icon(name));
  return h("div", { class: "stepper" },
    h("span", { class: "stepper-label" }, label),
    step(-by, "minus", "Moins"),
    h("output", { class: "stepper-value" }, String(value)),
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
