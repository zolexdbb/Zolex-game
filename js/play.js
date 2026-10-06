// Moteur de partie commun à tous les jeux : abonnements privés du joueur,
// boucle de l'hôte, et contexte passé aux modules de jeu.
import { db, uid, ref, get, set, update, onValue, serverTimestamp, runTransaction } from "./firebase.js";
import { sortedPlayers } from "./room.js";
import { getGame } from "./registry.js";
import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";

// Heure du serveur, pour que les comptes à rebours soient les mêmes chez tous.
let clockOffset = 0;
let clockWatched = false;
const serverNow = () => Date.now() + clockOffset;

export async function startGame(code, room) {
  const game = getGame(room.meta.gameId);
  const players = sortedPlayers(room).filter((p) => p.online);
  const settings = { ...game.defaultSettings, ...room.meta.settings };
  // La donne n'existe que le temps de cette fonction : elle part dans des
  // enveloppes que l'hôte ne peut plus relire.
  const deal = game.start({ players, settings, now: serverNow() });
  const g = "g" + Date.now().toString(36);
  await update(ref(db), {
    [`secrets/${code}/${g}`]: deal.secrets,
    [`vault/${code}/${g}`]: deal.vault,
    [`rooms/${code}/state`]: { ...deal.state, g, step: "0" },
    [`rooms/${code}/meta/status`]: "playing",
    [`rooms/${code}/meta/touchedAt`]: serverTimestamp()
  });
}

