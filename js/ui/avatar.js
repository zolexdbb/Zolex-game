// Avatars des pions. Deux formes, rangées dans une même chaîne :
//  - "a:3-1-0-2-4"  : avatar composé (fond, peau, yeux, bouche, coiffe) ;
//  - "data:image/…" : photo choisie par le joueur, réduite à 96 px.
const INK = "#1d1a16";
const BG = ["#b5452f", "#1f3550", "#d49a2a", "#7a4a8c", "#2c8a8a", "#f3e9d2", "#d9703c", "#3b3630", "#2f5d46", "#c9a877"];
const SKIN = ["#f6d7b8", "#e9b98d", "#c98f62", "#8d5a3b", "#5c3a26", "#9db88f", "#a9c7e8"];
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
const TOPS = [
  "",
  shape("M14 33a18 18 0 0 1 36 0c-4-6-10-9-18-9s-14 3-18 9z", "#3b2a1f"),
  shape("M13 51V33a19 19 0 0 1 38 0v18h-5V34c-3-5-8-8-14-8s-11 3-14 8v17z", "#d49a2a"),
  shape("M21 6h22v14H21zM14 20h36v4H14z", INK),
  shape("M15 26a17 17 0 0 1 34 0z", "#b5452f") + line("M49 26h9"),
  shape("M19 23l2-13 6 7 5-9 5 9 6-7 2 13z", "#d49a2a"),
  shape("M15 27a17 15 0 0 1 34 0z", "#1f3550") + dot(32, 10.5, 3.2, "#f3e9d2")
];

export const PARTS = [
  ["Fond", BG.length], ["Peau", SKIN.length], ["Yeux", EYES.length], ["Bouche", MOUTHS.length], ["Coiffe", TOPS.length]
];

const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function parseAvatar(code) {
  if (typeof code !== "string" || !code.startsWith("a:")) return null;
  const values = code.slice(2).split("-").map(Number);
  return PARTS.map(([, size], i) => (Number.isInteger(values[i]) && values[i] >= 0 && values[i] < size ? values[i] : 0));
}

export const makeAvatar = (values) => `a:${values.join("-")}`;
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
  const [bg, skin, eyes, mouth, top] = parts;
  const holder = document.createElement("span");
  // Assemblé à partir de fragments fixes et d'indices bornés : aucun texte de joueur.
  holder.innerHTML = `<svg class="avatar" viewBox="0 0 64 64" aria-hidden="true">`
    + `<rect width="64" height="64" fill="${BG[bg]}"/>`
    + `<circle cx="32" cy="37" r="18" fill="${SKIN[skin]}" stroke="${INK}" stroke-width="2"/>`
    + EYES[eyes] + MOUTHS[mouth] + TOPS[top] + `</svg>`;
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
