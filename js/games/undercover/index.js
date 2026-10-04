import { h } from "../../ui/dom.js";
import { stepper } from "../../ui/widgets.js";

const civils = (s, n) => n - s.undercover - s.mrWhite;

// Renvoie la raison pour laquelle la partie ne peut pas commencer, ou null.
function checkSettings(s, n) {
  if (civils(s, n) < 2) return "Il faut au moins 2 Civils autour de la table.";
  if (civils(s, n) <= s.undercover) return "Les Civils doivent être plus nombreux que les Undercover.";
  return null;
}

function lobbyView({ settings, playerCount, isHost, setSettings }) {
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
      role(civils(settings, playerCount), "Civils", "is-civil"),
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
  defaultSettings: { undercover: 1, mrWhite: 0 },
  checkSettings,
  lobbyView
};
