// Capy Deal : le capybara moustachu (à la place de M. Monopoly) et la mandarine (la monnaie).
// Les SVG sont assemblés à partir de pièces écrites ici, jamais à partir d'un texte de joueur :
// on peut donc les analyser comme du balisage sans risque.

const INK = "#1d1a16", FUR = "#9a6b43", SNOUT = "#b78a60", BROW = "#3a2618", RED = "#b5452f", GOLD = "#e0b23a";

const parse = (markup) => document.importNode(
  new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" ${markup}</svg>`, "image/svg+xml").documentElement, true);

// La mandarine : orange, reflet, queue et feuille.
export const man = (cls = "d-man") => parse(`class="${cls}" viewBox="0 0 24 24" aria-hidden="true">`
  + `<circle cx="12" cy="14" r="9" fill="#f28c28" stroke="#9a4a0f" stroke-width="1.5"/><circle cx="9" cy="11" r="2.2" fill="#ffc27a"/>`
  + `<path d="M12 5.5V3" stroke="#5a3a1a" stroke-width="1.6" stroke-linecap="round"/>`
  + `<path d="M12.5 4.5Q17 0 21 3Q17 7 12.5 4.5Z" fill="#4f9a3a" stroke="#2f5d1f" stroke-width=".8"/>`);

const line = (d, color = INK, width = 2.6) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;

// Les pièces du visage. Chaque œil est dessiné à l'abscisse x (38 ou 62).
const EYES = {
  dot: (x) => `<circle cx="${x}" cy="50" r="3.6" fill="${INK}"/><circle cx="${x + 1.2}" cy="48.8" r="1.1" fill="#fff"/>`,
  happy: (x) => line(`M${x - 4} 51Q${x} 45 ${x + 4} 51`),
  closed: (x) => line(`M${x - 4} 49Q${x} 53 ${x + 4} 49`),
  wide: (x) => `<circle cx="${x}" cy="50" r="6" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="${x}" cy="50" r="2.6" fill="${INK}"/>`,
  side: (x) => `<circle cx="${x}" cy="50" r="5" fill="#fff" stroke="${INK}" stroke-width="1.5"/><circle cx="${x - 2.2}" cy="50.5" r="2.4" fill="${INK}"/>`,
  coin: (x) => `<circle cx="${x}" cy="50" r="5.5" fill="#f28c28" stroke="#9a4a0f" stroke-width="1.5"/><path d="M${x} 44.5V42" stroke="#4f9a3a" stroke-width="2"/>`,
  red: (x) => `<circle cx="${x}" cy="50" r="4.4" fill="#e8554d"/><circle cx="${x}" cy="50" r="1.6" fill="${INK}"/>`,
  narrow: (x) => `<circle cx="${x}" cy="51" r="3.6" fill="${INK}"/><rect x="${x - 5}" y="45" width="10" height="5.5" fill="${FUR}"/>` + line(`M${x - 5} 50.5H${x + 5}`, INK, 1.8),
  spiral: (x) => `<circle cx="${x}" cy="50" r="5.5" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`
    + line(`M${x} 50m-1 0a1 1 0 1 1 2 0a2.2 2.2 0 1 1 -4.2 0a3.5 3.5 0 1 1 7 0`, INK, 1.2)
};
const BROWS = {
  angry: line("M31 41L44 46") + line("M69 41L56 46"),
  sad: line("M31 46L44 41") + line("M69 46L56 41"),
  up: line("M32 41Q38 36 44 41") + line("M56 41Q62 36 68 41"),
  flat: line("M32 42H44") + line("M56 42H68"),
  evil: line("M30 40L45 47", INK, 3.2) + line("M70 40L55 47", INK, 3.2),
  one: line("M32 41Q38 36 44 41") + line("M56 44L69 42")
};
// La bouche se lit sous la moustache.
const MOUTHS = {
  smile: line("M44 79Q50 83.5 56 79", INK, 2.2),
  grin: `<path d="M40 77Q50 87 60 77Z" fill="${INK}"/><path d="M42 77.6H58V80H42Z" fill="#fff"/>`,
  teeth: `<path d="M39 76Q50 88 61 76Z" fill="#5a1414"/><path d="M40 76.5L43 80L46 77L49 80.5L52 77L55 80L58 77L60 76.5Z" fill="#fff"/>`,
  o: `<ellipse cx="50" cy="80" rx="3.2" ry="3.8" fill="${INK}"/>`,
  frown: line("M44 82Q50 77 56 82", INK, 2.2),
  flat: line("M45 80H55", INK, 2.2)
};
// Le haut-de-forme a un liseré clair pour rester visible sur les fonds sombres.
const TOP = `<rect x="32" y="4" width="36" height="26" rx="2" fill="${INK}" stroke="#5a5048" stroke-width="1"/><rect x="32" y="21" width="36" height="5" fill="${RED}"/>`
  + `<rect x="20" y="28" width="60" height="6" rx="3" fill="${INK}" stroke="#5a5048" stroke-width="1"/>`;
const HATS = {
  top: TOP,
  tilt: `<g transform="rotate(-14 50 30)">${TOP}</g>`,
  party: `<path d="M50 0L36 34H64Z" fill="#c4547c"/><path d="M43 17H57M40 25H60" stroke="${GOLD}" stroke-width="3"/><circle cx="50" cy="2" r="3.5" fill="${GOLD}"/>`,
  crown: `<path d="M30 33L32 14L41 24L50 9L59 24L68 14L70 33Z" fill="${GOLD}" stroke="#86301f" stroke-width="1.5"/>`,
  helmet: `<path d="M24 34Q50 4 76 34Z" fill="${INK}" stroke="#5a5048" stroke-width="1"/><rect x="20" y="30" width="60" height="5" rx="2" fill="${INK}"/><circle cx="50" cy="22" r="5" fill="${GOLD}"/>`,
  hardhat: `<path d="M24 34Q24 10 50 10Q76 10 76 34Z" fill="${GOLD}" stroke="#86301f" stroke-width="1.5"/>`
    + `<rect x="18" y="30" width="64" height="5" rx="2" fill="${GOLD}" stroke="#86301f" stroke-width="1.2"/><path d="M50 10V30" stroke="#86301f" stroke-width="2"/>`
};
// Accessoires : « under » se dessinent sous les yeux, les autres par-dessus tout.
const UNDER = {
  blush: `<ellipse cx="31" cy="60" rx="5" ry="3" fill="#e58fb5" opacity=".8"/><ellipse cx="69" cy="60" rx="5" ry="3" fill="#e58fb5" opacity=".8"/>`,
  mask: `<rect x="25" y="43" width="50" height="13" rx="6.5" fill="${INK}"/>`
};
const EXTRAS = {
  patch: `<path d="M24 36L76 58" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="50" r="7" fill="${INK}"/>`,
  monocle: `<circle cx="62" cy="50" r="8" fill="none" stroke="${GOLD}" stroke-width="2.2"/><path d="M69 54Q76 66 72 80" fill="none" stroke="${GOLD}" stroke-width="1.4"/>`,
  glasses: `<circle cx="38" cy="50" r="7" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="50" r="7" fill="none" stroke="${INK}" stroke-width="2"/><path d="M45 50H55" stroke="${INK}" stroke-width="2"/>`,
  sweat: `<path d="M80 38q4 7 0 10q-4-3 0-10z" fill="#8ec5e0"/><path d="M19 46q3 5 0 7q-3-2 0-7z" fill="#8ec5e0"/>`,
  stars: `<path d="M12 22l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5z" fill="${GOLD}"/><path d="M86 18l1.5 4 4 .4-3 2.4 1 4-3.5-2.4-3.5 2.4 1-4-3-2.4 4-.4z" fill="${GOLD}"/>`,
  magnify: `<circle cx="84" cy="66" r="8" fill="#e6f1fb" stroke="#fffaf0" stroke-width="2.5"/><path d="M78 72L70 82" stroke="#fffaf0" stroke-width="4" stroke-linecap="round"/>`,
  coins: `<circle cx="13" cy="80" r="7" fill="#f28c28" stroke="#9a4a0f" stroke-width="1.5"/><circle cx="87" cy="80" r="7" fill="#f28c28" stroke="#9a4a0f" stroke-width="1.5"/>`
    + `<path d="M13 73V70M87 73V70" stroke="#4f9a3a" stroke-width="2"/>`,
  hand: `<path d="M80 60v-12q0-3 3-3t3 3v-6q0-3 3-3t3 3v24q0 8-7 8h-3q-4 0-6-4l-4-8q-1-3 2-3.5t4 2z" fill="${FUR}" stroke="${INK}" stroke-width="1.5"/>`,
  swag: `<path d="M80 70q8-2 10 6q2 10-8 12q-10 1-10-8q0-7 8-10z" fill="#c9a877" stroke="${INK}" stroke-width="1.5"/><path d="M78 72l8-6" stroke="${INK}" stroke-width="2"/>`
};

// Le capybara en buste, avec son humeur : { eyes, brows, mouth, hat, extras }.
// eyes peut être une paire [gauche, droite] pour un clin d'œil.
export function capy({ eyes = "dot", brows, mouth, hat = "top", extras = [] } = {}, cls = "d-capy") {
  const [left, right] = Array.isArray(eyes) ? eyes : [eyes, eyes];
  const pick = (table) => extras.filter((k) => table[k]).map((k) => table[k]).join("");
  return parse(`class="${cls}" viewBox="0 0 100 100" aria-hidden="true">`
    + `<path d="M14 100Q16 82 34 80H66Q84 82 86 100Z" fill="#3a2a2a" stroke="#5a4040" stroke-width="1"/><path d="M42 80L50 92L58 80Z" fill="#fffaf0"/>`
    + `<ellipse cx="29" cy="38" rx="6" ry="5" fill="#6e4a2e"/><ellipse cx="71" cy="38" rx="6" ry="5" fill="#6e4a2e"/>`
    + `<rect x="22" y="34" width="56" height="48" rx="20" fill="${FUR}" stroke="${INK}" stroke-width="1.2"/>`
    + pick({ blush: UNDER.blush })
    + `<rect x="29" y="58" width="42" height="24" rx="11" fill="${SNOUT}"/>`
    + pick({ mask: UNDER.mask })
    + EYES[left](38) + EYES[right](62) + (BROWS[brows] || "")
    + `<ellipse cx="44" cy="63" rx="2.4" ry="1.8" fill="${BROW}"/><ellipse cx="56" cy="63" rx="2.4" ry="1.8" fill="${BROW}"/>`
    + (MOUTHS[mouth] || "")
    + `<path d="M50 70C43 64 33 64 27 70C23 74 18 73 17 68C18 77 30 80 39 75C45 72 48 72 50 72C52 72 55 72 61 75C70 80 82 77 83 68C82 73 77 74 73 70C67 64 57 64 50 70Z" fill="${BROW}"/>`
    + HATS[hat]
    + `<path d="M50 88L37 82V94Z M50 88L63 82V94Z" fill="${RED}"/><circle cx="50" cy="88" r="3.5" fill="#86301f"/>`
    + pick(EXTRAS));
}
