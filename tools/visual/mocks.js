/* Harness visuel — données mock + construction du DOM par vue (ADR-029).
   Chargé par harness.html. La vue est choisie par ?view=… (défaut: stats).
   Les modules de l'app sont des IIFE qui s'attachent à window : on les charge
   en <script> classiques puis on appelle leurs build*() avec des mocks calqués
   sur le schéma du cache (docs/SPEC.md § 4.1). Ajouter une vue = une entrée
   dans VIEWS. */

const VIEW = new URLSearchParams(location.search).get("view") || "stats";
const APP = document.getElementById("app-screen");
const JS = (f) => "../../public/js/" + f;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error("échec chargement " + src));
    document.body.appendChild(s);
  });
}
async function loadAll(srcs) { for (const s of srcs) await loadScript(s); }

// Append défensif : une section qui throw n'interrompt pas le reste.
function safeAppend(feed, label, fn) {
  try { const el = fn(); if (el) feed.appendChild(el); } catch (e) {
    const d = document.createElement("div");
    d.style.cssText = "padding:8px;color:#d96d6d;font:11px monospace";
    d.textContent = "[" + label + " skip: " + e.message + "]";
    feed.appendChild(d);
  }
}

const VIEWS = {
  // ── Onglet Stats ─────────────────────────────────────────────────────────
  stats: {
    scripts: ["refdata.js", "covers.js", "stats-util.js", "stats-charts.js",
      "stats-top.js", "stats-preview.js"].map(JS),
    build() {
      APP.innerHTML =
        '<main id="view-stats" class="view is-active"><div id="stats-feed"></div></main>';
      const feed = document.getElementById("stats-feed");
      const C = window.OrpheeStatsCharts;
      const P = window.OrpheeStatsPreview;
      const T = window.OrpheeStatsTop;

      // Vue d'ensemble (construite à la main, comme stats.js)
      const ov = document.createElement("div");
      ov.className = "ov";
      ov.innerHTML =
        '<div class="ov-head"><span class="ov-eyebrow">Ta bibliothèque</span>' +
        '<span class="ov-refresh">actualisé aujourd’hui</span></div>' +
        '<div class="ov-cells">' +
        '<div class="ov-cell"><span class="ov-num k-stat">182 405</span><span class="ov-lab">écoutes</span><span class="ov-div"></span></div>' +
        '<div class="ov-cell"><span class="ov-num k-stat">9 543</span><span class="ov-lab">albums</span><span class="ov-div"></span></div>' +
        '<div class="ov-cell"><span class="ov-num k-stat">312</span><span class="ov-lab">notés</span></div>' +
        '</div><p class="ov-since">depuis 2014 · 487 artistes</p>';
      feed.appendChild(ov);

      // 01 Écoutes — 4 focales branchées (ADR-028)
      const ecoutes = {
        ans: { caption: "toutes années", data: [2014, 2015, 2016, 2017, 2018,
          2019, 2020, 2021, 2022, 2023, 2024].map((y, i) =>
          ({ label: String(y), count: 8000 + Math.round(Math.sin(i) * 3000) + i * 900 })) },
        mois: { caption: "par mois de l’année", data: ["Jan", "Fév", "Mar",
          "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]
          .map((m, i) => ({ label: m, count: 9000 + Math.round(Math.cos(i) * 2500) })) },
        semaine: { caption: "par jour de semaine", data: ["Lun", "Mar", "Mer",
          "Jeu", "Ven", "Sam", "Dim"].map((d, i) =>
          ({ label: d, count: 14000 + Math.round(Math.sin(i) * 3000) })) },
        heure: { caption: "par heure du jour", data: Array.from({ length: 24 },
          (_, h) => ({ label: h + "h", hod: h,
            count: Math.max(200, Math.round(3000 * Math.exp(-Math.pow(h - 18, 2) / 40))) })) },
      };
      safeAppend(feed, "ecoutes", () => {
        const { sec, init } = C.buildEcoutes(ecoutes);
        setTimeout(init, 0); return sec;
      });

      // 02 Distribution des notes
      safeAppend(feed, "grades", () => C.buildGrades({ 1: 42, 2: 88, 3: 140, 4: 96, 5: 55 }));

      // 03 Constellation
      const genres = ["Rock", "Electro", "Rap", "Pop", "Jazz", "Classical"];
      const nodes = Array.from({ length: 18 }, (_, i) => ({ album_sur: "a" + i,
        album: "Album " + i, artist: "Artiste " + i,
        genre: genres[i % genres.length], count: 20 + (i * 7) % 120 }));
      const edges = Array.from({ length: 22 }, (_, i) =>
        ({ source: "a" + (i % 18), target: "a" + ((i * 3 + 1) % 18), weight: 1 + (i % 4) }));
      safeAppend(feed, "constellation", () => P.buildConstellation({ nodes, edges }));

      // 04 / 05 Top
      const artists = Array.from({ length: 8 }, (_, i) => ({ artist: "Artiste " + (i + 1),
        count: 5000 - i * 420, top_album: "Album " + i, last_played: Date.now() / 1000 }));
      safeAppend(feed, "topArtistes", () => T.buildTopArtistes(artists));
      const albums = Array.from({ length: 8 }, (_, i) => ({ album_sur: "a" + i,
        artist: "Artiste " + (i + 1), album: "Album titre " + (i + 1),
        count: 3000 - i * 250, grade: (i % 5) + 1, personal_fav: i % 3 === 0, cover_url: null }));
      safeAppend(feed, "topAlbums", () => T.buildTopAlbums(albums));

      // 06 Personnalités (état vide honnête)
      safeAppend(feed, "personalites", () => P.buildPersonalites({ available: false }));
      // 07 Commuting
      const band = Array.from({ length: 24 }, (_, h) => ({ hod: h,
        v: Math.max(50, Math.round(2000 * Math.exp(-Math.pow(h - 18, 2) / 40))) }));
      safeAppend(feed, "commuting", () => P.buildCommuting({ band, matin: [], soir: [], byYear: {} }));
      // 08 Capsule (état vide honnête)
      safeAppend(feed, "capsule", () => P.buildCapsule({ available: false }));
      // 09 Découvertes
      safeAppend(feed, "decouvertes", () => P.buildDecouvertes({ items: [] }));
    },
  },

  // ── Barre d'onglets (.tabnav) par-dessus une vue réelle ──────────────────
  // Monte le contenu Stats, charge nav.js (qui construit la barre), puis
  // active l'onglet Stats pour voir la barre + un vrai contenu derrière.
  nav: {
    scripts: ["refdata.js", "covers.js", "stats-util.js", "stats-charts.js",
      "stats-top.js", "stats-preview.js"].map(JS),
    async build() {
      VIEWS.stats.build();
      await loadScript(JS("nav.js"));
      const t = document.querySelector('.tabnav-tab[data-tab="stats"]');
      if (t) t.click();
    },
  },

  // Ajouter ici d'autres vues (library, detail…) : { scripts:[…], build() {…} }.
};

(async () => {
  const v = VIEWS[VIEW];
  if (!v) { APP.textContent = "Vue inconnue : " + VIEW; window.__ready = true; return; }
  await loadAll(v.scripts);
  await v.build();
  window.__ready = true; // signal pour shoot.js
})();
