// Registre des jeux. Pour en ajouter un : créer js/games/<id>/index.js,
// puis l'importer et l'ajouter à la liste ci-dessous. Rien d'autre à modifier.
import undercover from "./games/undercover/index.js";
import loupgarou from "./games/loupgarou/index.js";
import dessin from "./games/dessin/index.js";
import uno from "./games/uno/index.js";
import connexion from "./games/connexion/index.js";
import petitbac from "./games/petitbac/index.js";
import codenames from "./games/codenames/index.js";
import taboo from "./games/taboo/index.js";
import deal from "./games/deal/index.js";

export const games = [undercover, loupgarou, dessin, uno, connexion, petitbac, codenames, taboo, deal];

// Jeux pas encore disponibles, affichés avec la mention « Bientôt ».
export const upcoming = [];

export const getGame = (id) => games.find((g) => g.id === id) || games[0];
