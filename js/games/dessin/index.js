import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { WORD_DEFAULTS, wordSetup, checkWords } from "../../ui/wordbank.js";
import { start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/dessin.css");

function lobbyView(props) {
  const { settings, playerCount, isHost, setSettings } = props;
  return h("div", { class: "game-settings" },
    stepper({
      label: "Tours de table", value: settings.rounds, min: 1, max: 5, disabled: !isHost,
      onChange: (rounds) => setSettings({ ...settings, rounds })
    }),
    stepper({
      label: "Secondes par dessin", value: settings.drawTime, min: 40, max: 160, by: 20, disabled: !isHost,
      onChange: (drawTime) => setSettings({ ...settings, drawTime })
    }),
    stepper({
      label: "Relances de mots par dessin", value: settings.rerolls, min: 0, max: 5, disabled: !isHost,
      onChange: (rerolls) => setSettings({ ...settings, rerolls })
    }),
    h("p", { class: "rule" },
      `Chacun dessine ${settings.rounds} fois : ${settings.rounds * playerCount} dessins en tout. Plus tu trouves vite, plus tu marques.`),
    wordSetup({ ...props, gameId: "dessin", grouped: false })
  );
}

export default {
  id: "dessin",
  name: "What's Drawing ?",
  tagline: "Un mot, un crayon, des devins",
  minPlayers: 2,
  defaultSettings: { rounds: 2, drawTime: 80, rerolls: 1, ...WORD_DEFAULTS },
  checkSettings: (settings) => checkWords(settings, false),
  lobbyView,
  start,
  view,
  hostTick
};
