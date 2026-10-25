import { h, busy } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { pawn } from "../ui/widgets.js";
import { profileSheet } from "../ui/profile.js";
import { chatBox } from "../ui/chat.js";
import { soundControl } from "../ui/sound.js";
import { sortedPlayers } from "../room.js";
import { games, upcoming, getGame } from "../registry.js";

// Feuille « Mon profil » ouverte : gardée d'un affichage du salon à l'autre.
const ui = { profile: false };

export function lobbyView({ code, room, me, onShare, onLeave, onClose, onRemove, onProfile, onRedraw, onPickGame, onSettings, onStart, onTalk }) {
  const { meta } = room;
  const players = sortedPlayers(room);
  const isHost = meta.hostUid === me;
  const host = players.find((p) => p.id === meta.hostUid);
  const game = getGame(meta.gameId);
  const settings = { ...game.defaultSettings, ...meta.settings };
  const present = players.filter((p) => p.online).length;

  const shareBtn = h("button", { class: "btn btn-cream", type: "button" }, icon("link"), h("span", null, "Copier l'invitation"));
  shareBtn.addEventListener("click", async () => {
    shareBtn.lastChild.textContent = (await onShare()) ? "Invitation copiée" : "Copie impossible";
    setTimeout(() => { shareBtn.lastChild.textContent = "Copier l'invitation"; }, 2000);
  });

  const blocker =
    present < game.minPlayers ? `Il manque ${game.minPlayers - present} joueur(s) pour ouvrir la boîte.`
    : game.checkSettings?.(settings, present)
    || (!game.start && "Cette boîte est encore sous cellophane : la partie arrive à la prochaine étape.");

  const startBtn = h("button", { class: "btn btn-brick btn-big", type: "button", disabled: !!blocker },
    icon("play"), "Distribuer les cartes");
  startBtn.addEventListener("click", busy(startBtn, onStart));

  return h("main", { class: `mat is-lobby theme-${game.id}` },
    h("div", { class: "col" }, h("header", { class: "table-head" },
      h("p", { class: "eyebrow" }, "Code de la table"),
      h("div", { class: "tiles", "aria-label": `Code ${code}` },
        [...code].map((letter) => h("span", { class: "tile" }, letter))),
      shareBtn
    ),

    h("section", { class: "felt-zone" },
      h("h2", { class: "felt-title" }, `Autour de la table · ${players.length}`),
      h("div", { class: "seats" },
        players.map((p) => h("div", { class: "seat" },
          pawn(p, { isHost: p.id === meta.hostUid, isMe: p.id === me }),
          p.id === me && h("button", {
            class: "btn btn-mini", type: "button", "aria-expanded": String(ui.profile),
            onclick: () => { ui.profile = !ui.profile; onRedraw(); }
          }, "Mon profil"),
          isHost && !p.online && h("button", {
            class: "btn btn-mini", type: "button", onclick: () => onRemove(p.id)
          }, "Retirer")
        ))
      )
    ),
    ui.profile && players.some((p) => p.id === me) && profileSheet({
      player: players.find((p) => p.id === me),
      onSave: onProfile,
      onClose: () => { ui.profile = false; onRedraw(); }
    }),
    // La même discussion qu'en partie : elle suit la table d'un jeu à l'autre.
    chatBox({ code, room, me, tryWrite: onTalk })),

    h("div", { class: "col" }, h("section", { class: "sheet" },
      h("h2", null, "Le jeu du soir"),
      h("div", { class: "shelf" },
        games.map((g) => h("button", {
          class: `gamebox box-${g.id}${g.id === game.id ? " is-picked" : ""}`, type: "button",
          disabled: !isHost, "aria-pressed": String(g.id === game.id), onclick: () => onPickGame(g)
        }, h("strong", null, g.name), h("small", null, g.tagline))),
        upcoming.filter((u) => !games.some((g) => g.id === u.id)).map((u) =>
          h("div", { class: `gamebox box-${u.id} is-sealed` },
            h("strong", null, u.name), h("small", null, u.tagline), h("span", { class: "stamp" }, "Bientôt")))
      ),
      game.lobbyView?.({ settings, playerCount: present, players: players.filter((p) => p.online), isHost, setSettings: onSettings }),
      isHost
        ? [startBtn, blocker && h("p", { class: "rule" }, blocker)]
        : h("p", { class: "rule" }, `${host?.name || "L'hôte"} tient la boîte : la partie commence dès la distribution des cartes.`)
    )),

    h("footer", { class: "table-foot" },
      h("button", { class: "btn btn-cream", type: "button", onclick: onLeave }, icon("leave"), "Quitter la table"),
      isHost && h("button", { class: "btn btn-cream", type: "button", onclick: onClose }, icon("box"), "Ranger la table")
    ),
    soundControl()
  );
}
