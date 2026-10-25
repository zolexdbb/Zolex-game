import { h, loadStyle } from "../../ui/dom.js";
import { WORD_DEFAULTS, wordSetup, checkWords } from "../../ui/wordbank.js";
import { teamPicker } from "../../ui/widgets.js";
import { SIZE, enoughWords, teamsCheck, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/codenames.css");

function lobbyView(props) {
  return h("div", { class: "game-settings" },
    h("p", { class: "rule" },
      "Deux équipes et une grille de 25 mots. Dans chaque équipe, un maître-espion connaît la carte-clé : "
      + "il donne un indice d'un seul mot et un nombre, et son équipe touche les cases qui vont avec. "
      + "Gare à l'assassin : le toucher, c'est perdre aussitôt."),
    h("h3", { class: "setup-title" }, "Les équipes"),
    teamPicker({
      players: props.players || [], teams: props.settings.teams || {}, spies: props.settings.spies || {}, isHost: props.isHost,
      onChange: ({ teams, spies }) => props.setSettings({ ...props.settings, teams, spies })
    }),
    h("p", { class: "rule" }, "Touche un joueur pour le changer d'équipe, et l'étoile pour en faire le maître-espion."),
    wordSetup({ ...props, gameId: "codenames", grouped: false })
  );
}

export default {
  id: "codenames",
  name: "Code Name",
  tagline: "Un indice, plusieurs mots",
  minPlayers: 4,
  defaultSettings: { ...WORD_DEFAULTS },
  checkSettings: (settings, n) => teamsCheck(settings, n) || checkWords(settings, false)
    || (!enoughWords(settings) && `Il faut au moins ${SIZE} mots différents pour remplir la grille.`) || null,
  lobbyView,
  start,
  view,
  hostTick
};
