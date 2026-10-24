(function () {
  "use strict";

  const REGION = "europe-west1";

  // Pastille et libellé de l'en-tête commun (construit par nav.js).
  const syncDot = document.getElementById("sync-dot");
  const headSync = document.getElementById("head-sync");
  const headLabel = document.getElementById("head-sync-label");
  const refreshBtn = document.getElementById("refresh-btn");
  const statsSummary = document.getElementById("stats-summary");
  const lastRefreshEl = document.getElementById("last-refresh");
  const toastEl = document.getElementById("toast");
  const progressEl = document.getElementById("refresh-progress");
  const barEl = document.getElementById("rfp-bar");
  const labelEl = document.getElementById("rfp-label");

  let toastTimer = null;
  let refreshFn = null;
  let syncFn = null;
  let lastRefreshMs = null; // date du dernier refresh connu (agg_global)
  let syncing = false;

  // Étapes simulées : [pct_cible, durée_ms, label]
  // Calées sur les vraies phases du backend (lecture sheets → covers → écriture)
  const STEPS = [
    [8,  2000, "Lecture des données…"],
    [22, 5000, "Analyse des écoutes…"],
    [38, 6000, "Calcul des agrégats…"],
    [55, 7000, "Résolution des pochettes…"],
    [72, 6000, "Personnalités & commuting…"],
    [88, 5000, "Écriture du cache…"],
    [95, 4000, "Finalisation…"],
  ];

  function setProgress(pct, label) {
    if (!barEl || !labelEl) return;
    barEl.style.width = pct + "%";
    if (label !== undefined) labelEl.textContent = label;
  }

  function startProgress() {
    if (!progressEl) return;
    progressEl.hidden = false;
    setProgress(2, STEPS[0][2]);
    let delay = 0;
    STEPS.forEach(([pct, dur, label]) => {
      delay += dur;
      setTimeout(() => { setProgress(pct, label); }, delay);
    });
  }

  function completeProgress(success) {
    if (!progressEl) return;
    setProgress(100, success ? "Données à jour ✓" : "Erreur lors du rafraîchissement");
    setTimeout(() => {
      progressEl.hidden = true;
      setProgress(0, STEPS[0][2]);
    }, 1800);
  }

  function setSync(state) {
    if (!syncDot) return;
    syncDot.classList.remove("is-syncing", "is-ok", "is-error");
    if (state) syncDot.classList.add(state);
  }

  // En-tête : « il y a 3 j » (fraîcheur des données) ou l'actualisation en
  // cours. Toucher la pastille relance un refresh (ADR-005 : à la demande).
  function renderHead() {
    if (!headLabel) return;
    if (syncing) {
      headLabel.textContent = "Actualisation…";
    } else if (lastRefreshMs) {
      headLabel.textContent = formatRelativeTime(lastRefreshMs);
    } else {
      headLabel.textContent = "Actualiser";
    }
    if (headSync) {
      headSync.disabled = syncing;
      headSync.title = lastRefreshMs ?
        "Données du " + new Date(lastRefreshMs).toLocaleString("fr-FR") +
        " — toucher pour actualiser" : "Actualiser les données";
    }
  }

  function showToast(message, kind, duration) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.remove("is-ok", "is-error");
    toastEl.classList.add(kind === "error" ? "is-error" : "is-ok");
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, duration || 3000);
  }

  // Retour visuel commun à toute l'app (enregistrement réussi / échoué).
  window.OrpheeToast = showToast;

  function formatNumber(n) {
    return new Intl.NumberFormat("fr-FR").format(n);
  }

  function formatRelativeTime(ms) {
    const diff = Date.now() - ms;
    if (diff < 60000) return "à l'instant";
    if (diff < 3600000) return "il y a " + Math.floor(diff / 60000) + " min";
    if (diff < 86400000) return "il y a " + Math.floor(diff / 3600000) + " h";
    return "il y a " + Math.floor(diff / 86400000) + " j";
  }

  function updateSummary(gradedInScope, inScope) {
    if (inScope > 0) {
      const pct = Math.round((gradedInScope / inScope) * 100);
      statsSummary.textContent = gradedInScope + " / " + inScope + " · " + pct + "%";
    } else if (gradedInScope > 0) {
      statsSummary.textContent = gradedInScope + " notés";
    } else {
      statsSummary.textContent = "";
    }
  }

  function renderStats(data) {
    const ts0 = data && data.last_refresh;
    lastRefreshMs = ts0 ?
      (ts0.toDate ? ts0.toDate() : new Date(ts0)).getTime() : null;
    renderHead();
    if (!data) {
      statsSummary.textContent = "";
      lastRefreshEl.textContent = "";
      lastRefreshEl.removeAttribute("title");
      return;
    }
    // graded_above_threshold = albums notés ET gradeable (≥ seuil d'écoutes).
    // Évite un % > 100 % causé par des albums notés sous le seuil.
    // Fallback sur graded_albums si le cache est antérieur à cette version.
    const gradedInScope = data.graded_above_threshold != null ?
      data.graded_above_threshold : (data.graded_albums || 0);
    const inScope = data.albums_above_threshold || 0;
    updateSummary(gradedInScope, inScope);
    const ts = data.last_refresh;
    if (ts) {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      lastRefreshEl.textContent = "Actualisé " + formatRelativeTime(d.getTime());
      lastRefreshEl.title = d.toLocaleString("fr-FR");
    } else {
      lastRefreshEl.textContent = "";
      lastRefreshEl.removeAttribute("title");
    }
  }

  async function readScrobblesMeta() {
    try {
      const snap = await firebase.firestore().doc("cache/scrobbles_meta").get();
      return snap.exists ? snap.data() : null;
    } catch (err) {
      return null;
    }
  }

  async function loadCachedStats() {
    try {
      const snap = await firebase.firestore().doc("cache/agg_global").get();
      renderStats(snap.exists ? snap.data() : null);
    } catch (err) {
      console.error("Failed to load agg_global:", err);
    }
  }

  async function triggerRefresh() {
    if (!refreshFn) return;
    if (syncing) return;
    syncing = true;
    refreshBtn.disabled = true;
    setSync("is-syncing");
    renderHead();
    startProgress();
    try {
      // Synchro Last.fm d'abord (ADR-034), une fois les écoutes migrées. Un
      // échec n'empêche pas le recalcul : rien n'est écrit à moitié.
      let added = null;
      let syncError = null;
      const meta = await readScrobblesMeta();
      if (meta && meta.source === "storage" && syncFn) {
        setProgress(4, "Nouvelles écoutes depuis Last.fm…");
        try {
          added = (await syncFn()).data.added || 0;
        } catch (e) {
          console.error("Last.fm sync failed:", e);
          syncError = e && e.message ? e.message : "Last.fm indisponible";
        }
      }
      const result = await refreshFn();
      const data = result.data || {};
      setSync("is-ok");
      completeProgress(true);
      if (syncError) {
        showToast("Last.fm : " + syncError + " Données recalculées sans les nouvelles écoutes.", "error", 6000);
      } else {
        showToast(
            (added !== null ? (added ? `${formatNumber(added)} nouvelle${added > 1 ? "s" : ""} écoute${added > 1 ? "s" : ""} · ` : "Aucune nouvelle écoute · ") : "Cache à jour — ") +
            formatNumber(data.total_listens || 0) + " écoutes, " +
            formatNumber(data.total_albums || 0) + " albums",
        );
      }
      await loadCachedStats();
      document.dispatchEvent(
          new CustomEvent("orphee:refreshed", {detail: data}),
      );
    } catch (err) {
      console.error("Refresh failed:", err);
      setSync("is-error");
      completeProgress(false);
      const msg = err && err.message ? err.message : "Erreur inconnue";
      showToast("Refresh échoué : " + msg, "error", 5000);
    } finally {
      syncing = false;
      refreshBtn.disabled = false;
      renderHead();
    }
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.functions ||
        !firebase.firestore) {
      console.error("Firebase Functions ou Firestore non disponible");
      return;
    }
    const functions = firebase.app().functions(REGION);
    // Jusqu’à ~2 min : pochettes, photos et rattachement d’albums (PM-29).
    refreshFn = functions.httpsCallable("refreshCache", { timeout: 290000 });
    syncFn = functions.httpsCallable("syncLastfm", { timeout: 300000 });
    refreshBtn.addEventListener("click", triggerRefresh);
    // Qualité lance l'actualisation après « Appliquer » (v2.30.0).
    window.OrpheeRefresh = { run: triggerRefresh, busy: () => syncing };
    if (headSync) headSync.addEventListener("click", triggerRefresh);
    // « il y a 3 min » reste juste sans recharger quoi que ce soit.
    setInterval(renderHead, 60000);

    // Mise à jour live du header quand le seuil change dans Settings.
    // Utilise orpheeOddity (disponible si la bibliothèque est chargée).
    document.addEventListener("orphee:settings-saved", (e) => {
      const api = window.orpheeOddity;
      if (!api || !api.ready() || !e.detail) return;
      const res = api.preview(e.detail.percentile, e.detail.eligible);
      updateSummary(res.gradedGradeable, res.gradeableCount);
    });

    firebase.auth().onAuthStateChanged((user) => {
      if (user && window.OrpheeSession && !window.OrpheeSession.ready(user)) return;
      if (user) {
        loadCachedStats();
      } else {
        renderStats(null);
        setSync(null);
      }
    });
  }

  init();
})();
