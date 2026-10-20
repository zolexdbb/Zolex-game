import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { PRESETS, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/uno.css");

const MODES = [
  { id: "classic", name: "Classique" },
  { id: "flip", name: "Flip" },
  { id: "nomercy", name: "No Mercy" }
];

// Règles à bascule : [clé, nom, ce que ça change].
const SWITCHES = [
  ["callUno", "Annoncer « Uno »", "Oublier de l'annoncer avec une seule carte en main coûte 2 cartes si quelqu'un te prend."],
  ["playDrawn", "Jouer la carte piochée", "Si la carte piochée peut être posée, tu peux la jouer tout de suite."],
  ["drawUntil", "Piocher jusqu'à pouvoir jouer", "Tu pioches tant que tu ne tires pas une carte jouable."],
  ["skipBlocks", "Passe esquive un malus", "Un Passe de la bonne couleur fait filer le +2 / +4 au joueur suivant."],
  ["reverseReturns", "Demi-tour renvoie un malus", "Un Demi-tour de la bonne couleur renvoie le +2 / +4 à l'expéditeur."],
  ["sevenZero", "7 et 0 échangent les mains", "7 : tu échanges ta main avec un joueur. 0 : toutes les mains tournent d'un cran."],
  ["jumpIn", "À la volée", "Tu poses la carte identique à celle du dessus, même hors de ton tour."],
  ["mercy", "Pas de pitié", "Qui atteint 25 cartes en main quitte la manche ; le dernier en lice gagne."]
];

// Ce que contient chaque boîte.
const DECK_NOTES = {
  classic: "108 cartes : chiffres, Passe, Demi-tour, +2, Joker et Joker +4.",
  flip: "112 cartes à deux faces. Une carte Flip retourne tout : les mains, la pioche et la défausse passent du côté clair (+1, Joker +2) au côté sombre (+5, Passe tout le monde, Joker pioche-couleur). Tu vois l'autre face des cartes de tes adversaires.",
  nomercy: "168 cartes sans pitié : +4 de couleur, Joker +6, +10, demi-tour +4, Défausse la couleur, Passe tout le monde et Roulette des couleurs. Les malus se cumulent, les 7 et 0 échangent les mains, et à 25 cartes on est éliminé."
};

const STACKS = [["off", "Non"], ["same", "+2 sur +2, +4 sur +4"], ["all", "+4 sur +2 aussi"]];

function lobbyView({ settings, isHost, setSettings }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  const chip = (label, pressed, onclick, disabled = !isHost) =>
    h("button", { class: "filter-chip", type: "button", "aria-pressed": String(pressed), disabled, onclick }, label);
  const mode = Object.keys(PRESETS).find((id) => Object.entries(PRESETS[id]).every(([key, value]) => settings[key] === value));

  return h("div", { class: "game-settings" },
    h("div", { class: "filters", role: "group", "aria-label": "Règles de départ" },
      MODES.map((m) => chip(m.name, m.id === mode, () => set(PRESETS[m.id]))),
      !mode && chip("Maison", true, null, true)),
    h("p", { class: "deck-note" }, DECK_NOTES[settings.deck || "classic"]),
    h("p", { class: "rule" }, mode
      ? "Règles officielles. Change ce que tu veux ci-dessous pour jouer avec vos règles maison."
      : "Règles maison. Appuie sur « Classique » pour revenir aux règles officielles."),
    stepper({
      label: "Manches (le score se cumule)", value: settings.rounds || 1, min: 1, max: 10, disabled: !isHost,
      onChange: (rounds) => set({ rounds })
    }),
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
      h("small", null, "Tu réponds à un malus par un autre : l'addition passe au suivant. Jamais de +2 sur un +4.")),
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
  defaultSettings: { ...PRESETS.classic, rounds: 1 },
  lobbyView,
  start,
  view,
  hostTick
};
