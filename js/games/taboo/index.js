import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { start, hostTick } from "./logic.js";
import { CARDS } from "./cards.js";
import { view } from "./view.js";

loadStyle("css/themes/taboo.css");

function lobbyView({ settings, isHost, setSettings }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  return h("div", { class: "game-settings" },
    stepper({
      label: "Secondes par tour", value: settings.time, min: 30, max: 120, by: 15, disabled: !isHost,
      onChange: (time) => set({ time })
    }),
    stepper({
      label: "Tours par équipe", value: settings.turns, min: 1, max: 8, disabled: !isHost,
      onChange: (turns) => set({ turns })
    }),
    h("p", { class: "rule" },
      "Deux équipes tirées au hasard. À tour de rôle, un orateur fait deviner le plus de mots possible à son équipe, à voix haute, "
      + "sans dire les cinq mots interdits de la carte. L'équipe adverse voit la carte et crie « Tabou ! » au moindre faux pas. "
      + `Trouvé : +1, tabou : −1, passé : 0. ${CARDS.length} cartes dans la boîte. Se joue dans la même pièce ou en appel vocal.`)
  );
}

export default {
  id: "taboo",
  name: "Taboo",
  tagline: "Fais deviner sans dire",
  minPlayers: 4,
  defaultSettings: { time: 60, turns: 3 },
  lobbyView,
  start,
  view,
  hostTick
};
