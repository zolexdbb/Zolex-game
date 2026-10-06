// Catalogue des rôles. `tags` sert aux filtres de composition ; `cards` est le
// nombre de cartes ajoutées quand le rôle est choisi (1 par défaut).
export const ROLES = {
  villageois: { name: "Villageois", icon: "house", camp: "village", tags: [],
    text: "Aucun pouvoir, sinon ta voix : débusque les loups au vote." },
  loup: { name: "Loup-Garou", icon: "paw", camp: "loups", tags: ["attaque"],
    text: "Chaque nuit, la meute choisit une victime. Le jour, fais-toi passer pour un villageois." },
  voyante: { name: "Voyante", icon: "eye", camp: "village", tags: ["enquete"],
    text: "Chaque nuit, tu découvres le rôle d'un joueur de ton choix." },
  sorciere: { name: "Sorcière", icon: "flask", camp: "village", tags: ["protection", "attaque"],
    text: "Une potion de vie, une potion de mort : chacune ne sert qu'une fois." },
  chasseur: { name: "Chasseur", icon: "target", camp: "village", tags: ["attaque"],
    text: "Si tu meurs, tu emportes quelqu'un avec toi d'un dernier tir." },
  salvateur: { name: "Salvateur", icon: "shield", camp: "village", tags: ["protection"],
    text: "Chaque nuit, tu protèges un joueur des loups. Jamais le même deux nuits de suite." },
  petitefille: { name: "Petite Fille", icon: "keyhole", camp: "village", tags: ["enquete"],
    text: "La nuit, tu entrouvres les yeux : tu vois vers qui les loups se tournent, pas qui ils sont." },
  renard: { name: "Renard", icon: "fox", camp: "village", tags: ["enquete"],
    text: "Chaque nuit, tu flaires un joueur et ses deux voisins. S'il n'y a aucun loup parmi eux, tu perds ton flair." },
  ours: { name: "Montreur d'Ours", icon: "bear", camp: "village", tags: ["enquete"],
    text: "Au lever du jour, ton ours grogne si l'un de tes deux voisins de table est un loup." },
  corbeau: { name: "Corbeau", icon: "feather", camp: "village", tags: ["influence"],
    text: "Chaque nuit, tu peux désigner un joueur : il aura deux voix contre lui au prochain vote." },
  idiot: { name: "Idiot du Village", icon: "jester", camp: "village", tags: ["influence"],
    text: "Si le village te condamne, il t'épargne en découvrant ta carte, mais tu ne votes plus." },
  cupidon: { name: "Cupidon", icon: "heart", camp: "village", tags: ["influence"],
    text: "La première nuit, tu unis deux amoureux. Si l'un meurt, l'autre meurt de chagrin." },
  macon: { name: "Maçons", icon: "bricks", camp: "village", tags: ["enquete"], cards: 2,
    text: "Deux frères qui se connaissent : un allié dont tu es sûr dès le départ." }
};

// Rôles que l'on coche dans le salon (les loups se comptent, les villageois complètent).
export const OPTIONAL = Object.keys(ROLES).filter((id) => id !== "villageois" && id !== "loup");

export const FILTERS = [
  ["tous", "Tous"], ["village", "Village"], ["loups", "Loups"],
  ["enquete", "Enquête"], ["protection", "Protection"], ["attaque", "Attaque"], ["influence", "Influence"]
];

export const WINNERS = {
  village: "Le village a chassé tous les loups",
  loups: "Les loups ont dévoré le village",
  amoureux: "Les amoureux survivent seuls : l'amour triomphe"
};

const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cardsOf = (s) => s.loups + OPTIONAL.reduce((sum, id) => sum + (s[id] ? ROLES[id].cards || 1 : 0), 0);
export const villagersOf = (s, n) => n - cardsOf(s);

// Renvoie la raison pour laquelle la partie ne peut pas commencer, ou null.
export function checkSettings(s, n) {
  if (cardsOf(s) > n) return `Il y a ${cardsOf(s)} cartes de rôle pour ${n} joueurs : retires-en.`;
  if (s.loups * 2 >= n) return "Les loups doivent être minoritaires au départ.";
  return null;
}

