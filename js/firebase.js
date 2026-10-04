import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserSessionPersistence, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export {
  ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export let db = null;
export let uid = null;

export function isConfigured() {
  const c = firebaseConfig || {};
  return ["apiKey", "databaseURL", "projectId"].every(
    (k) => typeof c[k] === "string" && c[k] && !/VOTRE|YOUR|XXXX/i.test(c[k])
  );
}

// Session par onglet : chaque onglet est un joueur différent.
export async function initFirebase() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserSessionPersistence);
  const user = await new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
  });
  uid = (user || (await signInAnonymously(auth)).user).uid;
  db = getDatabase(app);
  return uid;
}
