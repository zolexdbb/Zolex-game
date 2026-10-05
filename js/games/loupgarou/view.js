import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, flipCard, countdown, roundTable } from "../../ui/widgets.js";
import { ROLES, WINNERS, neighbours, openVote, forceClose, skipHunter, announce, fallNight } from "./logic.js";

// État d'affichage propre à cet appareil.
const ui = { g: null, seen: false, dealt: false };

export function roleArt(id) {
  return h("span", { class: `role-art camp-${ROLES[id].camp}` }, icon(ROLES[id].icon));
}

function hostTools(...buttons) {
  return h("div", { class: "host-tools" }, h("span", { class: "eyebrow" }, "Main de l'hôte"), buttons);
}

function action(label, iconName, run, cls = "btn-cream") {
  const button = h("button", { class: `btn ${cls}`, type: "button" }, iconName && icon(iconName), label);
  button.addEventListener("click", busy(button, run));
  return button;
}

const nameOf = (s, id) => s.names[id]?.name || "?";
const names = (s, ids) => ids.map((id) => nameOf(s, id)).join(", ");
const nightPath = (ctx, rest) => `night/${ctx.code}/${ctx.state.g}/${rest}`;

function choices(ids, s, onPick, label = (id) => nameOf(s, id)) {
  return h("div", { class: "vote-list" }, ids.map((id) => action(label(id), null, () => onPick(id), "btn-ink")));
}

// Les amoureux n'apprennent leur lien qu'une fois Cupidon passé : on relance
// l'écoute à chaque phase.
function lover(ctx) {
  const { state: s, me } = ctx;
  if (!s.has?.cupidon) return null;
  const pair = ctx.watch(nightPath(ctx, "cupid/pair"), `${s.phase}/${s.night}`);
  if (!pair || (pair.a !== me && pair.b !== me)) return null;
  return pair.a === me ? pair.b : pair.a;
}

const seenKey = (g) => `lg-seen-${g}`;

// La carte de rôle, en grand et au premier plan : au début de la partie, puis
// à la demande en touchant le rappel dans le coin de l'écran.
function roleIntro(secret, animate) {
  const role = ROLES[secret.role];
  const close = h("button", { class: "btn btn-brick btn-big", type: "button" }, "C'est noté");
  const overlay = h("div", { class: "role-intro", role: "dialog", "aria-label": "Ta carte de rôle" },
    flipCard({
      open: true, deal: animate, cls: `role-${secret.role}`,
      back: h("span", { class: "role-art" }, icon("moon")),
      front: [h("small", null, "Tu es"), roleArt(secret.role), h("strong", null, role.name), h("small", null, role.text)]
    }),
    h("p", { class: "rule" }, "Regarde ta carte à l'abri des regards, puis range-la."),
    close);
  close.addEventListener("click", () => {
    ui.seen = true;
    try { sessionStorage.setItem(seenKey(ui.g), "1"); } catch { /* stockage indisponible */ }
    overlay.remove();
  });
  return overlay;
}

function myCard(ctx) {
  const { state: s, secret } = ctx;
  const beloved = lover(ctx);
  const badge = h("button", { class: "role-badge", type: "button", title: "Revoir ta carte" },
    roleArt(secret.role), h("span", null, ROLES[secret.role].name));
  badge.addEventListener("click", () => {
    if (!document.querySelector(".role-intro")) badge.after(roleIntro(secret, false));
  });
  const first = !ui.seen && !ui.dealt;
  ui.dealt = true;
  return [
    badge,
    !ui.seen && roleIntro(secret, first),
    beloved && h("p", { class: "love-note" }, icon("heart"), " Tu es amoureux de ", h("b", null, nameOf(s, beloved)),
      " : si l'un de vous meurt, l'autre le suit.")
  ];
}

function table(ctx) {
  const { state: s, room, me, secret } = ctx;
  const dark = s.phase === "night" || s.phase === "dawn";
  const done = s.phase === "vote" ? room.done?.[s.g]?.[s.step] || {} : {};
  const seats = s.order.map((id) => {
    const seated = room.players?.[id];
    const out = !s.alive?.[id];
    const role = (out || id === s.idiot) && room.reveals?.[s.g]?.[id];
    const bond = secret?.pack?.[id] && id !== me ? (secret.role === "loup" ? "meute" : "frère") : null;
    return pawn(
      { name: s.names[id].name, index: s.names[id].pawn, online: !!seated?.online },
      {
        isHost: id === room.meta.hostUid, isMe: id === me, out, done: done[id],
        note: role ? ROLES[role].name : out ? "mort" : !seated ? "parti" : id === s.crow ? "corbeau +2" : bond
      }
    );
  });
  return roundTable(seats, [
    h("span", { class: "sky" }, icon(dark ? "moon" : "sun")),
    h("strong", null, s.phase === "end" ? "Fin" : dark ? `Nuit ${s.nightNo}` : `Jour ${s.nightNo}`),
    s.phase === "night" && countdown(s.until, ctx.now)
  ]);
}