export function createPlay(code, show, { onLeave }) {
  let room = null;
  let secret = null, myAction = null, actions = null, vault = null, mySealed = null, sealed = null;
  let gKey = null, stepKey = null, sealKey = null, vaultFor = null;
  let stopSecret = null, stopActions = null, stopMySealed = null, stopSealed = null;
  let ticking = false, again = false;
  let timer = null;
  const session = {}; // identifie cette partie pour les modules qui gardent un état
  const watches = new Map();

  if (!clockWatched) {
    clockWatched = true;
    onValue(ref(db, ".info/serverTimeOffset"), (snap) => { clockOffset = snap.val() || 0; });
  }

  // Donnée privée propre à un jeu : lue à la demande, tenue à jour, oubliée en fin de partie.
  // `tag` relance l'écoute quand il change : utile si le droit de lecture
  // n'arrive qu'en cours de partie (une écoute refusée ne reprend pas seule).
  function watch(path, tag = "") {
    let entry = watches.get(path);
    if (!entry || entry.tag !== tag) {
      entry?.stop?.();
      entry = { tag, value: entry?.value ?? null, stop: null };
      watches.set(path, entry);
      entry.stop = onValue(ref(db, path), (snap) => { entry.value = snap.val(); refresh(); }, () => {});
    }
    return entry.value;
  }

  // Écoute directe, sans redessiner l'écran à chaque changement (traits d'un dessin).
  const listeners = new Set();
  function listen(path, onChange) {
    const stop = onValue(ref(db, path), (snap) => onChange(snap.val()), () => {});
    listeners.add(stop);
    return () => { stop(); listeners.delete(stop); };
  }

  function unwatchAll() {
    for (const stop of listeners) stop();
    listeners.clear();
    for (const entry of watches.values()) entry.stop?.();
    watches.clear();
  }

  const isHost = () => room.meta.hostUid === uid;

  function context() {
    const state = room.state;
    return {
      code, room, state, me: uid, isHost: isHost(), secret, vault, myAction, actions, mySealed, sealed,
      now: serverNow, watch,
      // Écritures à des chemins absolus (données privées d'un jeu).
      write: (path, value) => set(ref(db, path), value),
      read: (path) => get(ref(db, path)).then((snap) => snap.val(), () => null),
      multi: (changes) => update(ref(db), changes),
      nextStep: () => String(Number(state.step) + 1),
      // Action du joueur pour l'étape en cours : une seule, non modifiable.
      act: (payload) => set(ref(db, `actions/${code}/${state.g}/${state.step}/${uid}`), payload),
      // Action sous enveloppe (un vote) : l'hôte voit qu'elle est déposée, mais
      // ne peut la lire qu'après avoir clos l'étape, ce qui est irréversible.
      seal: (payload) => update(ref(db), {
        [`sealed/${code}/${state.g}/${state.step}/${uid}`]: payload,
        [`rooms/${code}/done/${state.g}/${state.step}/${uid}`]: true
      }),
      // Écritures dans rooms/{code} (chemins relatifs).
      patch: (changes) => update(ref(db, `rooms/${code}`), changes),
      tryWrite: (path, value) => set(ref(db, `rooms/${code}/${path}`), value).then(() => true, () => false),
      // Comme tryWrite, mais rien n'apparaît à l'écran tant que la base n'a pas accepté.
      claim: (path, value) => runTransaction(ref(db, `rooms/${code}/${path}`), () => value, { applyLocally: false })
        .then((result) => result.committed, () => false),
      listen, session, refresh,
      backToLobby: () => update(ref(db, `rooms/${code}/meta`), { status: "lobby", touchedAt: serverTimestamp() })
    };
  }

  function sync() {
    const { g, step } = room.state;
    if (g !== gKey) {
      gKey = g;
      stopSecret?.();
      unwatchAll();
      secret = null; vault = null; vaultFor = null;
      stopSecret = onValue(ref(db, `secrets/${code}/${g}/${uid}`), (snap) => { secret = snap.val(); refresh(); }, () => {});
    }
    const key = `${g}/${step}/${isHost()}`;
    if (key !== stepKey) {
      stepKey = key;
      stopActions?.();
      stopMySealed?.();
      myAction = null; actions = null; mySealed = null;
      stopMySealed = onValue(ref(db, `sealed/${code}/${g}/${step}/${uid}`), (snap) => { mySealed = snap.val(); refresh(); }, () => {});
      const base = `actions/${code}/${g}/${step}`;
      stopActions = isHost()
        ? onValue(ref(db, base), (snap) => { actions = snap.val() || {}; myAction = actions[uid] || null; refresh(); }, () => {})
        : onValue(ref(db, `${base}/${uid}`), (snap) => { myAction = snap.val(); refresh(); }, () => {});
    }
    const open = `${key}/${!!room.closed?.[g]?.[step]}`;
    if (open !== sealKey) {
      sealKey = open;
      stopSealed?.();
      sealed = null;
      stopSealed = isHost() && room.closed?.[g]?.[step]
        ? onValue(ref(db, `sealed/${code}/${g}/${step}`), (snap) => { sealed = snap.val() || {}; refresh(); }, () => {})
        : null;
    }
    // Les phases chronométrées (state.until) réveillent l'hôte à l'échéance.
    clearTimeout(timer);
    const wait = room.state.until - serverNow();
    if (wait > 0) timer = setTimeout(refresh, wait + 50);
    if (room.ended?.[g] && vaultFor !== g) {
      vaultFor = g;
      get(ref(db, `vault/${code}/${g}`)).then((snap) => { vault = snap.val(); refresh(); }, () => { vaultFor = null; });
    }
  }

  async function tick() {
    if (ticking) { again = true; return; }
    ticking = true;
    try {
      await getGame(room.meta.gameId).hostTick?.(context());
    } catch (e) {
      console.error(e);
    } finally {
      ticking = false;
      if (again) { again = false; if (room && isHost()) tick(); }
    }
  }

  function refresh() {
    if (!room) return;
    if (isHost() && actions) tick();
    const game = getGame(room.meta.gameId);
    const ctx = context();
    show(h("main", { class: `mat theme-${game.id}` },
      game.view(ctx),
      h("footer", { class: "table-foot" },
        h("button", { class: "btn btn-cream", type: "button", onclick: () => onLeave(room) }, icon("leave"), "Quitter la table"),
        ctx.isHost && room.state.phase !== "end" && h("button", {
          class: "btn btn-cream", type: "button",
          onclick: () => confirm("Arrêter la partie et revenir au salon ?") && ctx.backToLobby()
        }, icon("box"), "Arrêter la partie")
      )
    ));
  }

  return {
    update(next) { room = next; sync(); refresh(); },
    stop() { stopSecret?.(); stopActions?.(); stopMySealed?.(); stopSealed?.(); unwatchAll(); clearTimeout(timer); room = null; }
  };
}
