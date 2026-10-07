# Graph Report - Zolex-game  (2026-10-07)

## Corpus Check
- Corpus is ~22,435 words - fits in a single context window. You may not need a graph.

## Summary
- 267 nodes · 840 edges · 8 communities
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Firebase & salons
- Vues de jeu & lobbies
- Loup-Garou : vue et votes
- Dessin : logique des tours
- Undercover : logique & mots
- Accueil, registre & identité
- Loup-Garou : logique de nuit
- Boucle de partie (play.js)

## God Nodes (most connected - your core abstractions)
1. `h()` - 84 edges
2. `icon()` - 23 edges
3. `busy()` - 18 edges
4. `nameOf()` - 14 edges
5. `drawPanel()` - 13 edges
6. `nightPath()` - 13 edges
7. `choose()` - 13 edges
8. `createPlay()` - 13 edges
9. `action()` - 12 edges
10. `pawn()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `app` --references--> `#app mount point`  [INFERRED]
  js/main.js → index.html
- `La Table de Zolex — jeux de société en ligne entre amis` --conceptually_related_to--> `games`  [INFERRED]
  index.html → js/registry.js
- `Pion rouge brique marqué d'un Z sur tapis de feutrine` --conceptually_related_to--> `La Table de Zolex — jeux de société en ligne entre amis`  [INFERRED]
  favicon.svg → index.html
- `nightPanel()` --calls--> `h()`  [EXTRACTED]
  js/games/loupgarou/view.js → js/ui/dom.js
- `scoreboard()` --calls--> `drawerOf()`  [EXTRACTED]
  js/games/dessin/view.js → js/games/dessin/logic.js

## Import Cycles
- None detected.

## Communities (8 total, 0 thin omitted)

### Community 0 - "Firebase & salons"
Cohesion: 0.11
Nodes (32): firebaseConfig, db, initFirebase(), isConfigured(), uid, boot(), enter(), explain() (+24 more)

### Community 1 - "Vues de jeu & lobbies"
Cohesion: 0.14
Nodes (38): lobbyView(), scoreboard(), view(), table(), lobbyView(), forceClose(), goVote(), skipGuess() (+30 more)

### Community 2 - "Loup-Garou : vue et votes"
Cohesion: 0.14
Nodes (41): announce(), forceClose(), neighbours(), openVote(), skipHunter(), action(), choose(), crowPanel() (+33 more)

### Community 3 - "Dessin : logique des tours"
Cohesion: 0.11
Nodes (36): closeTurn(), drawerOf(), hostTick(), nextTurn(), norm(), rand(), shuffle(), skipTurn() (+28 more)

### Community 4 - "Undercover : logique & mots"
Cohesion: 0.12
Nodes (30): start(), checkSettings(), civils(), eliminate(), finish(), giveClue(), hostTick(), nextRound() (+22 more)

### Community 5 - "Accueil, registre & identité"
Cohesion: 0.13
Nodes (19): Pion rouge brique marqué d'un Z sur tapis de feutrine, index.html (La Table de Zolex), #app mount point, La Table de Zolex — jeux de société en ligne entre amis, app, games, upcoming, avatarNode() (+11 more)

### Community 6 - "Loup-Garou : logique de nuit"
Cohesion: 0.17
Nodes (22): lobbyView(), afterDeaths(), ask(), cardsOf(), checkSettings(), dig(), fallNight(), FILTERS (+14 more)

### Community 7 - "Boucle de partie (play.js)"
Cohesion: 0.40
Nodes (11): createPlay(), context(), listen(), refresh(), sync(), tick(), unwatchAll(), watch() (+3 more)

## Knowledge Gaps
- **22 isolated node(s):** `COLORS`, `SIZES`, `ui`, `canvas`, `pen` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 29 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `h()` connect `Vues de jeu & lobbies` to `Firebase & salons`, `Loup-Garou : vue et votes`, `Dessin : logique des tours`, `Undercover : logique & mots`, `Accueil, registre & identité`, `Loup-Garou : logique de nuit`, `Boucle de partie (play.js)`?**
  _High betweenness centrality (0.448) - this node is a cross-community bridge._
- **What connects `COLORS`, `SIZES`, `ui` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Firebase & salons` be split into smaller, more focused modules?**
  _Cohesion score 0.11193339500462535 - nodes in this community are weakly interconnected._
- **Why does `icon()` connect `Dessin : logique des tours` to `Firebase & salons`, `Vues de jeu & lobbies`, `Loup-Garou : vue et votes`, `Accueil, registre & identité`, `Boucle de partie (play.js)`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `Vues de jeu & lobbies` be split into smaller, more focused modules?**
  _Cohesion score 0.14376321353065538 - nodes in this community are weakly interconnected._
- **Why does `createPlay()` connect `Boucle de partie (play.js)` to `Firebase & salons`, `Vues de jeu & lobbies`, `Dessin : logique des tours`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `Loup-Garou : vue et votes` be split into smaller, more focused modules?**
  _Cohesion score 0.13821138211382114 - nodes in this community are weakly interconnected._