// Sons du site, fabriqués par le navigateur : aucun fichier à charger.
// Un effet = quelques notes (tone) et souffles de bruit filtré (hiss).
import { h } from "./dom.js";
import { icon } from "./icons.js";

// Familles de sons réglables séparément : [clé, nom, son joué en exemple].
const GROUPS = [
  ["fx", "Effets de jeu", "card"],
  ["timer", "Chrono", "tick"],
  ["chat", "Messages", "message"],
  ["amb", "Ambiance", null]
];
const GROUP_OF = { tick: "timer", tock: "timer", message: "chat" }; // tout le reste : effets de jeu

let ac = null, master = null, noiseBuffer = null;
let bus = null; // famille dans laquelle joue la recette en cours
const buses = {};
let on = localStorage.getItem("sound") !== "off";
const volumes = { master: .6, fx: 1, timer: 1, chat: 1, amb: 1 };
try { Object.assign(volumes, JSON.parse(localStorage.getItem("volumes"))); } catch { /* réglages illisibles : valeurs par défaut */ }

function level() {
  if (!ac) return;
  master.gain.setTargetAtTime(on ? volumes.master : 0, ac.currentTime, .03);
  for (const [id] of GROUPS) buses[id].gain.setTargetAtTime(volumes[id], ac.currentTime, .03);
}

// Les navigateurs n'autorisent le son qu'après un geste du joueur.
function unlock() {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = on ? volumes.master : 0;
    master.connect(ac.destination);
    for (const [id] of GROUPS) {
      buses[id] = ac.createGain();
      buses[id].gain.value = volumes[id];
      buses[id].connect(master);
    }
    bus = buses.fx;
    ambience(wanted);
  }
  if (ac.state === "suspended") ac.resume();
}
addEventListener("pointerdown", unlock, true);
addEventListener("keydown", unlock, true);

function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ac.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  return source;
}

// Enveloppe : attaque franche, extinction douce.
function envelope(gain, t, dur) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + Math.min(.01, dur / 3));
  g.gain.exponentialRampToValueAtTime(.001, t + dur);
  return g;
}

// Note : de `freq` vers `to` (glissé) pendant `dur` secondes, dans `at` secondes.
function tone(freq, { at = 0, dur = .15, type = "sine", gain = .2, to, out = bus } = {}) {
  const t = ac.currentTime + at, osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  osc.connect(envelope(gain, t, dur)).connect(out);
  osc.start(t);
  osc.stop(t + dur + .05);
}

// Souffle : bruit passé dans un filtre centré sur `freq`.
function hiss(freq, { at = 0, dur = .1, gain = .3, to, q = 1, type = "bandpass", out = bus } = {}) {
  const t = ac.currentTime + at, source = noise(), filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  source.connect(filter).connect(envelope(gain, t, dur)).connect(out);
  source.start(t, Math.random());
  source.stop(t + dur + .05);
}

// ---- Effets courts : chaque recette se retouche indépendamment ----
const FX = {
  tick: () => tone(900, { dur: .05, type: "square", gain: .05 }),
  tock: () => tone(1300, { dur: .09, type: "square", gain: .09 }),
  turn: () => { tone(660, { dur: .12 }); tone(880, { at: .1, dur: .22 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * .12, dur: .35, type: "triangle" })),

  card: () => { hiss(2600, { dur: .09, gain: .35, to: 900 }); tone(140, { dur: .07, gain: .15 }); },
  draw: () => hiss(1100, { dur: .17, gain: .25, to: 3600 }),
  shuffle: () => { for (let i = 0; i < 9; i++) hiss(1800 + 150 * i, { at: i * .055, dur: .05, gain: .2 }); },
  malus: () => { FX.card(); tone(220, { at: .05, dur: .4, type: "sawtooth", gain: .1, to: 70 }); },
  // Annonce « Uno » : une petite fanfare qui monte. Contre-Uno : un buzzer qui descend.
  uno: () => [659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * .09, dur: i === 3 ? .45 : .12, type: "triangle", gain: .28 })),
  catch: () => {
    tone(196, { dur: .22, type: "sawtooth", gain: .2 });
    tone(196, { at: .26, dur: .22, type: "sawtooth", gain: .2 });
    tone(147, { at: .52, dur: .55, type: "sawtooth", gain: .22, to: 98 });
  },
  message: () => { tone(1175, { dur: .07, gain: .12 }); tone(1568, { at: .07, dur: .16, gain: .12 }); },

  howl: () => {
    tone(290, { dur: .8, type: "triangle", gain: .1, to: 560 });
    tone(560, { at: .75, dur: 1.7, type: "triangle", gain: .1, to: 360 });
  },
  rooster: () => {
    tone(700, { dur: .14, type: "sawtooth", gain: .06, to: 1100 });
    tone(900, { at: .18, dur: .14, type: "sawtooth", gain: .06, to: 1300 });
    tone(1250, { at: .36, dur: .55, type: "sawtooth", gain: .06, to: 800 });
  },
  death: () => { tone(110, { dur: 1.4, gain: .25, to: 55 }); tone(220, { dur: 1.1, gain: .08 }); hiss(300, { dur: .5, gain: .15, type: "lowpass" }); },

  found: () => { tone(880, { dur: .1 }); tone(1320, { at: .08, dur: .25 }); },
  reveal: () => { tone(392, { dur: .15, type: "triangle" }); tone(523, { at: .13, dur: .3, type: "triangle" }); }
};

