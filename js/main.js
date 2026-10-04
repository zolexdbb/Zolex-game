import { h } from "./ui/dom.js";
import { isConfigured, initFirebase, uid } from "./firebase.js";
import {
  createRoom, joinRoom, watchRoom, leaveRoom, closeRoom, removePlayer, updateMeta, sweepOldRooms
} from "./room.js";
import { games } from "./registry.js";
import { homeView, noticeView } from "./views/home.js";
import { lobbyView } from "./views/lobby.js";
import { createPlay, startGame } from "./play.js";

const app = document.getElementById("app");
let stopWatching = null;
let play = null;

// Remplace l'écran en gardant le champ en cours de saisie.
function show(view) {
  const active = document.activeElement;
  const id = active?.id;
  const caret = active?.selectionStart;
  app.replaceChildren(view);
  const again = id && document.getElementById(id);
  if (again) {
    again.focus();
    try { again.setSelectionRange(caret, caret); } catch { /* champ sans curseur */ }
  }
}

function explain(error) {
  const code = String(error?.code || error?.message || "");
  if (/configuration-not-found|admin-restricted|operation-not-allowed/.test(code)) {
    return "La connexion anonyme n'est pas activée : console Firebase > Authentication > Sign-in method > Anonyme.";
  }
  if (/permission[_-]denied/i.test(code)) {
    return "La base refuse l'accès : publie le contenu de database.rules.json dans Realtime Database > Règles.";
  }
  if (/unauthorized-domain/.test(code)) {
    return "Ce domaine n'est pas autorisé : ajoute-le dans Authentication > Paramètres > Domaines autorisés.";
  }
  return error?.message || "Une erreur inattendue est survenue.";
}

function goHome(message, code = "") {
  stopWatching?.();
  stopWatching = null;
  play?.stop();
  play = null;
  sessionStorage.removeItem("room");
  history.replaceState(null, "", location.pathname);
  show(homeView({
    name: localStorage.getItem("name"), code, message,
    onCreate: async (name) => {
      const game = games[0];
      try { await enter(await createRoom(name, game.id, game.defaultSettings), name, true); }
      catch (e) { throw new Error(explain(e)); }
    },
    onJoin: async (roomCode, name) => {
      try { await enter(roomCode, name); } catch (e) { throw new Error(explain(e)); }
    }
  }));
}

async function enter(code, name, alreadySeated = false) {
  if (!alreadySeated) await joinRoom(code, name);
  localStorage.setItem("name", name);
  sessionStorage.setItem("name", name); // par onglet : sert au retour après rafraîchissement
  sessionStorage.setItem("room", code);
  history.replaceState(null, "", `?room=${code}`);

  stopWatching = watchRoom(code, (room) => {
    if (!room?.meta) return goHome("La table a été rangée.");
    if (!room.players?.[uid]) return goHome("Tu n'es plus assis à cette table.");
    if (room.meta.status === "playing" && room.state) {
      play ??= createPlay(code, show, { onLeave: (current) => leaveRoom(code, current).catch((e) => alert(explain(e))) });
      return play.update(room);
    }
    play?.stop();
    play = null;
    render(code, room);
  });
}

function render(code, room) {
  const guard = (action) => action.catch((e) => alert(explain(e)));
  show(lobbyView({
    code, room, me: uid,
    onShare: async () => {
      const url = `${location.origin}${location.pathname}?room=${code}`;
      try { await navigator.clipboard.writeText(url); return true; } catch { return false; }
    },
    onLeave: () => guard(leaveRoom(code, room)),
    onClose: () => confirm("Ranger la table ? Tous les joueurs seront renvoyés à l'accueil.") && guard(closeRoom(code)),
    onRemove: (playerId) => guard(removePlayer(code, playerId)),
    onPickGame: (game) => guard(updateMeta(code, { gameId: game.id, settings: game.defaultSettings })),
    onSettings: (settings) => guard(updateMeta(code, { settings })),
    onStart: () => guard(startGame(code, room))
  }));
}

async function boot() {
  if (!isConfigured()) {
    return show(noticeView("Il manque une pièce",
      h("p", null, "Le site n'est pas encore relié à Firebase."),
      h("p", null, "Ouvre le fichier ", h("code", null, "js/firebase-config.js"),
        " et remplace les valeurs par celles de ton projet (console Firebase > Paramètres du projet > Vos applications). Le README détaille chaque étape.")));
  }
  try {
    await initFirebase();
  } catch (e) {
    return show(noticeView("La boîte reste fermée", h("p", null, explain(e))));
  }

  const wanted = (new URLSearchParams(location.search).get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const seated = sessionStorage.getItem("room");
  const name = sessionStorage.getItem("name");
  sweepOldRooms(seated || wanted);

  // Après un rafraîchissement, on se rassoit à la même table.
  if (seated && name && (!wanted || wanted === seated)) {
    try { return await enter(seated, name); } catch (e) { return goHome(explain(e)); }
  }
  goHome("", wanted);
}

boot();
