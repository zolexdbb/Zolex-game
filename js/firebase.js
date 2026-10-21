import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export {
  ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export let db = null;
export let uid = null;

export function isConfigured() {
  const c = firebaseConfig || {};
  return ["apiKey", "databaseURL", "projectId"].every(
    (k) => typeof c[k] === "string" && c[k] && !/VOTRE|YOUR|XXXX/i.test(c[k])
  );
}

// Le joueur est gardé sur cet appareil : fermer l'onglet, couper le réseau ou
// relancer le navigateur rend la même place à la table. Pour jouer à plusieurs
// sur un même ordinateur, chacun prend une fenêtre privée ou un autre navigateur.
export async function initFirebase() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  const user = await new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
  });
  uid = (user || (await signInAnonymously(auth)).user).uid;
  db = getDatabase(app);
  return uid;
}
