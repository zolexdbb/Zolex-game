import { h, busy } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { games, upcoming, getGame } from "../registry.js";

const PAWN_COLORS = 8;

export function sortedPlayers(room) {
  return Object.entries(room.players || {})
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt || a[0].localeCompare(b[0]))
    .map(([id, p], index) => ({ id, index, ...p }));
}

export function pawn(player, { isHost, isMe } = {}) {
  return h("div", { class: `pawn pawn-${player.index % PAWN_COLORS}${player.online ? "" : " is-away"}` },
    h("div", { class: "pawn-disc" },
      isHost && h("span", { class: "pawn-crown", title: "Hôte de la table" }, icon("crown")),
      h("span", { "aria-hidden": "true" }, player.name.charAt(0).toUpperCase())
    ),
    h("span", { class: "pawn-name" }, player.name, isMe && h("em", null, " (toi)")),
    !player.online && h("span", { class: "pawn-away" }, "absent")
  );
}

export function lobbyView({ code, room, me, onShare, onLeave, onClose, onRemove, onPickGame, onSettings, onStart }) {
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

  return h("main", { class: `mat theme-${game.id}` },
    h("header", { class: "table-head" },
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
          isHost && !p.online && h("button", {
            class: "btn btn-mini", type: "button", onclick: () => onRemove(p.id)
          }, "Retirer")
        ))
      )
    ),

    h("section", { class: "sheet" },
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
      game.lobbyView?.({ settings, playerCount: present, isHost, setSettings: onSettings }),
      isHost
        ? [startBtn, blocker && h("p", { class: "rule" }, blocker)]
        : h("p", { class: "rule" }, `${host?.name || "L'hôte"} tient la boîte : la partie commence quand il distribue les cartes.`)
    ),

    h("footer", { class: "table-foot" },
      h("button", { class: "btn btn-cream", type: "button", onclick: onLeave }, icon("leave"), "Quitter la table"),
      isHost && h("button", { class: "btn btn-cream", type: "button", onclick: onClose }, icon("box"), "Ranger la table")
    )
  );
}