// ---- Nuit : une action privée par rôle ----

function wolfPanel(ctx) {
  const { state: s, me, secret } = ctx;
  const den = nightPath(ctx, `den/${s.night}`);
  const victim = ctx.watch(`${den}/victim`);
  const props = ctx.watch(`${den}/props`) || {};
  if (victim) return h("p", null, "La meute a tranché : elle attaque ", h("b", null, nameOf(s, victim)), ".");
  if (s.sub !== "wolves") return h("p", { class: "rule" }, "La meute rentre bredouille : il fallait se décider plus vite.");
  const prey = s.order.filter((id) => s.alive[id] && !secret.pack?.[id]);
  const fans = (id) => Object.keys(props).filter((w) => props[w] === id).map((w) => nameOf(s, w));
  return [
    h("p", null, h("b", null, "Choisis une proie."), " Tes propositions sont visibles de la meute ; le premier loup qui confirme scelle le choix."),
    choices(prey, s, (id) => ctx.multi({ [`${den}/props/${me}`]: id, [`${den}/peek/${id}`]: true }),
      (id) => (fans(id).length ? `${nameOf(s, id)} (${fans(id).join(", ")})` : nameOf(s, id))),
    props[me] && action(`Dévorer ${nameOf(s, props[me])}`, "paw", () => ctx.write(`${den}/victim`, props[me]), "btn-brick")
  ];
}

function seerPanel(ctx) {
  const { state: s, me } = ctx;
  const base = nightPath(ctx, "seer");
  const picks = ctx.watch(`${base}/picks`) || {};
  if (Object.values(picks).includes(s.night)) return h("p", { class: "rule" }, "Ta vision de la nuit est notée dans ton carnet.");
  const targets = s.order.filter((id) => s.alive[id] && id !== me && !picks[id]);
  return [
    h("p", null, h("b", null, "Dans ta boule de cristal :"), " de qui veux-tu connaître le rôle ?"),
    choices(targets, s, (id) => ctx.multi({ [`${base}/nights/${s.night}`]: id, [`${base}/picks/${id}`]: s.night }))
  ];
}

function guardPanel(ctx) {
  const { state: s } = ctx;
  const guard = ctx.watch(nightPath(ctx, "guard")) || {};
  if (guard[s.night]) return h("p", { class: "rule" }, "Cette nuit, tu veilles sur ", h("b", null, nameOf(s, guard[s.night])), ".");
  const before = guard[`n${s.nightNo - 1}`];
  return [
    h("p", null, h("b", null, "Qui protèges-tu cette nuit ?"), " Tu peux te choisir, mais jamais la même personne deux nuits de suite."),
    choices(s.order.filter((id) => s.alive[id] && id !== before), s, (id) => ctx.write(nightPath(ctx, `guard/${s.night}`), id))
  ];
}

function crowPanel(ctx) {
  const { state: s, me } = ctx;
  const path = nightPath(ctx, `crow/${s.night}`);
  const marked = ctx.watch(path);
  if (marked) return h("p", { class: "rule" }, "Tu as posé ta plume chez ", h("b", null, nameOf(s, marked)), " : deux voix pèseront contre lui.");
  return [
    h("p", null, h("b", null, "Qui soupçonnes-tu ?"), " Le joueur désigné partira avec deux voix contre lui. Tu peux aussi ne rien faire."),
    choices(s.order.filter((id) => s.alive[id] && id !== me), s, (id) => ctx.write(path, id))
  ];
}

function foxPanel(ctx) {
  const { state: s } = ctx;
  const base = nightPath(ctx, "fox");
  const fox = ctx.watch(base) || {};
  if (Object.values(fox.answers || {}).includes(false)) return h("p", { class: "rule" }, "Tu as flairé un groupe sans loup : ton flair est perdu.");
  if (fox.nights?.[s.night]) return h("p", { class: "rule" }, "Ta piste de la nuit est notée dans ton carnet.");
  return [
    h("p", null, h("b", null, "Flaire un joueur et ses deux voisins de table."), " Tu sauras si au moins un loup se cache parmi eux."),
    choices(s.order.filter((id) => s.alive[id]), s, async (id) => {
      const [a, c] = neighbours(s, id);
      await ctx.write(`${base}/nights/${s.night}`, { a, b: id, c });
      // La base n'accepte que la vraie réponse.
      try { await ctx.write(`${base}/answers/${s.night}`, true); } catch { await ctx.write(`${base}/answers/${s.night}`, false); }
    })
  ];
}

