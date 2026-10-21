import { h, busy } from "../ui/dom.js";
import { cleanName } from "../room.js";
import { soundControl } from "../ui/sound.js";
import { games, upcoming } from "../registry.js";
import { avatarEditor, validName, NAME_RULE } from "../ui/profile.js";
import { icon } from "../ui/icons.js";

export function lid() {
  return h("header", { class: "lid" },
    h("h1", { class: "lid-title" }, "La Table", h("br"), "de Zolex"),
    h("p", { class: "lid-bottom" }, "Jeux de société en ligne")
  );
}

export function homeView({ name, code, message, onCreate, onJoin, onLocal }) {
  const error = h("p", { class: "notice", role: "alert", hidden: !message }, message || "");
  const fail = (e) => { error.textContent = e.message; error.hidden = false; };

  const nameInput = h("input", {
    id: "name", class: "field", type: "text", maxlength: "20", autocomplete: "nickname",
    placeholder: "Ton pseudo", value: name || ""
  });
  const codeInput = h("input", {
    id: "code", class: "field field-code", type: "text", maxlength: "4", autocomplete: "off",
    autocapitalize: "characters", spellcheck: false, placeholder: "ABCD", value: code || "",
    oninput: () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, ""); }
  });

  const player = () => {
    const value = cleanName(nameInput.value);
    if (!value) { nameInput.focus(); throw new Error("Choisis d'abord ton pseudo."); }
    if (!validName(value)) { nameInput.focus(); throw new Error(NAME_RULE); }
    return value;
  };

  const createBtn = h("button", { class: "btn btn-brick", type: "button" }, "Créer une table");
  createBtn.addEventListener("click", busy(createBtn, () => onCreate(player()), fail));

  const joinBtn = h("button", { class: "btn btn-ink", type: "submit" }, "Rejoindre");
  const joinForm = h("form", { class: "join join-code" }, codeInput, joinBtn);
  joinForm.addEventListener("submit", busy(joinBtn, () => {
    const who = player();
    if (codeInput.value.length !== 4) { codeInput.focus(); throw new Error("Le code d'une table compte 4 lettres."); }
    return onJoin(codeInput.value, who);
  }, fail));

  const sealed = upcoming.filter((u) => !games.some((g) => g.id === u.id));

  return h("main", { class: "mat mat-home" },
    lid(),
    h("section", { class: "sheet" },
      h("label", { class: "field-label", for: "name" }, "Ton pseudo"),
      nameInput,
      h("span", { class: "field-label" }, "Ton pion"),
      avatarEditor({
        code: localStorage.getItem("avatar"),
        save: (next) => (next ? localStorage.setItem("avatar", next) : localStorage.removeItem("avatar")),
        fail
      }),
      h("div", { class: "choices" },
        h("div", { class: "choice" },
          h("h2", null, "Créer une table"),
          h("p", { class: "rule" }, "Tu reçois un code à partager avec tes amis."),
          createBtn),
        h("div", { class: "choice" },
          h("h2", null, "Rejoindre une table"),
          h("label", { class: "rule", for: "code" }, "Entre le code à 4 lettres qu'on t'a donné."),
          joinForm)
      ),
      error,
      h("div", { class: "choice choice-local" },
        h("h2", null, "Jouer en local"),
        h("p", { class: "rule" }, "Undercover sans connexion : le téléphone passe de main en main."),
        h("button", { class: "btn btn-cream", type: "button", onclick: onLocal }, icon("person"), "Partie locale"))
    ),
    h("section", { class: "sheet" },
      h("h2", null, "Les jeux"),
      h("div", { class: "shelf" },
        games.map((g) => h("div", { class: `gamebox box-${g.id} is-shown` },
          h("strong", null, g.name), h("small", null, g.tagline))),
        sealed.map((u) => h("div", { class: `gamebox box-${u.id} is-sealed` },
          h("strong", null, u.name), h("small", null, u.tagline), h("span", { class: "stamp" }, "Bientôt")))
      )
    ),
    soundControl()
  );
}

export function noticeView(title, ...paragraphs) {
  return h("main", { class: "mat mat-narrow" },
    lid(),
    h("section", { class: "sheet" }, h("h2", null, title), paragraphs)
  );
}
