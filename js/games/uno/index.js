import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { PRESETS, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/uno.css");

const MODES = [
  { id: "classic", name: "Classique" },
  { id: "flip", name: "Flip", soon: true },
  { id: "nomercy", name: "No Mercy", soon: true }
];

// Règles à bascule : [clé, nom, ce que ça change].
const SWITCHES = [
  ["callUno", "Annoncer « Uno »", "Oublier de l'annoncer avec une seule carte en main coûte 2 cartes si quelqu'un te prend."],
  ["playDrawn", "Jouer la carte piochée", "Si la carte piochée peut être posée, tu peux la jouer tout de suite."],
  ["drawUntil", "Piocher jusqu'à pouvoir jouer", "Tu pioches tant que tu ne tires pas une carte jouable."],
  ["skipBlocks", "Passe esquive un malus", "Un Passe de la bonne couleur fait filer le +2 / +4 au joueur suivant."],
  ["reverseReturns", "Demi-tour renvoie un malus", "Un Demi-tour de la bonne couleur renvoie le +2 / +4 à l'expéditeur."],
  ["sevenZero", "7 et 0 échangent les mains", "7 : tu échanges ta main avec un joueur. 0 : toutes les mains tournent d'un cran."],
  ["jumpIn", "À la volée", "Tu poses la carte identique à celle du dessus, même hors de ton tour."]
];

const STACKS = [["off", "Non"], ["same", "+2 sur +2, +4 sur +4"], ["all", "+2 et +4 mélangés"]];

function lobbyView({ settings, isHost, setSettings }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  const chip = (label, pressed, onclick, disabled = !isHost) =>
    h("button", { class: "filter-chip", type: "button", "aria-pressed": String(pressed), disabled, onclick }, label);
  const mode = Object.keys(PRESETS).find((id) => Object.entries(PRESETS[id]).every(([key, value]) => settings[key] === value));

  return h("div", { class: "game-settings" },
    h("div", { class: "filters", role: "group", "aria-label": "Règles de départ" },
      MODES.map((m) => chip(m.soon ? `${m.name} · bientôt` : m.name, m.id === mode, () => set(PRESETS[m.id]), !isHost || m.soon)),
      !mode && chip("Maison", true, null, true)),
    h("p", { class: "rule" }, mode
      ? "Règles officielles. Change ce que tu veux ci-dessous pour jouer avec vos règles maison."
      : "Règles maison. Appuie sur « Classique » pour revenir aux règles officielles."),
    stepper({
      label: "Cartes en main", value: settings.handSize, min: 3, max: 10, disabled: !isHost,
      onChange: (handSize) => set({ handSize })
    }),
    stepper({
      label: "Secondes par tour (0 = libre)", value: settings.turnTime, min: 0, max: 90, by: 15, disabled: !isHost,
      onChange: (turnTime) => set({ turnTime })
    }),
    h("div", { class: "house-rule" },
      h("b", null, "Cumuler les +2 / +4"),
      h("div", { class: "filters", role: "group", "aria-label": "Cumuler les +2 et +4" },
        STACKS.map(([id, label]) => chip(label, settings.stack === id, () => set({ stack: id })))),
      h("small", null, "Tu réponds à un malus par un autre : l'addition passe au suivant.")),
    SWITCHES.map(([key, name, hint]) => h("div", { class: "house-rule" },
      chip(name, !!settings[key], () => set({ [key]: !settings[key] })),
      h("small", null, hint)))
  );
}

export default {
  id: "uno",
  name: "Uno",
  tagline: "Plus qu'une carte",
  minPlayers: 2,
  defaultSettings: PRESETS.classic,
  lobbyView,
  start,
  view,
  hostTick
};