function cupidPanel(ctx) {
  const { state: s } = ctx;
  const path = nightPath(ctx, "cupid/pair");
  const pair = ctx.watch(path);
  if (pair) return h("p", { class: "rule" }, "Ta flèche a uni ", h("b", null, nameOf(s, pair.a)), " et ", h("b", null, nameOf(s, pair.b)), ".");
  if (s.night !== "n1") return h("p", { class: "rule" }, "Tu n'as uni personne : ton carquois reste plein.");
  const chosen = new Set();
  const confirm = action("Unir ces deux joueurs", "heart", () => {
    const [a, b] = [...chosen];
    return ctx.write(path, { a, b });
  }, "btn-brick");
  confirm.disabled = true;
  const buttons = s.order.map((id) => {
    const button = h("button", { class: "btn btn-ink", type: "button", "aria-pressed": "false" }, nameOf(s, id));
    button.addEventListener("click", () => {
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size < 2) chosen.add(id);
      button.setAttribute("aria-pressed", String(chosen.has(id)));
      confirm.disabled = chosen.size !== 2;
    });
    return button;
  });
  return [
    h("p", null, h("b", null, "Choisis deux amoureux."), " Tu peux te désigner. Si l'un meurt, l'autre meurt de chagrin."),
    h("div", { class: "vote-list" }, buttons),
    confirm
  ];
}

function girlPanel(ctx) {
  const { state: s } = ctx;
  const peek = Object.keys(ctx.watch(nightPath(ctx, `den/${s.night}/peek`)) || {});
  return h("p", null, h("b", null, "Tu entrouvres les yeux."), peek.length
    ? [" Les loups se tournent vers : ", h("b", null, names(s, peek)), "."]
    : " Rien ne bouge encore dans l'ombre.");
}

function witchPanel(ctx) {
  const { state: s, me } = ctx;
  const base = nightPath(ctx, "witch");
  const victim = ctx.watch(nightPath(ctx, `den/${s.night}/victim`));
  const potions = ctx.watch(base) || {};
  const healed = potions.heal === s.night;
  const poisoned = potions.poison?.n === s.night ? potions.poison.target : null;
  return [
    h("p", null, victim
      ? ["Les loups ont attaqué ", h("b", null, nameOf(s, victim)), "."]
      : "Les loups n'ont attaqué personne cette nuit."),
    healed ? h("p", { class: "rule" }, "Ta potion de vie le sauvera au lever du jour.")
      : victim && !potions.heal ? action("Utiliser la potion de vie", "flask", () => ctx.write(`${base}/heal`, s.night))
      : potions.heal && h("p", { class: "rule" }, "Ta potion de vie est déjà utilisée."),
    poisoned ? h("p", { class: "rule" }, "Ta potion de mort emportera ", h("b", null, nameOf(s, poisoned)), ".")
      : potions.poison ? h("p", { class: "rule" }, "Ta potion de mort est déjà utilisée.")
      : h("details", { class: "poison" },
        h("summary", null, "Utiliser la potion de mort"),
        choices(s.order.filter((id) => s.alive[id] && id !== me), s,
          (id) => ctx.write(`${base}/poison`, { n: s.night, target: id })))
  ];
}

const FIRST_WATCH = { loup: wolfPanel, voyante: seerPanel, salvateur: guardPanel, corbeau: crowPanel, renard: foxPanel, cupidon: cupidPanel, petitefille: girlPanel };

function nightPanel(ctx) {
  const { state: s, me, secret } = ctx;
  const role = s.alive?.[me] && secret?.role;
  const panel = s.sub === "witch" ? (role === "sorciere" ? witchPanel : role === "loup" ? wolfPanel : null) : FIRST_WATCH[role];
  return [
    h("h2", null, s.sub === "wolves" ? "Les loups rôdent" : "La sorcière veille"),
    h("p", null, s.sub === "wolves"
      ? "Le village s'endort. Les loups cherchent une proie, et chacun use de son pouvoir en secret."
      : "Les loups se rendorment. La sorcière se penche sur ses fioles."),
    panel ? panel(ctx) : h("p", { class: "rule" }, role ? "Tu dors à poings fermés." : "Tu observes la nuit en silence.")
  ];
}

