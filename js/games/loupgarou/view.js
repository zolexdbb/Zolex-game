import { h, busy } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { pawn, flipCard, countdown, roundTable } from "../../ui/widgets.js";
import { chatBox } from "../../ui/chat.js";
import { ROLES, WINNERS, neighbours, openVote, forceClose, skipHunter, announce, fallNight } from "./logic.js";

// État d'affichage propre à cet appareil.
const ui = { g: null, seen: false, dealt: false, guide: false, sel: { key: null, ids: [] }, ctx: null, pair: null, poll: null };

// Sélection en cours autour de la table, reconstruite à chaque affichage.
let pick = null;

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
const living = (s, except) => s.order.filter((id) => s.alive[id] && id !== except);

// Demande au joueur de désigner un ou plusieurs pions autour de la table.
// Renvoie le bouton de confirmation (ou rien si `instant` : le pion touché
// déclenche aussitôt l'action, réversible).
function choose(ctx, { purpose, ids, max = 1, label, run, instant, notes }) {
  const s = ctx.state;
  const key = `${s.g}/${s.step}/${s.night}/${s.phase}/${purpose}`;
  if (ui.sel.key !== key) ui.sel = { key, ids: [] };
  ui.sel.ids = ui.sel.ids.filter((id) => ids.includes(id));
  const confirm = instant ? null : h("button", { class: "btn btn-brick btn-big", type: "button" });
  const refresh = () => {
    if (!confirm) return;
    const ready = ui.sel.ids.length === max;
    confirm.disabled = !ready;
    confirm.textContent = ready ? label(ui.sel.ids.map((id) => nameOf(s, id))) : "Touche un pion autour de la table";
  };
  confirm?.addEventListener("click", busy(confirm, async () => {
    const chosen = [...ui.sel.ids];
    ui.sel.ids = [];
    await run(chosen);
  }));
  refresh();
  pick = {
    ids, notes: notes || {}, selected: () => ui.sel.ids,
    toggle(id) {
      if (instant) return run([id]);
      if (ui.sel.ids.includes(id)) ui.sel.ids = ui.sel.ids.filter((other) => other !== id);
      else ui.sel.ids = max === 1 ? [id] : [...ui.sel.ids, id].slice(-max);
      refresh();
    }
  };
  return confirm;
}

// Les amoureux n'apprennent leur lien qu'une fois Cupidon passé : on relance
// l'écoute à chaque phase.
function lover(ctx) {
  const { state: s, me } = ctx;
  if (!s.has?.cupidon) return null;
  const path = nightPath(ctx, "cupid/pair");
  const pair = ui.pair || ctx.watch(path, `${s.phase}/${s.night}`);
  ui.ctx = ctx;
  // La première nuit, le lien n'existe pas encore quand on commence à l'écouter,
  // et la base ne prévient pas quand il devient lisible : on redemande de temps en temps.
  if (!pair && s.phase === "night" && s.night === "n1" && !ui.poll) {
    let tries = 0;
    ui.poll = setInterval(async () => {
      const now = ui.ctx.state;
      if (ui.pair || now.g !== s.g || now.phase !== "night" || ++tries > 90) {
        clearInterval(ui.poll);
        ui.poll = null;
        return;
      }
      const found = await ui.ctx.read(path);
      if (found && !ui.pair) { ui.pair = found; ui.ctx.refresh(); }
    }, 4000);
  }
  if (!pair || (pair.a !== me && pair.b !== me)) return null;
  return pair.a === me ? pair.b : pair.a;
}

const seenKey = (g) => `lg-seen-${g}`;

function overlay(label, ...content) {
  return h("div", { class: "role-intro", role: "dialog", "aria-label": label }, content);
}

// La carte de rôle en grand, au début de la partie.
function roleIntro(secret, animate) {
  const role = ROLES[secret.role];
  const close = h("button", { class: "btn btn-brick btn-big", type: "button" }, "C'est noté");
  const sheet = overlay("Ta carte de rôle",
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
    sheet.remove();
  });
  return sheet;
}

// Le rappel de tous les rôles, ouvert par le bouton « i » du tapis.
function guide(s) {
  const inPlay = (id) => id === "loup" || id === "villageois" || !!s.has?.[id];
  const ids = Object.keys(ROLES).sort((a, b) => inPlay(b) - inPlay(a));
  const close = h("button", { class: "btn btn-brick", type: "button" }, "Fermer");
  const sheet = overlay("Les rôles",
    h("div", { class: "guide" },
      h("h2", null, "Les rôles"),
      h("ul", { class: "guide-list" }, ids.map((id) => h("li", { class: inPlay(id) ? "" : "is-off" },
        roleArt(id),
        h("div", null, h("strong", null, ROLES[id].name, !inPlay(id) && h("em", null, " (absent de cette partie)")),
          h("p", null, ROLES[id].text))))),
      close));
  close.addEventListener("click", () => { ui.guide = false; sheet.remove(); });
  return sheet;
}

