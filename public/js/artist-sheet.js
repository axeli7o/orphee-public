/* Orphée — Fiche artiste (PM-26).
   Par-dessus l'écran courant, comme la fiche album, et en COUCHE d'historique
   (« retour » la ferme, nav.js). Ouverte depuis « Moi » (avatars, carte
   « Classer un artiste ») et depuis la fiche album (nom de l'artiste).
   Contenu, tout réel (ADR-028) : image (Deezer, cache/agg_artist_images, sinon
   initiales), écoutes cumulées, genre de l'artiste (modifiable — E8), ses
   albums (une pochette ouvre la fiche album), et les trimestres où il a
   compté.
   Sur téléphone, une carte comme la fiche album (v2.23.5) : 90 % de
   l'écran, poignée ; tirer l'en-tête vers le bas la ferme, la pousser vers
   le haut ou faire défiler le contenu la passe en plein écran. */
(function () {
  "use strict";

  const QUARTER_MONTHS = ["janv.–mars", "avr.–juin", "juil.–sept.", "oct.–déc."];
  let scrim = null;
  let sheet = null;   // coque : glisse (transform), arrondie, ne défile pas
  let scroller = null; // contenu : défile, jamais transformé (cf. detail.js)
  let current = null;
  let layered = false;
  // Fiches ouvertes depuis « Souvent avec » (v2.41.0) : le retour remonte
  // d'artiste en artiste, fermer la fiche les ferme toutes.
  let hops = [];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

  function initials(name) {
    const w = String(name || "").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return w.length === 1 ? w[0].slice(0, 2).toUpperCase() : (w[0][0] + w[w.length - 1][0]).toUpperCase();
  }

  function build() {
    scrim = el("div", "ar-scrim");
    scrim.addEventListener("click", close);
    sheet = el("div", "ar-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    // Comme la fiche album : la coque glisse, le contenu défile à l'intérieur.
    // Animer un conteneur arrondi qui défile force le navigateur à le
    // redessiner à chaque image (le clignotement) ; séparés, plus rien.
    scroller = el("div", "ar-scroll");
    sheet.appendChild(scroller);
    // Geste (v2.31.3) : la carte se tire vers le bas depuis n'importe où
    // tant que le contenu est tout en haut (et depuis la barre à tout
    // moment) ; un geste vers le haut fait défiler, comme d'habitude.
    scroller.addEventListener("touchstart", onDragStart, { passive: true });
    scroller.addEventListener("touchmove", onDragMove, { passive: false });
    scroller.addEventListener("touchend", onDragEnd, { passive: true });
    scroller.addEventListener("touchcancel", onDragEnd, { passive: true });
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    // Comme la fiche album (v2.31.3) : seul le geste agrandit la carte, pas
    // le défilement — un défilement fantôme au retour dans l'app la faisait
    // sauter en plein écran.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && current) close();
    });
    // Un album ouvert par-dessus (v2.32.2) : la fiche se cache dessous —
    // Safari iOS peignait des morceaux de la fiche artiste à travers celle
    // de l'album. Elle revient dès que l'album commence à partir.
    document.addEventListener("orphee:open-album", () => {
      if (current) sheet.classList.add("under");
    });
    document.addEventListener("orphee:album-leaving", () => sheet.classList.remove("under"));
    // Un genre posé ailleurs (carte « Classer ») : la fiche se met à jour.
    // Un genre posé (ici ou ailleurs) : seul le fond change de couleur,
    // le sélecteur garde son animation.
    document.addEventListener("orphee:artist-classified", () => {
      if (!current) return;
      const bg = scroller.querySelector(".ar-herobg");
      const items = (window.OrpheeLibrary ? window.OrpheeLibrary.items() : [])
          .filter((a) => a.artist === current)
          .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0));
      if (bg) bg.style.background = heroTint(current, items);
    });
    document.addEventListener("orphee:album-graded", () => { if (current) setTimeout(rerender, 0); });
  }

  // Genre de l'artiste (E8) : le même sélecteur que la fiche album
  // (v2.31.0) — un bouton résumé, des tuiles à la couleur du genre, puis
  // les sous-genres en pastilles ; repli après un choix complet. Pas
  // d'effacement : retoucher le genre choisi replie simplement.
  function genreEditor(artist) {
    const A = window.OrpheeArtists;
    const GENRES = window.ORPHEE_GENRES || [];
    const COLORS = window.ORPHEE_GENRE_COLORS || {};
    const J = window.OrpheeJuice || { buzz() {}, burst() {} };
    const guest = !!(window.OrpheeSession && window.OrpheeSession.isGuest());
    const cur = Object.assign({ genre: "", sousgenre: "" }, (A && A.get(artist)) || {});
    let open = false;
    let closeT = null;
    const color = (g) => COLORS[g] || "#3fc58e";
    const name = (g, sg) => (sg && sg !== g ? `${g} · ${sg.toLowerCase()}` : g);
    const wrap = el("div", "ar-genre");
    const sum = el("button", "dt-gsum");
    sum.type = "button";
    const panel = el("div", "dt-gpanel");
    const tiles = el("div", "dt-gts");
    const subs = el("div", "dt-sgs");
    panel.appendChild(tiles);
    panel.appendChild(subs);
    wrap.appendChild(sum);
    wrap.appendChild(panel);

    function pop(btn, n) {
      btn.classList.remove("boom");
      void btn.offsetWidth;
      btn.classList.add("boom");
      const r = btn.getBoundingClientRect();
      if (J.burst) J.burst(r.left + r.width / 2, r.top + r.height / 2, n, [btn.style.getPropertyValue("--c"), "#e8eae9"]);
    }
    async function save() {
      if (guest || !cur.genre) return;
      try {
        await A.set(artist, cur.genre, cur.sousgenre);
        if (window.OrpheeToast) window.OrpheeToast(`Genre enregistré · ${name(cur.genre, cur.sousgenre)}`, "ok", 1600);
      } catch (err) {
        console.error("[artist] genre non enregistré :", err.message);
        if (window.OrpheeToast) window.OrpheeToast("Non enregistré — réessaie.", "error", 4500);
      }
    }
    function setOpen(v) {
      clearTimeout(closeT);
      open = v;
      panel.hidden = !open;
      paint(true);
    }
    function closeSoon() {
      clearTimeout(closeT);
      closeT = setTimeout(() => { if (open) setOpen(false); }, 900);
    }
    function paint(cascade) {
      sum.innerHTML = "";
      sum.classList.toggle("set", !!cur.genre);
      sum.classList.toggle("open", open);
      sum.style.setProperty("--c", cur.genre ? color(cur.genre) : "var(--border-2)");
      sum.appendChild(el("span", "dt-gsum-dot"));
      const txt = el("span", "dt-gsum-txt");
      txt.appendChild(el("b", null, cur.genre ? name(cur.genre, cur.sousgenre) : (guest ? "Sans genre" : "Choisir un genre")));
      sum.appendChild(txt);
      if (!guest) {
        sum.insertAdjacentHTML("beforeend",
            '<svg class="dt-gsum-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>');
      }
      tiles.innerHTML = "";
      GENRES.forEach((g, k) => {
        const b = el("button", "dt-gt" + (g.genre === cur.genre ? " on" : ""), g.genre);
        b.type = "button";
        b.style.setProperty("--c", color(g.genre));
        if (cascade) { b.classList.add("in"); b.style.animationDelay = (k * 25) + "ms"; }
        b.addEventListener("click", () => {
          J.buzz();
          if (cur.genre === g.genre) { setOpen(false); return; }
          cur.genre = g.genre;
          cur.sousgenre = g.sousgenres && g.sousgenres.length === 1 ? g.sousgenres[0] : "";
          paint(false);
          const nb = Array.from(tiles.children).find((x) => x.textContent === g.genre);
          if (nb) pop(nb, cur.sousgenre ? 22 : 12);
          if (cur.sousgenre) { save(); closeSoon(); }
        });
        tiles.appendChild(b);
      });
      subs.innerHTML = "";
      const entry = GENRES.find((g) => g.genre === cur.genre);
      const list = (entry && entry.sousgenres) || [];
      subs.hidden = list.length < 2;
      if (list.length < 2) return;
      list.forEach((sg) => {
        const c = el("button", "dt-sg o-chip" + (sg === cur.sousgenre ? " on" : ""), sg);
        c.type = "button";
        c.style.setProperty("--c", color(cur.genre));
        c.addEventListener("click", () => {
          J.buzz();
          cur.sousgenre = sg;
          paint(false);
          const nb = Array.from(subs.children).find((x) => x.textContent === sg);
          if (nb) pop(nb, 22);
          save();
          closeSoon();
        });
        subs.appendChild(c);
      });
    }
    sum.addEventListener("click", () => { if (!guest) { J.buzz(); setOpen(!open); } });
    panel.hidden = true;
    paint(false);
    return wrap;
  }

  // Fond de l'en-tête (v2.31.3), comme la fiche album : la couleur du
  // genre de l'artiste, sinon la palette de son album le plus écouté.
  function heroTint(artist, items) {
    const A = window.OrpheeArtists;
    const g = A && A.get(artist) && A.get(artist).genre;
    const COLORS = window.ORPHEE_GENRE_COLORS || {};
    if (g && COLORS[g]) return `linear-gradient(150deg, ${COLORS[g]}, var(--bg) 85%)`;
    const pal = items[0] && window.coverPalette ? window.coverPalette(items[0]) : null;
    return pal ? `linear-gradient(150deg, ${pal.c1}, ${pal.c2})` : "none";
  }

  // Re-rendu sur événement : même contenu, même position de lecture.
  function rerender() {
    const y = scroller.scrollTop;
    render(true);
    scroller.scrollTop = y;
  }

  // covers=false (pendant la montée) : chaque pochette n'est que sa couleur,
  // les images viennent une fois la carte posée (paintCovers), sans rien
  // reconstruire — plus de cases noires, plus de saut.
  const NATURE = { single: "Single", remix: "Remix", live: "Live", bo: "BO", hors: "Hors album" };

  function render(covers) {
    if (covers === undefined) covers = true;
    const artist = current;
    const items = (window.OrpheeLibrary ? window.OrpheeLibrary.items() : [])
        .filter((a) => a.artist === artist)
        .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0));
    const data = window.OrpheeStats && window.OrpheeStats.data();
    const img = data && data.artistImages ? data.artistImages[artist] : null;
    const listens = items.reduce((s, a) => s + (a.listen_count || 0), 0);
    const since = items.map((a) => a.first_listen_y).filter(Boolean);

    scroller.innerHTML = "";
    sheet.setAttribute("aria-label", `Artiste ${artist}`);
    const top = el("div", "ar-top");
    const backBtn = el("button", "dt-iconbtn", "←");
    backBtn.type = "button";
    backBtn.setAttribute("aria-label", "Retour");
    backBtn.addEventListener("click", close);
    const handle = el("div", "ar-handle");
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Fermer");
    handle.addEventListener("click", close);
    top.appendChild(backBtn);
    top.appendChild(handle);
    top.appendChild(el("span", "ar-top-pad"));
    scroller.appendChild(top);

    const bg = el("div", "ar-herobg");
    bg.style.background = heroTint(artist, items);
    scroller.appendChild(bg);
    const hero = el("div", "ar-hero");
    const pic = el("div", "ar-pic");
    if (img) {
      const im = el("img");
      im.alt = "";
      im.src = img;
      im.addEventListener("error", () => { pic.innerHTML = ""; pic.textContent = initials(artist); });
      pic.appendChild(im);
    } else {
      pic.textContent = initials(artist);
    }
    hero.appendChild(pic);
    hero.appendChild(el("h2", "ar-name", artist));
    // Singles, faces B, remix, lives (v2.36.0, nature dérivée au refresh) :
    // sous les vrais albums, nommés pour ce qu'ils sont.
    const albums = items.filter((a) => !a.nature);
    const apart = items.filter((a) => a.nature);
    const meta = [`${fmt(listens)} écoutes`, `${albums.length} album${albums.length > 1 ? "s" : ""}`];
    if (since.length) meta.push(`depuis ${Math.min(...since)}`);
    hero.appendChild(el("p", "ar-meta", meta.join(" · ")));
    // Sa courbe (v2.41.0, PM-26) : écoutes par année active (agg_artists).
    const A = data && data.artistsAgg;
    const series = A && A.series ? A.series[artist] : null;
    if (series) hero.appendChild(curve(series, A.years));
    scroller.appendChild(hero);

    const body = el("div", "ar-body");
    body.appendChild(el("p", "ar-label", "Son genre"));
    body.appendChild(genreEditor(artist));

    scroller.appendChild(body);
    const GR = window.ORPHEE_GRADES || {};
    const section = (label, list) => {
      if (!list.length) return;
      body.appendChild(el("p", "ar-label", label));
      const grid = el("div", "ar-albums");
      for (const a of list) grid.appendChild(albumCell(a));
      body.appendChild(grid);
    };
    const albumCell = (a) => {
      const cell = el("button", "ar-album");
      cell.type = "button";
      cell.setAttribute("aria-label", `${a.album} — ouvrir la fiche`);
      cell.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("orphee:open-album", { detail: { album_sur: a.album_sur } }));
      });
      const cov = el("div", "ar-cover");
      cov._album = a;
      if (covers && typeof window.renderCover === "function") window.renderCover(cov, a);
      else if (window.coverPalette) {
        const pal = window.coverPalette(a);
        cov.style.background = `linear-gradient(135deg, ${pal.c1}, ${pal.c2})`;
      }
      cell.appendChild(cov);
      cell.appendChild(el("span", "ar-album-title", a.album));
      cell.appendChild(el("span", "ar-album-meta",
          `${fmt(a.listen_count)} écoute${a.listen_count > 1 ? "s" : ""}${a.grade != null ? " · " + (GR[a.grade] || a.grade) : ""}`));
      return cell;
    };
    section("Ses albums", albums);
    // À part (v2.36.0) : pas des albums, donc pas de pochettes — une liste,
    // chaque ligne cherche le titre sur YouTube Music (même lien que la fiche
    // album : sur Android, la redirection /yt ouvre l'appli).
    if (apart.length) {
      body.appendChild(el("p", "ar-label", "À part"));
      const list = el("div", "ar-apart");
      const android = /Android/i.test(navigator.userAgent);
      for (const a of apart) {
        const row = el("a", "ar-apart-row");
        const q = encodeURIComponent(`${a.artist} ${a.album}`);
        row.href = android ? `/yt?q=${q}` : `https://music.youtube.com/search?q=${q}`;
        if (!android) { row.target = "_blank"; row.rel = "noopener noreferrer"; }
        row.appendChild(el("span", "ar-apart-t", a.album));
        row.appendChild(el("span", "ar-apart-m",
            `${NATURE[a.nature]} · ${fmt(a.listen_count)} écoute${a.listen_count > 1 ? "s" : ""}`));
        row.appendChild(el("span", "ar-apart-go", "↗"));
        list.appendChild(row);
      }
      body.appendChild(list);
    }

    // Souvent avec (v2.41.0, PM-26) : les artistes enchaînés dans une même
    // séance (agg_artists.with, ≥ 10 séances) ; toucher → sa fiche.
    const withs = A && A.with ? A.with[artist] || [] : [];
    if (withs.length) {
      body.appendChild(el("p", "ar-label", "Souvent avec"));
      body.appendChild(el("p", "ar-sub", `Les artistes que tu enchaînes avec ${artist}, dans une même séance.`));
      const list = el("div", "ar-with");
      const max = withs[0].n || 1;
      for (const w of withs) {
        const row = el("button", "ar-with-row");
        row.type = "button";
        row.setAttribute("aria-label", `${w.a} — ouvrir sa fiche`);
        row.appendChild(miniFace(w.a, data));
        const tx = el("span", "ar-with-t");
        tx.appendChild(el("b", null, w.a));
        tx.appendChild(el("small", null, `${fmt(w.n)} séances ensemble`));
        row.appendChild(tx);
        const bar = el("span", "ar-with-bar");
        const fill = el("i");
        fill.style.width = Math.round(w.n / max * 100) + "%";
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el("span", "ar-with-go", "›"));
        row.addEventListener("click", () => hop(w.a));
        list.appendChild(row);
      }
      body.appendChild(list);
      // « Tes mondes » (v2.48.0, PM-40) : l'archipel des groupes d'artistes
      // enchaînés, ouvert centré sur le monde de cet artiste. Seulement si
      // l'artiste appartient à un monde.
      const C = window.OrpheeWorldmap;
      if (C && C.has(artist)) {
        const explore = el("button", "ar-explore", "✦ Explorer tes mondes");
        explore.type = "button";
        explore.addEventListener("click", () => C.open(artist));
        body.appendChild(explore);
      }
    }

    // Trimestres où l'un de ses albums était dans le top 4 (agg_quarters).
    const qs = ((data && data.quarters) || []).filter((q) =>
      (q.albums || []).some((x) => x.artist === artist));
    if (qs.length) {
      body.appendChild(el("p", "ar-label", "Dans tes trimestres"));
      const list = el("div", "ar-quarters");
      for (const q of qs.slice(-12).reverse()) {
        list.appendChild(el("span", "moi-q-fact",
            `${q.y} · T${q.q} (${QUARTER_MONTHS[q.q - 1]})${q.mood_label ? " · " + q.mood_label : ""}`));
      }
      body.appendChild(list);
    }
  }

  function paintCovers() {
    if (typeof window.renderCover !== "function") return;
    for (const cov of scroller.querySelectorAll(".ar-cover")) {
      if (cov._album) window.renderCover(cov, cov._album);
    }
  }

  // ---- Carte : glisser pour fermer, pousser pour agrandir -------------------
  const DRAG_CLOSE_PX = 110;
  const EXPAND_PX = 40;
  let drag = null;
  let settleT = null;
  function setExpanded(on) {
    if (sheet) sheet.classList.toggle("expanded", on);
  }
  function onDragStart(e) {
    if (!current || e.touches.length !== 1) return;
    // Contenu tout en haut : n'importe où ; sinon, la barre seulement.
    const onBar = !!(e.target.closest && e.target.closest(".ar-top"));
    if (scroller.scrollTop > 0 && !onBar) return;
    drag = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, dy: 0, raf: 0, armed: false,
      head: !!(e.target.closest && e.target.closest(".ar-top, .ar-hero")) };
  }
  function paintDrag() {
    if (!drag) return;
    drag.raf = 0;
    const dy = Math.max(0, drag.dy);
    sheet.style.transform = dy ? `translateY(${dy}px)` : "";
    scrim.style.opacity = String(Math.max(0, 1 - dy / 600));
  }
  function onDragMove(e) {
    if (!drag) return;
    drag.dy = e.touches[0].clientY - drag.y0;
    if (!drag.armed) {
      // Pris au premier vrai mouvement, comme la fiche album : vers le bas →
      // la carte suit ; vers le haut sur l'en-tête → agrandir ; vers le haut
      // ailleurs, ou à l'horizontale → on laisse défiler.
      const dx = e.touches[0].clientX - drag.x0;
      if (Math.abs(drag.dy) < 6 && Math.abs(dx) < 6) return;
      if (Math.abs(dx) > Math.abs(drag.dy) || (drag.dy < 0 && !drag.head)) { drag = null; return; }
      drag.armed = true;
      sheet.classList.add("animating");
      sheet.style.transition = "none";
    }
    // Vers le bas : la carte suit le doigt, le contenu ne défile pas.
    if (drag.dy > 0) e.preventDefault();
    if (!drag.raf) drag.raf = requestAnimationFrame(paintDrag);
  }
  function onDragEnd() {
    if (!drag) return;
    if (!drag.armed) { drag = null; return; }
    const dy = drag.dy;
    if (drag.raf) cancelAnimationFrame(drag.raf);
    drag = null;
    sheet.style.transition = "";
    scrim.style.opacity = "";
    if (dy > DRAG_CLOSE_PX) {
      sheet.style.transform = "translateY(100%)";
      scrim.classList.remove("open");
      setTimeout(close, 280);
      return;
    }
    sheet.style.transform = "";
    if (dy < -EXPAND_PX) setExpanded(true);
    setTimeout(() => { if (!drag) sheet.classList.remove("animating"); }, 320);
  }

  function open(artist) {
    if (!artist) return;
    if (!sheet) build();
    const already = !!current && sheet.classList.contains("open");
    current = artist;
    render(already);
    scroller.scrollTop = 0;
    sheet.style.transform = "";
    sheet.style.transition = "";
    sheet.classList.remove("parked");
    document.body.classList.add("ar-open");
    clearTimeout(settleT);
    if (!already) {
      // Montée : posée après une image (sinon, à la toute première ouverture,
      // la carte apparaît d'un coup), puis les pochettes une fois arrêtée.
      sheet.classList.remove("expanded");
      sheet.classList.add("animating");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scrim.classList.add("open");
        sheet.classList.add("open");
      }));
      settleT = setTimeout(() => {
        sheet.classList.remove("animating");
        if (current === artist) paintCovers();
      }, 320);
    }
    if (window.OrpheeNav && !layered) {
      layered = true;
      window.OrpheeNav.openLayer("artist", hide);
    }
  }

  // Ouvre un autre artiste dans la même fiche ; le retour ramène au précédent.
  function hop(artist) {
    if (!current || artist === current) return;
    hops.push(current);
    current = artist;
    render(true);
    scroller.scrollTop = 0;
    if (window.OrpheeNav) {
      window.OrpheeNav.openLayer("artist-hop", () => {
        if (!hops.length) return;
        current = hops.pop();
        render(true);
        scroller.scrollTop = 0;
      });
    }
  }

  // Courbe des années actives ; un trait marque un trou entre deux années.
  function curve(s, years) {
    const box = el("div", "ar-curve");
    const m = Math.max(...s.y) || 1;
    const n = s.y.length;
    const w = 320;
    const h = 64;
    const step = w / n;
    let svg = `<svg viewBox="0 0 ${w} ${h + 16}" role="img" aria-label="Écoutes par année">`;
    s.y.forEach((v, i) => {
      const bh = Math.max(2, v / m * h);
      svg += `<rect x="${(i * step + 2).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(step - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" class="${v ? "on" : ""}"><title>${years[i]} : ${v} écoutes</title></rect>`;
      if (n <= 12 || i % 2 === 0) svg += `<text x="${(i * step + step / 2).toFixed(1)}" y="${h + 13}" text-anchor="middle">’${String(years[i]).slice(2)}</text>`;
    });
    box.innerHTML = svg + "</svg>";
    return box;
  }

  function miniFace(artist, data) {
    const f = el("span", "ar-with-face", initials(artist));
    const img = data && data.artistImages ? data.artistImages[artist] : null;
    if (img) {
      const i = el("img");
      i.alt = "";
      i.loading = "lazy";
      i.src = img;
      i.addEventListener("error", () => i.remove());
      f.appendChild(i);
    }
    return f;
  }

  function hide() {
    layered = false;
    hops = [];
    current = null;
    if (!sheet) return;
    clearTimeout(settleT);
    scrim.classList.remove("open");
    sheet.classList.remove("open", "expanded", "animating");
    sheet.style.transform = "";
    sheet.style.transition = "";
    scrim.style.opacity = "";
    document.body.classList.remove("ar-open");
    // Une fois descendue : hors de l'écran ET hors du focus clavier.
    setTimeout(() => { if (!current) sheet.classList.add("parked"); }, 320);
  }

  // Fermeture voulue par l'interface : passe par l'historique.
  function close() {
    if (layered && window.OrpheeNav) {
      // Fiches enchaînées : un seul retour arrière pour toutes.
      if (hops.length) history.go(-(hops.length + 1));
      else window.OrpheeNav.closeLayer("artist");
    } else hide();
  }

  window.OrpheeArtistSheet = { open, close };
})();
