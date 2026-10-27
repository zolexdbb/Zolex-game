// Banque de mots du site : les thèmes larges (cases à cocher dans le salon) et les
// packs à thème (une partie 100 % Pokémon, Harry Potter…). Pour ajouter un pack :
// créer js/words/packs/<id>.js sur le modèle des autres (avec son genre, `kind`),
// puis l'importer ici et l'ajouter à TITLES. Il rejoint tout seul le mélange de son genre.
import harrypotter from "./packs/harrypotter.js";
import marvel from "./packs/marvel.js";
import disney from "./packs/disney.js";
import starwars from "./packs/starwars.js";
import pokemon from "./packs/pokemon.js";
import minecraft from "./packs/minecraft.js";
import mario from "./packs/mario.js";
import zelda from "./packs/zelda.js";
import sonic from "./packs/sonic.js";
import fortnite from "./packs/fortnite.js";
import lol from "./packs/lol.js";
import gta from "./packs/gta.js";
import finalfantasy from "./packs/finalfantasy.js";
import animalcrossing from "./packs/animalcrossing.js";
import smash from "./packs/smash.js";
import onepiece from "./packs/onepiece.js";
import naruto from "./packs/naruto.js";
import dragonball from "./packs/dragonball.js";
import demonslayer from "./packs/demonslayer.js";
import snk from "./packs/snk.js";
import mha from "./packs/mha.js";
import jujutsu from "./packs/jujutsu.js";
import deathnote from "./packs/deathnote.js";
import hxh from "./packs/hxh.js";
import bleach from "./packs/bleach.js";
import fma from "./packs/fma.js";
import onepunchman from "./packs/onepunchman.js";
import football from "./packs/football.js";
import basket from "./packs/basket.js";
import tennis from "./packs/tennis.js";
import f1 from "./packs/f1.js";
import rugby from "./packs/rugby.js";

export { CATEGORIES, GROUPS } from "./categories.js";

// Les genres de packs, dans l'ordre des filtres du salon.
export const KINDS = [["film", "Films et séries"], ["jeu", "Jeux vidéo"], ["manga", "Manga"], ["sport", "Sport"]];

// Un pack par licence.
const TITLES = [
  harrypotter, marvel, disney, starwars,
  pokemon, minecraft, mario, zelda, sonic, fortnite, lol, gta, finalfantasy, animalcrossing, smash,
  onepiece, naruto, dragonball, demonslayer, snk, mha, jujutsu, deathnote, hxh, bleach, fma, onepunchman,
  football, basket, tennis, f1, rugby
];

// Deux mots qui ne diffèrent que par les accents, la casse ou la ponctuation sont le même mot.
const key = (word) => word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Le mélange d'un genre : toutes les familles de ses packs, chaque mot une seule fois.
// Une famille réduite à moins de 3 mots par les doublons est laissée de côté.
function mix(kind, label) {
  const seen = new Set();
  const groups = TITLES.filter((pack) => pack.kind === kind).flatMap((pack) => pack.groups)
    .map((group) => group.filter((word) => !seen.has(key(word)) && seen.add(key(word))))
    .filter((group) => group.length >= 3);
  return { id: `${kind}-melange`, name: `${label} (mélange)`, kind, mix: true, groups };
}

// Tous les packs, genre par genre : le mélange d'abord, puis les licences.
export const PACKS = KINDS.flatMap(([kind, label]) => [mix(kind, label), ...TITLES.filter((pack) => pack.kind === kind)]);