export function play(name) {
  if (!ac || !on || !FX[name]) return;
  bus = buses[GROUP_OF[name] || "fx"];
  FX[name]();
}

// Tic-tac des dix dernières secondes d'un chrono. L'écran étant redessiné
// souvent, chaque seconde ne sonne qu'une fois.
let lastTick = "";
export function tick(until, left) {
  const key = `${until}/${left}`;
  if (left > 10 || left <= 0 || key === lastTick) return;
  lastTick = key;
  play(left <= 3 ? "tock" : "tick");
}

// ---- Frottement du crayon : `force` de 0 à 1, s'éteint seul si rien ne suit ----
let pencil = null, pencilTimer = null;
export function scratch(force) {
  if (!ac) return;
  if (!pencil) {
    const source = noise(), filter = ac.createBiquadFilter();
    pencil = ac.createGain();
    pencil.gain.value = 0;
    filter.type = "bandpass";
    filter.frequency.value = 3200;
    filter.Q.value = .6;
    source.connect(filter).connect(pencil).connect(buses.fx);
    source.start();
  }
  pencil.gain.setTargetAtTime(Math.min(force, 1) * .22, ac.currentTime, .03);
  clearTimeout(pencilTimer);
  if (force) pencilTimer = setTimeout(() => scratch(0), 160);
}

// ---- Ambiances en boucle ----
const AMBIENCES = {
  // Nuit : vent qui enfle et retombe, grillons, une chouette de temps en temps.
  night(out) {
    const wind = noise(), filter = ac.createBiquadFilter(), gain = ac.createGain(), sway = ac.createOscillator(), depth = ac.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    gain.gain.value = .14;
    sway.frequency.value = .07;
    depth.gain.value = 260;
    sway.connect(depth).connect(filter.frequency);
    wind.connect(filter).connect(gain).connect(out);
    wind.start();
    sway.start();
    const timer = setInterval(() => {
      for (let i = 0; i < 4; i++) tone(4300, { at: i * .07, dur: .04, gain: .012, out });
      if (Math.random() < .07) { tone(350, { dur: .35, gain: .06, to: 320, out }); tone(330, { at: .5, dur: .6, gain: .06, to: 290, out }); }
    }, 1300);
    return () => { clearInterval(timer); wind.stop(); sway.stop(); };
  },
  // Jour : une brise légère et quelques oiseaux.
  day(out) {
    const breeze = noise(), filter = ac.createBiquadFilter(), gain = ac.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    gain.gain.value = .035;
    breeze.connect(filter).connect(gain).connect(out);
    breeze.start();
    const timer = setInterval(() => {
      if (Math.random() > .45) return;
      const base = 2200 + Math.random() * 1400;
      for (let i = 0; i < 2 + Math.round(Math.random() * 2); i++) tone(base, { at: i * .13, dur: .09, gain: .025, to: base * 1.35, out });
    }, 900);
    return () => { clearInterval(timer); breeze.stop(); };
  }
};

let wanted = null, current = null;
// Lance l'ambiance `name`, ou coupe tout avec null. Redemander la même ne relance rien.
export function ambience(name) {
  wanted = name || null;
  if (!ac || current?.name === wanted) return;
  if (current) {
    const old = current;
    old.out.gain.setTargetAtTime(0, ac.currentTime, .4);
    setTimeout(() => { old.stop(); old.out.disconnect(); }, 2500);
    current = null;
  }
  if (!wanted) return;
  const out = ac.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ac.currentTime, .8);
  out.connect(buses.amb);
  current = { name: wanted, out, stop: AMBIENCES[wanted](out) };
}

// ---- Paramètres : une fenêtre posée hors de l'écran de jeu, qui survit à ses réaffichages ----
let dialog = null;

function slider(id, label, sample) {
  const range = h("input", { class: "volume", type: "range", min: "0", max: "1", step: "0.05", value: String(volumes[id]), "aria-label": `Volume : ${label}` });
  range.addEventListener("input", () => {
    volumes[id] = Number(range.value);
    localStorage.setItem("volumes", JSON.stringify(volumes));
    level();
  });
  // Au relâchement, un exemple pour entendre le réglage.
  if (sample) range.addEventListener("change", () => play(sample));
  return h("label", { class: "vol-row" }, h("span", null, label), range);
}

function settings() {
  const mute = h("button", { class: "filter-chip", type: "button", "aria-pressed": String(on) }, on ? "Son activé" : "Son coupé");
  mute.addEventListener("click", () => {
    on = !on;
    localStorage.setItem("sound", on ? "on" : "off");
    mute.setAttribute("aria-pressed", String(on));
    mute.textContent = on ? "Son activé" : "Son coupé";
    level();
  });
  const close = h("button", { class: "btn btn-ink", type: "button", onclick: () => dialog.close() }, "Fermer");
  return h("dialog", { class: "sheet settings", "aria-label": "Paramètres" },
    h("h2", null, "Paramètres"),
    mute,
    slider("master", "Volume général", "card"),
    h("p", { class: "rule" }, "Règle chaque famille de sons à ton goût :"),
    GROUPS.map(([id, label, sample]) => slider(id, label, sample)),
    close);
}

// Petit bouton « Paramètres », à poser directement dans le tapis : il se range dans son coin en haut à gauche.
export function soundControl() {
  return h("button", {
    class: "settings-btn", type: "button", "aria-label": "Paramètres", title: "Paramètres",
    onclick: () => {
      dialog ??= document.body.appendChild(settings());
      dialog.showModal();
    }
  }, icon("sliders"));
}
