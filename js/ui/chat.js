// Discussion écrite de la table, pour les tables qui ne sont pas en vocal.
// Un seul fil à l'écran, mais plusieurs canaux possibles : chaque message porte
// l'étiquette de son canal, et c'est la base qui décide qui peut lire lequel.
// Le canal de la table vit dans rooms/{code}/talk/table : le même du salon à la
// partie et d'un jeu à l'autre, son historique suit la table tant qu'elle existe.
import { h, busy } from "./dom.js";
import { token } from "./widgets.js";
import { play } from "./sound.js";

const draft = { text: "", channel: null }; // saisie en cours et canal choisi
let heard = { code: null, key: "" }; // dernier message déjà signalé par un son

// Le canal de toute la table. `write` : le joueur peut-il y écrire maintenant ?
export const tableChannel = (ctx, write = true) => ({
  id: "table", messages: ctx.room.talk?.table, write,
  send: (key, message) => ctx.tryWrite(`talk/table/${key}`, message)
});

// `ctx` : { code, room, me, tryWrite } (et `state` pendant une partie).
// `channels` : [{ id, tag, hint, messages, send, write }]. Sans lui, un seul
// canal : la discussion de toute la table.
//  - tag : étiquette affichée devant les messages du canal (aucune pour la table) ;
//  - hint : texte du champ quand on écrit dans ce canal ;
//  - write : le joueur peut-il y écrire maintenant ?
// `prefer` : canal proposé par défaut. `note` : explication si rien n'est ouvert.
export function chatBox(ctx, { channels, prefer, note } = {}) {
  const { room, me } = ctx;
  const s = ctx.state || {};
  const list = channels || [tableChannel(ctx)];
  // Le pseudo est gardé dans le message : on sait encore qui parlait après son départ.
  const who = (uid, saved) => ({
    name: room.players?.[uid]?.name || s.names?.[uid]?.name || String(saved || "?").slice(0, 20),
    index: s.names?.[uid]?.pawn ?? 0, avatar: room.players?.[uid]?.avatar
  });

  // Les clés commencent par l'heure d'envoi : les canaux se mêlent dans l'ordre.
  const lines = list.flatMap((channel) => Object.entries(channel.messages || {}).map(([key, message]) => ({ key, channel, ...message })))
    .sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-100);
  // Un message d'un autre joueur vient d'arriver : on le signale (pas l'historique d'une table rejointe).
  const last = lines.at(-1);
  if (heard.code === ctx.code && last && last.key > heard.key && last.uid !== me) play("message");
  heard = { code: ctx.code, key: heard.code === ctx.code && heard.key > (last?.key || "") ? heard.key : last?.key || "" };
  const thread = h("ul", { class: "talk-list", "aria-live": "polite" },
    lines.length ? lines.map((line) => h("li", { class: `from-${line.channel.id}${line.uid === me ? " is-me" : ""}` },
      token(who(line.uid, line.name)),
      h("span", null, line.channel.tag && h("em", { class: "talk-tag" }, line.channel.tag), h("b", null, who(line.uid, line.name).name), " ", line.text)))
      : h("li", { class: "is-empty" }, "Personne n'a encore rien écrit."));
  // Une fois affichée, la liste se cale sur le dernier message.
  queueMicrotask(() => { thread.scrollTop = thread.scrollHeight; });

  const open = list.filter((channel) => channel.write);
  if (!open.length) {
    return h("section", { class: "sheet talk" }, h("h2", null, "Discussion"), thread,
      h("p", { class: "rule" }, note || "Tu ne peux pas écrire pour l'instant."));
  }
  let target = open.find((channel) => channel.id === draft.channel) || open.find((channel) => channel.id === prefer) || open[0];

  const input = h("input", {
    id: "talk", class: "field", type: "text", maxlength: "200", autocomplete: "off",
    placeholder: target.hint || "Écrire à la table", value: draft.text, oninput: () => { draft.text = input.value; }
  });
  const button = h("button", { class: "btn btn-ink", type: "submit" }, "Envoyer");
  const form = h("form", { class: "join" }, input, button);
  form.addEventListener("submit", busy(button, async () => {
    const text = input.value.replace(/\s+/g, " ").trim();
    if (!text) return input.focus();
    draft.text = "";
    input.value = "";
    const name = room.players?.[me]?.name || s.names?.[me]?.name || "";
    await target.send(`${Date.now().toString(36)}${me.slice(0, 4)}`, { uid: me, text, name });
  }));

  // Plusieurs canaux ouverts : le joueur choisit à qui il parle.
  const tabs = open.length > 1 && open.map((channel) => {
    const tab = h("button", { class: "filter-chip", type: "button", "aria-pressed": String(channel === target) }, channel.tag || "La table");
    tab.addEventListener("click", () => {
      target = channel;
      draft.channel = channel.id;
      input.placeholder = channel.hint || "Écrire à la table";
      tabs.forEach((other) => other.setAttribute("aria-pressed", String(other === tab)));
      input.focus();
    });
    return tab;
  });

  return h("section", { class: "sheet talk" }, h("h2", null, "Discussion"), thread,
    tabs && h("div", { class: "filters", role: "group", "aria-label": "À qui écrire" }, tabs),
    form);
}
