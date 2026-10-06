// Choix des mots d'une partie, commun aux jeux de mots : thèmes de la banque du
// site, ou mots saisis par l'hôte dans le salon.
import { h } from "./dom.js";
import { CATEGORIES } from "../games/undercover/words.js";

export const WORD_DEFAULTS = {
  source: "site",
  cats: Object.fromEntries(CATEGORIES.map((category) => [category.id, 1])),
  customText: ""
};

const MAX_WORD = 30;

// Familles de mots des thèmes cochés.
export function siteGroups(settings) {
  return CATEGORIES.filter((category) => settings.cats?.[category.id]).flatMap((category) => category.groups);
}

const clean = (word) => word.replace(/\s+/g, " ").trim();

function splitWords(text) {
  const words = [...new Set(text.split(";").map(clean).filter(Boolean))];
  const long = words.find((word) => word.length > MAX_WORD);
  return long ? { error: `« ${long.slice(0, 20)}… » est trop long (${MAX_WORD} caractères au plus par mot).` } : { words };
}

// Liste simple : mot;mot;mot (What's Drawing ?).
export function parseWords(text) {
  const { words, error } = splitWords(String(text || ""));
  if (error) return { error };
  if (/[[\]()]/.test(text)) return { error: "Pas de crochets ni de parenthèses ici : écris seulement les mots, séparés par « ; »." };
  if (words.length < 3) return { error: `Il faut au moins 3 mots séparés par « ; » (il y en a ${words.length}).` };
  return { words };
}

// Groupes de mots proches : [Nom](mot;mot;mot);[Autre](mot;mot) (Undercover).
// Le nom entre crochets est facultatif : sans lui, le groupe s'appelle « Groupe n ».
export function parseGroups(text) {
  const source = String(text || "");
  const groups = [];
  let i = 0;
  const skip = () => { while (i < source.length && /\s/.test(source[i])) i++; };
  for (skip(); i < source.length; skip()) {
    const number = groups.length + 1;
    let name = `Groupe ${number}`;
    if (source[i] === "[") {
      const end = source.indexOf("]", i);
      if (end < 0) return { error: `Groupe ${number} : le crochet « [ » n'est pas refermé par « ] ».` };
      name = clean(source.slice(i + 1, end)) || name;
      i = end + 1;
      skip();
    }
    if (source[i] !== "(") {
      const found = source.slice(i, i + 15).trim();
      return { error: `${name} : j'attends une parenthèse « ( » avant les mots${found ? `, pas « ${found} »` : ""}. Exemple : [Fruits](pomme;poire;pêche)` };
    }
    const close = source.indexOf(")", i);
    if (close < 0) return { error: `${name} : la parenthèse « ( » n'est pas refermée par « ) ».` };
    const inner = source.slice(i + 1, close);
    if (/[[(]/.test(inner)) return { error: `${name} : il manque « ) » avant le groupe suivant.` };
    const { words, error } = splitWords(inner);
    if (error) return { error: `${name} : ${error}` };
    if (words.length < 2) return { error: `${name} : il faut au moins 2 mots différents, séparés par « ; ».` };
    groups.push({ name, words });
    i = close + 1;
    skip();
    if (i < source.length && source[i] !== ";") return { error: `Il manque un « ; » après le groupe « ${name} ».` };
    i++;
  }
  if (!groups.length) return { error: "Écris au moins un groupe, par exemple : [Fruits](pomme;poire;pêche)" };
  return { groups };
}

const parse = (text, grouped) => (grouped ? parseGroups(text) : parseWords(text));

// Renvoie la raison pour laquelle les mots ne permettent pas de jouer, ou null.
export function checkWords(settings, grouped) {
  if (settings.source !== "perso") return siteGroups(settings).length ? null : "Choisis au moins un thème de mots.";
  if (!clean(settings.customText || "")) return "L'hôte doit d'abord écrire les mots de la partie.";
  return parse(settings.customText, grouped).error || null;
}

const drafts = {}; // saisie en cours de l'hôte, gardée d'un affichage du salon à l'autre

// Bloc de réglage à placer dans le salon d'un jeu. `grouped` : le jeu a besoin
// de groupes de mots proches (Undercover) plutôt que d'une simple liste.
export function wordSetup({ gameId, grouped, settings, isHost, setSettings }) {
  const perso = settings.source === "perso";
  const tab = (source, label) => h("button", {
    class: "filter-chip", type: "button", "aria-pressed": String((source === "perso") === perso), disabled: !isHost,
    onclick: () => setSettings({ ...settings, source })
  }, label);
  const head = [
    h("h3", { class: "setup-title" }, "Les mots"),
    h("div", { class: "filters", role: "group", "aria-label": "Origine des mots" },
      tab("site", "Mots du site"), tab("perso", "Mots perso"))
  ];

  if (!perso) {
    return h("div", { class: "word-setup" }, head,
      h("p", { class: "rule" }, "Coche les thèmes qui peuvent sortir."),
      h("div", { class: "filters", role: "group", "aria-label": "Thèmes de mots" },
        CATEGORIES.map((category) => h("button", {
          class: "filter-chip", type: "button", disabled: !isHost, "aria-pressed": String(!!settings.cats?.[category.id]),
          onclick: () => setSettings({ ...settings, cats: { ...settings.cats, [category.id]: settings.cats?.[category.id] ? 0 : 1 } })
        }, category.name))));
  }

  const saved = settings.customText || "";
  const result = saved ? parse(saved, grouped) : {};
  const summary = result.groups
    ? `${result.groups.length} groupe(s) enregistré(s) : ${result.groups.map((group) => `${group.name} (${group.words.length})`).join(", ")}.`
    : result.words ? `${result.words.length} mots enregistrés.`
    : "Aucun mot enregistré pour l'instant.";

  if (!isHost) {
    return h("div", { class: "word-setup" }, head,
      h("p", { class: "rule" }, "L'hôte écrit les mots de la partie : seuls ceux-ci sortiront, sans les mots du site."),
      h("p", null, summary));
  }

  const draft = (drafts[gameId] ??= { text: saved, error: "" });
  const input = h("textarea", {
    id: `words-${gameId}`, class: "field field-words", rows: "5", spellcheck: false,
    placeholder: grouped ? "[Fruits](pomme;poire;pêche);[Félins](chat;tigre;lion)" : "pomme;vélo;tour Eiffel;dinosaure",
    oninput: () => { draft.text = input.value; }
  });
  input.value = draft.text;
  const error = h("p", { class: "notice", role: "alert", hidden: !draft.error }, draft.error);
  const save = h("button", {
    class: "btn btn-ink", type: "button",
    onclick: () => {
      draft.error = parse(input.value, grouped).error || "";
      error.textContent = draft.error;
      error.hidden = !draft.error;
      if (!draft.error) setSettings({ ...settings, customText: input.value.slice(0, 6000) });
    }
  }, "Enregistrer les mots");

  return h("div", { class: "word-setup" }, head,
    h("p", { class: "rule" }, grouped
      ? "Écris des groupes de mots proches, séparés par « ; ». Le nom entre crochets est facultatif. Deux mots d'un même groupe seront tirés à chaque partie."
      : "Écris tes mots, séparés par « ; ». Seuls ceux-ci sortiront, sans les mots du site."),
    h("p", { class: "format" }, grouped ? "[nom du groupe](mot;mot;mot);[autre groupe](mot;mot)" : "mot;mot;mot"),
    input, error, save,
    h("p", { class: "rule" }, draft.text !== saved && saved ? `${summary} Tes dernières modifications ne sont pas enregistrées.` : summary)
  );
}
