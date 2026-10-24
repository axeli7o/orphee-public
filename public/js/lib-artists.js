/* Orphée · Bibliothèque › Artistes (v2.40.0, PM-37).
   Pas une liste alphabétique : des récits vérifiables (piliers, découvertes,
   retrouvailles, fulgurances, perdus de vue — calculés à la synchro,
   cache/agg_artists), puis les artistes par genre (curation live, ADR-031).
   Même grammaire que « Moi » : titre, ligne, 3 visages, « Voir les N ».
   Chaque visage porte la courbe de ses années : sa forme dit le récit. */
(function () {
  "use strict";

  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);
  const open = {};      // blocs dépliés (clé → true)
  let genreSel = null;  // genre choisi dans « Par genre »

  const BLOCKS = [
    ["piliers", "Tes piliers", "Là presque chaque année, depuis le début.", "piliers"],
    ["decouvertes", "Découvertes", "Arrivés ces deux dernières années, déjà installés.", "découvertes"],
    ["retrouvailles", "Retrouvailles", "Beaucoup avant, un creux, et les revoilà.", "retrouvailles"],
    ["fulgurances", "Fulgurances", "Une année énorme, puis presque rien.", "fulgurances"],
    ["perdus", "Perdus de vue", "Beaucoup écoutés, plus depuis un moment.", "perdus de vue"],
  ];
  const GENRE_LABEL = { Classical: "Classique" };
  const GENRE_MAX = 9; // 3 × 3, sans dépliage

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const agg = () => {
    const d = window.OrpheeStats && window.OrpheeStats.data();
    return d && d.artistsAgg ? d.artistsAgg : null;
  };
  const items = () => (window.OrpheeLibrary ? window.OrpheeLibrary.items() : []);

  // Genre d'un artiste : celui qu'Axel lui a donné, sinon le genre le plus
  // écouté de ses albums (curation live).
  function genres() {
    const A = window.OrpheeArtists;
    const byArtist = new Map();
    for (const a of items()) {
      let e = byArtist.get(a.artist);
      if (!e) byArtist.set(a.artist, e = { n: 0, g: new Map() });
      e.n += a.listen_count || 0;
      if (a.genre) e.g.set(a.genre, (e.g.get(a.genre) || 0) + (a.listen_count || 0));
    }
    const out = new Map();
    for (const [artist, e] of byArtist) {
      const own = A && A.get(artist);
      const g = own && own.genre ? own.genre :
        Array.from(e.g.entries()).sort((x, y) => y[1] - x[1]).map((x) => x[0])[0] || "";
      out.set(artist, { g, n: e.n });
    }
    return out;
  }
  const color = (g) => (window.ORPHEE_GENRE_COLORS || {})[g] || "#88938d";
  const initials = (n) => {
    const w = String(n).replace(/&/g, " ").split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x[0] || ""));
    if (!w.length) return "?";
    return (w[0][0] + (w[1] ? w[1][0] : (w[0][1] || ""))).toUpperCase();
  };

  // Courbe des années actives (trou entre années non consécutives marqué).
  function spark(artist, w, h) {
    const s = agg() && agg().series[artist];
    const box = el("span", "la-spark");
    if (!s) return box;
    const years = agg().years;
    const m = Math.max(...s.y) || 1;
    const step = w / s.y.length;
    const c = color(curGenres.get(artist) ? curGenres.get(artist).g : "");
    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    s.y.forEach((v, i) => {
      const bh = Math.max(1.5, v / m * (h - 2));
      svg += `<rect x="${(i * step + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(2, step - 3).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${v ? c : "var(--surface-3)"}"/>`;
      if (i > 0 && years[i] - years[i - 1] > 1) svg += `<rect x="${(i * step - 1.2).toFixed(1)}" y="0" width="1" height="${h}" fill="var(--border-2)"/>`;
    });
    box.innerHTML = svg + "</svg>";
    return box;
  }

  function face(artist, size) {
    const d = window.OrpheeStats && window.OrpheeStats.data();
    const photo = d && d.artistImages ? d.artistImages[artist] : null;
    const g = curGenres.get(artist);
    const f = el("span", "la-face", initials(artist));
    f.style.setProperty("--g", color(g ? g.g : ""));
    if (size) f.style.setProperty("--s", size + "px");
    if (photo) {
      const img = el("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = photo;
      img.addEventListener("error", () => img.remove());
      f.appendChild(img);
    }
    return f;
  }

  function card(artist, why, kind) {
    const b = el("button", "la-card");
    b.type = "button";
    b.setAttribute("aria-label", `${artist} — ouvrir sa fiche`);
    b.appendChild(face(artist));
    b.appendChild(el("b", null, artist));
    // Découvertes : deux barres ne disent rien, leur présence suffit.
    if (kind !== "decouvertes") b.appendChild(spark(artist, 80, 24));
    b.appendChild(el("small", null, why));
    b.addEventListener("click", () => {
      if (window.OrpheeArtistSheet) window.OrpheeArtistSheet.open(artist);
    });
    return b;
  }

  // La ligne sous un visage : courte, la courbe dit le reste.
  function why(kind, artist) {
    const a = agg();
    const s = a && a.series[artist];
    if (!s) return `${fmt((curGenres.get(artist) || {}).n)} écoutes`;
    const yr = (i) => a.years[i];
    if (kind === "piliers") return `${s.y.filter((v) => v >= 10).length} ans sur ${s.y.length}`;
    if (kind === "decouvertes") return `depuis ${s.first}`;
    if (kind === "retrouvailles") return `de retour en ${yr(s.y.length - 2)}`;
    if (kind === "fulgurances") return `${yr(s.y.indexOf(Math.max(...s.y)))}, son année`;
    if (kind === "perdus") {
      let k = 0;
      s.y.forEach((v, i) => { if (v >= 0.1 * s.n) k = i; });
      return `jusqu’en ${yr(k)}`;
    }
    return `${fmt(s.n)} écoutes`;
  }

  function block(key, title, lede, all, kind, noun, extra) {
    // Un multiple de 3 (3, 6 ou 9) : des rangées pleines.
    const list = all.length > 3 ? all.slice(0, all.length - all.length % 3) : all;
    const sec = el("section", "la-blk");
    sec.appendChild(el("h2", "la-h", title));
    sec.appendChild(el("p", "la-lede", lede));
    if (extra) sec.appendChild(extra);
    const grid = el("div", "la-grid");
    for (const a of open[key] ? list : list.slice(0, 3)) grid.appendChild(card(a, why(kind, a), kind));
    sec.appendChild(grid);
    if (noun && list.length > 3) {
      // Même bouton que « Moi » (.moi-more) : le nombre en couleur, chevron.
      const more = el("button", "moi-more o-btn soft block" + (open[key] ? " open" : ""));
      more.type = "button";
      more.setAttribute("aria-expanded", open[key] ? "true" : "false");
      if (open[key]) more.appendChild(document.createTextNode("Replier"));
      else {
        more.appendChild(document.createTextNode("Voir les "));
        more.appendChild(el("b", null, fmt(list.length)));
        more.appendChild(document.createTextNode(` ${noun}`));
      }
      more.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>');
      more.addEventListener("click", () => { open[key] = !open[key]; render(host); });
      sec.appendChild(more);
    }
    return sec;
  }

  // « Ta musique » (v2.42.0) : l'artiste qu'Axel déclare être (Réglages ›
  // Compte), sorti des récits. Sa courbe, puis ses titres les plus écoutés —
  // chacun cherché sur YouTube Music, comme « À part » dans la fiche artiste.
  function mineBlock(mine) {
    const a = agg();
    const s = a.series[mine.artist];
    const sec = el("section", "la-blk la-mine");
    sec.appendChild(el("h2", "la-h", "La BO de ta campagne"));
    sec.appendChild(el("p", "la-lede", "Ce que tu as composé, tel que tu l’écoutes."));
    const head = el("button", "la-mine-head");
    head.type = "button";
    head.setAttribute("aria-label", `${mine.artist} — ouvrir sa fiche`);
    head.appendChild(face(mine.artist, 72));
    const txt = el("span", "la-mine-txt");
    txt.appendChild(el("b", null, mine.artist));
    if (s) {
      txt.appendChild(el("small", null, `${fmt(s.n)} écoutes · depuis ${s.first}`));
      txt.appendChild(spark(mine.artist, 150, 28));
    }
    head.appendChild(txt);
    head.addEventListener("click", () => window.OrpheeArtistSheet && window.OrpheeArtistSheet.open(mine.artist));
    sec.appendChild(head);
    if (mine.tracks && mine.tracks.length) {
      const list = el("div", "ar-apart la-mine-tracks");
      const android = /Android/i.test(navigator.userAgent);
      for (const t of mine.tracks) {
        const row = el("a", "ar-apart-row");
        const q = encodeURIComponent(`${mine.artist} ${t.t}`);
        row.href = android ? `/yt?q=${q}` : `https://music.youtube.com/search?q=${q}`;
        if (!android) { row.target = "_blank"; row.rel = "noopener noreferrer"; }
        row.appendChild(el("span", "ar-apart-t", t.t));
        row.appendChild(el("span", "ar-apart-m", `${fmt(t.n)} écoute${t.n > 1 ? "s" : ""}`));
        row.appendChild(el("span", "ar-apart-go", "↗"));
        list.appendChild(row);
      }
      sec.appendChild(list);
    }
    return sec;
  }

  // Par genre (curation live) : les 9 plus écoutés (3 × 3), toujours tous.
  function genreBlock() {
    const byG = new Map();
    const mine = agg() && agg().mine ? agg().mine.artist : null;
    for (const [artist, e] of curGenres) {
      if (!e.g || e.g === "Podcast" || artist === mine) continue;
      if (!byG.has(e.g)) byG.set(e.g, []);
      byG.get(e.g).push([artist, e.n]);
    }
    const gs = Array.from(byG.entries())
        .map(([g, l]) => [g, l.sort((x, y) => y[1] - x[1]).slice(0, GENRE_MAX).map((x) => x[0]),
          l.reduce((s, x) => s + x[1], 0)])
        .sort((x, y) => y[2] - x[2]).slice(0, 6);
    if (!gs.length) return null;
    if (!genreSel || !gs.some((x) => x[0] === genreSel)) genreSel = gs[0][0];
    const chips = el("div", "la-chips");
    for (const [g] of gs) {
      const c = el("button", "la-chip", GENRE_LABEL[g] || g);
      c.type = "button";
      c.style.setProperty("--g", color(g));
      c.setAttribute("aria-pressed", g === genreSel ? "true" : "false");
      c.addEventListener("click", () => { genreSel = g; render(host); });
      chips.appendChild(c);
    }
    open.genre = true;
    return block("genre", "Par genre", "Les plus écoutés de chaque genre.",
        gs.find((x) => x[0] === genreSel)[1], "genre", null, chips);
  }

  let host = null;
  let curGenres = new Map();

  function render(target) {
    host = target;
    if (!host) return;
    const y = host.scrollTop;
    host.innerHTML = "";
    curGenres = genres();
    const a = agg();
    const wrap = el("div", "la");
    const genre = genreBlock();
    if (!a) {
      wrap.appendChild(el("p", "la-lede la-empty", "Appuie sur « Actualiser » pour voir tes artistes racontés."));
      if (genre) wrap.appendChild(genre);
    } else {
      if (a.mine) wrap.appendChild(mineBlock(a.mine));
      for (const [k, t, l, n] of BLOCKS) {
        const list = (a.rows[k] || []).filter((x) => curGenres.has(x));
        if (list.length) wrap.appendChild(block(k, t, l, list, k, n));
        if (k === "piliers" && genre) wrap.appendChild(genre); // juste sous les piliers
      }
    }
    const all = el("button", "la-all");
    all.type = "button";
    all.innerHTML = `<span>Tous les artistes</span><span class="n">${fmt(a ? a.count : curGenres.size)} ›</span>`;
    all.addEventListener("click", () => window.OrpheeLibrary && window.OrpheeLibrary.search());
    wrap.appendChild(all);
    host.appendChild(wrap);
    host.scrollTop = y;
  }

  // Visages en ligne (artistes trouvés par la loupe).
  function strip(list) {
    curGenres = genres();
    const row = el("div", "la-strip");
    for (const a of list) {
      const b = el("button", "la-mini");
      b.type = "button";
      b.appendChild(face(a, 56));
      b.appendChild(el("span", null, a));
      b.addEventListener("click", () => window.OrpheeArtistSheet && window.OrpheeArtistSheet.open(a));
      row.appendChild(b);
    }
    return row;
  }

  window.OrpheeArtistsView = { render, strip };
  // Classification changée : le bloc « Par genre » suit.
  document.addEventListener("orphee:artist-classified", () => { if (host && !host.hidden) render(host); });
  document.addEventListener("orphee:stats-reloaded", () => { if (host && !host.hidden) render(host); });
})();