// Ce que le joueur a appris en secret (voyante, renard).
function notebook(ctx) {
  const { state: s, secret } = ctx;
  let lines = [];
  if (secret?.role === "voyante") {
    const picks = ctx.watch(nightPath(ctx, "seer/picks")) || {};
    lines = Object.keys(picks).sort((a, b) => picks[a].slice(1) - picks[b].slice(1)).map((id) => {
      const role = ctx.watch(`vault/${ctx.code}/${s.g}/roles/${id}`);
      return h("li", null, nameOf(s, id), " : ", h("b", null, role ? ROLES[role].name : "…"));
    });
  } else if (secret?.role === "renard") {
    const fox = ctx.watch(nightPath(ctx, "fox")) || {};
    lines = Object.keys(fox.nights || {}).sort((a, b) => a.slice(1) - b.slice(1)).map((n) => {
      const group = fox.nights[n];
      const answer = fox.answers?.[n];
      return h("li", null, names(s, [...new Set([group.a, group.b, group.c])]), " : ",
        h("b", null, answer == null ? "…" : answer ? "au moins un loup" : "aucun loup"));
    });
  } else {
    return null;
  }
  return h("section", { class: "sheet notebook" }, h("h2", null, "Ton carnet"),
    lines.length ? h("ul", { class: "ballots" }, lines) : h("p", { class: "rule" }, "Rien encore : attends la nuit."));
}

// ---- Jour ----

function obituary({ state: s, room }) {
  const news = s.news || {};
  const grief = [...(news.grief || []), ...(news.shotGrief || [])];
  const line = (id, verb) => {
    const role = room.reveals?.[s.g]?.[id];
    return h("li", null, h("b", null, nameOf(s, id)), ` ${grief.includes(id) ? "meurt de chagrin" : verb}`,
      role && [" : c'était ", h("b", null, ROLES[role].name)], ".");
  };
  const dead = news.dead || [];
  return [
    !dead.length && !news.spared && h("p", null, news.kind === "night" ? "Miracle : personne n'est mort cette nuit."
      : news.tie ? "Égalité des voix : le village n'a condamné personne." : "Personne n'a été désigné."),
    news.spared && h("p", null, "Le village condamne ", h("b", null, nameOf(s, news.spared)),
      "… et découvre l'Idiot du Village. Il est épargné, mais ne votera plus."),
    (dead.length || news.shot) && h("ul", { class: "roles-list obituary" },
      dead.map((id) => line(id, news.kind === "night" ? "est mort cette nuit" : "est condamné par le village")),
      news.shot && line(news.shot, "tombe sous la balle du chasseur"),
      (news.shotGrief || []).map((id) => line(id, ""))),
    news.growl != null && h("p", null, news.growl
      ? "L'ours du montreur grogne : un loup est assis à côté de lui."
      : "L'ours du montreur reste calme."),
    s.crow && h("p", null, "Le corbeau s'est posé chez ", h("b", null, nameOf(s, s.crow)), " : deux voix pèsent déjà contre lui."),
    news.votes && h("ul", { class: "ballots" }, Object.entries(news.votes).map(([from, to]) =>
      h("li", null, nameOf(s, from), " vote contre ", h("b", null, nameOf(s, to)))))
  ];
}

const verdictButton = (ctx) => action("Annoncer le résultat", "play", () => announce(ctx), "btn-brick btn-big");

function dayPanel(ctx) {
  const { state: s, isHost } = ctx;
  return [
    h("h2", null, "Le village se réveille"),
    obituary(ctx),
    !s.pending && h("p", null, "Débattez à voix haute : qui ment ? Quand tout le monde a parlé, l'hôte ouvre le vote."),
    isHost
      ? (s.pending ? verdictButton(ctx) : action("Ouvrir le vote", "check", () => openVote(ctx), "btn-brick btn-big"))
      : h("p", { class: "rule" }, "L'hôte lance la suite.")
  ];
}

