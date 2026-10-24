/* Orphée · Données de « Moi » (v2.12.0).
   L'écran Stats a disparu : ses éléments utiles vivent dans « Moi » (en-tête,
   « Ceux qui me définissent », « Mes moments », « Mes écoutes par… »).
   Ce module ne fait plus que charger les agrégats (cache/*, dérivés —
   IM-5) une fois, les partager (« Moi », fiche artiste) et les recharger
   après un refresh. Garde le nom OrpheeStats pour ses consommateurs. */
(function () {
  "use strict";

  let data = null;
  let loadingPromise = null;

  function docData(snap) {
    return snap && snap.exists ? snap.data() : null;
  }

  async function load() {
    const db = firebase.firestore();
    const [g, s, a, cmm, qtr, rec, img, one, por, moi, arts, days, clus] =
      await Promise.all([
        db.doc("cache/agg_global").get(),
        db.doc("cache/agg_stats").get(),
        db.doc("cache/agg_top_artists_alltime").get(),
        db.doc("cache/agg_commuting").get(),
        db.doc("cache/agg_quarters").get(),      // trimestres & humeurs
        db.doc("cache/agg_recent").get(),        // « À faire » + netteté
        db.doc("cache/agg_artist_images").get(), // photos d'artistes
        db.doc("cache/agg_one_track").get(),     // « Un seul titre »
        db.doc("cache/agg_portrait").get(),      // portrait, 1er jet (ADR-048)
        db.doc("cache/agg_moi").get(),           // « Moi » préparé (ADR-049)
        db.doc("cache/agg_artists").get(),       // vue Artistes (PM-37)
        db.doc("cache/agg_days").get(),          // « Ces jours-ci » (PM-39)
        db.doc("cache/agg_clusters").get(),      // « Tes mondes » (PM-40)
      ]);
    data = {
      global: docData(g),
      stats: docData(s),
      artists: (docData(a) || {}).items || [],
      cmm: docData(cmm),
      quarters: (docData(qtr) || {}).items || [],
      years: (docData(qtr) || {}).years || [],               // « Mes années »
      recent: docData(rec),
      artistImages: realPhotos((docData(img) || {}).images),
      oneTrack: (docData(one) || {}).items || [],
      portrait: docData(por),
      moi: docData(moi),
      artistsAgg: docData(arts),
      days: docData(days),                                   // « Ces jours-ci »
      clusters: docData(clus),                               // « Tes mondes »
    };
  }

  // Seulement les vraies photos (https) : la silhouette grise par défaut de
  // Deezer (« /images/artist//… ») vaut une absence d'image.
  function realPhotos(images) {
    const out = {};
    for (const [name, url] of Object.entries(images || {})) {
      if (typeof url === "string" && /^https:\/\//.test(url) &&
          !/\/images\/artist\/\//.test(url) &&
          !url.includes("d41d8cd98f00b204e9800998ecf8427e")) out[name] = url;
    }
    return out;
  }

  function ensureLoaded(force) {
    if (data && !force) return Promise.resolve();
    if (!loadingPromise || force) {
      loadingPromise = load().catch((err) => {
        console.error("Chargement des agrégats échoué :", err);
        loadingPromise = null;
      });
    }
    return loadingPromise;
  }

  // Chiffres de l'en-tête de « Moi ».
  function profile() {
    const g = data && data.global;
    const s = data && data.stats;
    // Années blanches exclues, comme partout (MODELE, Période) : l'en-tête
    // et « Mes écoutes par… » disent le même total (2019 : 29 écoutes).
    const lpy = blankless((s && s.listens_per_year) || []);
    return {
      listens: lpy.length ? lpy.reduce((sum, y) => sum + y.count, 0) : (g && g.total_listens) || 0,
      albums: (g && g.total_albums) || 0,
      artists: (g && g.total_artists) || 0,
      since: lpy.length ? Math.min(...lpy.map((y) => y.year)) : null,
    };
  }

  // « Mes écoutes par… » : 4 focales, toutes sur de vraies données (ADR-028) :
  // ans/mois/semaine ← agg_stats ; heure ← agg_commuting.band.
  const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
    "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const WD_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]; // idx=getUTCDay
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // affichage Lundi → Dimanche
  const MONTHS_FULL = ["janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const WD_FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi",
    "vendredi", "samedi"]; // idx=getUTCDay

  // Années blanches (presque sans scrobbles) : jamais affichées. Même règle
  // que le serveur (quarters.js, blankYears) : < 100 écoutes et < 5 % de
  // l'année médiane.
  function blankless(lpy) {
    const ns = lpy.map((y) => y.count).sort((a, b) => a - b);
    const median = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
    const min = Math.min(100, median * 0.05);
    return lpy.filter((y) => y.count >= min);
  }

  function buildEcoutesData() {
    const s = data && data.stats;
    const cmm = data && data.cmm;
    const lpy = blankless((s && s.listens_per_year) || []);
    const ansData = lpy.map((y) => ({ label: String(y.year), count: y.count, top: y.top || null, when: "en " + y.year }));
    const byMonth = (s && s.by_month) || [];
    const moisData = byMonth.map((m) =>
      ({ label: MONTHS[m.month - 1] || String(m.month), count: m.count,
        top: m.top || null, when: "en " + (MONTHS_FULL[m.month - 1] || "") }));
    const wd = {};
    const wdTop = {};
    ((s && s.by_weekday) || []).forEach((w) => { wd[w.weekday] = w.count; wdTop[w.weekday] = w.top || null; });
    const semaineData = WD_ORDER.map((d) => ({ label: WD_LABELS[d], count: wd[d] || 0,
      top: wdTop[d] || null, when: "le " + WD_FULL[d] }));
    const band = (cmm && cmm.band) || [];
    // Journée (refonte v2.46.0) : barres horaires + signatures de créneau
    // (genres + artistes sur-représentés matin/soir/nuit, buildCommuting).
    const heureData = band.map((b) =>
      ({ label: b.hod + "h", count: b.v, hod: b.hod }));
    const shape = (d, caption) => (d && d.length ? { data: d, caption } : null);
    return {
      ans: shape(ansData, "toutes années"),
      mois: shape(moisData, "par mois de l’année"),
      semaine: shape(semaineData, "par jour de semaine"),
      journee: heureData.length ? { data: heureData, caption: "dans ta journée",
        signatures: (cmm && cmm.signatures) || null } : null,
    };
  }

  window.OrpheeStats = { ensureLoaded, data: () => data, profile, buildEcoutesData };

  function init() {
    if (typeof firebase === "undefined" || !firebase.firestore) return;
    document.addEventListener("orphee:refreshed", async () => {
      await ensureLoaded(true);
      document.dispatchEvent(new CustomEvent("orphee:stats-reloaded"));
    });
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) { data = null; loadingPromise = null; }
    });
  }

  init();
})();
