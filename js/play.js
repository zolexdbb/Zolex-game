// Moteur de partie commun à tous les jeux : abonnements privés du joueur,
// boucle de l'hôte, et contexte passé aux modules de jeu.
import { db, uid, ref, get, set, update, onValue, serverTimestamp, runTransaction } from "./firebase.js";
import { sortedPlayers } from "./room.js";
import { getGame } from "./registry.js";
import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { soundControl, ambience } from "./ui/sound.js";

// Heure du serveur, pour que les comptes à rebours soient les mêmes chez tous.
let clockOffset = 0;
let clockWatched = false;
const serverNow = () => Date.now() + clockOffset;
// Le tiroir de discussion : ouvert ou non, et le dernier message vu (gardés d'un affichage à l'autre).
const dock = { code: null, open: false, seen: "" };
// Assez de place à droite du tapis pour y laisser la discussion ouverte (voir .chat-dock).
const wide = matchMedia("(min-width: 1560px)");

// `carry` : ce qui passe d'une donne à la suivante (le score d'une série de parties).
// Renvoie false, sans rien écrire, si la table ne permet plus de jouer.
export async function startGame(code, room, carry = null) {
  const game = getGame(room.meta.gameId);
  const players = sortedPlayers(room).filter((p) => p.online);
  const settings = { ...game.defaultSettings, ...room.meta.settings };
  if (carry && (players.length < game.minPlayers || game.checkSettings?.(settings, players.length))) return false;
  // La donne n'existe que le temps de cette fonction : elle part dans des
  // enveloppes que l'hôte ne peut plus relire.
  const deal = game.start({ players, settings, now: serverNow() });
  const g = "g" + Date.now().toString(36);
  await update(ref(db), {
    [`secrets/${code}/${g}`]: deal.secrets,
    [`vault/${code}/${g}`]: deal.vault,
    [`rooms/${code}/state`]: { ...deal.state, ...carry, g, step: "0" },
    [`rooms/${code}/meta/status`]: "playing",
    [`rooms/${code}/meta/touchedAt`]: serverTimestamp()
  });
  return true;
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
      // Nouvelle donne dans la même partie, en gardant `carry` dans l'état.
      redeal: (carry) => startGame(code, room, carry),
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

  // La discussion du jeu, rangée dans un tiroir sur la droite : ouvert d'office sur un grand écran
  // (dans la marge à côté du tapis), sinon derrière une languette. Un point signale un message non lu.
  function chatDock(talk) {
    const last = Object.keys(room.talk?.table || {}).sort().at(-1) || "";
    if (dock.code !== code) Object.assign(dock, { code, seen: last, open: false });
    if (dock.open || wide.matches) dock.seen = last;
    const news = last > dock.seen;
    return h("aside", { class: `chat-dock${dock.open ? " is-open" : ""}` },
      h("button", {
        class: `chat-tab${news ? " has-news" : ""}`, type: "button", "aria-expanded": String(dock.open),
        "aria-label": dock.open ? "Fermer la discussion" : "Ouvrir la discussion",
        onclick: () => { dock.open = !dock.open; refresh(); }
      }, dock.open ? "›" : "‹", h("span", null, "Chat")),
      talk);
  }

  function refresh() {
    if (!room) return;
    if (isHost() && actions) tick();
    const game = getGame(room.meta.gameId);
    const ctx = context();
    const main = h("main", { class: `mat theme-${game.id}` },
      game.view(ctx),
      h("footer", { class: "table-foot" },
        h("button", { class: "btn btn-cream", type: "button", onclick: () => onLeave(room) }, icon("leave"), "Quitter la table"),
        ctx.isHost && room.state.phase !== "end" && h("button", {
          class: "btn btn-cream", type: "button",
          onclick: () => confirm("Arrêter la partie et revenir au salon ?") && ctx.backToLobby()
        }, icon("box"), "Arrêter la partie")
      ),
      soundControl()
    );
    const talk = main.querySelector(".sheet.talk");
    if (talk) {
      // Le bloc qui ne contenait que la discussion (fin de partie, colonne latérale) part avec elle.
      const home = talk.parentElement;
      main.append(chatDock(talk));
      if (home !== main && !home.children.length) home.remove();
    }
    show(main);
  }

  return {
    update(next) { room = next; sync(); refresh(); },
    stop() { stopSecret?.(); stopActions?.(); stopMySealed?.(); stopSealed?.(); unwatchAll(); clearTimeout(timer); ambience(null); room = null; }
  };
}
