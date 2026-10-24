/* Orphée · Mes CD (PM-38, MODELE E12).
   Curation : users/{uid}/cds/{encodeURIComponent(album_sur)} = {album_sur, at}
   — Axel marque ou retire ; lue EN DIRECT (ADR-031). L'invité lit celle
   d'Axel (règle dédiée) et n'écrit jamais (IM-8). Posséder n'est pas noter :
   aucun dérivé ne lit E12. */
(function () {
  "use strict";

  const keys = new Set();   // album_sur
  let unsub = null;

  const S = () => window.OrpheeSession;
  const isGuest = () => !!(S() && S().isGuest());
  const dataUid = () => (S() ? S().dataUid() : null);
  const col = () => firebase.firestore().collection(`users/${dataUid()}/cds`);
  const changed = () => document.dispatchEvent(new CustomEvent("orphee:cds-changed"));

  function start() {
    stop();
    if (!dataUid()) return;
    unsub = col().onSnapshot((snap) => {
      keys.clear();
      snap.forEach((d) => { const k = d.data().album_sur; if (k) keys.add(k); });
      changed();
    }, (err) => console.error("[cds] CD illisibles :", err.message));
  }
  function stop() {
    if (unsub) unsub();
    unsub = null;
    keys.clear();
  }

  // Ajoute ou retire ; la vue suit tout de suite (le snapshot confirme).
  // Message avec « Annuler » (bandeau de « Mis de côté »), sauf `quiet`.
  async function set(album, on, quiet) {
    const key = album && album.album_sur;
    if (!key || isGuest() || !dataUid()) return false;
    const ref = col().doc(encodeURIComponent(key));
    if (on) keys.add(key); else keys.delete(key);
    changed();
    try {
      if (on) await ref.set({ album_sur: key, at: Date.now() });
      else await ref.delete();
    } catch (err) {
      console.error("[cds] écriture refusée :", err.message);
      if (on) keys.delete(key); else keys.add(key);
      changed();
      if (window.OrpheeToast) window.OrpheeToast("Non enregistré — vérifie ta connexion et réessaie.", "error", 4500);
      return false;
    }
    const A = window.OrpheeAside;
    if (!quiet && A && A.toast) {
      A.toast(on ? `« ${album.album} » dans tes CD` : `« ${album.album} » retiré de tes CD`,
          () => set(album, !on, true));
    }
    return true;
  }

  window.OrpheeCds = {
    has: (key) => keys.has(key),
    count: () => keys.size,
    keys: () => keys,
    canEdit: () => !isGuest() && !!dataUid(),
    set,
    toggle: (album, quiet) => set(album, !keys.has(album.album_sur), quiet),
  };

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().onAuthStateChanged((u) => {
      if (u && S() && !S().ready(u)) return;
      start();
    });
  }
})();
