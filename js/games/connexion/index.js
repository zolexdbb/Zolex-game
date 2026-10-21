import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { WORD_DEFAULTS, wordSetup, checkWords } from "../../ui/wordbank.js";
import { needed, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/connexion.css");

function lobbyView(props) {
  const { settings, playerCount, isHost, setSettings } = props;
  const set = (patch) => setSettings({ ...settings, ...patch });
  const n = Math.max(playerCount, 2);
  return h("div", { class: "game-settings" },
    stepper({
      label: "Secondes par tour", value: settings.tourTime, min: 20, max: 60, by: 10, disabled: !isHost,
      onChange: (tourTime) => set({ tourTime })
    }),
    stepper({
      label: "Tours avant l'échec", value: settings.maxTours, min: 5, max: 12, disabled: !isHost,
      onChange: (maxTours) => set({ maxTours })
    }),
    stepper({
      label: "Manches (le score se cumule)", value: settings.manches, min: 1, max: 5, disabled: !isHost,
      onChange: (manches) => set({ manches })
    }),
    h("div", { class: "house-rule" },
      h("button", {
        class: "filter-chip", type: "button", "aria-pressed": String(!!settings.majority), disabled: !isHost,
        onclick: () => set({ majority: !settings.majority })
      }, "La majorité suffit"),
      h("small", null, settings.majority
        ? `La manche est gagnée dès que ${needed(n, true)} joueurs sur ${n} écrivent le même mot.`
        : `Il faut que les ${n} joueurs écrivent le même mot. Conseillé jusqu'à 5 joueurs.`)),
    h("p", { class: "rule" },
      "Deux mots tombent sur la table. Chacun écrit en secret un mot qui les relie, puis tout se révèle en même temps. "
      + "On recommence avec les mots dits, jusqu'à ce que tout le monde écrive le même. Un mot déjà dit ne compte plus."),
    wordSetup({ ...props, gameId: "connexion", grouped: false })
  );
}

export default {
  id: "connexion",
  name: "Connexion",
  tagline: "Le même mot, en même temps",
  minPlayers: 2,
  defaultSettings: { tourTime: 30, maxTours: 8, manches: 3, majority: false, ...WORD_DEFAULTS },
  checkSettings: (settings) => checkWords(settings, false),
  lobbyView,
  start,
  view,
  hostTick
};
