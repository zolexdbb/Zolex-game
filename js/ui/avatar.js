// Avatars des pions. Deux formes, rangées dans une même chaîne :
//  - "a:3-1-0-2-4-0" : avatar composé (fond, peau, yeux, bouche, coiffe, couleur de coiffe) ;
//  - "data:image/…" : photo choisie par le joueur, réduite à 96 px.
const INK = "#1d1a16";
// Les nouvelles teintes s'ajoutent en fin de liste : les avatars déjà créés ne changent pas.
const BG = [
  "#b5452f", "#1f3550", "#d49a2a", "#7a4a8c", "#2c8a8a", "#f3e9d2", "#d9703c", "#3b3630", "#2f5d46", "#c9a877",
  "#e8554d", "#f2d541", "#7fbf4d", "#6fc3e8", "#3a6fd8", "#e58fb5", "#c4547c", "#ffffff"
];
const SKIN = ["#f6d7b8", "#e9b98d", "#c98f62", "#8d5a3b", "#5c3a26", "#9db88f", "#a9c7e8", "#fbe7d3", "#d9a066", "#c7b3e6"];
// Couleur de la coiffe : 0 garde la couleur d'origine de chaque coiffe.
const TINT = [null, "#3b2a1f", "#6b4a2f", "#e8c25a", "#d49a2a", "#b5452f", "#1d1a16", "#9a948a", "#f3e9d2", "#1f3550", "#7a4a8c", "#2f5d46", "#e58fb5", "#6fc3e8"];
const line = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x, y, r, fill = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

const EYES = [
  dot(25, 34, 2.4) + dot(39, 34, 2.4),
  line("M22 35q3-4 6 0M36 35q3-4 6 0"),
  dot(25, 34, 4.5, "#fff") + dot(39, 34, 4.5, "#fff") + dot(26, 34.5, 2) + dot(40, 34.5, 2),
  `<circle cx="25" cy="34" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="34" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/>`
    + line("M30 34h4") + dot(25, 34, 1.8) + dot(39, 34, 1.8),
  dot(25, 34, 2.4) + line("M36 34h6")
];
const MOUTHS = [
  line("M26 43q6 5 12 0"),
  `<ellipse cx="32" cy="44.5" rx="4" ry="3.2" fill="${INK}"/>`,
  line("M27 44.5h10"),
  line("M26 46q6-5 12 0"),
  line("M26 43q6 5 12 0") + dot(34.5, 46.5, 2.2, "#b5452f")
];
const shape = (d, fill) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
// Chaque coiffe se dessine dans la couleur demandée (`c`), ou dans la sienne.
const TOPS = [
  () => "",
  (c = "#3b2a1f") => shape("M14 33a18 18 0 0 1 36 0c-4-6-10-9-18-9s-14 3-18 9z", c),
  (c = "#d49a2a") => shape("M13 51V33a19 19 0 0 1 38 0v18h-5V34c-3-5-8-8-14-8s-11 3-14 8v17z", c),
  (c = INK) => shape("M21 6h22v14H21zM14 20h36v4H14z", c),
  (c = "#b5452f") => shape("M15 26a17 17 0 0 1 34 0z", c) + line("M49 26h9"),
  (c = "#d49a2a") => shape("M19 23l2-13 6 7 5-9 5 9 6-7 2 13z", c),
  (c = "#1f3550") => shape("M15 27a17 15 0 0 1 34 0z", c) + dot(32, 10.5, 3.2, "#f3e9d2"),
  (c = "#3b2a1f") => shape("M13 34c0-13 8-20 19-20s19 7 19 20c-3-4-6-6-9-6l-2-5-3 5-5-6-3 6-4-4-3 4c-3 0-6 2-9 6z", c),
  (c = "#d49a2a") => shape("M17 22a15 15 0 0 1 30 0c0 3-3 4-6 3-2-2-5-3-9-3s-7 1-9 3c-3 1-6 0-6-3zM44 19a5 5 0 1 1 6 7z", c),
  (c = "#7a4a8c") => shape("M32 2l13 20H19z", c) + dot(32, 3, 2.6, "#f3e9d2")
];

export const PARTS = [
  ["Fond", BG.length], ["Peau", SKIN.length], ["Yeux", EYES.length], ["Bouche", MOUTHS.length],
  ["Coiffe", TOPS.length], ["Couleur", TINT.length]
];
// Aperçu d'une teinte, pour les pièces qui ne sont qu'une couleur.
export const SWATCHES = { 0: BG, 1: SKIN, 5: TINT };

const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function parseAvatar(code) {
  if (typeof code !== "string" || !code.startsWith("a:")) return null;
  const values = code.slice(2).split("-").map(Number);
  return PARTS.map(([, size], i) => (Number.isInteger(values[i]) && values[i] >= 0 && values[i] < size ? values[i] : 0));
}

export const makeAvatar = (values) => `a:${values.join("-")}`;
// Un avatar où une seule pièce change : sert à montrer chaque choix possible.
export const withPart = (code, i, value) => {
  const values = parseAvatar(code) || PARTS.map(() => 0);
  values[i] = value;
  return makeAvatar(values);
};
export const randomAvatar = () => makeAvatar(PARTS.map(([, size]) => Math.floor(Math.random() * size)));

// Nœud à poser dans un pion, ou null si le joueur n'a pas d'avatar valide.
export function avatarNode(code) {
  if (typeof code === "string" && IMAGE.test(code)) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.alt = "";
    img.src = code;
    return img;
  }
  const parts = parseAvatar(code);
  if (!parts) return null;
  const [bg, skin, eyes, mouth, top, tint] = parts;
  const holder = document.createElement("span");
  // Assemblé à partir de fragments fixes et d'indices bornés : aucun texte de joueur.
  holder.innerHTML = `<svg class="avatar" viewBox="0 0 64 64" aria-hidden="true">`
    + `<rect width="64" height="64" fill="${BG[bg]}"/>`
    + `<circle cx="32" cy="37" r="18" fill="${SKIN[skin]}" stroke="${INK}" stroke-width="2"/>`
    + EYES[eyes] + MOUTHS[mouth] + TOPS[top](TINT[tint] || undefined) + `</svg>`;
  return holder.firstChild;
}

// Réduit une photo à un carré de 96 px, assez léger pour voyager avec la table.
export async function imageAvatar(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("Impossible de lire cette image."); }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  canvas.getContext("2d").drawImage(bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 96, 96);
  const data = canvas.toDataURL("image/jpeg", 0.72);
  if (!IMAGE.test(data) || data.length > 12000) throw new Error("Cette image est trop lourde, essaie-en une autre.");
  return data;
}
