// Fabrique de nœuds DOM. Tout texte passe par des nœuds texte : rien de ce que
// saisit un joueur n'est jamais interprété comme du HTML.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Désactive un bouton pendant une action asynchrone et affiche l'erreur éventuelle.
export function busy(button, action, onError) {
  return async (event) => {
    event?.preventDefault();
    button.disabled = true;
    try { await action(); } catch (e) { onError?.(e); } finally { button.disabled = false; }
  };
}
