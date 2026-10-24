"use strict";

/**
 * Charge la curation de l'utilisateur (notes, genres, coups de cœur) depuis
 * users/{uid}/grades/ et retourne une Map album_sur → curation.
 * L'import one-shot depuis la Sheet (import_v0, ADR-013) a déjà été exécuté ;
 * la Sheet Albums n'est plus lue (ADR-014).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @return {Promise<Map<string, Object>>}
 */
async function loadCuration(db, uid) {
  const gradesSnap = await db
      .collection("users").doc(uid)
      .collection("grades")
      .get();
  const byKey = new Map();
  gradesSnap.forEach((d) => byKey.set(d.id, d.data()));
  return byKey;
}

// ---- Classification d'artiste (MODELE E8, PM-21) --------------------------

/**
 * Id de document d'un artiste (un nom peut contenir « / », interdit dans un
 * id Firestore). Même règle côté client (artists.js).
 * @param {string} artist
 * @return {string}
 */
function artistDocId(artist) {
  return encodeURIComponent(String(artist));
}

/**
 * Classification d'artiste de l'utilisateur (users/{uid}/artist_genres).
 * L'app fait foi (l'import unique depuis l'onglet Artists de la Sheet a été
 * fait en v2.7.0 ; la Sheet n'est plus lue du tout, ADR-044).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @return {Promise<Map<string, {genre: string, sousgenre: string}>>}
 */
async function loadArtistGenres(db, uid) {
  const snap = await db.collection(`users/${uid}/artist_genres`).get();
  const map = new Map();
  snap.forEach((d) => {
    const x = d.data();
    if (x.artist && x.genre) {
      map.set(x.artist, {genre: x.genre, sousgenre: x.sousgenre || ""});
    }
  });
  return map;
}

exports.loadCuration = loadCuration;
exports.artistDocId = artistDocId;
exports.loadArtistGenres = loadArtistGenres;