// Composition conseillée pour `n` joueurs.
export function preset(s, n) {
  const next = { ...s, loups: n <= 6 ? 1 : n <= 11 ? 2 : n <= 15 ? 3 : 4 };
  const from = { voyante: 4, sorciere: 5, chasseur: 7, salvateur: 8, cupidon: 9, petitefille: 10, idiot: 11, corbeau: 12, ours: 13, renard: 14, macon: 16 };
  for (const id of OPTIONAL) next[id] = n >= from[id] ? 1 : 0;
  return next;
}

export function start({ players, settings, now }) {
  const ids = shuffle(players.map((p) => p.id));
  const deck = Array(settings.loups).fill("loup");
  for (const id of OPTIONAL) if (settings[id]) deck.push(...Array(ROLES[id].cards || 1).fill(id));
  const roles = Object.fromEntries(ids.map((id, i) => [id, deck[i] || "villageois"]));
  const group = (role) => Object.fromEntries(ids.filter((id) => roles[id] === role).map((id) => [id, true]));

  // Le tour de table, public : il sert au renard et au montreur d'ours.
  const order = shuffle(ids);
  const vault = { roles };
  const tamer = order.findIndex((id) => roles[id] === "ours");
  if (tamer >= 0) {
    vault.bear = { id: order[tamer], left: order.at(tamer - 1), right: order[(tamer + 1) % order.length] };
  }

  return {
    state: {
      phase: "night", sub: "wolves", night: "n1", nightNo: 1,
      until: now + settings.wolvesTime * 1000,
      order,
      alive: Object.fromEntries(ids.map((id) => [id, true])),
      names: Object.fromEntries(players.map((p) => [p.id, { name: p.name, pawn: p.index }])),
      totals: { loup: settings.loups },
      times: { wolves: settings.wolvesTime, witch: settings.witchTime },
      has: Object.fromEntries(OPTIONAL.filter((id) => settings[id]).map((id) => [id, true]))
    },
    // Chacun connaît son rôle ; loups et maçons connaissent en plus les leurs.
    secrets: Object.fromEntries(ids.map((id) => [id,
      roles[id] === "loup" || roles[id] === "macon" ? { role: roles[id], pack: group(roles[id]) } : { role: roles[id] }])),
    vault
  };
}

// Voisins vivants d'un joueur dans le tour de table.
export function neighbours(s, id) {
  const ring = s.order.filter((p) => s.alive?.[p] || p === id);
  const i = ring.indexOf(id);
  return [ring.at(i - 1), ring[(i + 1) % ring.length]];
}

// Camp vainqueur d'après les cartes déjà retournées, ou null si la partie continue.
function winnerOf(s, room, roles, alive) {
  const shown = { ...room.reveals?.[s.g], ...roles };
  const wolves = s.totals.loup - Object.values(shown).filter((r) => r === "loup").length;
  if (wolves === 0) return "village";
  if (wolves >= alive.length - wolves) return "loups";
  return null;
}

const dig = (room, path) => path.split("/").reduce((node, key) => node?.[key], room);

// L'hôte ne connaît ni les rôles ni les actions de nuit. Pour chaque question
// (« est-il mort ? », « l'ours grogne-t-il ? »), la base n'accepte que la vraie
// réponse : on propose « non », puis « oui ».
async function ask(ctx, path) {
  const known = dig(ctx.room, path);
  if (known != null) return known;
  if (await ctx.tryWrite(path, false)) return false;
  return (await ctx.tryWrite(path, true)) ? true : null;
}

async function reveal(ctx, id) {
  const { room, state: s } = ctx;
  const known = room.reveals?.[s.g]?.[id];
  if (known) return known;
  if (!room.out?.[s.g]?.[id]) await ctx.tryWrite(`out/${s.g}/${id}`, true);
  for (const candidate of Object.keys(ROLES)) {
    if (await ctx.tryWrite(`reveals/${s.g}/${id}`, candidate)) return candidate;
  }
  return null;
}