// Mon rôle, toujours sous les yeux dans le tapis.
function myRole(ctx) {
  const { state: s, secret } = ctx;
  const role = ROLES[secret.role];
  const beloved = lover(ctx);
  const first = !ui.seen && !ui.dealt;
  ui.dealt = true;
  return [
    h("section", { class: `role-block role-${secret.role}` },
      roleArt(secret.role),
      h("div", null, h("small", null, "Ton rôle"), h("strong", null, role.name), h("p", null, role.text))),
    beloved && h("p", { class: "love-note" }, icon("heart"), " Ton cœur bat pour ", h("b", null, nameOf(s, beloved)),
      " : si l'un de vous deux meurt, l'autre le suit."),
    !ui.seen && roleIntro(secret, first)
  ];
}

function table(ctx) {
  const { state: s, room, me, secret } = ctx;
  const dark = s.phase === "night" || s.phase === "dawn";
  const done = s.phase === "vote" ? room.done?.[s.g]?.[s.step] || {} : {};
  const buttons = {};
  const seats = s.order.map((id) => {
    const seated = room.players?.[id];
    const out = !s.alive?.[id];
    const role = (out || id === s.idiot) && room.reveals?.[s.g]?.[id];
    const bond = secret?.pack?.[id] && id !== me ? (secret.role === "loup" ? "meute" : "frère") : null;
    const token = pawn(
      { name: s.names[id].name, index: s.names[id].pawn, online: !!seated?.online, avatar: seated?.avatar },
      {
        isHost: id === room.meta.hostUid, isMe: id === me, out, done: done[id],
        note: role ? ROLES[role].name : out ? "hors jeu" : !seated ? "a quitté"
          : pick?.notes[id] || (id === s.crow ? "corbeau +2" : bond)
      }
    );
    if (!pick?.ids.includes(id)) return token;
    // Un pion que l'on peut désigner devient un bouton.
    const button = h("button", {
      class: "seat-btn", type: "button", "aria-pressed": String(pick.selected().includes(id)),
      "aria-label": `Désigner ${s.names[id].name}`
    }, token);
    const current = pick;
    button.addEventListener("click", () => {
      current.toggle(id);
      for (const [other, node] of Object.entries(buttons)) node.setAttribute("aria-pressed", String(current.selected().includes(other)));
    });
    buttons[id] = button;
    return button;
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
  const notes = {};
  for (const [wolf, prey] of Object.entries(props)) notes[prey] = `proie de ${wolf === me ? "toi" : nameOf(s, wolf)}`;
  choose(ctx, {
    purpose: "prey", ids: living(s).filter((id) => !secret.pack?.[id]), instant: true, notes,
    run: ([id]) => ctx.multi({ [`${den}/props/${me}`]: id, [`${den}/peek/${id}`]: true })
  });
  return [
    h("p", null, h("b", null, "Touche le pion de ta proie."), " Ta proposition est visible de la meute ; le premier loup qui confirme scelle le choix."),
    props[me]
      ? action(`Dévorer ${nameOf(s, props[me])}`, "paw", () => ctx.write(`${den}/victim`, props[me]), "btn-brick btn-big")
      : h("p", { class: "rule" }, "Aucune proie proposée pour l'instant.")
  ];
}

function seerPanel(ctx) {
  const { state: s, me } = ctx;
  const base = nightPath(ctx, "seer");
  const picks = ctx.watch(`${base}/picks`) || {};
  if (Object.values(picks).includes(s.night)) return h("p", { class: "rule" }, "Ta vision de la nuit est notée dans ton carnet.");
  return [
    h("p", null, h("b", null, "Dans ta boule de cristal :"), " touche le pion du joueur dont tu veux connaître le rôle."),
    choose(ctx, {
      purpose: "seer", ids: living(s, me).filter((id) => !picks[id]), label: ([name]) => `Sonder ${name}`,
      run: ([id]) => ctx.multi({ [`${base}/nights/${s.night}`]: id, [`${base}/picks/${id}`]: s.night })
    })
  ];
}

function guardPanel(ctx) {
  const { state: s } = ctx;
  const guard = ctx.watch(nightPath(ctx, "guard")) || {};
  if (guard[s.night]) return h("p", { class: "rule" }, "Cette nuit, tu veilles sur ", h("b", null, nameOf(s, guard[s.night])), ".");
  const before = guard[`n${s.nightNo - 1}`];
  return [
    h("p", null, h("b", null, "Qui protèges-tu cette nuit ?"), " Touche son pion. Tu peux te choisir, mais jamais la même personne deux nuits de suite."),
    choose(ctx, {
      purpose: "guard", ids: living(s, before), label: ([name]) => `Protéger ${name}`,
      run: ([id]) => ctx.write(nightPath(ctx, `guard/${s.night}`), id)
    })
  ];
}

function crowPanel(ctx) {
  const { state: s, me } = ctx;
  const path = nightPath(ctx, `crow/${s.night}`);
  const marked = ctx.watch(path);
  if (marked) return h("p", { class: "rule" }, "Tu as posé ta plume chez ", h("b", null, nameOf(s, marked)), " : deux voix pèseront contre ce joueur.");
  return [
    h("p", null, h("b", null, "Qui soupçonnes-tu ?"), " Touche son pion : ce joueur partira avec deux voix contre lui. Tu peux aussi ne rien faire."),
    choose(ctx, { purpose: "crow", ids: living(s, me), label: ([name]) => `Désigner ${name}`, run: ([id]) => ctx.write(path, id) })
  ];
}

function foxPanel(ctx) {
  const { state: s } = ctx;
  const base = nightPath(ctx, "fox");
  const fox = ctx.watch(base) || {};
  if (Object.values(fox.answers || {}).includes(false)) return h("p", { class: "rule" }, "Tu as flairé un groupe sans loup : ton flair est perdu.");
  if (fox.nights?.[s.night]) return h("p", { class: "rule" }, "Ta piste de la nuit est notée dans ton carnet.");
  return [
    h("p", null, h("b", null, "Touche un pion :"), " tu flaires ce joueur et ses deux voisins de table, et tu sauras si au moins un loup se cache parmi eux."),
    choose(ctx, {
      purpose: "fox", ids: living(s), label: ([name]) => `Flairer ${name} et ses voisins`,
      run: async ([id]) => {
        const [a, c] = neighbours(s, id);
        await ctx.write(`${base}/nights/${s.night}`, { a, b: id, c });
        // La base n'accepte que la vraie réponse.
        try { await ctx.write(`${base}/answers/${s.night}`, true); } catch { await ctx.write(`${base}/answers/${s.night}`, false); }
      }
    })
  ];
}

function cupidPanel(ctx) {
  const { state: s } = ctx;
  const path = nightPath(ctx, "cupid/pair");
  const pair = ctx.watch(path);
  if (pair) return h("p", { class: "rule" }, "Ta flèche a uni ", h("b", null, nameOf(s, pair.a)), " et ", h("b", null, nameOf(s, pair.b)), ".");
  if (s.night !== "n1") return h("p", { class: "rule" }, "Tu n'as uni personne : ton carquois reste plein.");
  return [
    h("p", null, h("b", null, "Touche les pions de deux amoureux."), " Tu peux te désigner. Si l'un meurt, l'autre meurt de chagrin."),
    choose(ctx, {
      purpose: "cupid", ids: living(s), max: 2, label: ([a, b]) => `Unir ${a} et ${b}`,
      run: ([a, b]) => ctx.write(path, { a, b })
    })
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
    healed ? h("p", { class: "rule" }, "Ta potion de vie sauvera la victime au lever du jour.")
      : victim && !potions.heal ? action("Utiliser la potion de vie", "flask", () => ctx.write(`${base}/heal`, s.night))
      : potions.heal && h("p", { class: "rule" }, "Ta potion de vie est déjà utilisée."),
    poisoned ? h("p", { class: "rule" }, "Ta potion de mort emportera ", h("b", null, nameOf(s, poisoned)), ".")
      : potions.poison ? h("p", { class: "rule" }, "Ta potion de mort est déjà utilisée.")
      : [h("p", { class: "rule" }, "Potion de mort : touche un pion pour désigner ta cible, ou ne fais rien."),
        choose(ctx, {
          purpose: "poison", ids: living(s, me), label: ([name]) => `Empoisonner ${name}`,
          run: ([id]) => ctx.write(`${base}/poison`, { n: s.night, target: id })
        })]
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
      role && [". Son rôle : ", h("b", null, ROLES[role].name)], ".");
  };
  const dead = news.dead || [];
  return [
    !dead.length && !news.spared && h("p", null, news.kind === "night" ? "Miracle : personne n'est mort cette nuit."
      : news.tie ? "Égalité des voix : le village n'a condamné personne." : "Personne n'a été désigné."),
    news.spared && h("p", null, "Le village condamne ", h("b", null, nameOf(s, news.spared)),
      "… et découvre l'Idiot du Village : la sentence est levée, mais ce joueur ne votera plus."),
    (dead.length || news.shot) && h("ul", { class: "roles-list obituary" },
      dead.map((id) => line(id, news.kind === "night" ? "n'a pas survécu à la nuit" : "monte au bûcher, sur décision du village")),
      news.shot && line(news.shot, "tombe sous la balle du chasseur"),
      (news.shotGrief || []).map((id) => line(id, ""))),
    news.growl != null && h("p", null, news.growl
      ? "L'ours du montreur grogne : un loup est assis à côté de lui."
      : "L'ours du montreur reste calme."),
    s.crow && h("p", null, "Le corbeau s'est posé chez ", h("b", null, nameOf(s, s.crow)), " : deux voix pèsent déjà contre ce joueur."),
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
    !s.pending && h("p", null, "Débattez : qui ment ? Quand tout le monde a parlé, l'hôte ouvre le vote."),
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
    h("p", null, "Touche le pion du joueur que tu envoies au bûcher. Les bulletins restent secrets jusqu'au dépouillement ; en cas d'égalité, personne n'est condamné."),
    choose(ctx, { purpose: "vote", ids: living(s, me), label: ([name]) => `Voter contre ${name}`, run: ([id]) => ctx.seal({ target: id }) }),
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
      h("p", null, "Dans un dernier souffle, une main épaule le fusil et cherche sa cible."),
      isHost && hostTools(action("Passer (le chasseur ne répond pas)", "skip", () => skipHunter(ctx)))];
  }
  if (myAction) return [title, h("p", { class: "rule" }, "Le coup est parti…")];
  return [title,
    h("p", null, h("b", null, "Tu meurs, mais tu emportes quelqu'un."), " Touche le pion du joueur que tu emportes avec toi."),
    choose(ctx, { purpose: "hunter", ids: living(s), label: ([name]) => `Tirer sur ${name}`, run: ([id]) => ctx.act({ target: id }) })];
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

// Un seul fil de discussion, trois canaux cloisonnés par la base elle-même :
//  - la table : les vivants, le jour ;
//  - la meute : les loups vivants, à toute heure, lisible des seuls loups ;
//  - l'au-delà : les morts entre eux, illisible pour les vivants.
function talk(ctx) {
  const { state: s, room, me, secret } = ctx;
  if (s.phase === "end") return chatBox(ctx);
  const seated = !!s.names[me];
  const alive = seated && !!s.alive?.[me];
  const night = s.phase === "night" || s.phase === "dawn";
  const channel = (id, extra) => {
    const path = nightPath(ctx, id);
    // Le droit de lire l'au-delà n'arrive qu'à la mort : l'écoute est relancée à ce moment.
    return { id, messages: ctx.watch(path, alive ? "alive" : "dead"), send: (key, message) => ctx.write(`${path}/${key}`, message), ...extra };
  };
  const channels = [{
    id: "table", messages: room.talk?.[s.g], write: alive && !night,
    send: (key, message) => ctx.tryWrite(`talk/${s.g}/${key}`, message)
  }];
  if (seated && secret?.role === "loup") {
    channels.push(channel("pack", { tag: "Meute", hint: "Écrire à la meute (les loups seuls te lisent)", write: alive }));
  }
  if (seated && !alive) {
    channels.push(channel("dead", { tag: "Au-delà", hint: "Écrire aux morts (eux seuls te lisent)", write: true }));
  }
  return chatBox(ctx, {
    channels, prefer: night ? "pack" : "table",
    note: !seated ? "Tu regardes la partie : tu ne peux pas écrire." : "Le village dort : la discussion reprend au matin."
  });
}

export function view(ctx) {
  const { state: s, me, secret } = ctx;
  if (ui.g !== s.g) {
    let seen = false;
    try { seen = !!sessionStorage.getItem(seenKey(s.g)); } catch { /* stockage indisponible */ }
    clearInterval(ui.poll);
    Object.assign(ui, { g: s.g, seen, dealt: false, guide: false, sel: { key: null, ids: [] }, pair: null, poll: null });
  }
  const seated = !!s.names[me];
  const dark = s.phase === "night" || s.phase === "dawn";

  // Le panneau d'abord : c'est lui qui dit quels pions peuvent être désignés.
  pick = null;
  const stage = h("section", { class: "sheet stage" }, PANELS[s.phase]?.(ctx));
  const info = h("button", { class: "info-btn", type: "button", "aria-label": "Voir tous les rôles", title: "Tous les rôles" }, icon("info"));
  info.addEventListener("click", () => {
    if (ui.guide) return;
    ui.guide = true;
    info.after(guide(s));
  });

  return [
    h("span", { class: dark ? "is-night" : "is-day", hidden: true }),
    info,
    ui.guide && guide(s),
    stage,
    h("div", { class: "lg-board" },
      h("div", { class: "lg-side" },
        seated && secret ? myRole(ctx)
          : !seated && h("p", { class: "rule" }, "La partie a commencé sans toi : observe, tu joueras la prochaine."),
        s.phase !== "end" && notebook(ctx)),
      table(ctx),
      h("div", { class: "lg-side" }, talk(ctx)))
  ];
}
