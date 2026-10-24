(function () {
  "use strict";

  const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));
  const views = Array.from(document.querySelectorAll(".view"));

  function activate(tab) {
    for (const t of document.querySelectorAll(".tab")) {
      const on = t.dataset.tab === tab;
      t.classList.toggle("is-active", on);
      if (t.dataset.tab) t.setAttribute("aria-selected", String(on));
    }
    for (const v of views) {
      v.classList.toggle("is-active", v.id === "view-" + tab);
    }
    document.dispatchEvent(new CustomEvent("orphee:tab", {detail: {tab}}));
  }

  for (const t of tabs) {
    t.addEventListener("click", () => activate(t.dataset.tab));
  }

  activate("library"); // onglet par défaut
})();
