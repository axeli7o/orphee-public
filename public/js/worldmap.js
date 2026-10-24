/* Orphée — « Tes mondes » (PM-40, ADR-052).
   Archipel des groupes d'artistes qu'Axel enchaîne ensemble (clusters de
   co-écoute, Louvain côté serveur : cache/agg_clusters). Ouvert depuis la
   fiche artiste (bouton « Explorer »), centré sur le monde de cet artiste ;
   on dézoome pour voir toute la forêt. Chaque monde une île (taille =
   écoutes), la DISTANCE entre îles = combien on bascule de l'une à l'autre
   (le poids des ponts rapproche, pas de traits). Pince pour zoomer : les noms
   d'artistes apparaissent. Couleur = genre, lu live depuis la curation
   (ADR-031) — jamais figé dans l'agrégat. Tout réel (ADR-028). */
(function () {
  "use strict";

  let host = null;
  let vp = null;
  let world = null;    // calque îles + ponts (transformé par scale)
  let members = null;  // calque membres (échelle écran, net au zoom)
  let memList = [];    // [{node, wx, wy, wr, foc}] en coordonnées monde
  let ov = null;
  let sheet = null;
  let CUR = null;      // {clusters, bridges, pos}
  let layered = false;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);

  function initials(name) {
    const w = String(name || "").replace(/[^\p{L}\p{N} ]/gu, " ")
        .split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return w.length === 1 ? w[0].slice(0, 2).toUpperCase() :
      (w[0][0] + w[w.length - 1][0]).toUpperCase();
  }
  const DEFAULT_COL = "#5a625d";
  function genreOf(name) {
    const A = window.OrpheeArtists;
    const g = A && A.get(name);
    return (g && g.genre) || null;
  }
  function colorOf(name) {
    const C = window.ORPHEE_GENRE_COLORS || {};
    return C[genreOf(name)] || DEFAULT_COL;
  }
  const hexA = (h, a) => {
    if (!/^#[0-9a-f]{6}$/i.test(h)) return h;
    const n = parseInt(h.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," +
      (n & 255) + "," + a + ")";
  };

  function clusters() {
    const d = (window.OrpheeStats && window.OrpheeStats.data()) || {};
    return d.clusters || null;
  }
  // Photo Deezer de l'artiste (agg_artist_images), sinon null → initiales.
  function imgOf(name) {
    const d = (window.OrpheeStats && window.OrpheeStats.data()) || {};
    return (d.artistImages && d.artistImages[name]) || null;
  }
  // Monde (cluster) auquel appartient un artiste, ou -1.
  function clusterOf(name) {
    const c = clusters();
    if (!c || !c.clusters) return -1;
    return c.clusters.findIndex((w) =>
      w.members.some((m) => m.a === name));
  }
  function has(name) {
    return clusterOf(name) >= 0;
  }
  // Genre dominant d'un monde : par volume, sur la curation live (ADR-031).
  function domGenre(w) {
    const gs = {};
    for (const m of w.members) {
      const g = genreOf(m.a);
      if (g) gs[g] = (gs[g] || 0) + m.n;
    }
    const e = Object.entries(gs).sort((a, b) => b[1] - a[1])[0];
    return e ? e[0] : null;
  }

  // ---- disposition des îles : le poids du pont rapproche (distance = lien).
  function layout(cs, bridges, W, H) {
    const K = cs.length;
    if (!K) return [];
    const maxP = Math.max(...cs.map((c) => c.plays));
    const R = cs.map((c) => 44 + Math.sqrt(c.plays / maxP) * 62);
    const genres = cs.map(domGenre);
    const maxB = Math.max(1, ...Object.values(bridges || {}));
    const br = [];
    for (const key in bridges) {
      if (!Object.prototype.hasOwnProperty.call(bridges, key)) continue;
      const [a, b] = key.split("-").map(Number);
      br.push([a, b, bridges[key] / maxB]);
    }
    const p = cs.map((_, i) => ({
      x: W / 2 + Math.cos(i / K * 6.283) * W * 0.26,
      y: H / 2 + Math.sin(i / K * 6.283) * H * 0.26,
    }));
    for (let it = 0; it < 560; it++) {
      const F = cs.map(() => ({x: 0, y: 0}));
      for (let i = 0; i < K; i++) {
        F[i].x += (W / 2 - p[i].x) * 0.006;
        F[i].y += (H / 2 - p[i].y) * 0.006;
        for (let j = 0; j < K; j++) {
          if (i === j) continue;
          let dx = p[i].x - p[j].x;
          let dy = p[i].y - p[j].y;
          const d = Math.hypot(dx, dy) || 1;
          const minD = R[i] + R[j] + 40;
          F[i].x += dx / d * (minD * minD) / (d * d) * 1.1;
          F[i].y += dy / d * (minD * minD) / (d * d) * 1.1;
          if (d < minD) {
            F[i].x += dx / d * (minD - d) * 0.8;
            F[i].y += dy / d * (minD - d) * 0.8;
          }
        }
      }
      // regroupement par genre : chaque île tirée vers le centre de son genre
      const gc = {};
      for (let i = 0; i < K; i++) {
        const g = genres[i];
        if (!g) continue;
        (gc[g] || (gc[g] = {x: 0, y: 0, n: 0}));
        gc[g].x += p[i].x; gc[g].y += p[i].y; gc[g].n++;
      }
      for (let i = 0; i < K; i++) {
        const g = genres[i];
        if (!g || gc[g].n < 2) continue;
        F[i].x += (gc[g].x / gc[g].n - p[i].x) * 0.012;
        F[i].y += (gc[g].y / gc[g].n - p[i].y) * 0.012;
      }
      for (const [a, b, w] of br) {
        let dx = p[b].x - p[a].x;
        let dy = p[b].y - p[a].y;
        const d = Math.hypot(dx, dy) || 1;
        const rest = R[a] + R[b] + 18;
        if (d <= rest) continue;
        const f = (d - rest) * (0.006 + 0.03 * w);
        dx /= d;
        dy /= d;
        F[a].x += dx * f;
        F[a].y += dy * f;
        F[b].x -= dx * f;
        F[b].y -= dy * f;
      }
      for (let i = 0; i < K; i++) {
        p[i].x += F[i].x;
        p[i].y += F[i].y;
      }
    }
    // anti-chevauchement dur
    for (let it = 0; it < 60; it++) {
      let hit = 0;
      for (let i = 0; i < K; i++) {
        for (let j = i + 1; j < K; j++) {
          let dx = p[j].x - p[i].x;
          let dy = p[j].y - p[i].y;
          const d = Math.hypot(dx, dy) || 1;
          const minD = R[i] + R[j] + 40;
          if (d < minD) {
            const push = (minD - d) / 2;
            dx /= d;
            dy /= d;
            p[i].x -= dx * push;
            p[i].y -= dy * push;
            p[j].x += dx * push;
            p[j].y += dy * push;
            hit = 1;
          }
        }
      }
      if (!hit) break;
    }
    // fit (échelle uniforme : positions ET rayons)
    let minx = 1e9;
    let maxx = -1e9;
    let miny = 1e9;
    let maxy = -1e9;
    for (let i = 0; i < K; i++) {
      minx = Math.min(minx, p[i].x - R[i]);
      maxx = Math.max(maxx, p[i].x + R[i]);
      miny = Math.min(miny, p[i].y - R[i] - 18);
      maxy = Math.max(maxy, p[i].y + R[i] + 22);
    }
    const sc = Math.min(1, (W - 16) / (maxx - minx), (H - 16) / (maxy - miny));
    const mx = (minx + maxx) / 2;
    const my = (miny + maxy) / 2;
    return p.map((q, i) => ({
      x: W / 2 + (q.x - mx) * sc,
      y: H / 2 + (q.y - my) * sc,
      r: R[i] * sc,
    }));
  }

  function render(focus) {
    const c = clusters();
    if (!c || !c.clusters || !c.clusters.length) return;
    const W = vp.clientWidth;
    const H = vp.clientHeight;
    const pos = layout(c.clusters, c.bridges, W, H);
    CUR = {clusters: c.clusters, bridges: c.bridges, pos};
    const maxB = Math.max(1, ...Object.values(c.bridges || {}));
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '">';
    for (const key in c.bridges) {
      if (!Object.prototype.hasOwnProperty.call(c.bridges, key)) continue;
      const r = c.bridges[key] / maxB;
      if (r < 0.45) continue;
      const [a, b] = key.split("-").map(Number);
      if (!pos[a] || !pos[b]) continue;
      svg += '<line x1="' + pos[a].x + '" y1="' + pos[a].y + '" x2="' +
        pos[b].x + '" y2="' + pos[b].y + '" stroke="#8a948e" stroke-opacity="' +
        (0.10 + 0.14 * r).toFixed(2) + '" stroke-width="' +
        (1 + r * 2).toFixed(1) + '" stroke-linecap="round"/>';
    }
    svg += "</svg>";
    let html = "";       // îles + étiquettes (calque transformé)
    let mhtml = "";      // membres (calque écran)
    const mem = [];      // coordonnées monde des membres
    c.clusters.forEach((w, i) => {
      const P = pos[i];
      const r = P.r;
      const g0 = colorOf(w.top);
      const dg = domGenre(w) || genreOf(w.top);
      const tint = (window.ORPHEE_GENRE_COLORS || {})[dg] || g0;
      html += '<div class="wm-isl" data-i="' + i + '" style="left:' + P.x +
        "px;top:" + P.y + "px;width:" + (r * 2) + "px;height:" + (r * 2) +
        "px;background:" + hexA(tint, 0.12) + ";border-color:" +
        hexA(tint, 0.5) + '"></div>';
      html += '<div class="wm-lab" style="left:' + P.x + "px;top:" +
        (P.y + r + 8) + 'px"><b>' + w.top + "</b><small>" + (dg || "") +
        " · " + w.members.length + "</small></div>";
      // membres montrés : top 6, mais l'artiste focalisé toujours présent.
      let mm = w.members.slice(0, Math.min(6, w.members.length));
      if (focus && w.members.some((m) => m.a === focus) &&
          !mm.some((m) => m.a === focus)) {
        mm = mm.slice(0, 5).concat(w.members.find((m) => m.a === focus));
      }
      const mx = Math.max(...mm.map((m) => m.n));
      const M = mm.length;
      mm.forEach((m, j) => {
        const md = Math.max(9, r * 0.30 * (0.6 + 0.4 * Math.sqrt(m.n / mx)));
        const rr = j === 0 ? 0 : r * 0.6;
        const ang = -Math.PI / 2 + (j - 1) * 2 * Math.PI / Math.max(1, M - 1);
        mem.push({
          wx: P.x + Math.cos(ang) * rr, wy: P.y + Math.sin(ang) * rr,
          wr: md / 2, foc: m.a === focus,
        });
        const img = imgOf(m.a);
        // Initiales toujours dessous ; la photo couvre, et s'efface si 404.
        const face = initials(m.a) + (img ? '<img src="' + img +
          '" alt="" loading="lazy">' : "");
        mhtml += '<div class="wm-node' + (m.a === focus ? " foc" : "") +
          '"><span class="wm-face" style="background:' + colorOf(m.a) + '">' +
          face + '</span><span class="wm-nname">' + m.a + "</span></div>";
      });
    });
    world.innerHTML = svg + html;
    members.innerHTML = mhtml;
    members.querySelectorAll("img").forEach((im) =>
      im.addEventListener("error", () => im.remove()));
    const nodes = members.children;
    memList = mem.map((m, k) => Object.assign({node: nodes[k]}, m));
    applyT();
  }

  function openIsland(i) {
    const w = CUR && CUR.clusters[i];
    if (!w) return;
    sheet.innerHTML = "";
    sheet.appendChild(el("h2", null, "Autour de " + w.top));
    sheet.appendChild(el("div", "wm-sub", (domGenre(w) || "") + " · " +
      w.members.length + " artistes · " + fmt(w.plays) +
      " écoutes — enchaînés ensemble"));
    for (const m of w.members) {
      const row = el("button", "wm-row");
      row.type = "button";
      const d = el("span", "wm-dot", initials(m.a));
      d.style.background = colorOf(m.a);
      const b = el("b", null, m.a);
      const sm = el("small", null, fmt(m.n) + " éc.");
      row.append(d, b, sm);
      row.addEventListener("click", () => {
        ov.classList.remove("on");
        if (window.OrpheeArtistSheet) window.OrpheeArtistSheet.open(m.a);
      });
      sheet.appendChild(row);
    }
    ov.classList.add("on");
  }

  // ---- zoom / pan + noms par niveau de détail ----
  let tx = 0;
  let ty = 0;
  let s = 1;
  const SMIN = 0.7;
  const SMAX = 6;
  function applyT() {
    world.style.transform = "translate(" + tx.toFixed(1) + "px," +
      ty.toFixed(1) + "px) scale(" + s.toFixed(3) + ")";
    const z = clamp((s - 1.5) / 0.9, 0, 1);
    world.style.setProperty("--iz", (1 - z).toFixed(2)); // étiquettes de monde
    members.style.setProperty("--z", z); // noms d'artistes (LOD)
    // Membres en coordonnées ÉCRAN (jamais zoomés en bitmap → nets).
    for (const m of memList) {
      const d = m.wr * 2 * s;
      const st = m.node.style;
      st.left = (m.wx * s + tx).toFixed(1) + "px";
      st.top = (m.wy * s + ty).toFixed(1) + "px";
      st.width = d.toFixed(1) + "px";
      st.height = d.toFixed(1) + "px";
      st.fontSize = (d * 0.42).toFixed(1) + "px";
    }
  }
  function focusIsland(i) {
    const P = CUR && CUR.pos[i];
    const W = vp.clientWidth;
    const H = vp.clientHeight;
    if (!P) {
      tx = 0;
      ty = 0;
      s = 1;
    } else {
      s = clamp(Math.min(W, H) * 0.42 / P.r, 1.6, 3.4);
      tx = W / 2 - P.x * s;
      ty = H / 2 - P.y * s;
    }
    applyT();
  }
  const rel = (e) => {
    const r = vp.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  };
  const pts = new Map();
  let pinch = null;
  let downPt = null;
  let moved = 0;
  let t0 = 0;
  function onDown(e) {
    vp.setPointerCapture(e.pointerId);
    const p = rel(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      downPt = p;
      moved = 0;
      t0 = performance.now();
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = {d: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s, tx, ty};
    }
  }
  function onMove(e) {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const cur = rel(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 1 && !pinch) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      applyT();
    } else if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ns = clamp(pinch.s * d / pinch.d, SMIN, SMAX);
      const wx = (pinch.mx - pinch.tx) / pinch.s;
      const wy = (pinch.my - pinch.ty) / pinch.s;
      s = ns;
      tx = mx - wx * s;
      ty = my - wy * s;
      applyT();
    }
  }
  function onUp(e) {
    const was1 = pts.size === 1;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (was1 && downPt && moved < 8 && performance.now() - t0 < 400) {
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const isl = t && t.closest && t.closest(".wm-isl");
      if (isl) openIsland(+isl.dataset.i);
    }
    if (pts.size === 0) downPt = null;
  }
  function onWheel(e) {
    e.preventDefault();
    const p = rel(e);
    const ns = clamp(s * (e.deltaY < 0 ? 1.12 : 0.89), SMIN, SMAX);
    const wx = (p.x - tx) / s;
    const wy = (p.y - ty) / s;
    s = ns;
    tx = p.x - wx * s;
    ty = p.y - wy * s;
    applyT();
  }

  function build() {
    host = el("div", "wm-host");
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-label", "Tes mondes d'écoute");
    const hd = el("div", "wm-hd");
    hd.appendChild(el("div", "wm-kick", "TES MONDES"));
    hd.appendChild(el("div", "wm-note",
        "Groupés par ce que tu enchaînes. Pince pour zoomer."));
    vp = el("div", "wm-vp");
    world = el("div", "wm-world");
    members = el("div", "wm-members");
    vp.appendChild(world);
    vp.appendChild(members);
    const cls = el("button", "wm-close", "Fermer");
    cls.type = "button";
    cls.addEventListener("click", close);
    ov = el("div", "wm-ov");
    sheet = el("div", "wm-sheet");
    ov.appendChild(sheet);
    ov.addEventListener("click", (e) => {
      if (e.target === ov) ov.classList.remove("on");
    });
    host.append(hd, vp, cls, ov);
    document.body.appendChild(host);
    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", onUp);
    vp.addEventListener("pointercancel", onUp);
    vp.addEventListener("wheel", onWheel, {passive: false});
    window.addEventListener("resize", () => {
      if (host.classList.contains("open")) {
        render();
        tx = 0;
        ty = 0;
        s = 1;
        applyT();
      }
    });
  }

  function open(focus) {
    if (!clusters()) return;
    if (!host) build();
    host.classList.add("open");
    document.body.classList.add("wm-open");
    render(focus); // après l'affichage : vp a ses dimensions
    const ci = focus ? clusterOf(focus) : -1;
    if (ci >= 0) focusIsland(ci);
    else {
      tx = 0;
      ty = 0;
      s = 1;
      applyT();
    }
    if (window.OrpheeNav && !layered) {
      layered = true;
      window.OrpheeNav.openLayer("worldmap", hide);
    }
  }

  function hide() {
    layered = false;
    if (!host) return;
    host.classList.remove("open");
    ov.classList.remove("on");
    document.body.classList.remove("wm-open");
  }

  function close() {
    if (layered && window.OrpheeNav) window.OrpheeNav.closeLayer("worldmap");
    else hide();
  }

  window.OrpheeWorldmap = {open, close, has};
})();
