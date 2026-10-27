import { h, loadStyle } from "../../ui/dom.js";
import { WORD_DEFAULTS, wordSetup, checkWords } from "../../ui/wordbank.js";
import { teamPicker, stepper } from "../../ui/widgets.js";
import { TEAMS, TEAM_IDS, GRIDS, teamCountOf, enoughWords, teamsCheck, start, hostTick } from "./logic.js";
import { view } from "./view.js";

loadStyle("css/themes/codenames.css");

function lobbyView(props) {
  const count = teamCountOf(props.settings);
  const { size, cols } = GRIDS[count];
  return h("div", { class: "game-settings" },
    h("p", { class: "rule" },
      `${count} équipes et une grille de ${size} mots (${cols} × ${size / cols}). Dans chaque équipe, un maître-espion connaît la carte-clé : `
      + "il donne un indice d'un seul mot et un nombre, et son équipe touche les cases qui vont avec. "
      + (count > 2
        ? "Gare à l'assassin : l'équipe qui le touche est éliminée, et les autres continuent."
        : "Gare à l'assassin : le toucher, c'est perdre aussitôt.")),
    h("h3", { class: "setup-title" }, "Les équipes"),
    stepper({
      label: "Équipes", value: count, min: 2, max: 4, disabled: !props.isHost,
      onChange: (teamCount) => props.setSettings({ ...props.settings, teamCount })
    }),
    teamPicker({
      ids: TEAM_IDS.slice(0, count), names: TEAMS,
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
  defaultSettings: { ...WORD_DEFAULTS, teamCount: 2 },
  checkSettings: (settings, n) => teamsCheck(settings, n) || checkWords(settings, false)
    || (!enoughWords(settings) && `Il faut au moins ${GRIDS[teamCountOf(settings)].size} mots différents pour remplir la grille.`) || null,
  lobbyView,
  start,
  view,
  hostTick
};