function votePanel(ctx) {
  const { state: s, room, me, isHost, mySealed } = ctx;
  const title = h("h2", null, "Le vote du village");
  const done = room.done?.[s.g]?.[s.step] || {};
  const waiting = Object.keys(s.alive).filter((id) => id !== s.idiot && !done[id]).length;
  const tools = isHost && hostTools(action("Clôturer le vote", "check", () => forceClose(ctx)));
  if (!s.alive?.[me]) return [title, h("p", { class: "rule" }, "Les vivants désignent un coupable."), tools];
  if (s.idiot === me) return [title, h("p", { class: "rule" }, "Démasqué comme Idiot du Village, tu ne votes plus."), tools];
  if (mySealed) {
    return [title,
      h("p", null, "Ton bulletin est dans l'urne : tu votes contre ", h("b", null, nameOf(s, mySealed.target)), "."),
      h("p", { class: "rule" }, waiting ? `Encore ${waiting} bulletin(s) attendu(s).` : "Dépouillement…"),
      tools];
  }
  return [title,
    h("p", null, "Qui le village envoie-t-il au bûcher ? Les bulletins restent secrets jusqu'au dépouillement ; en cas d'égalité, personne n'est condamné."),
    choices(s.order.filter((id) => s.alive[id] && id !== me), s, (id) => ctx.seal({ target: id })),
    tools];
}

function duskPanel(ctx) {
  const { state: s, isHost } = ctx;
  return [
    h("h2", null, "Le verdict"),
    obituary(ctx),
    isHost
      ? (s.pending ? verdictButton(ctx) : action("La nuit tombe", "moon", () => fallNight(ctx), "btn-brick btn-big"))
      : h("p", { class: "rule" }, "L'hôte lance la suite.")
  ];
}

function hunterPanel(ctx) {
  const { state: s, me, isHost, myAction } = ctx;
  const title = h("h2", null, `${nameOf(s, s.hunter)} était le Chasseur`);
  if (s.hunter !== me) {
    return [title, obituary(ctx),
      h("p", null, "Dans un dernier souffle, il épaule son fusil et choisit sa cible."),
      isHost && hostTools(action("Passer (le chasseur ne répond pas)", "skip", () => skipHunter(ctx)))];
  }
  if (myAction) return [title, h("p", { class: "rule" }, "Le coup est parti…")];
  return [title,
    h("p", null, h("b", null, "Tu meurs, mais pas seul."), " Qui emportes-tu avec toi ?"),
    choices(s.order.filter((id) => s.alive[id]), s, (id) => ctx.act({ target: id }))];
}

function endPanel(ctx) {
  const { state: s, vault, isHost } = ctx;
  const pair = s.has?.cupidon ? ctx.watch(nightPath(ctx, "cupid/pair"), "end") : null;
  const alive = Object.keys(s.alive || {});
  // Deux amoureux de camps opposés qui restent seuls gagnent à la place des autres.
  const lovers = vault && pair && alive.length === 2 && alive.includes(pair.a) && alive.includes(pair.b)
    && (vault.roles[pair.a] === "loup") !== (vault.roles[pair.b] === "loup");
  return [
    h("h2", null, "Fin de la partie"),
    h("p", { class: "verdict" }, WINNERS[lovers ? "amoureux" : s.winner]),
    pair && h("p", null, "Cupidon avait uni ", h("b", null, nameOf(s, pair.a)), " et ", h("b", null, nameOf(s, pair.b)), "."),
    !vault ? h("p", { class: "rule" }, "On retourne toutes les cartes…")
      : h("ul", { class: "roles-list" }, s.order.map((id) =>
        h("li", { class: `role-${vault.roles[id]}` }, h("span", null, nameOf(s, id)), h("b", null, ROLES[vault.roles[id]].name)))),
    isHost
      ? action("Rejouer", "play", () => ctx.backToLobby(), "btn-brick btn-big")
      : h("p", { class: "rule" }, "L'hôte peut relancer une partie depuis le salon.")
  ];
}

const PANELS = {
  night: nightPanel,
  dawn: () => [h("h2", null, "Le jour se lève"), h("p", { class: "rule" }, "Le village compte ses habitants…")],
  day: dayPanel, vote: votePanel, dusk: duskPanel, hunter: hunterPanel, end: endPanel
};

export function view(ctx) {
  const { state: s, me, secret } = ctx;
  if (ui.g !== s.g) {
    let seen = false;
    try { seen = !!sessionStorage.getItem(seenKey(s.g)); } catch { /* stockage indisponible */ }
    Object.assign(ui, { g: s.g, seen, dealt: false });
  }
  const seated = !!s.names[me];
  const dark = s.phase === "night" || s.phase === "dawn";
  return [
    h("span", { class: dark ? "is-night" : "is-day", hidden: true }),
    table(ctx),
    seated && secret ? myCard(ctx)
      : !seated && h("p", { class: "rule" }, "Tu es arrivé en cours de partie : observe, tu joueras la prochaine."),
    h("section", { class: "sheet" }, PANELS[s.phase]?.(ctx)),
    s.phase !== "end" && notebook(ctx)
  ];
}
