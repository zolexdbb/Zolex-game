// Icônes maison : même grille 24 px, traits épais, bouts ronds.
const PATHS = {
  crown: "M4 19h16M4.5 15.5 3 7l5 4 4-6 4 6 5-4-1.5 8.5z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  leave: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9",
  box: "M3 8l9-4 9 4v8l-9 4-9-4zM3 8l9 4 9-4M12 12v8",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  cross: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  skip: "M5 5l8 7-8 7zM18 5v14",
  play: "M7 4.5v15l12-7.5z"
};

export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
