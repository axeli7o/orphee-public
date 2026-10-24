/* Orphée — Bibliothèque en bacs (v2.11.0, PM-03, ADR-039).
   Comme un disquaire : des bacs qu'on change en glissant de côté, et qu'on
   parcourt de haut en bas.
   - Adorés, puis un bac par genre (genre effectif : album, sinon artiste —
     MODELE E8), puis Paradoxes (Oddity, IM-6 — v2.12.0) : chacun est une PILE DE TRANCHES — sombres, à peine teintées
     par la pochette, avec sa vignette nette ; un toucher ouvre la fiche.
   - Tri au choix (écoutes, artiste A→Z, album A→Z) : trois pictos discrets.
   - Une loupe : un champ, toute la bibliothèque, un bac « Recherche ».
   Curation lue LIVE (ADR-031) ; la note s'édite dans la fiche album.
   Expose aussi window.orpheeOddity (Réglages, « Mes paradoxes »). */
(function () {
  "use strict";

  const GRADE_COLORS = window.ORPHEE_GRADE_COLORS || {};
  const GRADE_LABELS = window.ORPHEE_GRADES || {};
  const ODDITY_DEFAULTS = { percentile: 90, eligible: [1, 2] };
  const UNCLASSIFIED = "Non classé";

  // ---- Données -------------------------------------------------------------
  let allItems = null;
  let allLoading = null;
  let sortedListens = [];
  let oddity = Object.assign({}, ODDITY_DEFAULTS);
  let oddityThreshold = 0;

  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);
  const norm = (s) => (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  const byListens = (a, b) => (b.listen_count || 0) - (a.listen_count || 0);
  const az = (x, y) => (x || "").localeCompare(y || "", "fr", { sensitivity: "base", numeric: true });
  // Tri des bacs, au choix (sélecteur discret) : écoutes, note, album A→Z.
  // « Note » (v2.39.0) remplace « artiste A→Z » : les artistes ont leur vue.
  // Adoré → Zappé, non notés à la fin ; à note égale, les plus écoutés.
  const SORTS = {
    ecoutes: byListens,
    note: (a, b) => (b.grade || 0) - (a.grade || 0) || byListens(a, b),
    album: (a, b) => az(a.album, b.album) || az(a.artist, b.artist),
  };
  let sortMode = "note"; // par défaut (v2.42.1)
  try { const m = localStorage.getItem("orphee.lib.sort"); if (SORTS[m]) sortMode = m; } catch (e) { /* défaut */ }
  const bySort = (a, b) => SORTS[sortMode](a, b);
  // Albums | Artistes (v2.40.0, PM-37) : deux façons d'entrer dans la
  // bibliothèque ; l'appli rouvre sur la dernière choisie.
  let mode = "albums";
  try { if (localStorage.getItem("orphee.lib.mode") === "artistes") mode = "artistes"; } catch (e) { /* défaut */ }
  let modeSeg = null;
  let barEl = null;
  let sortEl = null;
  let artistsEl = null;
  let sArtistsEl = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function thresholdForPercentile(p) {
    if (!sortedListens.length) return 0;
    const rank = Math.ceil((p / 100) * sortedListens.length);
    return sortedListens[Math.min(sortedListens.length - 1, Math.max(0, rank - 1))];
  }

  function isOddity(item, threshold, eligible) {
    return item.grade !== null && threshold > 0 &&
      eligible.indexOf(item.grade) >= 0 && item.listen_count >= threshold;
  }

  function recomputeOddity() {
    sortedListens = allItems ? allItems.map((a) => a.listen_count).sort((x, y) => x - y) : [];
    oddityThreshold = thresholdForPercentile(oddity.percentile);
  }

  function docData(snap) { return snap && snap.exists ? snap.data() : null; }

  function applyCuration(item, c) {
    item.grade        = (c.grade == null) ? null : c.grade;
    item.grade_label  = item.grade === null ? null : (GRADE_LABELS[item.grade] || null);
    item.personal_fav = !!c.personal_fav;
    item.genre        = c.genre        || "";
    item.sousgenre    = c.sousgenre    || "";
    item.commentaire  = c.commentaire  || "";
    if (c.cover_url) item.cover_url = c.cover_url;
  }

  // Données à lire : les siennes, ou celles d'Axel pour un invité (PM-28).
  const dataUid = () => (window.OrpheeSession ? window.OrpheeSession.dataUid() : null);

  async function loadUserGrades() {
    const uid = dataUid();
    if (!uid) return new Map();
    try {
      const snap = await firebase.firestore().collection("users/" + uid + "/grades").get();
      const m = new Map();
      snap.forEach((d) => m.set(d.id, d.data()));
      return m;
    } catch (err) {
      console.error("[library] grades load failed:", err.message);
      return new Map();
    }
  }

  async function loadOddSettings() {
    const uid = dataUid();
    if (!uid) return Object.assign({}, ODDITY_DEFAULTS);
    try {
      const snap = await firebase.firestore().doc("users/" + uid + "/settings/oddity").get();
      const d = snap.exists ? snap.data() : null;
      return {
        percentile: (d && typeof d.percentile === "number") ? d.percentile : ODDITY_DEFAULTS.percentile,
        eligible: (d && Array.isArray(d.eligible)) ? d.eligible : ODDITY_DEFAULTS.eligible.slice(),
      };
    } catch (err) {
      console.error("[library] oddity settings load failed:", err.message);
      return Object.assign({}, ODDITY_DEFAULTS);
    }
  }

  async function loadAll() {
    const db = firebase.firestore();
    const meta = docData(await db.doc("cache/agg_library_all_meta").get());
    if (!meta) { allItems = []; return; }
    const reads = [];
    for (let i = 0; i < (meta.chunk_count || 0); i++) {
      reads.push(db.doc("cache/agg_library_all_" + i).get());
    }
    const [snaps, grades, settings] = await Promise.all([
      Promise.all(reads), loadUserGrades(), loadOddSettings(),
    ]);
    const items = [];
    for (const s of snaps) {
      const d = docData(s);
      if (d && d.items) items.push(...d.items);
    }
    for (const it of items) {
      // Les chunks cache ne portent pas la curation (ADR-031) : forme normalisée
      // (non noté par défaut) puis curation LIVE superposée.
      it.grade        = (it.grade == null) ? null : it.grade;
      it.grade_label  = it.grade === null ? null : (GRADE_LABELS[it.grade] || null);
      it.personal_fav = !!it.personal_fav;
      it.genre        = it.genre || "";
      it.sousgenre    = it.sousgenre || "";
      it.commentaire  = it.commentaire || "";
      const c = grades.get(it.album_sur);
      if (c) applyCuration(it, c);
    }
    allItems = items;
    oddity = settings;
    recomputeOddity();
  }

  function ensureAll() {
    if (allItems) return Promise.resolve();
    if (!allLoading) {
      allLoading = loadAll().catch((err) => {
        console.error("[library] load failed:", err.message);
        allLoading = null;
      });
    }
    return allLoading;
  }

  // ---- Bacs ----------------------------------------------------------------
  function genreOf(a) {
    const g = window.OrpheeArtists ? window.OrpheeArtists.effective(a).genre : a.genre;
    return g || UNCLASSIFIED;
  }

  function buildCrates(items) {
    const crates = [];
    // La pile « Mis de côté » (PM-35), à gauche d'Adorés : dans son ordre (envie forte,
    // prêts, à découvrir, oubliés — signal dérivé, aside.js), quel que soit
    // le tri. Les oubliés sont ternis, les envies fortes portent une étoile.
    // La bibliothèque s'ouvre toujours sur Adorés (render) : on sait où
    // trouver la pile sans qu'elle s'impose. Axel seul : l'invité ne la voit pas.
    const A = window.OrpheeAside;
    const guest = window.OrpheeSession && window.OrpheeSession.isGuest();
    const pile = A && !guest ? A.list(items) : [];
    if (pile.length) {
      crates.unshift({ key: "aside", title: "Mis de côté", sub: "à écouter avant de noter", items: pile.map((x) => x.a),
        dim: new Set(pile.filter((x) => x.sig.kind === "old" && !x.entry.star).map((x) => x.a.album_sur)),
        star: new Set(pile.filter((x) => x.entry.star).map((x) => x.a.album_sur)) });
    }
    // Mes CD (PM-38, E12), tout à gauche : toujours là pour Axel (même vide,
    // pour y trouver « Trier mes CD »), pour l'invité seulement s'il y en a.
    const C = window.OrpheeCds;
    if (C && (C.count() || C.canEdit())) {
      const mine = items.filter((a) => C.has(a.album_sur)).sort(bySort);
      crates.unshift({ key: "cds", title: "Mes CD", sub: "ta discothèque", regard: true, items: mine,
        empty: "Aucun CD pour l’instant. Touche la pochette d’un album, ou « Trier mes CD » en bas." });
    }
    const adored = items.filter((a) => a.grade === 5 || a.personal_fav).sort(bySort);
    if (adored.length) {
      crates.push({ key: "adores", title: "Adorés", sub: "ce que tu adores", regard: true, items: adored });
    }
    // Bacs de genre : les albums notés + les très écoutés (même seuil que
    // « très écouté », Réglages › Avancé). La longue traîne d'albums à
    // quelques écoutes reste trouvable par la loupe (recherche = tout).
    const kept = (a) => a.grade != null || !oddityThreshold ||
      (a.listen_count || 0) >= oddityThreshold;
    const byGenre = new Map();
    for (const a of items) {
      if (!kept(a)) continue;
      const g = genreOf(a);
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g).push(a);
    }
    const genres = Array.from(byGenre.keys()).sort((x, y) => {
      if (x === UNCLASSIFIED) return 1;
      if (y === UNCLASSIFIED) return -1;
      return byGenre.get(y).length - byGenre.get(x).length;
    });
    for (const g of genres) {
      const list = byGenre.get(g).sort(bySort);
      crates.push({ key: "g:" + g, title: g, sub: list.length + " album" + (list.length > 1 ? "s" : ""), mode: "tr", items: list });
    }
    // Derrière les genres : les paradoxes (segmentation dérivée, IM-6 — lue,
    // jamais écrite). « Voir les N » de « Moi » y mène.
    const odd = items.filter((a) => isOddity(a, oddityThreshold, oddity.eligible)).sort(bySort);
    if (odd.length) {
      crates.push({ key: "paradoxes", title: "Paradoxes", sub: "écoutés sans compter, notés bas", regard: true, items: odd });
    }
    return crates;
  }

  // ---- Mes CD : galette et mode « Trier mes CD » (PM-38) ---------------------
  let sorting = false;
  let triEl = null, cdSortBtn = null;
  const hasCd = (a) => !!(a && window.OrpheeCds && window.OrpheeCds.has(a.album_sur));
  function paintCd(s) {
    const on = hasCd(s._a);
    s.classList.toggle("is-cd", on);
    if (s._a) s.setAttribute("aria-label", `${s._a.album} — ${s._a.artist}${on ? ", dans tes CD" : ""}` +
      (sorting ? (on ? ". Toucher pour le retirer de tes CD" : ". Toucher si tu l'as en CD") : ", ouvrir la fiche"));
  }
  function paintTri() {
    if (!triEl) return;
    const c = view[current];
    const n = c ? c.items.filter(hasCd).length : 0;
    triEl.querySelector("b").textContent = fmt(n);
    triEl.querySelector("small").textContent = c ? ` sur ${fmt(c.items.length)} dans « ${c.title} »` : "";
  }
  function setSorting(on) {
    sorting = on;
    viewEl.classList.toggle("lb-sorting", on);
    applyMode();
    if (on) {
      // Depuis « Mes CD », on part trier dans Adorés : là où sont les CD à trouver.
      if (view[current] && view[current].key === "cds") {
        const i = view.findIndex((c) => c.key === "adores");
        if (i >= 0) goToCrate(i, true);
      }
      for (const s of viewEl.querySelectorAll(".lb-spine")) paintCd(s);
      paintTri();
    } else {
      render();  // « Mes CD » se recompose une fois le tri terminé
    }
  }
  // Un CD change : les galettes visibles suivent sur place. Le bac « Mes CD »
  // se recompose ensuite (fin du tri, ou fiche album refermée) : reconstruire
  // toute la pile sous une fiche ouverte la faisait clignoter (v2.43.1).
  function onCdsChanged() {
    if (!allItems) return;
    for (const s of viewEl.querySelectorAll(".lb-spine")) paintCd(s);
    if (sorting) paintTri(); else renderLater();
  }
  let albumOpen = false, pending = false;
  function renderLater() {
    if (albumOpen) pending = true; else render();
  }

  function openAlbum(a) {
    document.dispatchEvent(new CustomEvent("orphee:edit-album", { detail: { album: a } }));
  }

  // ---- Tranches : une bande de la vraie pochette (ADR-039) -----------------
  // Plutôt que de résumer la pochette en quelques couleurs (essais v2–v4 :
  // teintes ternes ou taches boueuses), la tranche montre une fine bande
  // horizontale de la pochette elle-même, étirée sur la largeur (vignette
  // Deezer agrandie : douce, comme un fond flou) et assombrie à gauche pour
  // que le titre, blanc, reste lisible. Pas de canvas, pas de CORS.
  // Sans pochette réelle : le dégradé génératif de la maquette.
  try { for (const v of ["v1", "v2", "v3", "v4"]) localStorage.removeItem("orphee.spines." + v); } catch (e) { /* ignoré */ }
  function hslCss(h, s2, l) { return `hsl(${Math.round(h)} ${Math.round(s2 * 100)}% ${Math.round(l * 100)}%)`; }
  function sized(url, px) {
    // Deezer : …/1000x1000-000000-80-0-0.jpg → même image, autre taille
    return url && /dzcdn\.net/.test(url) ? url.replace(/\/\d+x\d+-/, `/${px}x${px}-`) : url;
  }
  function generatedSpine(a) {
    const p = window.coverPalette ? window.coverPalette(a) : null;
    const h = p && typeof p.h === "number" ? p.h : 150;
    const h2 = (h + 55) % 360;
    return `linear-gradient(90deg, ${hslCss(h, 0.45, 0.3)}, ${hslCss(h, 0.5, 0.38)} 40%, ${hslCss(h2, 0.45, 0.26)})`;
  }
  // Fond de la tranche : la pochette, très floutée et assombrie par le CSS
  // (.lb-spine .bg) — une teinte d'ambiance ; la vignette nette fait la
  // reconnaissance. url() nettoyée.
  function spineBackground(a) {
    const url = a.cover_url && sized(a.cover_url, 56); // très flouté : la vignette suffit
    if (!url || !/^https:\/\//.test(url)) return generatedSpine(a);
    return `url("${url.replace(/["\\\n]/g, "")}") center 50% / 100% auto no-repeat, ${generatedSpine(a)}`;
  }
  function paintSpine(bgEl, a) {
    bgEl.style.background = spineBackground(a);
  }

  // ---- Vue -------------------------------------------------------------------
  let viewEl, railEl, pagerEl, searchRow, searchInput, sheetEl, scrimEl, statusEl;
  let crates = [];
  let view = [];           // bacs affichés (la recherche les remplace par un seul)
  let current = 0;
  let panels = [];         // {key, api}
  const memory = {};       // par bac : album devant / sorti (survit aux rebuilds)
  let searching = false;
  let searchLayered = false;
  let sheetLayered = false;

  function isActive() { return viewEl && viewEl.classList.contains("is-active"); }

  // ---- Rail : les noms des bacs glissent avec le doigt -------------------------
  let railLabels = [];
  let railRaf = 0;
  function buildRail() {
    railEl.innerHTML = "";
    railLabels = view.map((c, i) => {
      const b = el("button", "lb-rail-l");
      b.type = "button";
      b.appendChild(document.createTextNode(c.title));
      b.appendChild(el("span", "n", fmt(c.items.length)));
      const car = el("span", "car", "▾");
      b.appendChild(car);
      b.addEventListener("click", () => {
        if (i === current) { if (!searching) openSheet(); } else goToCrate(i, true);
      });
      railEl.appendChild(b);
      return { b, car, w: 0 };
    });
    requestAnimationFrame(() => { measureRail(); paintRail(); });
  }
  // Largeurs mesurées une fois (et au redimensionnement), jamais pendant le
  // glissement. paintRail n'écrit que ce qui change (v2.24.3) : réécrire
  // chaque étiquette à chaque image coûtait des saccades.
  let railCx = 0, railSp = 0, pagerW = 1;
  function measureRail() {
    for (const l of railLabels) { l.w = l.b.offsetWidth; l.hid = null; l.cur = null; }
    pagerW = pagerEl.clientWidth || 1;
    railCx = railEl.clientWidth / 2;
    railSp = Math.min(190, railEl.clientWidth * 0.46);
  }
  function paintRail() {
    railRaf = 0;
    const pos = pagerEl.scrollLeft / pagerW;
    railLabels.forEach((l, i) => {
      const d = i - pos;
      const ad = Math.abs(d);
      const cur = ad < 0.5;
      if (l.cur !== cur) {
        l.cur = cur;
        l.b.setAttribute("aria-current", cur ? "true" : "false");
        // La pile « Mis de côté » a son propre ordre : pas de tri (PM-35).
        if (cur) viewEl.classList.toggle("lb-own-order", !!(view[i] && view[i].key === "aside"));
        if (cur && sorting) paintTri();
      }
      const hid = ad > 2.2;
      if (l.hid !== hid) { l.hid = hid; l.b.style.visibility = hid ? "hidden" : ""; }
      if (hid) return;
      const sc = 1 - Math.min(ad, 1) * 0.42;
      l.b.style.transform = `translate3d(${(railCx + d * railSp - l.w / 2).toFixed(1)}px,0,0) scale(${sc.toFixed(3)})`;
      l.b.style.opacity = (1 - Math.min(ad, 1.6) * 0.5).toFixed(3);
      l.car.style.opacity = searching ? "0" : Math.max(0, 1 - ad * 3).toFixed(2);
    });
  }
  function goToCrate(i, smooth) {
    i = Math.max(0, Math.min(view.length - 1, i));
    pagerEl.scrollTo({ left: i * pagerEl.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }

  // ---- Tous les bacs (feuille) -----------------------------------------------
  function openSheet() {
    sheetEl.innerHTML = "";
    const groups = [["", view.filter((c) => c.regard)], ["Genres", view.filter((c) => !c.regard)]];
    for (const [title, list] of groups) {
      if (!list.length) continue;
      if (title) sheetEl.appendChild(el("h2", null, title));
      const g = el("div", "lb-sheet-grp");
      for (const c of list) {
        const i = view.indexOf(c);
        const b = el("button", i === current ? "on" : "");
        b.type = "button";
        b.appendChild(document.createTextNode(c.title));
        b.appendChild(el("span", "n", fmt(c.items.length)));
        b.addEventListener("click", () => { closeSheet(); goToCrate(i, false); });
        g.appendChild(b);
      }
      sheetEl.appendChild(g);
    }
    sheetEl.hidden = false;
    scrimEl.hidden = false;
    if (window.OrpheeNav && !sheetLayered) {
      sheetLayered = true;
      window.OrpheeNav.openLayer("crates", closeSheetNow);
    }
  }
  function closeSheet() {
    if (sheetLayered && window.OrpheeNav) window.OrpheeNav.closeLayer("crates");
    else closeSheetNow();
  }
  function closeSheetNow() {
    sheetLayered = false;
    sheetEl.hidden = true;
    scrimEl.hidden = true;
  }

  // ---- Mode Tranches : une pile de CD vus de côté (genres) ---------------------
  // Un bac peut compter plus de 1 000 albums : la pile est VIRTUALISÉE (seules
  // les tranches visibles existent, recyclées), le défilement est libre (élan
  // natif) et la pile se cale en douceur sur une tranche une fois arrêtée.
  const ROW = 58; // 56 px de tranche + 2 px d'écart
  function buildSpines(p, c) {
    const n = c.items.length;
    const box = el("div", "lb-spines");
    const inner = el("div", "lb-spines-in");
    box.appendChild(inner);
    p.appendChild(box);

    let raf = 0, boxH = 0;

    // Pool de tranches recyclées
    const live = new Map(); // index → bouton
    const free = [];
    function makeSpine() {
      const s = el("button", "lb-spine");
      s.type = "button";
      const bg = el("span", "bg");
      const notch = el("span", "notch");
      const thumb = el("span", "thumb");
      const ar = el("span", "ar");
      const al = el("span", "al");
      const ls = el("span", "ls");
      const cd = el("span", "cd cd-mini");   // la galette, derrière la vignette (PM-38)
      const ck = el("span", "ck");           // la coche du mode « Trier mes CD »
      // deux lignes : le titre de l'album, puis l'artiste
      const txt = el("span", "txt");
      txt.appendChild(al); txt.appendChild(ar);
      s.appendChild(bg); s.appendChild(notch); s.appendChild(cd); s.appendChild(thumb);
      s.appendChild(txt); s.appendChild(ls); s.appendChild(ck);
      s._parts = { bg, notch, thumb, ar, al, ls };
      // Un toucher ouvre la fiche (comme partout dans l'app) ; en mode
      // « Trier mes CD », il coche ou décoche le CD, sans ouvrir la fiche.
      s.addEventListener("click", () => {
        const a = c.items[s._idx];
        if (!a) return;
        if (sorting && window.OrpheeCds) {
          if (window.OrpheeJuice) window.OrpheeJuice.buzz(8);
          window.OrpheeCds.toggle(a, true);
        } else openAlbum(a);
      });
      inner.appendChild(s);
      return s;
    }
    function bind(s, k) {
      const a = c.items[k];
      s._idx = k;
      s._a = a;
      paintCd(s);
      s.style.transform = `translateY(${k * ROW}px)`;
      paintSpine(s._parts.bg, a);
      const u = a.cover_url && sized(a.cover_url, 56);
      s._parts.thumb.style.background = u && /^https:\/\//.test(u) ?
        `url("${u.replace(/["\\\n]/g, "")}") center / cover` : generatedSpine(a);
      const col = GRADE_COLORS[a.grade];
      s._parts.notch.style.background = col ? col.bg : "rgba(255,255,255,.18)";
      s._parts.ar.textContent = a.artist;
      s._parts.al.textContent = a.album;
      const starred = !!(c.star && c.star.has(a.album_sur));
      s._parts.ls.textContent = starred ? "★" : fmt(a.listen_count);
      s._parts.ls.classList.toggle("star", starred);
      s.classList.toggle("asleep", !!(c.dim && c.dim.has(a.album_sur)));
      s.setAttribute("aria-label", `${a.album} — ${a.artist}, ouvrir la fiche`);
    }
    function renderWindow() {
      // Hauteur relue à chaque fois (barre d'adresse mobile, rotation…) ;
      // jamais 0 : au pire la fenêtre, pour ne pas dessiner trop peu.
      boxH = box.clientHeight || p.clientHeight || window.innerHeight;
      const top = box.scrollTop;
      const first = Math.max(0, Math.floor(top / ROW) - 4);
      const last = Math.min(n - 1, Math.ceil((top + boxH) / ROW) + 8);
      for (const [k, s] of live) {
        if (k < first || k > last) { live.delete(k); s.style.visibility = "hidden"; free.push(s); }
      }
      for (let k = first; k <= last; k++) {
        if (live.has(k)) continue;
        const s = free.pop() || makeSpine();
        s.style.visibility = "";
        bind(s, k);
        live.set(k, s);
      }
    }
    // Défilement natif, libre : on retient seulement l'album du haut, pour
    // revenir au même endroit.
    function onFrame() {
      raf = 0;
      renderWindow();
      const top = c.items[Math.min(n - 1, Math.floor(box.scrollTop / ROW))];
      if (top) memory[c.key] = top.album_sur;
    }
    box.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(onFrame); }, { passive: true });

    const keep = memory[c.key];
    const start = keep ? Math.max(0, c.items.findIndex((a) => a.album_sur === keep)) : 0;
    let placed = false;
    // Safari peut mesurer la pile avant qu'elle ait sa taille : on refait
    // la mise en page dès que sa taille change.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => { if (box.clientHeight) layout(); }).observe(box);
    }
    function layout() {
      if (!p.clientHeight && !box.clientHeight) return;
      boxH = box.clientHeight || p.clientHeight;
      inner.style.height = (n * ROW + 84) + "px"; // de la marge sous le sélecteur de tri
      if (!placed) {
        placed = true;
        box.scrollTop = start * ROW;
      }
      onFrame();
    }
    return { layout };
  }

  // ---- Assemblage ------------------------------------------------------------
  // Les panneaux existent tous (le pager a sa largeur), mais seuls le bac
  // courant et ses voisins sont construits ; les autres sont vidés.
  function buildPanels() {
    pagerEl.innerHTML = "";
    panels = view.map((c) => {
      const p = el("section", "lb-panel");
      p.setAttribute("aria-label", c.title);
      pagerEl.appendChild(p);
      return { key: c.key, c, p, api: null };
    });
  }

  function ensurePanels() {
    panels.forEach((x, i) => {
      const near = Math.abs(i - current) <= 1;
      if (near && !x.api) {
        if (!x.c.items.length) {
          x.p.appendChild(el("p", "lb-empty", searching ? "Aucun album ne correspond." : (x.c.empty || "Ce bac est vide.")));
          x.api = {};
        } else {
          x.api = buildSpines(x.p, x.c);
        }
        if (isActive() && x.api.layout) x.api.layout();
      } else if (!near && x.api && Math.abs(i - current) > 2) {
        x.p.innerHTML = "";
        x.api = null;
      }
    });
  }

  function relayout() {
    if (!isActive()) return;
    measureRail();
    ensurePanels();
    for (const x of panels) if (x.api && x.api.layout) x.api.layout();
    pagerEl.scrollLeft = current * pagerEl.clientWidth;
    paintRail();
  }

  // Reconstruit tout en gardant le bac courant et, dans chaque bac, l'album
  // devant / sorti (memory) : une note posée ne fait plus « sauter » la vue.
  function render() {
    if (!viewEl) return;
    if (!allItems) {
      statusEl.textContent = "Chargement…";
      statusEl.hidden = false;
      pagerEl.innerHTML = "";
      railEl.innerHTML = "";
      return;
    }
    statusEl.hidden = true;
    const keepKey = view[current] && view[current].key;
    crates = buildCrates(allItems);
    if (searching) {
      view = [searchCrate(searchInput.value)];
    } else {
      view = crates;
    }
    const idx = view.findIndex((c) => c.key === keepKey);
    // Premier affichage : sur Adorés, même si « Mis de côté » est à sa gauche.
    const home = keepKey ? -1 : view.findIndex((c) => c.key === "adores");
    current = idx >= 0 ? idx : home >= 0 ? home : Math.min(current, Math.max(0, view.length - 1));
    if (!view.length) {
      statusEl.textContent = "Ta bibliothèque est vide : lance « Actualiser ».";
      statusEl.hidden = false;
    }
    buildRail();
    buildPanels();
    applyMode();
    requestAnimationFrame(relayout);
  }

  function searchCrate(q) {
    const nq = norm(q.trim());
    const items = nq ?
      (allItems || []).filter((a) => norm(a.artist + " " + a.album).includes(nq)).sort(bySort) : [];
    return { key: "q", title: "Recherche", items, sub: "" };
  }

  // ---- Recherche : un champ, toute la bibliothèque ----------------------------
  let savedKey = null;
  let searchT = 0;
  function openSearch(q) {
    if (!searching) {
      savedKey = view[current] && view[current].key;
      searching = true;
      viewEl.classList.add("searching");
      searchRow.hidden = false;
      if (window.OrpheeNav && !searchLayered) {
        searchLayered = true;
        window.OrpheeNav.openLayer("search", closeSearchNow);
      }
    }
    applyMode();
    searchInput.value = q || "";
    // focus synchrone, dans le geste : sinon iOS n'ouvre pas le clavier
    if (q == null) searchInput.focus();
    runSearch();
  }
  function runSearch() {
    renderSearchArtists(searchInput.value);
    view = [searchCrate(searchInput.value)];
    current = 0;
    buildRail();
    buildPanels();
    requestAnimationFrame(relayout);
  }
  function closeSearch() {
    if (searchLayered && window.OrpheeNav) window.OrpheeNav.closeLayer("search");
    else closeSearchNow();
  }
  function closeSearchNow() {
    searchLayered = false;
    if (!searching) return;
    searching = false;
    viewEl.classList.remove("searching");
    searchRow.hidden = true;
    searchInput.blur();
    view = crates;
    const idx = view.findIndex((c) => c.key === savedKey);
    current = Math.max(0, idx);
    buildRail();
    buildPanels();
    applyMode();
    requestAnimationFrame(relayout);
  }

  // ---- Albums | Artistes -------------------------------------------------------
  // La recherche montre toujours les albums trouvés, et les artistes au-dessus.
  function applyMode() {
    if (!viewEl || !barEl) return;
    const artists = mode === "artistes" && !searching;
    for (const b of modeSeg.children) b.classList.toggle("on", b.dataset.mode === mode);
    if (artists && sorting) { sorting = false; viewEl.classList.remove("lb-sorting"); }
    barEl.hidden = artists;
    pagerEl.hidden = artists;
    sortEl.hidden = artists || sorting;
    triEl.hidden = artists || !sorting;
    cdSortBtn.hidden = !(window.OrpheeCds && window.OrpheeCds.canEdit());
    artistsEl.hidden = !artists;
    sArtistsEl.hidden = !searching;
    if (artists && allItems && window.OrpheeArtistsView) window.OrpheeArtistsView.render(artistsEl);
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    try { localStorage.setItem("orphee.lib.mode", m); } catch (e) { /* pour la session */ }
    applyMode();
    if (mode === "albums") requestAnimationFrame(relayout);
    else artistsEl.scrollTop = 0;
  }
  // Artistes trouvés par la loupe : leurs visages, au-dessus des albums.
  function renderSearchArtists(q) {
    sArtistsEl.innerHTML = "";
    const nq = norm(q).trim();
    if (!nq || !allItems) return;
    const tot = new Map();
    for (const a of allItems) if (norm(a.artist).includes(nq)) tot.set(a.artist, (tot.get(a.artist) || 0) + (a.listen_count || 0));
    const top = Array.from(tot.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8);
    if (!top.length || !window.OrpheeArtistsView) return;
    sArtistsEl.appendChild(window.OrpheeArtistsView.strip(top.map(([a]) => a)));
  }

  // ---- Sélecteur de tri : trois pictos, sous le pouce ------------------------
  const SORT_ICONS = {
    ecoutes: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="13" width="3.4" height="7" rx="1"/><rect x="10.3" y="9" width="3.4" height="11" rx="1"/><rect x="16.6" y="4" width="3.4" height="16" rx="1"/></svg>',
    // Trois pastilles aux couleurs des notes (Adoré, Culte, Génial).
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="3.2" fill="#e0a23f"/><circle cx="12" cy="12" r="3.2" fill="#ff5fa2"/><circle cx="19" cy="12" r="3.2" fill="#3fc58e"/></svg>',
    album: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="13" r="1.8"/><text x="16" y="8" font-size="8.5" font-weight="800" font-family="inherit">az</text></svg>',
  };
  const SORT_LABELS = { ecoutes: "Trier par écoutes", note: "Trier par note", album: "Trier par album, de A à Z" };
  function buildSortPick() {
    const pick = el("div", "lb-sort");
    pick.setAttribute("role", "group");
    pick.setAttribute("aria-label", "Tri des albums");
    for (const m of ["ecoutes", "note", "album"]) {
      const b = el("button", m === sortMode ? "on" : "");
      b.type = "button";
      b.innerHTML = SORT_ICONS[m];
      b.setAttribute("aria-label", SORT_LABELS[m]);
      b.setAttribute("aria-pressed", m === sortMode ? "true" : "false");
      b.title = SORT_LABELS[m];
      b.addEventListener("click", () => {
        if (m === sortMode) return;
        sortMode = m;
        try { localStorage.setItem("orphee.lib.sort", m); } catch (e) { /* pour la session */ }
        for (const x of pick.children) {
          const on = x === b;
          x.classList.toggle("on", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        }
        // nouvel ordre : chaque bac repart du début
        for (const k of Object.keys(memory)) delete memory[k];
        if (searching) runSearch(); else render();
      });
      pick.appendChild(b);
    }
    // « Trier mes CD » (PM-38) : Axel seul (affiché par applyMode).
    {
      const t = el("button", "lb-sort-cd");
      cdSortBtn = t;
      t.type = "button";
      t.innerHTML = '<i class="cd-mini" aria-hidden="true"></i>';
      t.setAttribute("aria-label", "Trier mes CD");
      t.title = "Trier mes CD";
      t.addEventListener("click", () => setSorting(true));
      pick.appendChild(t);
    }
    return pick;
  }

  // ---- Structure -------------------------------------------------------------
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

  function buildLayout() {
    viewEl = document.getElementById("view-library");
    if (!viewEl) return false;
    viewEl.innerHTML = "";

    const bar = el("div", "lb-bar");
    barEl = bar;
    railEl = el("nav", "lb-rail");
    railEl.setAttribute("aria-label", "Bacs");
    const sBtn = el("button", "lb-search-btn");
    sBtn.type = "button";
    sBtn.setAttribute("aria-label", "Chercher un album ou un artiste");
    sBtn.innerHTML = ICON_SEARCH;
    sBtn.addEventListener("click", () => openSearch());
    bar.appendChild(railEl);
    // Ligne du haut : la bascule, et la loupe (v2.40.0).
    const modeRow = el("div", "lb-mode");
    modeSeg = el("div", "o-seg lb-mode-seg");
    modeSeg.setAttribute("role", "group");
    modeSeg.setAttribute("aria-label", "Albums ou artistes");
    for (const [m, label] of [["albums", "Albums"], ["artistes", "Artistes"]]) {
      const b = el("button", "", label);
      b.type = "button";
      b.dataset.mode = m;
      b.addEventListener("click", () => setMode(m));
      modeSeg.appendChild(b);
    }
    modeRow.appendChild(modeSeg);
    modeRow.appendChild(sBtn);
    artistsEl = el("div", "lb-artists");
    sArtistsEl = el("div", "lb-sartists");

    searchRow = el("div", "lb-search");
    searchRow.hidden = true;
    searchInput = el("input");
    searchInput.id = "lb-search-input";
    searchInput.type = "search";
    searchInput.placeholder = "Album ou artiste";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "Chercher un album ou un artiste");
    searchInput.addEventListener("input", () => {
      clearTimeout(searchT);
      searchT = setTimeout(runSearch, 160);
    });
    searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSearch(); });
    const close = el("button", "lb-search-close", "Fermer");
    close.type = "button";
    close.addEventListener("click", closeSearch);
    searchRow.appendChild(searchInput);
    searchRow.appendChild(close);

    pagerEl = el("div", "lb-pager");
    // Les bacs voisins se construisent une fois le glissement terminé, plus
    // en plein mouvement (v2.24.3 : c'était une saccade au milieu du geste).
    let settleT = 0;
    const settle = () => { clearTimeout(settleT); settleT = 0; ensurePanels(); };
    pagerEl.addEventListener("scroll", () => {
      if (!railRaf) railRaf = requestAnimationFrame(paintRail);
      const i = Math.round(pagerEl.scrollLeft / Math.max(1, pagerEl.clientWidth));
      if (i !== current) current = i;
      clearTimeout(settleT);
      settleT = setTimeout(settle, 140);
    }, { passive: true });
    pagerEl.addEventListener("scrollend", settle, { passive: true });

    statusEl = el("p", "lb-status");
    statusEl.hidden = true;
    scrimEl = el("div", "lb-sheet-scrim");
    scrimEl.hidden = true;
    scrimEl.addEventListener("click", closeSheet);
    sheetEl = el("div", "lb-sheet");
    sheetEl.setAttribute("role", "dialog");
    sheetEl.setAttribute("aria-label", "Tous les bacs");
    sheetEl.hidden = true;

    viewEl.appendChild(modeRow);
    viewEl.appendChild(bar);
    viewEl.appendChild(searchRow);
    viewEl.appendChild(sArtistsEl);
    viewEl.appendChild(statusEl);
    viewEl.appendChild(pagerEl);
    viewEl.appendChild(artistsEl);
    sortEl = buildSortPick();
    viewEl.appendChild(sortEl);
    triEl = el("div", "lb-tri");
    triEl.hidden = true;
    triEl.setAttribute("role", "status");
    const triTxt = el("p");
    triTxt.appendChild(document.createTextNode("Touche ceux que tu as en CD"));
    triTxt.appendChild(el("br"));
    triTxt.appendChild(el("b", null, "0"));
    triTxt.appendChild(el("small"));
    const done = el("button", "o-btn main", "Terminé");
    done.type = "button";
    done.addEventListener("click", () => setSorting(false));
    triEl.appendChild(triTxt);
    triEl.appendChild(done);
    viewEl.appendChild(triEl);
    viewEl.appendChild(scrimEl);
    viewEl.appendChild(sheetEl);
    return true;
  }

  // ---- Événements ------------------------------------------------------------
  function wireEvents() {
    document.addEventListener("orphee:open-album", (e) => {
      if (!allItems || !e.detail) return;
      const item = allItems.find((a) => a.album_sur === e.detail.album_sur);
      if (item) openAlbum(item);
    });

    document.addEventListener("orphee:album-graded", (e) => {
      if (!allItems || !e.detail) return;
      const item = allItems.find((a) => a.album_sur === e.detail.album_sur);
      if (!item) return;
      // L'événement peut ne porter que la note : on garde le reste.
      applyCuration(item, Object.assign({}, item, e.detail.curation));
      recomputeOddity();
      render();
    });

    document.addEventListener("orphee:artist-classified", () => render());
    // Pile « Mis de côté » modifiée (fiche, « Moi ») : le bac suit.
    document.addEventListener("orphee:aside-changed", () => { if (allItems) renderLater(); });
    // Fiche album ouverte : la pile attend qu'elle parte pour se reconstruire.
    document.addEventListener("orphee:edit-album", () => { albumOpen = true; });
    document.addEventListener("orphee:album-leaving", () => {
      albumOpen = false;
      if (pending) { pending = false; setTimeout(() => { if (!albumOpen) render(); }, 400); }
    });
    document.addEventListener("orphee:cds-changed", onCdsChanged);

    document.addEventListener("orphee:settings-saved", (e) => {
      if (!e.detail) return;
      oddity = { percentile: e.detail.percentile, eligible: e.detail.eligible };
      oddityThreshold = thresholdForPercentile(oddity.percentile);
      render();
    });

    document.addEventListener("orphee:refreshed", async () => {
      allItems = null;
      allLoading = null;
      render();
      try {
        await ensureAll();
        if (window.OrpheeArtists) await window.OrpheeArtists.ensure(true);
        render();
        // « Moi » (adorés, paradoxes) dépend de la bibliothèque rechargée.
        document.dispatchEvent(new CustomEvent("orphee:library-reloaded"));
      } catch (err) { console.error("[library] reload failed:", err.message); }
    });

    // Bacs construits pendant que la vue était cachée : mesures à refaire.
    document.addEventListener("orphee:tab", (e) => {
      if (e.detail.tab === "library") requestAnimationFrame(relayout);
    });
    window.addEventListener("resize", () => requestAnimationFrame(relayout));
    document.addEventListener("keydown", (e) => {
      if (!isActive() || searching) return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const dt = document.querySelector(".dt-overlay");
      if (dt && dt.style.display !== "none") return;
      if (e.key === "ArrowRight") goToCrate(current + 1, true);
      if (e.key === "ArrowLeft") goToCrate(current - 1, true);
    });
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      console.error("Firestore non disponible");
      return;
    }
    if (!buildLayout()) return;
    wireEvents();

    // Partagé avec « Moi », la fiche artiste, Réglages… : curation LIVE (ADR-031).
    window.OrpheeLibrary = {
      ensure: ensureAll,
      items: () => allItems || [],
      // Ouvre la bibliothèque sur un bac (« Voir les N » de « Moi »), en haut.
      openCrate: (key) => {
        if (window.OrpheeNav) window.OrpheeNav.activate("library");
        if (searching) closeSearchNow();
        setMode("albums");
        const i = view.findIndex((c) => c.key === key);
        if (i < 0) return;
        delete memory[key];
        current = i;
        buildRail();
        buildPanels();
        requestAnimationFrame(relayout);
      },
      // Ouvre la bibliothèque sur une recherche.
      search: (q) => {
        if (window.OrpheeNav) window.OrpheeNav.activate("library");
        openSearch(q);
      },
    };

    // Réglages et « Mes paradoxes » (moi.js).
    window.orpheeOddity = {
      ready: () => !!allItems,
      current: () => ({ percentile: oddity.percentile, eligible: oddity.eligible.slice() }),
      totalCount: () => (allItems ? allItems.length : 0),
      list: () => (allItems || [])
          .filter((a) => isOddity(a, oddityThreshold, oddity.eligible))
          .sort(byListens),
      preview: (percentile, eligible) => {
        const t = thresholdForPercentile(percentile);
        let count = 0, gradeableCount = 0, gradedGradeable = 0;
        if (allItems && t > 0) {
          for (const a of allItems) {
            if (a.listen_count >= t) {
              gradeableCount++;
              if (a.grade !== null) gradedGradeable++;
            }
            if (isOddity(a, t, eligible)) count++;
          }
        }
        return { count, threshold: t, gradeableCount, gradedGradeable };
      },
    };

    firebase.auth().onAuthStateChanged(async (user) => {
      allItems = null;
      allLoading = null;
      for (const k of Object.keys(memory)) delete memory[k];
      if (searching) closeSearchNow();
      render();
      if (!user) return;
      // Invité en train d'entrer : on attend le rechargement (v2.24.2).
      if (window.OrpheeSession && !window.OrpheeSession.ready(user)) return;
      try {
        // Les agrégats d'abord (~120 Ko, « Moi » s'affiche avec eux) : sur la
        // même connexion Firestore, ils attendaient derrière les ~2 Mo de la
        // bibliothèque (v2.37.0, ADR-048).
        if (window.OrpheeStats) await window.OrpheeStats.ensureLoaded(false);
        await ensureAll();
        if (window.OrpheeArtists) await window.OrpheeArtists.ensure();
        render();
      } catch (err) {
        console.error("[library] auth load failed:", err.message);
      }
    });
  }

  init();
})();
