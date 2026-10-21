// Profil du joueur : pseudo et pion. Servent à l'accueil et dans le salon.
import { h, busy } from "./dom.js";
import { PARTS, SWATCHES, parseAvatar, withPart, randomAvatar, avatarNode, imageAvatar } from "./avatar.js";
import { cleanName } from "../room.js";

// Un pseudo doit contenir au moins une lettre ou un chiffre (pas seulement des espaces ou des signes).
export const validName = (name) => /[\p{L}\p{N}]/u.test(cleanName(name));
export const NAME_RULE = "Ton pseudo doit contenir au moins une lettre ou un chiffre.";

// Onglet de pièce ouvert : gardé quand l'écran est redessiné (le salon l'est à chaque changement).
const ui = { tab: 0, open: false };

// Choix du pion : un avatar composé pièce par pièce, une image, ou la simple initiale.
// `save(code)` reçoit chaque nouvel avatar ("" = sans avatar).
export function avatarEditor({ code: start, save, fail }) {
  let code = start || "";
  const root = h("div", { class: "avatar-edit" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    file.value = "";
    if (!chosen) return;
    try { change(await imageAvatar(chosen)); ui.open = false; paint(); } catch (e) { fail?.(e); }
  });

  function change(next) {
    code = next;
    save(next);
    paint();
  }

  // Une grille de vignettes par pièce : on voit chaque choix avant de le prendre.
  function builder() {
    const values = parseAvatar(code) || PARTS.map(() => 0);
    const tabs = h("div", { class: "avatar-tabs", role: "tablist" }, PARTS.map(([label], i) =>
      h("button", {
        class: "filter-chip", type: "button", role: "tab", "aria-selected": String(i === ui.tab), "aria-pressed": String(i === ui.tab),
        onclick: () => { ui.tab = i; paint(); }
      }, label)));
    const [label, size] = PARTS[ui.tab];
    const colors = SWATCHES[ui.tab];
    const grid = h("div", { class: "avatar-grid", role: "tabpanel", "aria-label": label },
      Array.from({ length: size }, (_, v) => {
        const pressed = values[ui.tab] === v;
        const look = colors
          ? h("span", { class: `avatar-swatch${colors[v] ? "" : " is-native"}` })
          : avatarNode(withPart(code, ui.tab, v));
        if (colors && colors[v]) look.style.background = colors[v];
        return h("button", {
          class: "avatar-choice", type: "button", "aria-pressed": String(pressed),
          "aria-label": colors && !colors[v] ? `${label} d'origine` : `${label} ${v + 1}`,
          onclick: () => change(withPart(code, ui.tab, v))
        }, look);
      }));
    return h("div", { class: "avatar-builder" }, tabs, grid,
      h("button", { class: "btn btn-mini", type: "button", onclick: () => change(randomAvatar()) }, "Au hasard"));
  }

  function paint() {
    const face = avatarNode(code);
    const preview = h("div", { class: `pawn-disc avatar-preview${face ? " has-avatar" : ""}` }, face || h("span", null, "?"));
    root.replaceChildren(...[
      preview,
      h("div", { class: "avatar-actions" },
        h("button", {
          class: "btn btn-mini", type: "button", "aria-expanded": String(ui.open),
          onclick: () => {
            ui.open = !ui.open;
            if (ui.open && !parseAvatar(code)) change(randomAvatar()); else paint();
          }
        }, ui.open ? "Fermer" : "Composer un avatar"),
        h("button", { class: "btn btn-mini", type: "button", onclick: () => file.click() }, "Choisir une image"),
        h("button", { class: "btn btn-mini", type: "button", onclick: () => { ui.open = false; change(""); } }, "Sans avatar")),
      ui.open && parseAvatar(code) && builder(),
      file].filter(Boolean));
  }

  paint();
  return root;
}

// Feuille « Mon profil » du salon : pseudo et pion, enregistrés à la table.
const draft = { name: null };
export function profileSheet({ player, onSave, onClose }) {
  if (draft.name == null) draft.name = player.name;
  const error = h("p", { class: "notice", role: "alert", hidden: true });
  const fail = (e) => { error.textContent = e.message; error.hidden = false; };
  const input = h("input", {
    id: "profile-name", class: "field", type: "text", maxlength: "20", autocomplete: "nickname",
    value: draft.name, oninput: () => { draft.name = input.value; }
  });
  const rename = h("button", { class: "btn btn-brick", type: "submit" }, "Renommer");
  const form = h("form", { class: "join" }, input, rename);
  form.addEventListener("submit", busy(rename, async () => {
    if (!validName(input.value)) throw new Error(NAME_RULE);
    error.hidden = true;
    await onSave({ name: cleanName(input.value) });
    localStorage.setItem("name", cleanName(input.value));
    sessionStorage.setItem("name", cleanName(input.value));
  }, fail));
  return h("section", { class: "sheet profile-sheet" },
    h("h2", null, "Mon profil"),
    h("label", { class: "field-label", for: "profile-name" }, "Ton pseudo"),
    form, error,
    h("p", { class: "field-label" }, "Ton pion"),
    avatarEditor({
      code: player.avatar,
      save: (code) => {
        if (code) localStorage.setItem("avatar", code); else localStorage.removeItem("avatar");
        onSave({ avatar: code || null }).catch(fail);
      },
      fail
    }),
    h("button", { class: "btn btn-cream", type: "button", onclick: () => { draft.name = null; onClose(); } }, "Fermer"));
}