// Sort des joueurs du jeu, retourne leur carte, et emporte leur amoureux.
async function mourn(ctx, ids) {
  const s = ctx.state;
  const dead = [...ids], roles = {}, grief = [];
  for (let i = 0; i < dead.length; i++) {
    const role = await reveal(ctx, dead[i]);
    if (!role) return null;
    roles[dead[i]] = role;
    if (!s.has?.cupidon) continue;
    const others = Object.keys(s.alive).filter((id) => !dead.includes(id));
    const loved = await Promise.all(others.map((id) => ask(ctx, `heart/${s.g}/${dead[i]}/${id}`)));
    if (loved.includes(null)) return null;
    others.forEach((id, k) => { if (loved[k]) { dead.push(id); grief.push(id); } });
  }
  return { dead, roles, grief };
}

function finish(ctx, winner, extra = {}) {
  return ctx.patch({
    [`ended/${ctx.state.g}`]: true,
    "state/phase": "end", "state/winner": winner, "state/until": null,
    "state/step": ctx.nextStep(), ...extra
  });
}

// Après des morts : le chasseur tire s'il en fait partie, sinon on passe à `after`.
function afterDeaths(ctx, loss, after, news, extra = {}) {
  const { room, state: s } = ctx;
  const { dead, roles, grief } = loss;
  const left = Object.keys(s.alive).filter((id) => !dead.includes(id));
  const hunter = dead.find((id) => roles[id] === "chasseur" && room.players?.[id]);
  const changes = {
    "state/news": { ...news, dead: dead.length ? dead : null, grief: grief.length ? grief : null },
    "state/forceClose": null, "state/step": ctx.nextStep(), ...extra
  };
  for (const id of dead) changes[`state/alive/${id}`] = null;
  // Les deux voix du corbeau ne valent que pour le vote qui vient de se clore.
  if (after === "dusk") changes["state/crow"] = null;
  if (hunter && left.length) {
    Object.assign(changes, { "state/phase": "hunter", "state/hunter": hunter, "state/after": after });
  } else {
    Object.assign(changes, { "state/phase": after, "state/pending": winnerOf(s, room, roles, left) });
  }
  return ctx.patch(changes);
}

function nextNight(ctx) {
  const s = ctx.state;
  return ctx.patch({
    "state/phase": "night", "state/sub": "wolves",
    "state/night": `n${s.nightNo + 1}`, "state/nightNo": s.nightNo + 1,
    "state/until": ctx.now() + s.times.wolves * 1000,
    "state/news": null, "state/hunter": null, "state/after": null, "state/crow": null,
    "state/step": ctx.nextStep()
  });
}

// Commandes de l'hôte.
export const openVote = (ctx) => ctx.patch({ "state/phase": "vote", "state/step": ctx.nextStep() });
export const forceClose = (ctx) => ctx.patch({ "state/forceClose": true });
export const skipHunter = (ctx) => ctx.patch({ "state/skipHunter": true });
export const announce = (ctx) => finish(ctx, ctx.state.pending);
export const fallNight = (ctx) => nextNight(ctx);

