// Registre des jeux. Pour en ajouter un : créer js/games/<id>/index.js,
// puis l'importer et l'ajouter à la liste ci-dessous. Rien d'autre à modifier.
import undercover from "./games/undercover/index.js";

export const games = [undercover];

// Boîtes encore fermées, affichées sur l'étagère du salon.
export const upcoming = [
  { id: "loupgarou", name: "Loup-Garou", tagline: "Le village s'endort" },
  { id: "uno", name: "Uno", tagline: "Plus qu'une carte" }
];

export const getGame = (id) => games.find((g) => g.id === id) || games[0];
