import { h, loadStyle } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";
import { checkSettings, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/undercover.css");

function lobbyView({ settings, playerCount, isHost, setSettings }) {
  const civils = playerCount - settings.undercover - settings.mrWhite;
  const role = (count, name, cls) =>
    h("li", { class: `role-chip ${cls}` }, h("b", null, String(Math.max(count, 0))), " ", name);
  return h("div", { class: "game-settings" },
    stepper({
      label: "Undercover", value: settings.undercover, min: 1, max: 3, disabled: !isHost,
      onChange: (undercover) => setSettings({ ...settings, undercover })
    }),
    stepper({
      label: "Mr White", value: settings.mrWhite, min: 0, max: 1, disabled: !isHost,
      onChange: (mrWhite) => setSettings({ ...settings, mrWhite })
    }),
    h("ul", { class: "role-chips", "aria-label": "Composition de la partie" },
      role(civils, "Civils", "is-civil"),
      role(settings.undercover, "Undercover", "is-undercover"),
      role(settings.mrWhite, "Mr White", "is-white")
    )
  );
}

export default {
  id: "undercover",
  name: "Undercover",
  tagline: "Un mot de trop et tu es démasqué",
  minPlayers: 3,
  defaultSettings: { undercover: 1, mrWhite: 0, clueTours: 3 },
  checkSettings,
  lobbyView,
  start,
  view,
  hostTick
};
