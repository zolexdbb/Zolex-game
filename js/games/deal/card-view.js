// Capy Deal : le dessin des cartes (styles dans css/themes/deal.css). Tout est mesuré en
// fractions de --w, la largeur de la carte : une même carte sert en main et en grand.
import { h } from "../../ui/dom.js";
import { GROUPS, RULES, MOODS } from "./cards.js";
import { capy, man } from "./capy.js";

// Un texte de carte : {m} devient une mandarine, le reste reste du texte.
export const rich = (text) => String(text).split("{m}").flatMap((part, i) => (i ? [man(), part] : [part]));

const price = (value) => h("span", { class: "d-val" }, String(value), man());
const band = (group, name, small) => h("div", {
  class: `d-band${small ? " is-small" : ""}`, style: `--band: ${GROUPS[group].color}; --band-ink: ${GROUPS[group].ink}`
}, name);
const rents = (group) => h("ol", { class: "d-rents" }, GROUPS[group].rents.map((rent, i, all) =>
  h("li", { class: i === all.length - 1 ? "is-full" : null },
    h("span", null, `${i + 1} carte${i ? "s" : ""}${i === all.length - 1 ? " ★" : ""}`), h("span", null, String(rent), man()))));
const plaque = (text) => h("div", { class: "d-plaque" }, h("span", null, rich(text)));
// Le disque des couleurs d'un loyer : deux moitiés, ou les dix couleurs pour un joker.
const disc = (groups, mark) => {
  const colors = (groups || Object.keys(GROUPS)).map((g) => GROUPS[g].color);
  const step = 100 / colors.length;
  const fill = `conic-gradient(${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
  return h("div", { class: "d-disc", style: `background: ${fill}` }, mark);
};

const faces = {
  money: (c) => [
    h("div", { class: "d-title" }, "Capy Deal"),
    h("div", { class: "d-big" }, String(c.value), man()),
    h("div", { class: "d-note" }, "À poser dans ta réserve")
  ],
  property: (c) => [
    band(c.group, c.name),
    h("div", { class: "d-note" }, "Loyer selon le nombre posé"),
    rents(c.group)
  ],
  wild: (c) => (c.groups
    ? [h("div", { class: "d-half" }, band(c.groups[0], GROUPS[c.groups[0]].name, true), rents(c.groups[0])),
      h("div", { class: "d-split" }, "Joker"),
      h("div", { class: "d-half is-flipped" }, band(c.groups[1], GROUPS[c.groups[1]].name, true), rents(c.groups[1]))]
    : [h("div", { class: "d-title" }, "Joker"), disc(null), h("div", { class: "d-note" }, "Se pose dans n'importe quel groupe. Prend le loyer de ce groupe.")]),
  action: (c) => [h("div", { class: "d-title" }, c.name), h("div", { class: "d-art" }, capy(c.mood)), plaque(c.text)],
  rent: (c) => [
    h("div", { class: "d-title" }, c.name),
    h("div", { class: "d-art is-disc" }, disc(c.rent === "all" ? null : c.rent, c.double ? "×2" : null)),
    plaque(c.text)
  ]
};

// La carte : cadre crème, cartouche coloré cousu, valeur en haut à gauche.
// count : affiche le nombre d'exemplaires en haut à droite (galerie).
export function dealCard(card, { count, cls = "" } = {}) {
  const style = card.kind === "rent" ? (card.double ? "dark" : "cream") : card.kind === "action" ? "blue" : card.kind;
  return h("div", {
    class: `dcard d-${style} ${cls}`, style: card.kind === "money" ? `--suit: ${card.color}` : null,
    role: "img", "aria-label": card.name || (card.kind === "money" ? `${card.value} mandarines` : "Joker propriété")
  },
  h("div", { class: "d-face" }, faces[card.kind](card)),
  price(card.value),
  count && h("span", { class: "d-count" }, `×${card.count}`));
}

// Le dos des cartes.
export const cardBack = (cls = "") => h("div", { class: `dcard d-back ${cls}`, role: "img", "aria-label": "Dos de carte" },
  h("div", { class: "d-face" }, h("div", { class: "d-art" }, capy(MOODS.back)), h("div", { class: "d-title" }, "Capy Deal"),
    h("div", { class: "d-note" }, "sans pitié ", man())));

// Le jeton Dette : pas une carte, un disque devant le joueur.
export const debtToken = () => h("div", { class: "d-token", role: "img", "aria-label": "Jeton Dette" }, capy(MOODS.debt), h("span", null, "Dette"));

// L'aide-mémoire : une carte simple, ouverte en grand.
export const rulesCard = () => h("div", { class: "d-rules" },
  h("div", { class: "d-rules-in" },
    h("div", { class: "d-rules-head" }, capy(MOODS.rules),
      h("div", null, h("div", { class: "d-rules-title" }, "Aide-mémoire"), h("div", { class: "d-rules-sub" }, "Ce que les cartes ne disent pas"))),
    h("ol", null, RULES.map(([title, text]) => h("li", null, h("b", null, title), h("span", null, rich(text)))))));
