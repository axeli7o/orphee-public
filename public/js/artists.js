/* Orphée — Classification d'artiste (MODELE E8, PM-21).
   Curation d'Axel : users/{uid}/artist_genres/{encodeURIComponent(artist)} =
   {artist, genre, sousgenre, source: "sheet"|"axel", updated_at}. Importée
   une fois depuis l'onglet Artists par refreshCache, puis l'app fait foi.
   Genre EFFECTIF d'un album = celui de l'album s'il est classé, sinon celui
   de son artiste. Lecture LIVE (ADR-031), partagée via window.OrpheeArtists. */
(function () {
  "use strict";

  let map = new Map();   // artist → {genre, sousgenre}
  let loading = null;

  // Les siens, ou ceux d'Axel pour un invité (lecture seule, PM-28).
  function col() {
    const uid = window.OrpheeSession ? window.OrpheeSession.dataUid() : null;
    return uid ? firebase.firestore().collection(`users/${uid}/artist_genres`) : null;
  }

  async function load() {
    const c = col();
    if (!c) { map = new Map(); return; }
    const snap = await c.get();
    const next = new Map();
    snap.forEach((d) => {
      const x = d.data();
      if (x.artist && x.genre) next.set(x.artist, { genre: x.genre, sousgenre: x.sousgenre || "" });
    });
    map = next;
  }

  function ensure(force) {
    if (!loading || force) {
      loading = load().catch((err) => {
        console.error("[artists] classification non chargée :", err.message);
        loading = null;
      });
    }
    return loading;
  }

  // Écrit la classification d'un artiste (genre/sous-genre de R2, refdata.js).
  async function set(artist, genre, sousgenre) {
    const c = col();
    if (!c || !artist || !genre) throw new Error("classification invalide");
    await c.doc(encodeURIComponent(artist)).set({
      artist, genre, sousgenre: sousgenre || "", source: "axel",
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    });
    map.set(artist, { genre, sousgenre: sousgenre || "" });
    document.dispatchEvent(new CustomEvent("orphee:artist-classified", { detail: { artist } }));
  }

  // Genre effectif d'un album de la bibliothèque.
  function effective(a) {
    if (a && a.genre) return { genre: a.genre, sousgenre: a.sousgenre || "" };
    return (a && map.get(a.artist)) || { genre: "", sousgenre: "" };
  }

  window.OrpheeArtists = {
    ensure,
    set,
    effective,
    get: (artist) => map.get(artist) || null,
  };

  firebase.auth().onAuthStateChanged(() => {
    map = new Map();
    loading = null;
  });
})();
