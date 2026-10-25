// Capy Deal sans pitié : le contenu exact de la boîte (Monopoly Deal sans pitié), 115 cartes.
// Les effets sont ceux de la boîte ; seuls les noms et les textes sont adaptés pour tenir sur la carte.
// Dans les textes, {m} se dessine en mandarine, la monnaie du jeu.

// Les groupes de propriétés : nom, couleur, couleur du texte sur cette couleur,
// valeur d'une carte et loyers selon le nombre de cartes posées (le dernier = groupe complet).
export const GROUPS = {
  brun: { name: "Marron", color: "#7a4a2a", ink: "#fffaf0", value: 1, rents: [1, 2] },
  ciel: { name: "Bleu clair", color: "#8ec5e0", ink: "#1d1a16", value: 1, rents: [1, 2, 3] },
  rose: { name: "Rose", color: "#c4547c", ink: "#fffaf0", value: 2, rents: [1, 2, 4] },
  orange: { name: "Orange", color: "#d9703c", ink: "#fffaf0", value: 2, rents: [1, 3, 5] },
  rouge: { name: "Rouge", color: "#b5452f", ink: "#fffaf0", value: 3, rents: [2, 3, 6] },
  jaune: { name: "Jaune", color: "#e0b23a", ink: "#1d1a16", value: 3, rents: [2, 4, 6] },
  vert: { name: "Vert", color: "#2f5d46", ink: "#fffaf0", value: 4, rents: [2, 4, 7] },
  bleu: { name: "Bleu foncé", color: "#1f3550", ink: "#fffaf0", value: 4, rents: [3, 8] },
  gare: { name: "Gare", color: "#1d1a16", ink: "#fffaf0", value: 2, rents: [1, 2, 3, 4] },
  cie: { name: "Service public", color: "#9aa38f", ink: "#1d1a16", value: 2, rents: [1, 2] }
};

// Les noms des rues : pour mettre vos références, il suffit de changer ces lignes
// (autant de noms que de cartes dans le groupe).
export const STREETS = {
  gare: ["Gare Montparnasse", "Gare de Lyon", "Gare du Nord", "Gare Saint-Lazare"],
  ciel: ["Rue de Vaugirard", "Rue de Courcelles", "Avenue de la République"],
  vert: ["Avenue de Breteuil", "Avenue Foch", "Boulevard des Capucines"],
  rouge: ["Avenue Matignon", "Boulevard Malesherbes", "Avenue Henri-Martin"],
  orange: ["Avenue Mozart", "Boulevard Saint-Michel", "Place Pigalle"],
  jaune: ["Faubourg Saint-Honoré", "Place de la Bourse", "Rue La Fayette"],
  cie: ["Compagnie d'électricité", "Compagnie des eaux"],
  brun: ["Boulevard de Belleville", "Rue Lecourbe"],
  rose: ["Boulevard de la Villette", "Avenue de Neuilly", "Rue de Paradis"],
  bleu: ["Avenue des Champs-Élysées", "Rue de la Paix"]
};

// Billets : [valeur, exemplaires, couleur].
export const MONEY = [[1, 4, "#6f8f5a"], [2, 4, "#c4547c"], [3, 3, "#2c8a8a"], [4, 3, "#3a6fd8"], [5, 2, "#4b2f66"], [10, 1, "#d9703c"], [15, 1, "#86301f"]];

// Jokers propriété : [couleurs, valeur, exemplaires]. Sans couleur : le joker toutes couleurs.
export const WILDS = [
  [["vert", "bleu"], 4, 1], [["vert", "gare"], 4, 1], [["gare", "cie"], 2, 1], [["gare", "ciel"], 4, 1],
  [["ciel", "brun"], 1, 1], [["rouge", "jaune"], 3, 2], [["orange", "rose"], 2, 2], [null, 0, 2]
];

// Les paires des cartes Loyer et Loyer double à 1.
const PAIRS = [["rose", "orange"], ["rouge", "jaune"], ["cie", "gare"], ["brun", "ciel"], ["bleu", "vert"]];
const lower = (key) => GROUPS[key].name.toLowerCase();
const capital = (text) => text[0].toUpperCase() + text.slice(1);

