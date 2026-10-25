// Galerie de Capytalisme, mode Capy Deal (galerie.html) : toutes les cartes, chaque type une fois avec son nombre
// d'exemplaires, pour les vérifier. Signale les plaques dont le texte déborde.
import { h } from "../../ui/dom.js";
import { cardTypes, buildDeck } from "./cards.js";
import { dealCard, cardBack, debtToken, rulesCard } from "./card-view.js";

const types = cardTypes();
const deck = buildDeck();
const ui = { mini: false };

const SECTIONS = [
  ["Argent", (t) => t.kind === "money"],
  ["Propriétés", (t) => t.kind === "property"],
  ["Jokers propriété", (t) => t.kind === "wild"],
  ["Actions", (t) => t.kind === "action"],
  ["Loyers", (t) => t.kind === "rent"]
];
const tally = (kind) => deck.filter((c) => c.kind === kind).length;

// Plaques trop pleines : entourées en rouge, et comptées dans la barre.
function check(root) {
  // Seules les plaques affichées comptent : en taille de main, elles sont masquées.
  const plaques = [...root.querySelectorAll(".d-plaque")].filter((p) => p.offsetParent);
  const over = plaques.filter((p) => p.firstChild.offsetHeight > p.clientHeight - 2);
  for (const p of plaques) p.classList.toggle("is-over", over.includes(p));
  const out = root.querySelector(".gal-check");
  out.textContent = !plaques.length ? "Textes vérifiés en taille réelle" : over.length ? `${over.length} texte(s) débordent : cartes entourées en rouge` : `Les ${plaques.length} plaques : aucun texte ne déborde`;
  out.classList.toggle("is-bad", over.length > 0);
}

// Un exemple de main de 9 cartes en éventail, à la taille réelle.
function fan() {
  const sample = [0, 20, 30, 50, 60, 70, 85, 95, 110].map((i) => deck[i]);
  return h("div", { class: "gal-fan" }, sample.map((card, k) => {
    const angle = (k - 4) * 4;
    const node = dealCard(card, { cls: "is-mini" });
    node.style.setProperty("--fan", `${angle}deg`);
    node.style.setProperty("--lift", `${Math.abs(angle) * .6}px`);
    return node;
  }));
}

function render() {
  const app = document.getElementById("app");
  const mini = ui.mini ? " is-mini" : "";
  const toggle = h("button", { class: "btn btn-cream btn-mini", type: "button", onclick: () => { ui.mini = !ui.mini; render(); } },
    ui.mini ? "Taille réelle en grand" : "Taille en main");
  const root = h("main", { class: "mat theme-deal" },
    h("header", { class: "table-head" }, h("h1", { class: "felt-title" }, "Capytalisme · Capy Deal : toutes les cartes")),
    h("div", { class: "gal-bar" },
      h("span", null, `${deck.length} cartes : argent ${tally("money")} · propriétés ${tally("property")} · jokers ${tally("wild")} · actions ${tally("action") + tally("rent")}`),
      h("span", { class: "gal-check" }, "…"), toggle),
    ui.mini && h("section", { class: "sheet" }, h("h2", null, "Une main de 9 cartes"), fan()),
    SECTIONS.map(([title, keep]) => h("section", { class: "sheet" },
      h("h2", null, title),
      h("div", { class: `gal-grid${mini}` }, types.filter(keep).map((t) => dealCard(t, { count: true, cls: mini.trim() }))))),
    h("section", { class: "sheet" },
      h("h2", null, "Hors paquet"),
      h("div", { class: "gal-extra" }, h("div", { class: `gal-grid${mini}` }, cardBack(mini.trim())), debtToken(), rulesCard())));
  app.replaceChildren(root);
  document.fonts.ready.then(() => check(root));
}

render();
