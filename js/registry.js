// Registre des jeux. Pour en ajouter un : créer js/games/<id>/index.js,
// puis l'importer et l'ajouter à la liste ci-dessous. Rien d'autre à modifier.
import undercover from "./games/undercover/index.js";
import loupgarou from "./games/loupgarou/index.js";
import dessin from "./games/dessin/index.js";
import uno from "./games/uno/index.js";

export const games = [undercover, loupgarou, dessin, uno];

// Jeux pas encore disponibles, affichés avec la mention « Bientôt ».
export const upcoming = [];

export const getGame = (id) => games.find((g) => g.id === id) || games[0];
