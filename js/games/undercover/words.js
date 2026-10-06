// Banque de mots du site, rangée par thèmes. Chaque thème contient des familles
// de mots proches : Undercover tire deux mots dans une même famille (chercher
// son mot ici ne dit donc pas lequel des autres est en jeu), What's Drawing ?
// pioche des mots un par un.
export const CATEGORIES = [
  { id: "animaux", name: "Animaux", groups: [
    ["Chat", "Chien", "Lapin", "Hamster", "Furet"],
    ["Lion", "Tigre", "Panthère", "Guépard", "Lynx"],
    ["Requin", "Dauphin", "Baleine", "Orque", "Phoque"],
    ["Abeille", "Guêpe", "Bourdon", "Mouche", "Moustique"]
  ] },
  { id: "cuisine", name: "À table", groups: [
    ["Café", "Thé", "Chocolat chaud", "Tisane", "Cappuccino"],
    ["Pizza", "Burger", "Kebab", "Tacos", "Sandwich"],
    ["Pomme", "Poire", "Pêche", "Abricot", "Prune"],
    ["Croissant", "Pain au chocolat", "Brioche", "Chausson aux pommes", "Baguette"],
    ["Vin", "Bière", "Cidre", "Champagne", "Limonade"],
    ["Chocolat", "Caramel", "Nougat", "Réglisse", "Guimauve"],
    ["Crêpe", "Gaufre", "Beignet", "Churros", "Pancake"],
    ["Frites", "Chips", "Purée", "Gratin", "Raclette"],
    ["Fourchette", "Cuillère", "Couteau", "Baguettes", "Louche"]
  ] },
  { id: "loisirs", name: "Sports et loisirs", groups: [
    ["Football", "Rugby", "Handball", "Basket", "Volley"],
    ["Tennis", "Ping-pong", "Badminton", "Squash", "Pétanque"],
    ["Ski", "Snowboard", "Luge", "Patinage", "Surf"],
    ["Échecs", "Dames", "Dominos", "Petits chevaux", "Belote"],
    ["Guitare", "Violon", "Harpe", "Banjo", "Contrebasse"],
    ["Cinéma", "Théâtre", "Opéra", "Cirque", "Concert"],
    ["Mariage", "Anniversaire", "Baptême", "Noël", "Nouvel An"]
  ] },
  { id: "voyage", name: "Lieux et voyages", groups: [
    ["Train", "Métro", "Tramway", "Bus", "Funiculaire"],
    ["Avion", "Hélicoptère", "Montgolfière", "Planeur", "Fusée"],
    ["Vélo", "Trottinette", "Skateboard", "Rollers", "Moto"],
    ["Château", "Palais", "Manoir", "Forteresse", "Cathédrale"],
    ["Bibliothèque", "Librairie", "Musée", "Kiosque", "École"],
    ["Camping", "Hôtel", "Auberge", "Gîte", "Cabane"]
  ] },
  { id: "nature", name: "Nature", groups: [
    ["Plage", "Piscine", "Lac", "Rivière", "Port"],
    ["Lune", "Soleil", "Étoile", "Comète", "Planète"],
    ["Montagne", "Colline", "Volcan", "Falaise", "Dune"],
    ["Neige", "Glace", "Grêle", "Givre", "Brouillard"],
    ["Désert", "Savane", "Jungle", "Banquise", "Steppe"]
  ] },
  { id: "personnages", name: "Métiers et personnages", groups: [
    ["Médecin", "Infirmier", "Dentiste", "Pharmacien", "Vétérinaire"],
    ["Policier", "Détective", "Gendarme", "Espion", "Juge"],
    ["Pirate", "Corsaire", "Viking", "Chevalier", "Mousquetaire"],
    ["Roi", "Empereur", "Prince", "Président", "Pharaon"],
    ["Vampire", "Zombie", "Fantôme", "Momie", "Loup-garou"],
    ["Sorcière", "Fée", "Magicien", "Lutin", "Sirène"]
  ] },
  { id: "objets", name: "Objets du quotidien", groups: [
    ["Stylo", "Crayon", "Feutre", "Pinceau", "Craie"],
    ["Téléphone", "Tablette", "Ordinateur", "Télévision", "Radio"],
    ["Canapé", "Fauteuil", "Tabouret", "Hamac", "Banc"],
    ["Parapluie", "Imperméable", "Écharpe", "Bonnet", "Gants"],
    ["Baskets", "Chaussons", "Bottes", "Sandales", "Tongs"],
    ["Montre", "Horloge", "Réveil", "Sablier", "Chronomètre"],
    ["Bougie", "Lampe", "Lanterne", "Torche", "Phare"]
  ] },
  { id: "jeuxvideo", name: "Jeux vidéo", groups: [
    ["Mario", "Sonic", "Kirby", "Donkey Kong", "Crash Bandicoot"],
    ["Minecraft", "Fortnite", "Roblox", "Among Us", "Fall Guys"],
    ["Zelda", "Final Fantasy", "Skyrim", "Elden Ring", "The Witcher"],
    ["PlayStation", "Xbox", "Switch", "Game Boy", "Steam Deck"],
    ["FIFA", "Rocket League", "NBA 2K", "Mario Kart", "Gran Turismo"],
    ["Call of Duty", "Valorant", "Overwatch", "Counter-Strike", "Apex Legends"],
    ["League of Legends", "Dota", "Clash Royale", "Brawl Stars", "Clash of Clans"],
    ["Pikachu", "Dracaufeu", "Évoli", "Mewtwo", "Ronflex"],
    ["Tetris", "Pac-Man", "Candy Crush", "Snake", "Space Invaders"],
    ["GTA", "Red Dead Redemption", "Cyberpunk", "Assassin's Creed", "Watch Dogs"]
  ] },
  { id: "manga", name: "Manga et animé", groups: [
    ["Naruto", "One Piece", "Dragon Ball", "Bleach", "Hunter x Hunter"],
    ["Luffy", "Goku", "Ichigo", "Gon", "Deku"],
    ["Sasuke", "Vegeta", "Zoro", "Kirua", "Bakugo"],
    ["L'Attaque des Titans", "Demon Slayer", "Jujutsu Kaisen", "Chainsaw Man", "Tokyo Ghoul"],
    ["Death Note", "Code Geass", "Fullmetal Alchemist", "Steins;Gate", "Monster"],
    ["Totoro", "Chihiro", "Mononoké", "Ponyo", "Kiki"],
    ["Sharingan", "Kamehameha", "Bankai", "Haki", "Nen"],
    ["Hokage", "Shinigami", "Super Saiyan", "Alchimiste", "Titan"],
    ["Pokémon", "Digimon", "Yu-Gi-Oh!", "Beyblade", "Inazuma Eleven"],
    ["Haikyu", "Captain Tsubasa", "Slam Dunk", "Blue Lock", "Kuroko's Basket"]
  ] }
];

export const GROUPS = CATEGORIES.flatMap((category) => category.groups);
