/* Orphée · Genres dans le temps (v2.33.0, PM-19) — en tête de « Mes années ».
   Dérivé pur, tracé côté client depuis cache/agg_quarters (items[].styles :
   écoutes classées par « genre|sous-genre », items[].listens : toutes les
   écoutes du trimestre). Une colonne par trimestre, regroupées par année :
   - une bande de volume au-dessus (écoutes du trimestre) ;
   - la part des 3 genres les plus écoutés sur toute la période, le reste
     en « Autres » (gris) — les mêmes à chaque trimestre, avec la couleur du
     genre partout dans l'app ;
   - repliés dessous, les 3 sous-genres d'un genre choisi, en nuances de sa
     couleur.
   Un trimestre touché est mis en avant dans les deux graphiques (focus
   partagé) ; toucher ailleurs le retire. La légende dit la période entière,
   ou le trimestre en focus — jamais les deux. */
(function () {
  "use strict";

  const MIN_LISTENS = 150;   // trimestre trop maigre : omis
  const THIN_GENRE = 30;     // moins d'écoutes du genre : colonne pâle
  const TOP = 3;
  const W = 398, H = 150, BAND = 34, GAP = 2, YEAR_GAP = 8;

  // État gardé d'une reconstruction de « Moi » à l'autre.
  const st = { sel: null, open: false, genre: null };
  let redrawAll = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const nf = (v) => new Intl.NumberFormat("fr-FR").format(Math.round(v || 0));
  const pct = (v) => Math.round((v || 0) * 100) + " %";
  const color = (g) => (window.ORPHEE_GENRE_COLORS || {})[g] || "#88938d";

  // Nuances d'une couleur de genre pour ses sous-genres : foncée, elle-même,
  // claire (écarts vérifiés, daltonisme compris).
  function mix(hex, to, t) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const tints = (hex) => [mix(hex, 0, 0.3), hex, mix(hex, 255, 0.65)];

  // Rangées d'un graphique : parts des séries (et « Autres ») par trimestre.
  function rowsFor(quarters, keyOf, series) {
    return quarters.map((q) => {
      const counts = new Map();
      let n = 0;
      for (const [k, v] of Object.entries(q.styles || {})) {
        const key = keyOf(k);
        if (key === null) continue;
        n += v;
        counts.set(key, (counts.get(key) || 0) + v);
      }
      const parts = series.map((s) => (n ? (counts.get(s) || 0) / n : 0));
      const other = n ? 1 - parts.reduce((a, b) => a + b, 0) : 0;
      return { key: q.key, y: String(q.y), q: q.q, n, parts, other: Math.max(0, other) };
    });
  }
  // Les séries : les plus écoutées sur toute la période.
  function topOf(quarters, keyOf) {
    const tot = new Map();
    for (const q of quarters) {
      for (const [k, v] of Object.entries(q.styles || {})) {
        const key = keyOf(k);
        if (key !== null) tot.set(key, (tot.get(key) || 0) + v);
      }
    }
    return Array.from(tot.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k]) => k);
  }
  // Ce qui mène au début et à la fin de la période : le titre se calcule.
  function leaders(rows) {
    const ok = rows.filter((r) => !r.thin && r.n);
    if (!ok.length) return null;
    const lead = (r) => r.parts.indexOf(Math.max(...r.parts));
    const mode = (a) => {
      const c = new Array(TOP).fill(0);
      a.forEach((r) => { c[lead(r)] += 1; });
      return c.indexOf(Math.max(...c));
    };
    const span = Math.max(1, Math.min(12, Math.floor(ok.length / 3)));
    return [mode(ok.slice(0, span)), mode(ok.slice(-Math.max(1, Math.min(8, span))))];
  }

  function svgNS(tag, attrs) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  // Un graphique : bande de volume + colonnes à 100 % + légende dynamique.
  function chart(rows, series, colors, volumeOf) {
    const box = el("div", "gf-chart");
    const years = [...new Set(rows.map((r) => r.y))];
    const cw = (W - (years.length - 1) * YEAR_GAP - (rows.length - 1) * GAP) / rows.length;
    let x = 0;
    let prev = null;
    const cols = rows.map((r) => {
      if (prev && r.y !== prev) x += YEAR_GAP;
      const c = Object.assign({ x, gapBefore: prev && +r.y - +prev > 1 }, r);
      x += cw + GAP;
      prev = r.y;
      return c;
    });
    const maxV = Math.max(1, ...cols.map(volumeOf));

    const band = svgNS("svg", { viewBox: `0 0 ${W} ${BAND + 4}`, class: "gf-band", "aria-hidden": "true" });
    const main = svgNS("svg", { viewBox: `0 0 ${W} ${H + 24}`, class: "gf-cols", role: "img",
      "aria-label": "Part des " + series.join(", ") + " par trimestre" });
    cols.forEach((c, i) => {
      const dim = (st.sel !== null && st.sel !== c.key) || c.thin;
      const h = Math.max(2, (volumeOf(c) / maxV) * BAND);
      band.appendChild(svgNS("rect", { x: c.x.toFixed(1), y: (BAND - h).toFixed(1), width: cw.toFixed(1),
        height: h.toFixed(1), rx: 2, class: "gf-vol" + (st.sel === c.key ? " on" : "") }));
      let y0 = H;
      const segs = c.parts.map((p, j) => [p, colors[j]]).concat([[c.other, "var(--gf-other)"]]);
      segs.forEach(([p, col], j) => {
        const sh = p * H;
        if (sh <= 0) return;
        const yy = y0 - sh;
        main.appendChild(svgNS("rect", { x: c.x.toFixed(1), y: (yy + (j ? 1 : 0)).toFixed(1),
          width: cw.toFixed(1), height: Math.max(0, sh - (j ? 1 : 0)).toFixed(1),
          rx: j === segs.length - 1 ? 3 : 0, fill: col,
          opacity: dim ? (c.thin ? 0.18 : 0.35) : 1 }));
        y0 = yy;
      });
      if (c.gapBefore) {
        const gx = c.x - YEAR_GAP / 2 - GAP / 2;
        main.appendChild(svgNS("line", { x1: gx, x2: gx, y1: 6, y2: H - 6, class: "gf-break" }));
      }
      if (i === 0 || cols[i - 1].y !== c.y) {
        const t = svgNS("text", { x: c.x, y: H + 17, class: "gf-year" });
        t.textContent = "’" + c.y.slice(2);
        main.appendChild(t);
      }
      // Zone de toucher : la colonne entière, bande comprise.
      const hit = svgNS("rect", { x: (c.x - GAP / 2).toFixed(1), y: 0, width: (cw + GAP).toFixed(1),
        height: H, fill: "transparent", class: "gf-hit" });
      hit.dataset.q = c.key;
      hit.addEventListener("click", () => focus(st.sel === c.key ? null : c.key));
      main.appendChild(hit);
    });
    box.append(band, main);

    // Légende : la période entière, ou le trimestre en focus.
    const legend = el("div", "gf-legend");
    const c = st.sel !== null ? cols.find((x) => x.key === st.sel) : null;
    let parts;
    let other;
    let head;
    if (c) {
      parts = c.parts;
      other = c.other;
      head = `${c.y} · T${c.q} · ${nf(volumeOf(c))} écoutes`;
    } else {
      const ok = rows.filter((r) => r.n);
      const tot = ok.reduce((a, r) => a + r.n, 0) || 1;
      parts = series.map((_, j) => ok.reduce((a, r) => a + r.parts[j] * r.n, 0) / tot);
      other = ok.reduce((a, r) => a + r.other * r.n, 0) / tot;
      head = `${rows[0].y} – ${rows[rows.length - 1].y} · ${nf(rows.reduce((a, r) => a + volumeOf(r), 0))} écoutes`;
    }
    legend.appendChild(el("b", "gf-lh" + (c ? " on" : ""), head));
    series.forEach((s, j) => {
      const it = el("span", "gf-li");
      const dot = el("i");
      dot.style.background = colors[j];
      it.append(dot, document.createTextNode(s + " "), el("em", null, pct(parts[j])));
      legend.appendChild(it);
    });
    const ot = el("span", "gf-li");
    const od = el("i");
    od.style.background = "var(--gf-other)";
    ot.append(od, document.createTextNode("Autres "), el("em", null, pct(other)));
    legend.appendChild(ot);
    box.appendChild(legend);
    return box;
  }

  function title(cls, html) {
    const p = el("p", cls);
    p.innerHTML = html;
    return p;
  }
  // Élision devant une voyelle : « du rock au rap », « du rock à l’electro » (pas « hip-hop » : h aspiré).
  const vowel = (g) => /^[aeiouéèêàâîôû]/i.test(String(g));
  const from = (g) => (vowel(g) ? "De l’" : "Du ");
  const to = (g) => (vowel(g) ? "à l’" : "au ");
  const word = (txt, col) => `<span style="color:${col}">${txt.toLowerCase()}</span>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

  function focus(key) {
    st.sel = key;
    if (redrawAll) redrawAll();
  }
  // Toucher ailleurs retire le focus (hors colonnes, pastilles, bouton).
  document.addEventListener("click", (e) => {
    if (st.sel === null || !redrawAll) return;
    if (e.target.closest && e.target.closest(".gf-hit, .gf-chip, .gf-more")) return;
    focus(null);
  });

  function build(quarters) {
    const qs = (quarters || []).filter((q) => (q.listens || 0) >= MIN_LISTENS && q.styles);
    if (qs.length < 4) return null;
    const genreOf = (k) => k.split("|")[0] || null;
    const genres = topOf(qs, genreOf);
    if (!genres.length) return null;
    if (!st.genre || !genres.includes(st.genre)) st.genre = genres[0];
    if (st.sel && !qs.some((q) => q.key === st.sel)) st.sel = null;
    const vol = new Map(qs.map((q) => [q.key, q.listens || 0]));

    const root = el("div", "gf");
    function draw() {
      root.innerHTML = "";
      // 1. Genres.
      const rows = rowsFor(qs, genreOf, genres);
      const cols = genres.map(color);
      const ld = leaders(rows);
      if (ld) {
        const [a, b] = ld;
        root.appendChild(title("moi-title gf-title", a === b ?
          `Toujours ${word(esc(genres[a]), cols[a])}.` :
          `${from(genres[a])}${word(esc(genres[a]), cols[a])} ${to(genres[b])}${word(esc(genres[b]), cols[b])}.`));
      }
      root.appendChild(chart(rows, genres, cols, (r) => vol.get(r.key) || 0));

      // 2. Sous-genres, repliés.
      const more = el("button", "gf-more o-btn soft block", st.open ? "Replier les sous-genres" : "Voir les sous-genres");
      more.type = "button";
      more.setAttribute("aria-expanded", st.open ? "true" : "false");
      more.insertAdjacentHTML("beforeend", st.open ?
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>' :
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>');
      more.addEventListener("click", () => { st.open = !st.open; draw(); });
      root.appendChild(more);
      if (!st.open) return;
      const chips = el("div", "gf-chips");
      genres.forEach((g) => {
        const b = el("button", "gf-chip o-chip" + (g === st.genre ? " on" : ""), g);
        b.type = "button";
        b.style.setProperty("--c", color(g));
        b.addEventListener("click", () => { st.genre = g; draw(); });
        chips.appendChild(b);
      });
      root.appendChild(chips);
      const g = st.genre;
      const inG = (k) => (k.split("|")[0] === g ? (k.split("|")[1] || g) : null);
      const subs = topOf(qs, inG);
      const sRows = rowsFor(qs, inG, subs).map((r) => Object.assign(r, { thin: r.n < THIN_GENRE }));
      const sCols = tints(color(g)).slice(0, subs.length);
      const sl = leaders(sRows);
      if (sl && subs.length) {
        const [a, b] = sl;
        const c = color(g);
        root.appendChild(title("gf-sub-title", `${esc(g)} : ` + (a === b ?
          `surtout ${word(esc(subs[a]), c)}.` :
          `d’abord ${word(esc(subs[a]), c)}, puis ${word(esc(subs[b]), c)}.`)));
      }
      if (subs.length) root.appendChild(chart(sRows, subs, sCols, (r) => r.n));
    }
    redrawAll = draw;
    draw();
    return root;
  }

  window.OrpheeGenreFlow = { build };
})();
