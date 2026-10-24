/* Orphée · Écoutes Last.fm (PM-01, ADR-034, ADR-044) — Réglages ›
   Synchronisation, sous « Actualiser » : combien d'écoutes, la dernière, la
   dernière synchro. (La migration unique depuis la Sheet est faite.)
   « Exporter pour analyse » (v2.20.0) : JSON compact (albums + écoutes),
   construit par exportListens, réservé au propriétaire.
   La vérification MusicBrainz est dans l'onglet Qualité (v2.23.0). */
(function () {
  "use strict";

  const root = document.getElementById("set-scrobbles");
  if (!root) return;

  let state = { meta: null, canon: null };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);
  const dateOf = (uts) => new Date(uts * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  async function loadMeta() {
    try {
      const snap = await firebase.firestore().doc("cache/scrobbles_meta").get();
      state.meta = snap.exists ? snap.data() : null;
    } catch (err) {
      state.meta = null;
    }
    // Rattachement des titres à leur album (PM-29) : état du dernier refresh.
    try {
      const g = await firebase.firestore().doc("cache/agg_global").get();
      const d = g.exists ? g.data() : null;
      state.canon = d && typeof d.canon_pending === "number" ? d.canon_pending : null;
    } catch (err) {
      state.canon = null;
    }
  }

  async function exportForAnalysis(btn, msg) {
    btn.disabled = true;
    msg.textContent = "Préparation de l’export…";
    try {
      const fn = firebase.app().functions("europe-west1")
          .httpsCallable("exportListens", { timeout: 120000 });
      const { data } = await fn();
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `orphee-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      msg.textContent = `${fmt(data.listens.length)} écoutes, ${fmt(data.albums.length)} albums · ${Math.round(blob.size / 1024)} Ko.`;
    } catch (err) {
      msg.textContent = "L’export a échoué : " + (err.message || "erreur inconnue");
    } finally {
      btn.disabled = false;
    }
  }

  function exportRow() {
    const row = el("div", "set-field");
    const btn = el("button", "share-btn o-btn soft block", "Exporter pour analyse");
    btn.type = "button";
    // Vide tant qu'on n'exporte pas : l'avancement et le résultat s'y écrivent.
    const msg = el("p", "settings-help set-status-line");
    btn.addEventListener("click", () => exportForAnalysis(btn, msg));
    row.append(btn, msg);
    return row;
  }

  function render() {
    root.innerHTML = "";
    const m = state.meta;
    if (m && m.source === "storage") {
      const last = m.last_uts ? dateOf(m.last_uts) : "";
      let line = `${fmt(m.total)} écoutes Last.fm${last ? ` · dernière le ${last}` : ""}`;
      if (state.canon > 0) line += ` · ${fmt(state.canon)} titre${state.canon > 1 ? "s" : ""} à rattacher`;
      root.appendChild(el("p", "settings-help set-status-line", line));
      root.appendChild(exportRow());
      return;
    }
    root.appendChild(el("p", "settings-help", "Last.fm · pas encore synchronisé."));
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    document.addEventListener("orphee:tab", async (e) => {
      if (e.detail.tab !== "settings") return;
      const u = firebase.auth().currentUser;
      if (!u || u.isAnonymous) return;
      await loadMeta();
      render();
    });
    document.addEventListener("orphee:refreshed", async () => { await loadMeta(); render(); });
  }

  init();
})();