export async function hostTick(ctx) {
  const { room, state: s } = ctx;
  if (!s || s.phase === "end") return;
  const alive = Object.keys(s.alive || {});
  const closed = room.closed?.[s.g]?.[s.step];

  if (["night", "day", "dusk"].includes(s.phase) || (s.phase === "vote" && !closed)) {
    // Un joueur qui a quitté la table meurt ; sa carte est retournée.
    const gone = alive.find((id) => !room.players?.[id]);
    if (gone) {
      const loss = await mourn(ctx, [gone]);
      if (!loss) return;
      const changes = { [`state/left/${gone}`]: true };
      for (const id of loss.dead) changes[`state/alive/${id}`] = null;
      const winner = winnerOf(s, room, loss.roles, alive.filter((id) => !loss.dead.includes(id)));
      return winner ? finish(ctx, winner, changes) : ctx.patch(changes);
    }
  }

  if (s.phase === "night") {
    // La nuit a une durée fixe, que les rôles soient encore en vie ou non :
    // sa longueur ne trahit rien.
    if (ctx.now() < s.until) return;
    if (s.sub === "wolves" && s.has?.sorciere) {
      await ctx.tryWrite(`marks/${s.g}/${s.night}-witch`, true);
      return ctx.patch({ "state/sub": "witch", "state/until": ctx.now() + s.times.witch * 1000 });
    }
    await ctx.tryWrite(`marks/${s.g}/${s.night}-dawn`, true);
    return ctx.patch({ "state/phase": "dawn", "state/sub": null, "state/until": null });
  }

  if (s.phase === "dawn") {
    const fates = await Promise.all(alive.map((id) => ask(ctx, `fate/${s.g}/${s.night}/${id}`)));
    if (fates.includes(null)) return;
    const loss = await mourn(ctx, alive.filter((id, i) => fates[i]));
    if (!loss) return;
    const news = { kind: "night" };
    if (s.has?.ours) {
      news.growl = await ask(ctx, `bear/${s.g}/${s.night}`);
      if (news.growl == null) return;
    }
    // Le choix du corbeau devient public une fois la nuit close.
    const marked = s.has?.corbeau ? await ctx.read(`night/${ctx.code}/${s.g}/crow/${s.night}`) : null;
    const crow = typeof marked === "string" && s.alive[marked] && !loss.dead.includes(marked) ? marked : null;
    return afterDeaths(ctx, loss, "day", news, { "state/crow": crow });
  }

  if (s.phase === "vote") {
    // Les bulletins restent sous enveloppe, même pour l'hôte, jusqu'à la clôture.
    const voters = alive.filter((id) => id !== s.idiot);
    if (!closed) {
      const done = room.done?.[s.g]?.[s.step] || {};
      if (voters.every((id) => done[id]) || s.forceClose) return ctx.patch({ [`closed/${s.g}/${s.step}`]: true });
      return;
    }
    if (!ctx.sealed) return;
    const votes = {};
    for (const id of voters) {
      const target = ctx.sealed[id]?.target;
      if (typeof target === "string" && target !== id && s.alive[target]) votes[id] = target;
    }
    const tally = {};
    for (const target of Object.values(votes)) tally[target] = (tally[target] || 0) + 1;
    if (s.crow && s.alive[s.crow]) tally[s.crow] = (tally[s.crow] || 0) + 2;
    const top = Math.max(0, ...Object.values(tally));
    const tied = Object.keys(tally).filter((id) => tally[id] === top);
    const news = { kind: "vote", votes: Object.keys(votes).length ? votes : null, tie: tied.length > 1 || null };
    // En cas d'égalité, le village ne condamne personne.
    if (tied.length !== 1) return afterDeaths(ctx, { dead: [], roles: {}, grief: [] }, "dusk", news);
    const role = await reveal(ctx, tied[0]);
    if (!role) return;
    if (role === "idiot" && s.idiot !== tied[0]) {
      // L'idiot est épargné : sa carte est connue, il reste en jeu sans voter.
      return ctx.patch({
        "state/news": { ...news, spared: tied[0] }, "state/idiot": tied[0], "state/crow": null,
        "state/phase": "dusk", "state/pending": null, "state/forceClose": null, "state/step": ctx.nextStep()
      });
    }
    const loss = await mourn(ctx, tied);
    if (!loss) return;
    return afterDeaths(ctx, loss, "dusk", news);
  }

  if (s.phase === "hunter") {
    const target = ctx.actions?.[s.hunter]?.target;
    const valid = typeof target === "string" && target !== s.hunter && !!s.alive?.[target];
    if (!valid && !s.skipHunter && room.players?.[s.hunter]) return;
    const loss = valid ? await mourn(ctx, [target]) : { dead: [], roles: {}, grief: [] };
    if (!loss) return;
    const changes = {
      "state/phase": s.after, "state/skipHunter": null, "state/step": ctx.nextStep(),
      "state/news/shot": valid ? target : null,
      "state/news/shotGrief": loss.grief.length ? loss.grief : null,
      "state/pending": winnerOf(s, room, loss.roles, alive.filter((id) => !loss.dead.includes(id)))
    };
    for (const id of loss.dead) changes[`state/alive/${id}`] = null;
    return ctx.patch(changes);
  }
}
