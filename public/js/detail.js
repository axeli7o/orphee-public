/* Orphée — Album detail overlay (redesign).
   Sections: Hero · Ta note · Écoutes dans le temps · Titres · Écho.
   Depends on: covers.js (coverPalette, renderCover), refdata.js (ORPHEE_GENRES, ORPHEE_GRADES). */
(function () {
  "use strict";

  // ORPHEE_GRADES / _COLORS : source unique générée (refdata.js, ADR-026),
  // chargée avant ce script — pas de repli en dur (qui re-dupliquerait l'échelle).
  const GRADES     = window.ORPHEE_GRADES      || {};
  const GRADE_COLORS = window.ORPHEE_GRADE_COLORS || {};
  const GENRES     = window.ORPHEE_GENRES      || [];

  const MOIS = ["jan", "fév", "mar", "avr", "mai", "jui", "jui", "aoû", "sep", "oct", "nov", "déc"];

  const NO_DATA_MSGS = [
    "Cet album n'a pas encore assez résonné dans ta bibliothèque pour qu'on en trace les échos.",
    "Trop peu d'écoutes pour discerner ses compagnons de route — laisse-le infuser.",
    "Ses échos restent à venir : reviens quand tu l'auras davantage écouté.",
  ];
  const SOLITARY_MSGS = [
    "Cet album a traversé ta bibliothèque en solitaire — personne ne s'est attardé à ses côtés.",
    "Un électron libre : rien d'autre ne gravitait autour de lui à cette période.",
    "Tu l'écoutais seul, hors de tout courant. Aucun compagnon ne se dégage.",
  ];

  // État vide de la description : invite poétique à en parler à Orphée.
  const EMPTY_DESC =
    "Cet album n'a pas encore de récit. Évoque-le avec Orphée — ses mots viendront se poser ici.";

  // ---- helpers -----------------------------------------------------------

  function fmt(n) { return new Intl.NumberFormat("fr-FR").format(n || 0); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function esc(s) {
    return (s || "").toString().replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) Object.assign(node, attrs);
    for (const ch of children) {
      if (ch == null) continue;
      node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  // YT Music link. Launching the native app from a standalone PWA/WebAPK is
  // delicate: a client-side intent:// is blocked (ERR_UNKNOWN_URL_SCHEME), a
  // plain https link only loads the web page in-app, and a _blank Custom Tab
  // suppresses the App-Link handoff. The one reliable route is a *server* 302
  // to an intent:// — Chrome dispatches that to the app. So on Android we point
  // the button at our /yt redirect endpoint as a top-level navigation (no
  // _blank, no noreferrer — both defeat the handoff). Desktop opens the plain
  // web player in a new tab.
  function setListenLink(album) {
    const q = [album.artist, album.album].filter(Boolean).join(" ").trim();
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      listenBtn.href = "/yt?q=" + encodeURIComponent(q);
      listenBtn.removeAttribute("target");
      listenBtn.removeAttribute("rel");
    } else {
      listenBtn.href = "https://music.youtube.com/search?q=" +
        encodeURIComponent(q);
      listenBtn.setAttribute("target", "_blank");
      listenBtn.setAttribute("rel", "noopener noreferrer");
    }
  }

  // ---- DOM creation -------------------------------------------------------

  let overlay, scrollEl, scrim, topBar, backBtn, favBtn, dtHandle, heroEl, heroBg, heroInner;
  let coverWrap, coverStage, discEl, titleEl, artistEl, metaEl;
  let listenBtn;
  let asideRow, asideBtn, starBtn, cdBtn;
  let bodyEl, gradeRowEl, impactEl, trialEl;
  let noteLabelEl = null;
  let genreEl, sousgenreEl, commentEl, descEl, genreImpactEl, gsumEl, gpanelEl;
  let chartWrap, chartSvg, xaxisEl, secNoteEl;
  let tracksEl, echoEl, linksSec, linksEl;

  function buildDOM() {
    const container = document.getElementById("app-screen") || document.body;

    // scrim
    scrim = el("div", { className: "dt-scrim" });
    scrim.addEventListener("click", close);

    // floating top bar
    backBtn = el("button", { className: "dt-iconbtn", type: "button", ariaLabel: "Retour" }, "←");
    favBtn  = el("button", { className: "dt-iconbtn dt-favbtn", type: "button", ariaLabel: "Coup de cœur" }, "☆");
    dtHandle = el("div", { className: "dt-handle", ariaLabel: "Fermer", role: "button" });
    dtHandle.addEventListener("click", close);
    topBar  = el("div", { className: "dt-top" }, backBtn, dtHandle, favBtn);
    // Coup de cœur fusionné dans la note 5 (v3, PM-08) : l'étoile n'est plus
    // proposée ; gardée invisible pour l'équilibre de la barre.
    favBtn.style.visibility = "hidden";
    favBtn.setAttribute("aria-hidden", "true");
    favBtn.tabIndex = -1;

    // hero layers
    heroBg     = el("div", { className: "dt-herobg" });
    const heroScrim = el("div", { className: "dt-heroscrim" });

    coverWrap = el("div", { className: "dt-cover" });
    discEl    = el("div", { className: "dt-disc", ariaHidden: "true" });
    coverStage = el("div", { className: "dt-coverstage" }, discEl, coverWrap);
    titleEl   = el("h1", { className: "dt-title" });
    // Le nom de l'artiste ouvre sa fiche (artist-sheet.js, PM-26) : on
    // referme d'abord la fiche album pour garder l'historique linéaire.
    artistEl  = el("button", { className: "dt-artist dt-artist-link", type: "button" });
    artistEl.addEventListener("click", () => {
      const name = current && current.album && current.album.artist;
      if (!name || !window.OrpheeArtistSheet) return;
      close();
      setTimeout(() => window.OrpheeArtistSheet.open(name), 420);
    });
    metaEl    = el("div", { className: "dt-meta" });

    // "Écouter sur YT Music" — deep link, opens the app on mobile. href set in open().
    listenBtn = el("a", { className: "dt-listen o-btn main", rel: "noopener noreferrer" },
      el("span", { className: "dt-listen-ic", ariaHidden: "true" },
        "▶"),
      el("span", null, "Écouter sur YT Music"));

    // Mis de côté (PM-34) : le marque-page, puis « Envie forte » une fois
    // l'album dans la pile. Axel seul (l'invité ne voit pas la pile).
    asideBtn = el("button", { className: "dt-aside o-chip", type: "button" });
    starBtn = el("button", { className: "dt-aside dt-aside-star o-chip", type: "button" });
    asideBtn.addEventListener("click", toggleAside);
    starBtn.addEventListener("click", toggleStar);
    // Mes CD (PM-38, E12) : la pastille et la pochette ajoutent ou retirent
    // le CD ; le disque ne sort de la pochette que pour un CD.
    cdBtn = el("button", { className: "dt-aside dt-cd o-chip", type: "button" },
      el("i", { className: "cd-mini", ariaHidden: "true" }), el("span", null, "Dans tes CD"));
    cdBtn.addEventListener("click", toggleCd);
    coverStage.addEventListener("click", toggleCd);
    asideRow = el("div", { className: "dt-asiderow" }, cdBtn, asideBtn, starBtn);

    const heroMeta = el("div", { className: "dt-herometa" },
      titleEl, artistEl, metaEl, listenBtn, asideRow);
    heroInner = el("div", { className: "dt-heroinner" }, coverStage, heroMeta);
    heroEl    = el("div", { className: "dt-hero" }, heroBg, heroScrim, heroInner);

    // --- Ta note (v2.24.0, maquette « délice ») : les 5 boutons de « Moi »
    // à la place du menu, puis le genre et le sous-genre en pastilles.
    // Toucher une note la pose (onde, halo à sa couleur, confettis gradués
    // jusqu'à la pluie d'or d'Adoré) ; retoucher la note la retire.
    gradeRowEl = el("div", { className: "dt-grades", role: "radiogroup", ariaLabel: "Ta note" });
    for (const g of [1, 2, 3, 4, 5]) {
      const col = GRADE_COLORS[g] || {};
      const b = el("button", { className: "dt-g", type: "button", role: "radio" },
        el("span", { className: "dt-g-n" }, String(g)),
        el("span", { className: "dt-g-l" }, GRADES[g] || ""));
      b.dataset.grade = String(g);
      b.style.background = col.bg || "";
      b.style.color = col.fg || "";
      b.addEventListener("click", (ev) => setGrade(g, ev, b));
      gradeRowEl.appendChild(b);
    }
    impactEl = el("div", { className: "dt-impact", ariaLive: "polite" });
    genreEl = el("div", { className: "dt-gts", role: "radiogroup", ariaLabel: "Genre" });
    sousgenreEl = el("div", { className: "dt-sgs", role: "radiogroup", ariaLabel: "Sous-genre" });
    // Replié par défaut (v2.26.0) : un bouton résume le genre ; le toucher
    // déplie les tuiles, qui se replient d'elles-mêmes une fois le choix fait.
    gsumEl = el("button", { className: "dt-gsum", type: "button" });
    gsumEl.setAttribute("aria-expanded", "false");
    gsumEl.addEventListener("click", () => { J().buzz(); setGenreOpen(!(current && current.genreOpen)); });
    gpanelEl = el("div", { className: "dt-gpanel" }, genreEl, sousgenreEl);
    gpanelEl.hidden = true;
    genreImpactEl = el("div", { className: "dt-impact dt-gimpact", ariaLive: "polite" });

    trialEl = el("p", { className: "dt-trial" },
      "Touche une note ou un genre pour essayer : rien n’est enregistré.");
    const curationRow = el("div", { className: "dt-curation" },
      trialEl, gradeRowEl, impactEl,
      el("div", { className: "dt-seclabel dt-genrelabel" }, el("span", null, "Genre")),
      gsumEl, gpanelEl, genreImpactEl);

    // Description : rendu lecture seule (façon liner notes, hauteur auto),
    // bascule en édition au clic. Le textarea ne sert qu'à l'édition.
    descEl = el("div", { className: "dt-desc", tabIndex: 0, role: "button" });
    descEl.addEventListener("click", enterCommentEdit);
    descEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        enterCommentEdit();
      }
    });

    commentEl = el("textarea", { className: "dt-comment", rows: 1,
      placeholder: "Une note, un souvenir, un contexte d'écoute…" });
    commentEl.addEventListener("input", autosizeComment);
    commentEl.addEventListener("blur", commitComment);

    const noteLabel = el("div", { className: "dt-seclabel" }, "Ta note");
    noteLabelEl = noteLabel;
    const noteSec   = el("section", { className: "dt-sec" },
      noteLabel, curationRow, descEl, commentEl);

    // --- Écoutes section ---
    secNoteEl = el("div", { className: "dt-secnote" });
    const ecouteHead = el("div", { className: "dt-sechead" },
      el("div", { className: "dt-seclabel" }, "Écoutes dans le temps"),
      secNoteEl);
    chartSvg  = el("div", { className: "dt-chartsvg" });
    xaxisEl   = el("div", { className: "dt-xaxis" });
    chartWrap = el("div", { className: "dt-chartwrap" }, chartSvg, xaxisEl);
    const ecouteSec = el("section", { className: "dt-sec" }, ecouteHead, chartWrap);

    // --- Titres section ---
    tracksEl = el("ol", { className: "dt-tracks" });
    const titresSec = el("section", { className: "dt-sec" },
      el("div", { className: "dt-seclabel" }, "Titres les plus écoutés"),
      tracksEl);

    // --- Rattachés (album canonique, PM-29) ---
    linksEl = el("div", { className: "dt-links" });
    linksSec = el("section", { className: "dt-sec" },
      el("div", { className: "dt-seclabel" }, "Rattachés à cet album"),
      linksEl);

    // --- Écho section ---
    echoEl = el("div", null);
    const echoSec = el("section", { className: "dt-sec" },
      el("div", { className: "dt-seclabel" }, "Écho"),
      echoEl);

    const rightCol = el("div", { className: "dt-col dt-stats" },
      ecouteSec, titresSec, linksSec, echoSec);
    const leftCol  = el("div", { className: "dt-col dt-curate" }, noteSec);
    bodyEl = el("div", { className: "dt-body" }, leftCol, rightCol);

    // The scroll layer is decoupled from the animated shell: the shell
    // (.dt-overlay) owns the slide-up transform + rounded clip, while
    // .dt-scroll owns the scrolling. Animating a transform on a rounded
    // scroll container forces the browser to re-rasterize a clipped composite
    // layer on the first scroll (the one-time flicker); separating them keeps
    // the scroll layer stable.
    scrollEl = el("div", { className: "dt-scroll" }, topBar, heroEl, bodyEl);
    overlay  = el("div", { className: "dt-overlay" }, scrollEl);

    container.appendChild(scrim);
    container.appendChild(overlay);

    // hide initially (no album open)
    scrim.style.display   = "none";
    overlay.style.display = "none";
  }

  // ---- Genre en pastilles (v2.24.0) ---------------------------------------
  // Invité (PM-28) : la fiche se lit, ne s'édite pas (les règles refusent
  // de toute façon toute écriture).
  const readOnly = () => !!(window.OrpheeSession && window.OrpheeSession.isGuest());
  let trialToldOnce = false;
  const J = () => window.OrpheeJuice || { buzz() {}, gradeParty() {} };

  // ---- Genre en tuiles, sous-genre en pastilles (v2.26.0) -------------------
  // Même soin que la note : grosses cibles à la couleur du genre, onde,
  // petite gerbe de confettis (modeste : on classe bien plus souvent qu'on
  // n'adore), phrase d'impact sur le territoire. Retoucher retire. Un genre
  // à un seul sous-genre (Jazz, Blues, Podcast) pose les deux d'un coup.
  const GENRE_COLORS = window.ORPHEE_GENRE_COLORS || {};
  const NO_TERRITORY = ["Non classé", "Podcast"];
  const gColor = (g) => GENRE_COLORS[g] || "#3fc58e";

  function ripple(btn, ev) {
    const r = btn.getBoundingClientRect();
    const sz = Math.max(r.width, r.height);
    const rp = el("span", { className: "dt-ripple" });
    rp.style.width = rp.style.height = sz + "px";
    rp.style.left = ((ev && ev.clientX || r.left + r.width / 2) - r.left - sz / 2) + "px";
    rp.style.top = ((ev && ev.clientY || r.top + r.height / 2) - r.top - sz / 2) + "px";
    btn.appendChild(rp);
    setTimeout(() => rp.remove(), 500);
  }

  function pop(btn, n) {
    btn.classList.remove("boom");
    void btn.offsetWidth;
    btn.classList.add("boom");
    const r = btn.getBoundingClientRect();
    if (J().burst) J().burst(r.left + r.width / 2, r.top + r.height / 2, n, [btn.style.getPropertyValue("--c"), "#e8eae9"]);
  }

  // Part des écoutes classées que pèse ce genre (même calcul que les
  // territoires de « Moi » : genre effectif, Podcast et non classés exclus),
  // en tenant compte du choix qui vient d'être fait sur cet album.
  function territoryShare(genre) {
    const L = window.OrpheeLibrary, A = window.OrpheeArtists;
    if (!L || !current || NO_TERRITORY.includes(genre)) return null;
    let total = 0, mine = 0;
    for (const a of L.items()) {
      const n = a.listen_count || 0;
      if (!n) continue;
      const g = a.album_sur === current.album.album_sur ? (current.genre || (A ? A.effective({ artist: a.artist }).genre : "")) :
        (A ? A.effective(a).genre : a.genre);
      if (!g || NO_TERRITORY.includes(g)) continue;
      total += n;
      if (g === genre) mine += n;
    }
    return total ? Math.round(mine / total * 100) : null;
  }

  function genreImpact(kind) {
    genreImpactEl.innerHTML = "";
    if (!current) return;
    const g = current.genre, sg = current.sousgenre;
    let p;
    if (kind === "off") {
      p = el("p", { className: "dt-impact-off" },
          inherited() ? "Genre retiré : il reprend celui de l’artiste." : "Genre retiré.");
    } else if (kind === "ask") {
      p = el("p", null, el("b", null, g), " — et plus précisément ?");
    } else {
      const name = sg && sg !== g ? `${g} · ${sg.toLowerCase()}` : g;
      const share = territoryShare(g);
      p = share == null ? el("p", null, "Rangé dans ", el("b", null, name), ".") :
        el("p", null, el("b", null, name), " rejoint ton territoire " + g + " · ",
            el("span", { className: "dt-pct" }, share + "\u00a0%"), " de tes écoutes.");
    }
    genreImpactEl.appendChild(p);
  }

  // Genre de l'artiste (E8), montré tant que l'album n'a pas le sien.
  function inherited() {
    const A = window.OrpheeArtists;
    const art = current && A ? A.get(current.album.artist) : null;
    return art && art.genre ? art : null;
  }
  const coupleName = (g, sg) => (sg && sg !== g ? `${g} · ${sg.toLowerCase()}` : g);

  // Le bouton résumé : le genre de l'album, sinon celui de l'artiste (en
  // retrait), sinon une invite.
  function refreshSummary() {
    if (!current) return;
    const art = inherited();
    const g = current.genre;
    gsumEl.innerHTML = "";
    gsumEl.classList.toggle("set", !!g);
    gsumEl.classList.toggle("open", !!current.genreOpen);
    gsumEl.setAttribute("aria-expanded", current.genreOpen ? "true" : "false");
    const shown = g || (art && art.genre) || "";
    gsumEl.style.setProperty("--c", shown ? gColor(shown) : "var(--border-2)");
    gsumEl.appendChild(el("span", { className: "dt-gsum-dot" }));
    const txt = el("span", { className: "dt-gsum-txt" });
    if (g) {
      txt.appendChild(el("b", null, coupleName(g, current.sousgenre)));
      const entry = GENRES.find((x) => x.genre === g);
      if (!current.sousgenre && entry && entry.sousgenres.length > 1) {
        txt.appendChild(el("small", null, "précise le sous-genre"));
      }
    } else if (art) {
      txt.appendChild(el("b", null, coupleName(art.genre, art.sousgenre)));
      txt.appendChild(el("small", null, "hérité de l’artiste"));
    } else {
      txt.appendChild(el("b", null, "Choisir un genre"));
    }
    gsumEl.appendChild(txt);
    gsumEl.insertAdjacentHTML("beforeend",
        '<svg class="dt-gsum-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>');
  }

  let closeT = null;
  function setGenreOpen(open) {
    if (!current) return;
    clearTimeout(closeT);
    current.genreOpen = open;
    gpanelEl.hidden = !open;
    if (open) renderGenres(true);
    refreshSummary();
  }
  // Choix complet : on laisse voir l'effet, puis on replie.
  function closeSoon() {
    clearTimeout(closeT);
    const sur = current && current.album.album_sur;
    closeT = setTimeout(() => {
      if (current && current.album.album_sur === sur && current.genreOpen) setGenreOpen(false);
    }, 900);
  }

  function renderGenres(cascade) {
    const cur = current ? current.genre : "";
    genreEl.innerHTML = "";
    const list = GENRES.slice();
    // Valeur importée hors référentiel : affichée telle quelle.
    if (cur && !list.some((g) => g.genre === cur)) list.push({ genre: cur, sousgenres: [] });
    const inh = !cur ? inherited() : null;
    for (const g of list) {
      const on = g.genre === cur;
      // Genre hérité de l'artiste : cerclé en pointillés, pas choisi.
      const cls = "dt-gt" + (on ? " on" : "") + (inh && inh.genre === g.genre ? " inh" : "");
      const b = el("button", { className: cls, type: "button", role: "radio" }, g.genre);
      b.style.setProperty("--c", gColor(g.genre));
      if (cascade) { b.classList.add("in"); b.style.animationDelay = (list.indexOf(g) * 25) + "ms"; }
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.addEventListener("click", (ev) => {
        if (!current) return;
        J().buzz();
        ripple(b, ev);
        const was = current.genre === g.genre;
        current.genre = was ? "" : g.genre;
        current.sousgenre = (!was && g.sousgenres && g.sousgenres.length === 1) ? g.sousgenres[0] : "";
        renderGenres();
        if (!was) {
          const nb = Array.from(genreEl.children).find((x) => x.textContent === g.genre);
          if (nb) pop(nb, current.sousgenre ? 22 : 12);
          genreImpact(current.sousgenre ? "set" : "ask");
          if (current.sousgenre) closeSoon();
        } else {
          genreImpact("off");
        }
        refreshSummary();
        save();
      });
      genreEl.appendChild(b);
    }
    refreshSummary();
    renderSousgenres(true);
  }

  function renderSousgenres(animate) {
    sousgenreEl.innerHTML = "";
    const genre = current ? current.genre : "";
    const entry = GENRES.find((g) => g.genre === genre);
    const subs = ((entry && entry.sousgenres) || []).slice();
    const cur = current ? current.sousgenre : "";
    if (cur && !subs.includes(cur)) subs.push(cur);
    // Un seul sous-genre : posé avec le genre, rien à choisir.
    sousgenreEl.hidden = subs.length < 2;
    if (subs.length < 2) return;
    subs.forEach((sg, k) => {
      const on = sg === cur;
      const c = el("button", { className: "dt-sg o-chip" + (on ? " on" : ""), type: "button", role: "radio" }, sg);
      c.style.setProperty("--c", gColor(genre));
      c.setAttribute("aria-checked", on ? "true" : "false");
      c.addEventListener("click", () => {
        if (!current) return;
        J().buzz();
        const was = current.sousgenre === sg;
        current.sousgenre = was ? "" : sg;
        renderSousgenres(false);
        if (!was) {
          const nb = Array.from(sousgenreEl.children).find((x) => x.textContent === sg);
          if (nb) pop(nb, 22);
          genreImpact("set");
          closeSoon();
        } else {
          genreImpact("ask");
        }
        refreshSummary();
        save();
      });
      if (animate) { c.classList.add("in"); c.style.animationDelay = (k * 35) + "ms"; }
      sousgenreEl.appendChild(c);
    });
  }

  // ---- Note : 5 boutons ----------------------------------------------------
  const IMPACT = {
    1: "Rangé dans tes zappés.", 2: "Noté Sympa.", 3: "Entre dans tes génial.",
    4: "Devient un de tes cultes.", 5: "Rejoint tes adorés ✦",
  };

  function refreshGradeChips() {
    const grade = current ? current.selectedGrade : null;
    gradeRowEl.classList.toggle("has", grade != null);
    for (const b of gradeRowEl.querySelectorAll(".dt-g")) {
      const on = Number(b.dataset.grade) === grade;
      b.classList.toggle("sel", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
    const col = grade != null ? (GRADE_COLORS[grade] || {}).bg : "";
    overlay.style.setProperty("--dt-glow", col || "transparent");
    overlay.classList.toggle("glow", !!col);
  }

  function setGrade(g, ev, btn) {
    if (!current) return;
    const prev = current.selectedGrade;
    current.selectedGrade = prev === g ? null : g;
    J().buzz();
    // Onde à l'endroit touché.
    const r = btn.getBoundingClientRect();
    const rp = el("span", { className: "dt-ripple" });
    const sz = Math.max(r.width, r.height);
    rp.style.width = rp.style.height = sz + "px";
    rp.style.left = ((ev.clientX || r.left + r.width / 2) - r.left - sz / 2) + "px";
    rp.style.top = ((ev.clientY || r.top + r.height / 2) - r.top - sz / 2) + "px";
    btn.appendChild(rp);
    setTimeout(() => rp.remove(), 500);
    refreshGradeChips();
    for (const b of gradeRowEl.querySelectorAll(".dt-g")) b.classList.remove("boom");
    impactEl.innerHTML = "";
    if (current.selectedGrade != null) {
      void btn.offsetWidth;
      btn.classList.add("boom");
      impactEl.appendChild(el("p", null, IMPACT[g] || ""));
      J().gradeParty(g, r, (GRADE_COLORS[g] || {}).bg || "#e8eae9");
    } else if (prev != null) {
      impactEl.appendChild(el("p", { className: "dt-impact-off" }, "Note retirée."));
    }
    save();
  }

  function refreshFav() {
    const on = !!(current && current.personal_fav);
    favBtn.classList.toggle("on", on);
    favBtn.textContent = on ? "★" : "☆";
  }

  // ---- Mis de côté (PM-34, E11) ----------------------------------------------
  const MARK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'fill="FILL"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" ' +
    'stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="FILL">' +
    '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  const A = () => window.OrpheeAside;

  function refreshAside(pop) {
    asideRow.hidden = !current;
    refreshCd();
    // La pile est à Axel seul : l'invité ne voit que la pastille CD.
    const ok = !!(current && A() && !readOnly());
    asideBtn.hidden = !ok;
    if (!ok) { starBtn.hidden = true; return; }
    const key = current.album.album_sur;
    const e = A().entry(key);
    asideBtn.classList.toggle("on", !!e);
    asideBtn.innerHTML = MARK.replace("FILL", e ? "currentColor" : "none") +
      `<span>${e ? "Mis de côté" : "Mettre de côté"}</span>`;
    asideBtn.setAttribute("aria-pressed", e ? "true" : "false");
    starBtn.hidden = !e;
    const star = !!(e && e.star);
    starBtn.classList.toggle("on", star);
    starBtn.innerHTML = STAR.replace("FILL", star ? "currentColor" : "none") + "<span>Envie forte</span>";
    starBtn.setAttribute("aria-pressed", star ? "true" : "false");
    if (pop) { pop.classList.remove("pop"); void pop.offsetWidth; pop.classList.add("pop"); }
  }

  async function toggleAside() {
    if (!current || !A() || readOnly()) return;
    const key = current.album.album_sur;
    J().buzz();
    if (A().has(key)) await A().remove(key, "Retiré de « Mis de côté »");
    else await A().put(key, "Mis de côté · tu le retrouves dans la Bibliothèque");
    if (current && current.album.album_sur === key) refreshAside(asideBtn);
  }

  // ---- Mes CD (PM-38, E12) ------------------------------------------------
  const C = () => window.OrpheeCds;
  const isCd = () => !!(current && C() && C().has(current.album.album_sur));
  function refreshCd() {
    const on = isCd();
    const edit = !!(C() && C().canEdit());
    cdBtn.hidden = !current || (!on && !edit);   // l'invité ne voit qu'un CD
    cdBtn.disabled = !edit;
    cdBtn.classList.toggle("on", on);
    cdBtn.setAttribute("aria-pressed", on ? "true" : "false");
    coverStage.classList.toggle("dt-cd-edit", edit);
    if (edit) {
      coverStage.setAttribute("role", "button");
      coverStage.setAttribute("aria-label", on ? "Tu l'as en CD. Toucher pour le retirer" : "Toucher si tu l'as en CD");
    } else {
      coverStage.removeAttribute("role");
      coverStage.removeAttribute("aria-label");
    }
  }
  // Le disque suit le CD, sauf pendant l'arrivée ou le départ de la fiche.
  function syncDisc() {
    if (!current || closing || overlay.classList.contains("animating")) return;
    coverStage.classList.toggle("cd-out", isCd());
  }
  function toggleCd() {
    if (!current || !C() || !C().canEdit()) return;
    J().buzz();
    C().toggle(current.album);
  }

  async function toggleStar() {
    if (!current || !A()) return;
    const key = current.album.album_sur;
    const e = A().entry(key);
    if (!e) return;
    J().buzz();
    await A().star(key, !e.star);
    if (current && current.album.album_sur === key) refreshAside(starBtn);
  }

  // ---- Description (lecture seule par défaut, éditable au clic) -----------

  // Ajuste la hauteur du textarea à son contenu (jamais de barre de défilement).
  // box-sizing border-box : scrollHeight n'inclut pas les bordures, on les
  // rajoute pour ne pas rogner la dernière ligne.
  function autosizeComment() {
    commentEl.style.height = "auto";
    const border = commentEl.offsetHeight - commentEl.clientHeight;
    commentEl.style.height = (commentEl.scrollHeight + border) + "px";
  }

  function enterCommentEdit() {
    if (!current || readOnly()) return;
    current.editingComment = true;
    commentEl.value = current.album.commentaire || "";
    descEl.style.display = "none";
    commentEl.style.display = "block";
    autosizeComment();
    commentEl.focus();
  }

  // Sortie d'édition (blur) : on fige la valeur en mémoire, on repasse en
  // affichage, puis on persiste.
  function commitComment() {
    if (!current) return;
    current.editingComment = false;
    current.album.commentaire = commentEl.value.trim();
    refreshComment();
    save();
  }

  // Rend la description selon l'état (affichage / édition / vide poétique).
  function refreshComment() {
    if (!current) return;
    if (current.editingComment) {
      descEl.style.display = "none";
      commentEl.style.display = "block";
      autosizeComment();
      return;
    }
    commentEl.style.display = "none";
    descEl.style.display = "block";
    const txt = (current.album.commentaire || "").trim();
    descEl.textContent = txt || EMPTY_DESC;
    descEl.classList.toggle("dt-desc--empty", !txt);
    if (readOnly() && !txt) descEl.style.display = "none";
  }

  // ---- SVG area chart (hand-drawn, no chart lib) -------------------------

  // Écoutes par année (v2.49.0) : mêmes barres que la fiche artiste
  // (.ar-curve) — on agrège les mois "YYYY-MM" en années et on comble les
  // trous (une année sans écoute = barre vide), pour lire la vie de l'album.
  function renderChart(monthly) {
    chartSvg.innerHTML = "";
    xaxisEl.hidden = true;
    secNoteEl.textContent = "";
    if (!monthly || !monthly.length) { chartWrap.hidden = true; return; }
    chartWrap.hidden = false;
    chartSvg.className = "dt-chartsvg ar-curve";
    chartSvg.style.height = "auto";

    const perYear = new Map();
    for (const m of monthly) {
      const y = parseInt(String(m.month).slice(0, 4), 10);
      if (y) perYear.set(y, (perYear.get(y) || 0) + m.count);
    }
    const sorted = Array.from(perYear.keys()).sort((a, b) => a - b);
    const years = [];
    const vals = [];
    for (let y = sorted[0]; y <= sorted[sorted.length - 1]; y++) {
      years.push(y);
      vals.push(perYear.get(y) || 0);
    }
    const max = Math.max(...vals, 1);
    const n = vals.length, w = 320, h = 64, step = w / n;
    let svg = `<svg viewBox="0 0 ${w} ${h + 16}" role="img"` +
      ` aria-label="Écoutes par année">`;
    vals.forEach((v, i) => {
      const bh = Math.max(2, v / max * h);
      svg += `<rect x="${(i * step + 2).toFixed(1)}" y="${(h - bh).toFixed(1)}"` +
        ` width="${(step - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="3"` +
        ` class="${v ? "on" : ""}"><title>${years[i]} : ${v} écoutes` +
        `</title></rect>`;
      if (n <= 12 || i % 2 === 0) {
        svg += `<text x="${(i * step + step / 2).toFixed(1)}" y="${h + 13}"` +
          ` text-anchor="middle">’${String(years[i]).slice(2)}</text>`;
      }
    });
    chartSvg.innerHTML = svg + "</svg>";

    const total = vals.reduce((a, b) => a + b, 0);
    const peak = years[vals.indexOf(max)];
    secNoteEl.textContent = `pic en ${peak} · ${fmt(total)} sur ` +
      `${n} an${n > 1 ? "s" : ""}`;
  }

  // ---- Tracks -------------------------------------------------------------

  // Titre phare (v2.34.0) : l'album tenu par un titre (agg_one_track) —
  // un encart en or, et le titre en or dans la liste. Fait, sans la note.
  function phareOf(albumSur) {
    const d = window.OrpheeStats && window.OrpheeStats.data();
    return ((d && d.oneTrack) || []).find((x) => x.album_sur === albumSur) || null;
  }
  function renderTracks(tracks) {
    tracksEl.innerHTML = "";
    const old = tracksEl.parentNode && tracksEl.parentNode.querySelector(".dt-phare");
    if (old) old.remove();
    if (!tracks || !tracks.length) return;
    const ph = current && phareOf(current.album.album_sur);
    if (ph) {
      const box = el("div", { className: "dt-phare" },
        el("span", { className: "dt-phare-k" }, "Titre phare"),
        el("span", { className: "dt-phare-t" }, ph.track),
        el("span", { className: "dt-phare-m" },
          `${String(ph.ratio).replace(".", ",")}× la moyenne · ${Math.round(ph.share * 100)} % de tes écoutes de l’album`));
      tracksEl.parentNode.insertBefore(box, tracksEl);
    }
    const top = tracks.slice(0, 8);
    const maxCount = top[0].count || 1;
    for (let i = 0; i < top.length; i++) {
      const t   = top[i];
      const pct = Math.round(t.count / maxCount * 100);

      const rank  = el("span", { className: "dt-trank" }, String(i + 1));
      const name  = el("span", { className: "dt-tname" }, t.track || "");
      const bar   = el("span", { className: "dt-tbar" });
      bar.style.width = pct + "%";
      const barWrap = el("span", { className: "dt-tbarwrap" }, bar);
      const count = el("span", { className: "dt-tcount" }, fmt(t.count));

      const isPhare = ph && i === 0 && t.track === ph.track;
      tracksEl.appendChild(el("li", { className: "dt-track" + (isPhare ? " phare" : "") }, rank, name, barWrap, count));
    }
  }

  // ---- Rattachés (PM-29) --------------------------------------------------
  // Libellés envoyés par le lecteur (single, titre seul, édition Deluxe…)
  // réunis sous cet album, pour information. Les remettre à part se fait
  // dans Qualité, titre par titre (v2.32.0 — « Séparer » a quitté la
  // fiche ; ADR-046).
  function renderLinks(album) {
    linksEl.innerHTML = "";
    const v = album.variants || [];
    linksSec.hidden = !v.length;
    for (const x of v) {
      const name = x.album ? x.album : "Sans album";
      linksEl.appendChild(el("div", { className: "dt-link" },
        el("span", { className: "dt-link-name" }, name),
        el("span", { className: "dt-link-n" }, fmt(x.count) + "×")));
    }
    // Invité compris (démo, v2.32.1) : la Qualité y est jouable sans écrire.
    if (v.length && window.OrpheeQuality) {
      const b = el("button", { className: "dt-links-go o-link", type: "button" },
        "Revoir ces titres dans Qualité ›");
      b.addEventListener("click", () => {
        const sur = album.album_sur;
        close();
        setTimeout(() => window.OrpheeQuality.reviewAlbum(sur), 420);
      });
      linksEl.appendChild(b);
    }
  }

  // ---- Écho ---------------------------------------------------------------

  function renderEcho(doc) {
    echoEl.innerHTML = "";
    if (!doc) {
      echoEl.appendChild(el("p", { className: "dt-poetic" }, pick(NO_DATA_MSGS)));
      return;
    }
    const echo = doc.echo || [];
    if (!echo.length) {
      echoEl.appendChild(el("p", { className: "dt-poetic" }, pick(SOLITARY_MSGS)));
      return;
    }

    // intro: "Ce que tu écoutais à la même époque époque époque"
    const intro = el("p", { className: "dt-echointro" });
    intro.appendChild(document.createTextNode("Ce que tu écoutais à la même "));
    for (const [i, op] of [[0, 1], [1, 0.42], [2, 0.16]]) {
      const word = el("span", { className: "dt-echoword" }, "époque");
      word.style.opacity = String(op);
      if (i > 0) word.style.marginLeft = "0.34em";
      intro.appendChild(word);
    }
    echoEl.appendChild(intro);

    const ref = doc.echo_ref || 0;
    const ul  = el("ul", { className: "dt-echolist" });
    for (const e of echo) {
      const pct = ref > 0 ? Math.min(100, Math.round(e.score / ref * 100)) : 0;

      const bar     = el("span", { className: "dt-echobar" });
      bar.style.width = pct + "%";

      const miniCover = el("span", { className: "dt-echocover" });
      if (window.renderCover && e.album_sur) {
        // reconstruct a minimal album object for the cover engine
        window.renderCover(miniCover, { artist: e.artist || "", album: e.album || "",
          genre: e.genre || "" }, { showMono: false });
      }

      const albumSpan  = el("span", { className: "dt-echoalbum" }, e.album || "");
      const artistSpan = el("span", { className: "dt-echoartist" }, e.artist || "");
      const info  = el("span", { className: "dt-echoinfo" }, albumSpan, artistSpan);
      const count = el("span", { className: "dt-echocount" }, fmt(e.score));

      const btn = el("button", { className: "dt-echoitem", type: "button" },
        bar, miniCover, info, count);
      btn.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("orphee:open-album", {
          detail: { album_sur: e.album_sur },
        }));
      });
      ul.appendChild(el("li", null, btn));
    }
    echoEl.appendChild(ul);
  }

  // ---- Firestore persistence ---------------------------------------------

  let current = null; // { album, selectedGrade, personal_fav, saving }

  async function save() {
    if (!current) return;
    // Invité (PM-28, v2.24.1) : il essaie, avec les animations, mais rien
    // n'est jamais écrit (les règles le refuseraient de toute façon, IM-8).
    if (readOnly()) {
      if (!trialToldOnce && window.OrpheeToast) {
        trialToldOnce = true;
        window.OrpheeToast("Pour essayer : rien n’est enregistré", "ok", 2200);
      }
      return;
    }
    const user = firebase.auth().currentUser;
    if (!user) return;
    const { album } = current;
    if (!album.album_sur || album.album_sur.includes("/")) return;

    const prevGrade = (album.grade === undefined) ? null : album.grade;
    const had = (album.grade !== null && album.grade !== undefined) ||
      !!album.genre || !!album.sousgenre || !!album.personal_fav || !!album.commentaire;

    // Payload via le builder partagé (ADR-027) : pas de grade_label stocké (D-2).
    const m = window.OrpheeCuration.buildCurationMutation({
      type: "grade",
      album_sur: album.album_sur,
      grade: current.selectedGrade,
      personal_fav: !!current.personal_fav,
      genre: current.genre || "",
      sousgenre: current.sousgenre || "",
      commentaire: (album.commentaire || "").trim(),
      isFirst: !had,
    });
    if (!m.valid) { console.warn("[detail] curation invalide:", m.reason); return; }

    const data = Object.assign({}, m.fields);
    for (const f of m.timestamps) {
      data[f] = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
      await firebase.firestore()
        .doc("users/" + user.uid + "/grades/" + album.album_sur)
        .set(data, { merge: true });
      // grade_label dérivé de la note (affichage seulement, jamais stocké).
      const label = window.OrpheeCuration.gradeLabel(m.fields.grade, GRADES);
      // mirror into the album object so the library badge stays in sync
      Object.assign(album, {
        grade: m.fields.grade, grade_label: label,
        personal_fav: m.fields.personal_fav, genre: m.fields.genre,
        sousgenre: m.fields.sousgenre, commentaire: m.fields.commentaire,
      });
      document.dispatchEvent(new CustomEvent("orphee:album-graded", {
        detail: { album_sur: album.album_sur,
          gradeSet: m.fields.grade != null && m.fields.grade !== prevGrade,
          curation: { grade: m.fields.grade, grade_label: label,
            personal_fav: m.fields.personal_fav } },
      }));
      // Chaque modification de la fiche se voit (avant : enregistrement muet).
      if (window.OrpheeToast) {
        window.OrpheeToast(label ? `Enregistré · ${label}` : "Enregistré", "ok", 1600);
      }
    } catch (err) {
      console.error("[detail] save failed:", err.message);
      if (window.OrpheeToast) {
        window.OrpheeToast("Non enregistré — vérifie ta connexion et réessaie.", "error", 4500);
      }
    }
  }

  // ---- Stats loading (Firestore) -----------------------------------------

  async function fetchStats(albumSur) {
    try {
      const snap = await firebase.firestore()
        .doc("album_stats/" + albumSur).get();
      return snap.exists ? snap.data() : null;
    } catch (err) {
      console.error("[detail] album_stats load failed:", err.message);
      return null;
    }
  }

  // Inject the (potentially heavy) chart + lists. Called only once the slide-up
  // has settled, so the DOM mutation never reflows the sheet mid-animation.
  function applyStats(doc, albumSur) {
    // guard against a stale response if the user re-opened another album
    if (!current || current.album.album_sur !== albumSur) return;
    renderChart(doc ? (doc.monthly_distribution || []) : null);
    renderTracks(doc ? (doc.top_tracks || []) : null);
    renderEcho(doc);
  }

  // ---- open / close -------------------------------------------------------

  function open(album) {
    const grade = (album.grade === undefined || album.grade === null) ? null : album.grade;
    current = { album, selectedGrade: grade, personal_fav: !!album.personal_fav,
      genre: album.genre || "", sousgenre: album.sousgenre || "",
      editingComment: false };
    const ro = readOnly();
    impactEl.innerHTML = "";
    genreImpactEl.innerHTML = "";
    trialEl.hidden = !ro;
    descEl.tabIndex = ro ? -1 : 0;
    descEl.setAttribute("role", ro ? "note" : "button");
    if (noteLabelEl) noteLabelEl.textContent = ro ? "Sa note" : "Ta note";

    // hero
    const pal = window.coverPalette ? window.coverPalette(album) : { c1: "#1c211d", c2: "#0a0c0b" };
    heroBg.style.background = `linear-gradient(150deg, ${pal.c1}, ${pal.c2})`;
    if (window.renderCover) window.renderCover(coverWrap, album);

    titleEl.textContent  = album.album  || "";
    artistEl.textContent = album.artist || "";

    setListenLink(album);

    const bits = [];
    if (album.genre) bits.push(album.genre + (album.sousgenre ? " · " + album.sousgenre : ""));
    bits.push(fmt(album.listen_count) + " écoutes");
    if (album.first_listen_y) bits.push("découvert " + album.first_listen_y);

    metaEl.innerHTML = "";
    bits.forEach((b, i) => {
      if (i > 0) metaEl.appendChild(el("span", { className: "dt-dot" }, "·"));
      metaEl.appendChild(el("span", null, b));
    });

    // curation — genre replié à chaque ouverture de fiche
    clearTimeout(closeT);
    current.genreOpen = false;
    gpanelEl.hidden = true;
    renderGenres();
    refreshComment();
    refreshGradeChips();
    // Le halo s'allume une fois la fiche posée (v2.43.2) : allumé pendant la
    // montée, il clignotait quand le calque d'animation est rendu (400 ms).
    overlay.classList.remove("glow");
    refreshFav();
    refreshAside();
    renderLinks(album);

    // stats: start the network fetch NOW so its latency overlaps the slide-up,
    // but render an empty state for the moment and inject the real content only
    // after the animation settles (see the deferred applyStats below).
    const sur = album.album_sur;
    renderChart(null);
    renderTracks(null);
    renderEcho(null);
    chartWrap.hidden = true;
    const statsPromise = fetchStats(sur);

    // show — base reset shared by both entrances
    scrim.style.display   = "";
    overlay.style.display = "";
    overlay.style.transition = "";
    overlay.style.opacity    = "";
    overlay.style.transform  = "";
    scrim.style.opacity      = "";
    scrollEl.scrollTop = 0;
    overlay.classList.remove("expanded");
    coverStage.classList.remove("cd-out");
    expanded = false;

    // Bottom-sheet slide: the card rises from the bottom already populated
    // (cover + infos in place). Once it has settled, the disc slides out of the
    // sleeve and the cover shifts left.
    overlay.classList.add("animating");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add("open");
      scrim.classList.add("open");
      setTimeout(() => {
        if (current && current.album.album_sur === sur && isCd()) {
          coverStage.classList.add("cd-out");
        }
      }, 380);
      // once the slide-up has settled: drop the transient compositor hint and
      // inject the heavy stats content (kept off the timeline so neither the
      // reflow nor a layer re-raster lands mid-animation).
      setTimeout(async () => {
        overlay.classList.remove("animating");
        if (current && current.album.album_sur === sur) {
          overlay.classList.toggle("glow", current.selectedGrade != null);
        }
        applyStats(await statsPromise, sur);
      }, 400);
    }));

    if (!(history.state && history.state.orpheeDetail)) {
      // Garde l'écran courant et la profondeur (nav.js) : « retour » ferme la
      // fiche et revient exactement où l'on était.
      const prev = history.state || {};
      history.pushState({ orpheeDetail: album.album_sur,
        orpheeView: prev.orpheeView, orpheeDepth: (prev.orpheeDepth || 0) + 1 }, "",
        "?album=" + encodeURIComponent(album.album_sur));
    }
  }

  function hide() {
    leaving();
    scrim.style.display   = "none";
    overlay.style.display = "none";
    overlay.classList.remove("open");
    overlay.classList.remove("expanded");
    overlay.classList.remove("animating");
    coverStage.classList.remove("cd-out");
    scrim.classList.remove("open");
    // clear any inline state left by a drag-to-close gesture or morph-out
    overlay.style.transform  = "";
    overlay.style.transition = "";
    overlay.style.opacity    = "";
    scrim.style.opacity      = "";
    closing = false;
    expanded = false;
    current = null;
  }

  function popHistoryIfNeeded() {
    if (history.state && history.state.orpheeDetail) history.back();
  }

  // Slide the sheet back down (removing .open), then unmount it.
  // La fiche artiste dessous se cache tant que l'album la recouvre
  // (artist-sheet.js) : on la rend dès que l'album commence à partir.
  const leaving = () => document.dispatchEvent(new CustomEvent("orphee:album-leaving"));

  function animateDown() {
    leaving();
    if (closing) return;
    closing = true;
    overlay.classList.add("animating");
    coverStage.classList.remove("cd-out");
    overlay.style.transition = "";
    overlay.style.transform  = "";
    overlay.classList.remove("open");
    scrim.classList.remove("open");
    scrim.style.opacity      = "";
    setTimeout(hide, 360);
  }

  function close() {
    animateDown();
    popHistoryIfNeeded();
  }

  // ---- Sheet gestures -----------------------------------------------------
  // Vaul/Material pattern: the drag lives on the HEADER (handle + hero), never
  // on the scrollable body — so dragging the card and scrolling its content
  // never fight each other. The body scrolls 100% natively.
  let dragStartY = 0, dragging = false, dragDy = 0, closing = false;
  let expanded = false;
  const DRAG_CLOSE_PX = 110;   // pull the header down past this → dismiss
  const EXPAND_PX = 40;        // push the header up past this → full screen

  function setExpanded(on) {
    if (expanded === on) return;
    expanded = on;
    overlay.classList.toggle("expanded", on);
  }

  // v2.31.3 : la carte se tire vers le bas depuis TOUT le contenu tant
  // qu'il est en haut (plus besoin de viser l'en-tête). Le geste n'est
  // pris qu'au premier vrai mouvement : vers le bas → la carte suit ;
  // vers le haut sur l'en-tête → agrandir (comme avant) ; vers le haut
  // ailleurs, ou à l'horizontale → on laisse défiler.
  let dragArmed = false, dragOnHead = false, dragStartX = 0;
  function onDragStart(e) {
    if (overlay.style.display === "none" || e.touches.length !== 1) return;
    if (scrollEl.scrollTop > 0) return;
    dragStartY = e.touches[0].clientY;
    dragStartX = e.touches[0].clientX;
    dragOnHead = !!(e.target.closest && e.target.closest(".dt-top, .dt-hero"));
    dragging   = true;
    dragArmed  = false;
    dragDy     = 0;
  }

  function onDragMove(e) {
    if (!dragging) return;
    const dy = e.touches[0].clientY - dragStartY;
    if (!dragArmed) {
      const dx = e.touches[0].clientX - dragStartX;
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      if (Math.abs(dx) > Math.abs(dy) || (dy < 0 && !dragOnHead)) { dragging = false; return; }
      dragArmed = true;
      if (dy > 0) leaving();
      overlay.classList.add("animating");
      overlay.style.transition = "none";
    }
    dragDy = dy;
    if (dy > 0) {                        // downward → track the finger to dismiss
      e.preventDefault();
      // the disc slides back into the sleeve as soon as the pull starts
      coverStage.classList.remove("cd-out");
      overlay.style.transform = "translateY(" + dy + "px)";
      scrim.style.opacity     = String(Math.max(0, 1 - dy / 600));
    } else {                             // upward on the header → reveal/expand
      overlay.style.transform = "";
    }
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    if (!dragArmed) return;
    overlay.style.transition = "";       // hand back to the CSS transition
    if (dragDy > DRAG_CLOSE_PX) {         // dismiss
      closing = true;
      coverStage.classList.remove("cd-out");
      overlay.style.transform = "translateY(100%)";
      scrim.classList.remove("open");
      scrim.style.opacity     = "";
      popHistoryIfNeeded();
      setTimeout(hide, 340);
      return;
    }
    if (dragDy < -EXPAND_PX) setExpanded(true);  // pushed up → full screen
    if (isCd()) coverStage.classList.add("cd-out");  // le CD ressort
    overlay.style.transform = "";        // snap back to the resting/expanded top
    scrim.style.opacity     = "";
    // drop the transient layer once the snap-back settles
    setTimeout(() => { if (!dragging && !closing) overlay.classList.remove("animating"); }, 360);
  }

  // ---- init ---------------------------------------------------------------

  function init() {
    buildDOM();

    backBtn.addEventListener("click", close);
    favBtn.addEventListener("click", () => {
      if (!current) return;
      current.personal_fav = !current.personal_fav;
      refreshFav();
      save();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display !== "none") close();
    });

    window.addEventListener("popstate", () => {
      // back button: animate the sheet down unless a close is already running
      if (overlay.style.display !== "none" && !closing) animateDown();
    });

    // Glisser : sur tout le contenu (v2.31.3), armé au premier mouvement
    // (cf. onDragStart) — le défilement natif n'est jamais gêné.
    scrollEl.addEventListener("touchstart",  onDragStart, { passive: true });
    scrollEl.addEventListener("touchmove",   onDragMove,  { passive: false });
    scrollEl.addEventListener("touchend",    onDragEnd,   { passive: true });
    scrollEl.addEventListener("touchcancel", onDragEnd,   { passive: true });

    // La pile a bougé (autre écran, note posée) : le marque-page suit.
    document.addEventListener("orphee:aside-changed", () => { if (current) refreshAside(); });
    // Un CD ajouté ou retiré (ici, en mode tri, ou ailleurs) : pastille et disque suivent.
    document.addEventListener("orphee:cds-changed", () => { if (current) { refreshCd(); syncDisc(); } });

    document.addEventListener("orphee:edit-album", (e) => {
      if (e.detail && e.detail.album) open(e.detail.album);
    });
  }

  // wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
