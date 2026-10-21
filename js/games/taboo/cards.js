// Cartes de Taboo : le mot à faire deviner, puis les cinq mots interdits.
// Format : "Mot|interdit|interdit|interdit|interdit|interdit".
const RAW = `
Plage|Sable|Mer|Soleil|Vacances|Serviette
Pizza|Italie|Fromage|Tomate|Four|Pâte
Chat|Miauler|Souris|Animal|Félin|Moustache
Chien|Aboyer|Os|Niche|Animal|Laisse
Football|Ballon|But|Joueur|Équipe|Stade
Noël|Décembre|Sapin|Cadeau|Père|Neige
Anniversaire|Gâteau|Bougie|Âge|Fête|Cadeau
Avion|Voler|Aéroport|Pilote|Ciel|Billet
Train|Gare|Rail|Wagon|Voyage|Conducteur
Vélo|Pédale|Roue|Selle|Guidon|Rouler
Voiture|Rouler|Moteur|Volant|Route|Conduire
Téléphone|Appeler|Portable|Écran|Message|Sonner
Ordinateur|Clavier|Souris|Écran|Internet|Taper
Café|Boire|Tasse|Matin|Noir|Sucre
Chocolat|Cacao|Sucré|Noir|Lait|Tablette
Pomme|Fruit|Rouge|Arbre|Verte|Croquer
Banane|Jaune|Fruit|Singe|Éplucher|Peau
Hiver|Froid|Neige|Saison|Décembre|Manteau
Été|Chaud|Saison|Soleil|Vacances|Juillet
Pluie|Eau|Tomber|Nuage|Parapluie|Mouillé
Neige|Blanc|Froid|Flocon|Hiver|Ski
Soleil|Chaud|Ciel|Jaune|Briller|Étoile
Lune|Nuit|Ciel|Croissant|Astronaute|Pleine
Étoile|Ciel|Nuit|Briller|Filante|Constellation
Docteur|Malade|Hôpital|Soigner|Médecin|Ordonnance
Professeur|École|Élève|Classe|Enseigner|Cours
Pompier|Feu|Camion|Sauver|Échelle|Incendie
Policier|Voleur|Arrêter|Loi|Uniforme|Menottes
Cuisinier|Cuisine|Restaurant|Plat|Chef|Recette
Boulangerie|Pain|Baguette|Croissant|Acheter|Four
Hôpital|Malade|Docteur|Infirmier|Lit|Urgences
École|Élève|Professeur|Classe|Apprendre|Cartable
Cinéma|Film|Écran|Pop-corn|Salle|Acteur
Musique|Écouter|Chanson|Instrument|Note|Concert
Guitare|Cordes|Instrument|Jouer|Musique|Rock
Piano|Touches|Instrument|Noires|Blanches|Jouer
Livre|Lire|Pages|Auteur|Histoire|Bibliothèque
Journal|Lire|Nouvelles|Papier|Article|Kiosque
Télévision|Écran|Regarder|Chaîne|Émission|Télécommande
Lit|Dormir|Chambre|Oreiller|Couette|Matelas
Douche|Eau|Laver|Salle de bain|Savon|Shampoing
Brosse à dents|Dents|Dentifrice|Laver|Matin|Bouche
Miroir|Reflet|Regarder|Verre|Visage|Salle de bain
Fenêtre|Verre|Ouvrir|Vitre|Maison|Rideau
Porte|Ouvrir|Fermer|Clé|Entrer|Poignée
Clé|Serrure|Porte|Ouvrir|Trousseau|Fermer
Montre|Heure|Poignet|Temps|Aiguille|Bracelet
Lunettes|Yeux|Voir|Verres|Nez|Myope
Chaussure|Pied|Lacet|Marcher|Paire|Talon
Chapeau|Tête|Porter|Soleil|Casquette|Bord
Parapluie|Pluie|Ouvrir|Mouillé|Abri|Manche
Sac à dos|Dos|Porter|École|Bretelles|Randonnée
Valise|Voyage|Vêtements|Roulettes|Aéroport|Bagage
Passeport|Voyage|Pays|Frontière|Identité|Tampon
Argent|Payer|Euro|Billet|Banque|Riche
Banque|Argent|Compte|Carte|Conseiller|Prêt
Supermarché|Courses|Caddie|Acheter|Caisse|Rayon
Restaurant|Manger|Serveur|Table|Menu|Chef
Hôtel|Chambre|Dormir|Voyage|Réception|Nuit
Camping|Tente|Vacances|Dormir|Nature|Feu
Montagne|Haut|Sommet|Ski|Neige|Randonnée
Forêt|Arbre|Bois|Animaux|Champignon|Feuilles
Mer|Eau|Plage|Bateau|Sel|Vague
Rivière|Eau|Couler|Pont|Poisson|Fleuve
Île|Mer|Eau|Plage|Entourée|Naufragé
Désert|Sable|Chaud|Chameau|Sahara|Dune
Volcan|Lave|Éruption|Montagne|Feu|Cratère
Arc-en-ciel|Couleurs|Pluie|Soleil|Ciel|Sept
Orage|Éclair|Tonnerre|Pluie|Ciel|Nuage
Feu|Chaud|Brûler|Flamme|Pompier|Bois
Glace|Froid|Cube|Eau|Fondre|Dessert
Bateau|Mer|Naviguer|Voile|Capitaine|Port
Pirate|Bateau|Trésor|Perroquet|Jambe de bois|Capitaine
Château|Roi|Princesse|Tour|Fort|Pont-levis
Roi|Couronne|Reine|Trône|Royaume|Prince
Princesse|Prince|Château|Robe|Conte|Couronne
Dragon|Feu|Cracher|Ailes|Légende|Chevalier
Sorcière|Balai|Chapeau|Magie|Potion|Halloween
Fantôme|Drap|Hanter|Peur|Mort|Château
Vampire|Sang|Dents|Nuit|Dracula|Cercueil
Zombie|Mort|Marcher|Cerveau|Film|Mort-vivant
Robot|Machine|Métal|Intelligence|Futur|Ordinateur
Fusée|Espace|Décoller|Lune|Astronaute|NASA
Astronaute|Espace|Fusée|Lune|Combinaison|Apesanteur
Extraterrestre|Espace|Martien|Vert|Soucoupe|Planète
Dinosaure|Préhistoire|Fossile|Disparu|Énorme|T-Rex
Éléphant|Trompe|Gros|Afrique|Défenses|Gris
Girafe|Cou|Long|Tâches|Afrique|Grande
Lion|Roi|Savane|Crinière|Rugir|Félin
Singe|Banane|Arbre|Grimper|Gorille|Jungle
Serpent|Ramper|Venin|Siffler|Long|Cobra
Requin|Mer|Dents|Aileron|Poisson|Dangereux
Dauphin|Mer|Intelligent|Sauter|Mammifère|Nager
Papillon|Ailes|Chenille|Voler|Couleurs|Insecte
Abeille|Miel|Piquer|Ruche|Insecte|Fleur
Araignée|Toile|Huit|Pattes|Insecte|Peur
Poule|Œuf|Ferme|Coq|Plume|Poussin
Vache|Lait|Ferme|Meuh|Taches|Herbe
Cheval|Galoper|Selle|Équitation|Crinière|Sabot
Lapin|Oreilles|Carotte|Sauter|Terrier|Pâques
Hamburger|Pain|Viande|Fast-food|Steak|Frites
Frites|Pomme de terre|Huile|Ketchup|Friteuse|Belgique
Crêpe|Pâte|Sucre|Bretagne|Poêle|Chandeleur
Gâteau|Anniversaire|Sucre|Four|Bougie|Dessert
Fromage|Lait|Camembert|Vache|France|Croûte
Pain|Boulangerie|Baguette|Farine|Mie|Croûte
Œuf|Poule|Coquille|Jaune|Omelette|Blanc
Lait|Vache|Blanc|Boire|Bouteille|Céréales
Vin|Raisin|Rouge|Bouteille|Verre|Alcool
Bière|Mousse|Boire|Alcool|Bar|Houblon
Champagne|Bulles|Fête|Bouteille|Alcool|Bouchon
Thé|Boire|Chaud|Tasse|Feuilles|Anglais
Sushi|Japon|Riz|Poisson|Cru|Baguettes
Tour Eiffel|Paris|Fer|Monument|France|Haut
Paris|France|Capitale|Tour Eiffel|Ville|Seine
Mariage|Marier|Robe|Bague|Fête|Église
Bébé|Petit|Couche|Pleurer|Naître|Biberon
Grand-mère|Famille|Vieille|Mamie|Parents|Mère
Vacances|Partir|École|Été|Voyage|Repos
Halloween|Citrouille|Bonbons|Déguisement|Peur|Octobre
Pâques|Œufs|Chocolat|Lapin|Cloches|Printemps
Cadeau|Offrir|Paquet|Noël|Anniversaire|Surprise
Ballon|Gonfler|Rond|Jouer|Air|Foot
Jeu vidéo|Console|Manette|Jouer|Écran|Niveau
Échecs|Roi|Reine|Plateau|Pion|Mat
Cartes|Jouer|As|Paquet|Roi|Poker
Puzzle|Pièces|Assembler|Image|Morceaux|Jeu
Dessin|Crayon|Papier|Dessiner|Feutre|Art
Peinture|Pinceau|Couleur|Tableau|Mur|Artiste
Photo|Appareil|Image|Prendre|Souvenir|Selfie
Danse|Danser|Musique|Pas|Bouger|Salsa
Chanteur|Chanter|Voix|Musique|Micro|Concert
Acteur|Film|Jouer|Rôle|Cinéma|Théâtre
Magicien|Magie|Tour|Chapeau|Lapin|Baguette
Clown|Cirque|Nez|Rire|Rouge|Maquillage
Cirque|Clown|Chapiteau|Acrobate|Lion|Spectacle
Plongée|Mer|Masque|Bouteille|Nager|Poissons
Ski|Neige|Montagne|Glisser|Bâtons|Piste
Tennis|Raquette|Balle|Filet|Court|Roland-Garros
Natation|Nager|Piscine|Eau|Brasse|Maillot
Course|Courir|Vite|Marathon|Arrivée|Sport
Jardin|Fleurs|Plantes|Herbe|Arroser|Potager
Fleur|Pétale|Rose|Jardin|Bouquet|Sentir
Arbre|Feuilles|Tronc|Branche|Forêt|Racine
Soirée|Fête|Nuit|Danser|Amis|Musique
Sommeil|Dormir|Rêve|Nuit|Lit|Fatigue
Rêve|Dormir|Nuit|Cauchemar|Imaginer|Sommeil
Amour|Cœur|Aimer|Couple|Bisou|Sentiment
Rire|Drôle|Blague|Sourire|Ha|Humour
Peur|Effrayer|Trembler|Cauchemar|Frisson|Horreur
Secret|Cacher|Dire|Personne|Garder|Confidence
Ami|Copain|Amitié|Pote|Confiance|Meilleur
Selfie|Photo|Téléphone|Soi|Prendre|Réseaux
Internet|Web|Ordinateur|Réseau|Site|Connexion
Wi-Fi|Internet|Connexion|Mot de passe|Réseau|Sans fil
Batterie|Charge|Téléphone|Pile|Énergie|Vide
`;

export const CARDS = RAW.trim().split("\n").map((line) => {
  const [word, ...banned] = line.split("|").map((part) => part.trim());
  return { word, banned };
});
