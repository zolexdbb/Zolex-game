import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { ROLES, OPTIONAL, FILTERS, checkSettings, preset, villagersOf, start, hostTick } from "./logic.js";
import { view, roleArt } from "./view.js";

loadStyle("css/themes/loupgarou.css");

// Filtre affiché sur cet appareil : il survit aux rafraîchissements du salon.
let filter = "tous";

function lobbyView({ settings, playerCount, isHost, setSettings }) {
  const matches = (id, key) => key === "tous" || ROLES[id].camp === key || ROLES[id].tags.includes(key);
  const picked = OPTIONAL.filter((id) => settings[id]);

  const tiles = ["loup", ...OPTIONAL].map((id) => {
    const on = id === "loup" || !!settings[id];
    const tile = h("button", {
      class: `role-tile${on ? " is-on" : ""}`, type: "button", "aria-pressed": String(on),
      disabled: !isHost || id === "loup", hidden: !matches(id, filter),
      onclick: () => setSettings({ ...settings, [id]: settings[id] ? 0 : 1 })
    },
      roleArt(id),
      h("strong", null, ROLES[id].name, ROLES[id].cards > 1 && ` ×${ROLES[id].cards}`),
      h("small", null, ROLES[id].text));
    tile.dataset.role = id;
    return tile;
  });

  const chips = FILTERS.map(([key, label]) => {
    const chip = h("button", { class: "filter-chip", type: "button", "aria-pressed": String(key === filter) }, label);
    chip.addEventListener("click", () => {
      filter = key;
      for (const other of chips) other.setAttribute("aria-pressed", String(other === chip));
      for (const tile of tiles) tile.hidden = !matches(tile.dataset.role, key);
    });
    return chip;
  });

  const night = settings.wolvesTime + (settings.sorciere ? settings.witchTime : 0);
  return h("div", { class: "game-settings" },
    stepper({
      label: "Loups-Garous", value: settings.loups, min: 1, max: 4, disabled: !isHost,
      onChange: (loups) => setSettings({ ...settings, loups })
    }),
    isHost && h("button", {
      class: "btn btn-cream", type: "button", onclick: () => setSettings(preset(settings, playerCount))
    }, `Composition conseillée pour ${playerCount} joueurs`),
    h("div", { class: "filters", role: "group", "aria-label": "Filtrer les rôles" }, chips),
    h("div", { class: "role-grid" }, tiles),
    h("ul", { class: "role-chips", "aria-label": "Composition de la partie" },
      h("li", { class: "role-chip is-undercover" }, h("b", null, String(settings.loups)), " Loups"),
      picked.map((id) => h("li", { class: "role-chip" }, ROLES[id].name)),
      h("li", { class: "role-chip" }, h("b", null, String(Math.max(villagersOf(settings, playerCount), 0))), " Villageois")),
    h("p", { class: "rule" }, `Chaque nuit dure ${night} secondes, quels que soient les rôles encore en vie.`)
  );
}

export default {
  id: "loupgarou",
  name: "Loup-Garou",
  tagline: "Le village s'endort",
  minPlayers: 4,
  defaultSettings: {
    loups: 1, voyante: 1, sorciere: 1, chasseur: 0, salvateur: 0, petitefille: 0, renard: 0,
    ours: 0, corbeau: 0, idiot: 0, cupidon: 0, macon: 0, wolvesTime: 30, witchTime: 20
  },
  checkSettings,
  lobbyView,
  start,
  view,
  hostTick
};