// Actions : nom sur la carte, nom dans la boîte, valeur, exemplaires, texte, humeur du capybara.
// style : "blue" (actions), "cream" (loyers), "dark" (loyers doubles).
export const ACTIONS = [
  { id: "pasdebol", name: "Pas de bol", box: "Pas de chance", value: 5, count: 3, mood: { eyes: "narrow", brows: "evil", mouth: "grin", hat: "tilt" },
    text: "Choisis propriété, action ou argent : prends-les toutes dans la main d'un joueur." },
  { id: "fisc", name: "Fisc", box: "Collecteur d'impôt", value: 5, count: 2, mood: { eyes: "narrow", brows: "angry", mouth: "flat", hat: "helmet", extras: ["magnify"] },
    text: "Un joueur garde 1 carte de sa réserve et répartit le reste entre les autres joueurs." },
  { id: "saisie", name: "Saisie", box: "Reprise de possession", value: 5, count: 2, mood: { eyes: "narrow", brows: "angry", mouth: "frown", extras: ["monocle"] },
    text: "Un joueur garde 1 propriété et répartit les autres, bâtiments compris, entre vous." },
  { id: "non", name: "Non !", box: "Dites non", value: 4, count: 5, mood: { eyes: "closed", brows: "flat", mouth: "flat", extras: ["hand"] },
    text: "Annule une carte action jouée contre toi." },
  { id: "krach", name: "Krach immo", box: "L'immobilier en chute libre", value: 4, count: 3, mood: { eyes: "red", brows: "evil", mouth: "teeth" },
    text: "Vole 1 propriété à chaque joueur, celles de ton choix." },
  { id: "cambriolage", name: "Cambriolage", value: 4, count: 3, mood: { eyes: "side", brows: "one", mouth: "smile", extras: ["mask", "swag"] },
    text: "Vole 1 carte de ton choix dans la réserve de chaque joueur. Jamais ses jetons Dette." },
  { id: "arnaque", name: "Arnaque", box: "Échange inéquitable", value: 4, count: 2, mood: { eyes: ["dot", "happy"], brows: "one", mouth: "smile" },
    text: "Échange toute ta réserve contre celle d'un joueur. Impossible si ta réserve est vide." },
  { id: "loyer-double-joker", name: "Loyer double", box: "Double loyer joker", value: 3, count: 3, rent: "all", double: true,
    text: "Couleur au choix : chaque joueur te paie 2× le loyer par propriété de cette couleur." },
  { id: "loyer-joker", name: "Loyer joker", value: 3, count: 3, rent: "all",
    text: "Couleur au choix : chaque joueur te paie le loyer par propriété de cette couleur." },
  { id: "groscoup", name: "Gros coup", box: "Rupture de transaction", value: 3, count: 3, mood: { eyes: "narrow", brows: "evil", mouth: "grin", hat: "tilt", extras: ["coins"] },
    text: "Vole à un joueur un groupe de propriétés complet, bâtiments compris." },
  { id: "rafle", name: "Rafle", box: "Marché super sournois", value: 3, count: 3, mood: { eyes: "dot", brows: "evil", mouth: "teeth", hat: "tilt", extras: ["patch"] },
    text: "Couleur au choix : vole TOUTES ses propriétés à chaque joueur, groupes complets compris." },
  { id: "cabane", name: "Cabane", value: 3, count: 3, mood: { eyes: "happy", mouth: "smile", hat: "hardhat", extras: ["blush"] },
    text: "+5{m} au loyer d'une propriété, même hors groupe complet, gare ou service public." },
  { id: "kaching", name: "Ka-ching !", value: 2, count: 3, mood: { eyes: "coin", brows: "up", mouth: "grin", extras: ["coins"] },
    text: "Un joueur de ton choix te paie 10{m}." },
  { id: "ardoise", name: "Ardoise", box: "Dette forcée", value: 2, count: 3, mood: { eyes: "side", brows: "one", mouth: "smile", extras: ["monocle"] },
    text: "Un joueur te donne 1 jeton Dette : à son tour, il te paie avec une carte de sa main." },
  ...PAIRS.map(([a, b]) => ({ id: `loyer-${a}-${b}`, name: "Loyer", value: 1, count: 1, rent: [a, b],
    text: `${capital(lower(a))} ou ${lower(b)} : chaque joueur te paie le loyer par propriété.` })),
  ...PAIRS.map(([a, b]) => ({ id: `loyer-double-${a}-${b}`, name: "Loyer double", value: 1, count: 1, rent: [a, b], double: true,
    text: `${capital(lower(a))} ou ${lower(b)} : chaque joueur te paie 2× le loyer par propriété.` })),
  { id: "allez", name: "Allez allez !", box: "Allez, allez, allez", value: 1, count: 4, mood: { eyes: "wide", brows: "up", mouth: "o", extras: ["sweat"] },
    text: "Pioche jusqu'à avoir 7 cartes en main." },
  { id: "rejouer", name: "Rejouer", value: 1, count: 3, mood: { eyes: ["dot", "happy"], brows: "up", mouth: "grin", extras: ["stars"] },
    text: "Joue-la en dernier : ton tour finit et tu rejoues. Reçue en paiement : en réserve." }
];

