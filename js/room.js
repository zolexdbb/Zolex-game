import { db, uid, ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp } from "./firebase.js";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I ni O, trop faciles à confondre
const CLAIM_DELAY = 4000; // laisse à l'hôte le temps d'un rafraîchissement
const TOUCH_EVERY = 10 * 60 * 1000;
const VISITED_KEY = "tables";

const roomRef = (code, path = "") => ref(db, `rooms/${code}${path && "/" + path}`);

function randomCode() {
  const n = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(n, (x) => LETTERS[x % LETTERS.length]).join("");
}

export function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 20);
}

function remember(code) {
  const list = visited().filter((c) => c !== code);
  list.push(code);
  localStorage.setItem(VISITED_KEY, JSON.stringify(list.slice(-20)));
}

function visited() {
  try { return JSON.parse(localStorage.getItem(VISITED_KEY)) || []; } catch { return []; }
}

export async function createRoom(name, gameId, settings) {
  for (let i = 0; i < 6; i++) {
    const code = randomCode();
    if ((await get(roomRef(code, "meta"))).exists()) continue;
    await update(ref(db), {
      [`rooms/${code}/meta`]: {
        hostUid: uid, gameId, status: "lobby", settings,
        createdAt: serverTimestamp(), touchedAt: serverTimestamp()
      },
      [`rooms/${code}/players/${uid}`]: { name: cleanName(name), joinedAt: serverTimestamp(), online: true }
    });
    remember(code);
    return code;
  }
  throw new Error("Aucun code de table libre, réessaie.");
}

export async function joinRoom(code, name) {
  if (!(await get(roomRef(code, "meta"))).exists()) {
    throw new Error(`Aucune table ne porte le code ${code}.`);
  }
  const mine = roomRef(code, `players/${uid}`);
  const patch = { name: cleanName(name), online: true };
  if (!(await get(mine)).exists()) patch.joinedAt = serverTimestamp();
  await update(mine, patch);
  remember(code);
}

// Le premier joueur connecté arrivé à la table (hors `except`).
export function nextHost(room, except) {
  return Object.entries(room.players || {})
    .filter(([id, p]) => p.online && id !== except)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

// S'abonne à la table : présence, relève de l'hôte, et rappel à chaque changement.
export function watchRoom(code, onChange) {
  let claimTimer = null;
  let room = null;
  const online = roomRef(code, `players/${uid}/online`);

  const stopPresence = onValue(ref(db, ".info/connected"), async (snap) => {
    if (!snap.val()) return;
    await onDisconnect(online).set(false);
    set(online, true).catch(() => {});
  });

  const stopRoom = onValue(roomRef(code), (snap) => {
    room = snap.val();
    clearTimeout(claimTimer);
    if (room?.meta && !room.players?.[room.meta.hostUid]?.online && nextHost(room) === uid) {
      claimTimer = setTimeout(() => set(roomRef(code, "meta/hostUid"), uid).catch(() => {}), CLAIM_DELAY);
    }
    onChange(room);
  });

  const touch = setInterval(() => {
    if (room?.meta?.hostUid === uid) set(roomRef(code, "meta/touchedAt"), serverTimestamp()).catch(() => {});
  }, TOUCH_EVERY);

  return () => {
    clearTimeout(claimTimer);
    clearInterval(touch);
    stopPresence();
    stopRoom();
    onDisconnect(online).cancel();
  };
}

// Range la table et tout ce qui s'y rattache (secrets, coffre, actions, enveloppes).
export function closeRoom(code) {
  return update(ref(db), {
    [`rooms/${code}`]: null, [`secrets/${code}`]: null, [`vault/${code}`]: null,
    [`actions/${code}`]: null, [`sealed/${code}`]: null, [`night/${code}`]: null
  });
}

export function sortedPlayers(room) {
  return Object.entries(room.players || {})
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt || a[0].localeCompare(b[0]))
    .map(([id, p], index) => ({ id, index, ...p }));
}

// Quitter : passe la main si on est l'hôte, range la table si plus personne n'est connecté.
export async function leaveRoom(code, room) {
  const next = nextHost(room, uid);
  if (!next) {
    if (room.meta.hostUid !== uid) await set(roomRef(code, "meta/hostUid"), uid);
    return closeRoom(code);
  }
  const patch = { [`players/${uid}`]: null };
  if (room.meta.hostUid === uid) patch["meta/hostUid"] = next;
  return update(roomRef(code), patch);
}

export function removePlayer(code, playerId) {
  return remove(roomRef(code, `players/${playerId}`));
}

export function updateMeta(code, patch) {
  return update(roomRef(code, "meta"), { ...patch, touchedAt: serverTimestamp() });
}

// Range les tables déjà visitées depuis cet appareil et laissées à l'abandon
// (les règles n'autorisent la suppression que si la table est inactive depuis 6 h).
export async function sweepOldRooms(keep) {
  const left = [];
  for (const code of visited()) {
    if (code === keep) { left.push(code); continue; }
    try {
      if (!(await get(roomRef(code, "meta"))).exists()) continue;
      await closeRoom(code);
    } catch {
      left.push(code);
    }
  }
  localStorage.setItem(VISITED_KEY, JSON.stringify(left));
}
