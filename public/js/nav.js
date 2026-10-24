/* Orphée — Navigation (barre d'onglets persistante).
   Reprend le pattern de Zagreus : une barre toujours visible.
   - Mobile : barre EN BAS (icône + label), pouce-friendly.
   - Desktop (≥900px) : barre EN HAUT façon site web — wordmark « Orphée » à
     gauche, onglets à droite, onglet actif en pilule.
   Onglets (v3, ADR-036) : Moi · Bibliothèque · Qualité (v2.23.0, PM-31) ·
   Le Salon. Ouverture sur Moi.
   Réglages reste une vue hors barre : on y entre par la roue dentée de
   l'en-tête commun et on en revient par « retour » (Stats retiré, ADR-040). Conserve l'API orphee:tab + activate() (window.OrpheeNav). */
(function () {
  "use strict";

  // Ordre de la barre. Le Salon = onglet IA (accent), c'est la vue chat.
  const TABS = [
    { tab: "moi",      label: "Moi",          icon: "moi" },
    { tab: "library",  label: "Bibliothèque", icon: "bibliotheque" },
    // Qualité des données (PM-31, v2.23.0) : propriétaire seul (masqué à
    // l'invité par le style, IM-8 ; les données sont fermées par les règles).
    { tab: "quality",  label: "Qualité",      icon: "qualite" },
    { tab: "chat",     label: "Le Salon",     icon: "orphee", ai: true },
  ];
  const LANDING = "moi";

  const ICONS = {
    moi:          '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/></svg>',
    bibliotheque: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none"/></svg>',
    stats:        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="15" x2="5" y2="11"/><line x1="10" y1="15" x2="10" y2="6"/><line x1="15" y1="15" x2="15" y2="9"/></svg>',
    orphee:       '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none"><path d="M10 2.4c.3 3.1 1.6 5.4 4.7 5.7-3.1.3-4.4 2.6-4.7 5.7-.3-3.1-1.6-5.4-4.7-5.7C8.4 7.8 9.7 5.5 10 2.4Z"/><circle cx="15.4" cy="14.4" r="1.7"/></svg>',
    qualite:      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5 16 5v4.5c0 3.7-2.6 6.6-6 8-3.4-1.4-6-4.3-6-8V5z"/><path d="m7.2 10 2 2 3.8-4"/></svg>',
    reglages:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  let activeTab = LANDING;
  const tabBtns = {};

  // ── Historique (bouton retour du téléphone) ─────────────────────────────────
  // Chaque écran et chaque couche (mode feuillette, panneau de recherche…)
  // laisse une entrée : « retour » remonte toujours d'un cran, et ne quitte
  // l'app que depuis l'écran d'arrivée. La fiche album gère sa propre entrée
  // (detail.js, état orpheeDetail).
  const layers = [];   // couches ouvertes, de bas en haut : {name, close}
  // Profondeur de l'entrée courante (0 = écran d'arrivée), portée par l'état.
  const depthOf = () => (history.state && history.state.orpheeDepth) || 0;

  function activate(tab, opts) {
    const fromHistory = opts && opts.fromHistory;
    if (tab === activeTab && document.querySelector(".view.is-active")) {
      if (!fromHistory) closeAllLayers();
      return;
    }
    if (!fromHistory) {
      closeAllLayers();
      history.pushState({ orpheeView: tab, orpheeDepth: depthOf() + 1 }, "");
    }
    show(tab);
  }

  function show(tab) {
    activeTab = tab;

    for (const v of document.querySelectorAll(".view")) {
      v.classList.toggle("is-active", v.id === "view-" + tab);
    }
    // Le chat verrouille la page au viewport (seule la liste de messages
    // défile, le composer reste au-dessus de la barre) ; les autres vues
    // gardent le défilement document normal.
    document.body.classList.toggle("view-chat-active", tab === "chat");
    // La bibliothèque est aussi un écran fixe : ses bacs défilent, pas la page.
    document.body.classList.toggle("view-library-active", tab === "library");
    // Écran verrouillé : un défilement hérité de l'écran précédent glisserait
    // son contenu sous l'en-tête.
    if (tab === "chat" || tab === "library") window.scrollTo(0, 0);

    for (const [t, btn] of Object.entries(tabBtns)) {
      const on = t === tab;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-current", on ? "page" : "false");
    }

    document.dispatchEvent(new CustomEvent("orphee:tab", { detail: { tab } }));
  }

  // Une couche (au-dessus de l'écran courant) : « retour » la ferme.
  function openLayer(name, close) {
    const depth = depthOf() + 1;
    history.pushState(
        { orpheeView: activeTab, orpheeLayer: name, orpheeDepth: depth }, "");
    layers.push({ name, close, depth });
  }

  // Fermeture demandée par l'interface (bouton, clic extérieur, Échap) :
  // on remonte l'historique, c'est popstate qui ferme réellement.
  function closeLayer(name) {
    const top = layers[layers.length - 1];
    if (top && top.name === name) history.back();
  }

  // Changement d'écran : les couches ouvertes se ferment sans retour arrière.
  function closeAllLayers() {
    while (layers.length) layers.pop().close();
  }

  // Bouton « ← » d'une vue secondaire : remonte l'historique si l'app y a
  // laissé une entrée, sinon va à l'écran de repli.
  function back(fallback) {
    if (depthOf() > 0) history.back();
    else activate(fallback || LANDING);
  }

  window.addEventListener("popstate", (e) => {
    const st = e.state || {};
    if (st.orpheeDetail) return; // entrée de la fiche album (detail.js)
    // Toutes les couches plus profondes que l'entrée atteinte se ferment
    // (un retour simple en ferme une ; history.go(-n) en ferme n, v2.41.0).
    const d = st.orpheeDepth || 0;
    while (layers.length && layers[layers.length - 1].depth > d) layers.pop().close();
    if (st.orpheeView && st.orpheeView !== activeTab) {
      closeAllLayers();
      show(st.orpheeView);
    }
  });

  function buildTabBar(appScreen) {
    const nav = document.createElement("nav");
    nav.className = "tabnav";
    nav.setAttribute("aria-label", "Navigation principale");

    // Marque (visible desktop) : logo + wordmark « Orphée », clic → Bibliothèque.
    const brand = document.createElement("button");
    brand.type = "button";
    brand.className = "tabnav-brand";
    brand.setAttribute("aria-label", "Orphée — accueil");
    brand.innerHTML =
      '<span class="tabnav-brand-mark">' + ICONS.orphee + "</span>" +
      '<span class="tabnav-brand-word">Orphée</span>';
    brand.addEventListener("click", () => activate(LANDING));
    nav.appendChild(brand);

    const tabs = document.createElement("div");
    tabs.className = "tabnav-tabs";
    for (const t of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tabnav-tab" + (t.ai ? " ai" : "");
      btn.dataset.tab = t.tab;
      btn.innerHTML =
        '<span class="tabnav-ic">' + (ICONS[t.icon] || "") + "</span>" +
        '<span class="tabnav-lab">' + t.label + "</span>";
      btn.addEventListener("click", () => activate(t.tab));
      tabBtns[t.tab] = btn;
      tabs.appendChild(btn);
    }
    nav.appendChild(tabs);

    appScreen.appendChild(nav);
  }

  // En-tête commun à tous les écrans (lot 2 de la revue UX) : fraîcheur des
  // données (toucher = actualiser, câblé par refresh.js) et réglages. Mobile :
  // fine barre en haut ; desktop : à droite de la barre d'onglets.
  function buildHeader(appScreen) {
    const head = document.createElement("header");
    head.className = "apphead";
    head.innerHTML =
      '<span class="apphead-brand"><span class="apphead-mark">' + ICONS.orphee +
      '</span>Orphée</span>' +
      '<div class="apphead-tools">' +
      '<button type="button" id="head-sync" class="apphead-sync" ' +
      'aria-label="Actualiser les données">' +
      '<span id="sync-dot" class="sync-dot" aria-hidden="true"></span>' +
      '<span id="head-sync-label" class="apphead-sync-label"></span></button>' +
      '<button type="button" class="apphead-btn" data-goto="settings" ' +
      'aria-label="Réglages">' + ICONS.reglages + "</button></div>";
    appScreen.insertBefore(head, appScreen.firstChild);
  }

  function init() {
    const appScreen = document.getElementById("app-screen");
    if (!appScreen) return;

    // Retirer toute ancienne nav (header/tabs/popover/fab/topbar de versions
    // précédentes) si présente.
    for (const sel of [
      ".k-header", ".k-tabs", ".nav", ".topbar", ".nav-fab", ".nav-pop",
    ]) {
      const old = appScreen.querySelector(sel);
      if (old) old.remove();
    }

    buildTabBar(appScreen);
    buildHeader(appScreen);

    // Entrées hors barre (Réglages, Stats) et retours : <… data-goto="vue">.
    document.addEventListener("click", (e) => {
      const go = e.target.closest && e.target.closest("[data-goto]");
      if (go) activate(go.dataset.goto);
      const bk = e.target.closest && e.target.closest("[data-back]");
      if (bk) back(bk.dataset.back);
    });
    window.OrpheeNav = { activate, back, openLayer, closeLayer };

    // Écran d'arrivée : entrée de base, que « retour » quitte.
    history.replaceState({ orpheeView: LANDING, orpheeDepth: 0 }, "");
    show(LANDING);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