// L'aide-mémoire : ce que les cartes ne disent pas (hors paquet, ouvert par le bouton « Règles »).
export const RULES = [
  ["Ton tour", "Pioche 2 cartes (5 si ta main est vide). Joue jusqu'à 3 cartes. En fin de tour, garde 7 cartes au plus et défausse le reste."],
  ["Jouer une carte", "Pose-la dans ta réserve (argent ou action, pour sa valeur), devant toi (propriété) ou joue son effet. Une carte en réserve n'en ressort plus."],
  ["Payer", "Avec ta réserve et tes propriétés posées, au choix. On ne rend pas la monnaie{m}. Ta main ne sert jamais à payer."],
  ["Pas assez ?", "Donne 1 jeton Dette au joueur que tu dois (3 jetons chacun). À ton tour suivant, rembourse-le d'une carte de ta main : obligatoire, compte comme une action, et il doit la jouer aussitôt."],
  ["Propriétés", "Un groupe est complet quand il a toutes les cartes de sa couleur. À ton tour, tu peux déplacer tes jokers propriété d'un groupe à l'autre, sans compter d'action."],
  ["Loyers", "Chaque joueur paie le loyer pour chaque propriété de la couleur demandée. Une Cabane ajoute son bonus au loyer de sa propriété."],
  ["Gagner", "Le premier à poser 3 groupes complets de couleurs différentes gagne."]
];

// Les humeurs hors paquet : le dos des cartes, l'aide-mémoire et le jeton Dette.
export const MOODS = {
  back: { eyes: ["dot", "happy"], mouth: "smile", hat: "tilt", extras: ["blush"] },
  rules: { eyes: "dot", brows: "up", mouth: "smile", extras: ["glasses"] },
  debt: { eyes: "dot", brows: "sad", mouth: "frown" }
};

// Les types de cartes, chacun une fois, avec son nombre d'exemplaires.
export function cardTypes() {
  return [
    ...MONEY.map(([value, count, color]) => ({ id: `argent-${value}`, kind: "money", value, count, color })),
    ...Object.entries(STREETS).flatMap(([group, names]) => names.map((name, i) =>
      ({ id: `prop-${group}-${i + 1}`, kind: "property", group, name, value: GROUPS[group].value, count: 1 }))),
    ...WILDS.map(([groups, value, count]) => ({ id: `joker-${groups ? groups.join("-") : "tout"}`, kind: "wild", groups, value, count })),
    ...ACTIONS.map((a) => ({ ...a, kind: a.rent ? "rent" : "action" }))
  ];
}

// Le paquet complet : un objet par carte, avec un identifiant unique (type#exemplaire).
export const buildDeck = () => cardTypes().flatMap((t) => Array.from({ length: t.count }, (_, n) => ({ ...t, uid: `${t.id}#${n + 1}` })));
