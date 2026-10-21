// Banque de mots du site : les thèmes larges (cases à cocher dans le salon) et les
// packs à thème (une partie 100 % Pokémon, Harry Potter…). Pour ajouter un pack :
// créer js/words/packs/<id>.js sur le modèle des autres, puis l'importer ici.
import pokemon from "./packs/pokemon.js";
import harrypotter from "./packs/harrypotter.js";
import marvel from "./packs/marvel.js";
import disney from "./packs/disney.js";
import starwars from "./packs/starwars.js";
import onepiece from "./packs/onepiece.js";
import naruto from "./packs/naruto.js";
import minecraft from "./packs/minecraft.js";
import mario from "./packs/mario.js";
import football from "./packs/football.js";

export { CATEGORIES, GROUPS } from "./categories.js";

export const PACKS = [pokemon, harrypotter, marvel, disney, starwars, onepiece, naruto, minecraft, mario, football];
