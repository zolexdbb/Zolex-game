import { h, loadStyle } from "../../ui/dom.js";
import { stepper, teamPicker } from "../../ui/widgets.js";
import { start, hostTick } from "./logic.js";
import { teamsCheck } from "../codenames/logic.js";
import { CARDS } from "./cards.js";
import { view } from "./view.js";

loadStyle("css/themes/taboo.css");

const MODES = [["oral", "À voix haute"], ["written", "Par écrit"]];
const TOLERANCE = [[0, "Stricte"], [1, "Normale"], [2, "Large"]];

function lobbyView({ settings, players = [], isHost, setSettings }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  const chips = (list, value, key) => h("div", { class: "filters", role: "group" }, list.map(([id, label]) => h("button", {
    class: "filter-chip", type: "button", disabled: !isHost, "aria-pressed": String(value === id), onclick: () => set({ [key]: id })
  }, label)));
  const written = settings.mode === "written";
  return h("div", { class: "game-settings" },
    h("div", { class: "house-rule" }, h("b", null, "Comment on joue"), chips(MODES, settings.mode || "oral", "mode"),
      h("small", null, written
        ? "L'orateur tape ses indices ; le site refuse ceux qui contiennent un mot interdit. Son équipe tape ses réponses."
        : "L'orateur parle, dans la même pièce ou en appel vocal. L'équipe adverse surveille et crie « Tabou ! ».")),
    written && h("div", { class: "house-rule" }, h("b", null, "Fautes d'orthographe tolérées"), chips(TOLERANCE, settings.tolerance ?? 1, "tolerance"),
      h("small", null, "Stricte : orthographe exacte. Normale : une faute (deux pour les mots longs). Large : deux fautes. Accents et pluriel ne comptent jamais.")),
    stepper({
      label: "Secondes par tour", value: settings.time, min: 30, max: 120, by: 15, disabled: !isHost,
      onChange: (time) => set({ time })
    }),
    stepper({
      label: "Tours par équipe", value: settings.turns, min: 1, max: 8, disabled: !isHost,
      onChange: (turns) => set({ turns })
    }),
    h("h3", { class: "setup-title" }, "Les équipes"),
    teamPicker({ players, teams: settings.teams || {}, isHost, onChange: ({ teams }) => set({ teams }) }),
    h("p", { class: "rule" },
      `À tour de rôle, un orateur fait deviner le plus de mots possible à son équipe, ${written ? "par écrit" : "à voix haute"}, `
      + "sans dire les cinq mots interdits de la carte. L'équipe adverse voit la carte. "
      + `Trouvé : +1, tabou : −1, passé : 0. ${CARDS.length} cartes dans la boîte.`)
  );
}

export default {
  id: "taboo",
  name: "Taboo",
  tagline: "Fais deviner sans dire",
  minPlayers: 4,
  defaultSettings: { time: 60, turns: 3, mode: "oral", tolerance: 1 },
  checkSettings: (settings, n) => teamsCheck(settings, n),
  lobbyView,
  start,
  view,
  hostTick
};
