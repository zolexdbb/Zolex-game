import { h, loadStyle } from "../../ui/dom.js";
import { WORD_DEFAULTS, wordSetup, checkWords } from "../../ui/wordbank.js";
import { SIZE, enoughWords, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/codenames.css");

function lobbyView(props) {
  return h("div", { class: "game-settings" },
    h("p", { class: "rule" },
      "Deux équipes, tirées au hasard, et une grille de 25 mots. Dans chaque équipe, un maître-espion connaît la carte-clé : "
      + "il donne un indice d'un seul mot et un nombre, et son équipe touche les cases qui vont avec. "
      + "Gare à l'assassin : le toucher, c'est perdre aussitôt."),
    wordSetup({ ...props, gameId: "codenames", grouped: false })
  );
}

export default {
  id: "codenames",
  name: "Nom de code",
  tagline: "Un indice, plusieurs mots",
  minPlayers: 4,
  defaultSettings: { ...WORD_DEFAULTS },
  checkSettings: (settings) => checkWords(settings, false)
    || (!enoughWords(settings) && `Il faut au moins ${SIZE} mots différents pour remplir la grille.`) || null,
  lobbyView,
  start,
  view,
  hostTick
};
