import { h, loadStyle } from "../../ui/dom.js";
import { start, hostTick, GOAL } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/deal.css");

// Les modes de Capytalisme : le jeu de cartes, et le plateau à venir.
const MODES = [
  { id: "deal", name: "Capy Deal", ready: true },
  { id: "plateau", name: "Plateau", ready: false }
];

function lobbyView({ settings, isHost, setSettings }) {
  const mode = settings.mode || "deal";
  return h("div", { class: "game-settings" },
    h("p", { class: "rule" }, "Le Monopoly version capybara, où l'on paie en mandarines. Choisis ta façon de jouer :"),
    h("div", { class: "filters", role: "group", "aria-label": "Mode de jeu" },
      MODES.map((m) => h("button", {
        class: "filter-chip", type: "button", "aria-pressed": String(m.id === mode), disabled: !isHost || !m.ready,
        onclick: () => setSettings({ ...settings, mode: m.id })
      }, m.name, !m.ready && " · bientôt"))),
    // Chaque mode a sa règle en bref.
    mode === "deal"
      ? [h("p", { class: "rule" },
        `Capy Deal, le jeu de cartes sans pitié. À ton tour, pioche 2 cartes et joue-en jusqu'à 3 : `
        + `des mandarines dans ta réserve, des propriétés devant toi, ou des actions pour voler, faire payer et ruiner les autres. `
        + `Le premier à poser ${GOAL} groupes complets de couleurs différentes gagne.`),
      h("p", { class: "rule" }, "Qui ne peut pas payer donne un jeton Dette, et rembourse d'une carte de sa main à son tour suivant. "
        + "Le bouton « Règles » rappelle tout pendant la partie.")]
      : h("p", { class: "rule" }, "Le plateau : on lance les dés, on achète des rues et on bâtit autour du plateau. Ce mode arrive bientôt."));
}

export default {
  // L'identifiant reste « deal » : il sert de clé dans la base et pour les fichiers du mode Capy Deal.
  id: "deal",
  name: "Capytalisme",
  tagline: "Le Monopoly version capybara",
  minPlayers: 2,
  defaultSettings: { mode: "deal" },
  checkSettings: (settings, n) => ((settings.mode || "deal") !== "deal" ? "Le plateau arrive bientôt : choisis Capy Deal."
    : n > 5 ? "Capy Deal se joue à 5 au plus." : null),
  lobbyView,
  start,
  view,
  hostTick
};
