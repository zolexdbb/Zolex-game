import { h, busy } from "../ui/dom.js";
import { cleanName } from "../room.js";

export function lid() {
  return h("header", { class: "lid" },
    h("p", { class: "lid-top" }, "Ludothèque en ligne"),
    h("h1", { class: "lid-title" }, "La Table", h("br"), "de Zolex"),
    h("p", { class: "lid-bottom" }, "Jeux de société entre amis · dès 3 joueurs")
  );
}

export function homeView({ name, code, message, onCreate, onJoin }) {
  const error = h("p", { class: "notice", role: "alert", hidden: !message }, message || "");
  const fail = (e) => { error.textContent = e.message; error.hidden = false; };

  const nameInput = h("input", {
    id: "name", class: "field", type: "text", maxlength: "20", autocomplete: "nickname",
    placeholder: "Ton prénom", value: name || ""
  });
  const codeInput = h("input", {
    id: "code", class: "field field-code", type: "text", maxlength: "4", autocomplete: "off",
    autocapitalize: "characters", spellcheck: false, placeholder: "ABCD", value: code || "",
    oninput: () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, ""); }
  });

  const player = () => {
    const value = cleanName(nameInput.value);
    if (!value) { nameInput.focus(); throw new Error("Écris d'abord ton prénom sur l'étiquette."); }
    return value;
  };

  const createBtn = h("button", { class: "btn btn-brick", type: "button" }, "Ouvrir une table");
  createBtn.addEventListener("click", busy(createBtn, () => onCreate(player()), fail));

  const joinBtn = h("button", { class: "btn btn-ink", type: "submit" }, "S'asseoir");
  const joinForm = h("form", { class: "join" }, codeInput, joinBtn);
  joinForm.addEventListener("submit", busy(joinBtn, () => {
    const who = player();
    if (codeInput.value.length !== 4) { codeInput.focus(); throw new Error("Le code d'une table compte 4 lettres."); }
    return onJoin(codeInput.value, who);
  }, fail));

  return h("main", { class: "mat" },
    lid(),
    h("section", { class: "sheet" },
      h("h2", null, "Mise en place"),
      h("ol", { class: "steps" },
        h("li", null,
          h("label", { for: "name" }, "Écris ton prénom sur l'étiquette."),
          nameInput),
        h("li", null,
          h("p", null, "Ouvre une table et invite tes amis à s'y asseoir."),
          createBtn),
        h("li", null,
          h("label", { for: "code" }, "Ou rejoins la leur avec son code à 4 lettres."),
          joinForm)
      ),
      error
    )
  );
}

export function noticeView(title, ...paragraphs) {
  return h("main", { class: "mat" },
    lid(),
    h("section", { class: "sheet" }, h("h2", null, title), paragraphs)
  );
}
