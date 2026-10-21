import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { CATEGORIES, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/petitbac.css");

const DEFAULT_CATS = ["pays", "ville", "prenom", "animal", "metier", "fruit", "objet"];

function lobbyView({ settings, isHost, setSettings }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  const chosen = CATEGORIES.filter(([id]) => settings.cats?.[id]).length;
  return h("div", { class: "game-settings" },
    stepper({
      label: "Secondes pour remplir", value: settings.time, min: 60, max: 180, by: 30, disabled: !isHost,
      onChange: (time) => set({ time })
    }),
    stepper({
      label: "Manches (une lettre par manche)", value: settings.manches, min: 1, max: 8, disabled: !isHost,
      onChange: (manches) => set({ manches })
    }),
    h("h3", { class: "setup-title" }, `Les catégories · ${chosen}`),
    h("div", { class: "filters", role: "group", "aria-label": "Catégories" },
      CATEGORIES.map(([id, name]) => h("button", {
        class: "filter-chip", type: "button", "aria-pressed": String(!!settings.cats?.[id]), disabled: !isHost,
        onclick: () => set({ cats: { ...settings.cats, [id]: settings.cats?.[id] ? 0 : 1 } })
      }, name))),
    h("p", { class: "rule" },
      "Une lettre tombe : trouve un mot qui commence par elle dans chaque catégorie. Le premier qui a tout rempli peut crier « Stop ! », "
      + "les autres ont alors 10 secondes. Ensuite, la table conteste les réponses douteuses. 10 points pour une réponse unique, 5 si quelqu'un a eu la même.")
  );
}

export default {
  id: "petitbac",
  name: "Petit Bac",
  tagline: "Une lettre, toutes les cases",
  minPlayers: 2,
  defaultSettings: { time: 120, manches: 4, cats: Object.fromEntries(DEFAULT_CATS.map((id) => [id, 1])) },
  checkSettings: (settings) => {
    const n = CATEGORIES.filter(([id]) => settings.cats?.[id]).length;
    return n < 3 ? "Choisis au moins 3 catégories." : n > 10 ? "10 catégories au plus, sinon la manche n'en finit pas." : null;
  },
  lobbyView,
  start,
  view,
  hostTick
};
