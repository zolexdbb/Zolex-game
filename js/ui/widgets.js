import { h } from "./dom.js";
import { icon } from "./icons.js";

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
