"use strict";

/**
 * « Moi » préparé d'avance (v2.38.0, ADR-049) : tout ce que l'écran d'accueil
 * lit de la bibliothèque, réduit à ce qu'il peut montrer, AVEC la curation.
 * Recalculé à la synchro (refreshCache) et à chaque geste de curation
 * (onCurationWritten) — jamais à l'affichage. Dérivé (IM-5) : la curation
 * reste lue à sa source pour sa valeur courante (ADR-031).
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {withCuration, buildPortrait, buildOddities} = require("./aggregates");
const {loadCuration, loadArtistGenres} = require("./curation");
const {loadAside} = require("./aside");
const {writeCache} = require("../lib/firestore");

if (getApps().length === 0) initializeApp();

// Au-delà, un album compte pour « Moi » même sans note (classer un artiste,
// trimestres) ; les autres n'y paraissent que notés ou cités ailleurs.
const MOI_MIN_LISTENS = 20;
// Curation qui change « Moi » : notes et genres d'album, genres d'artiste,
// pile « Mis de côté », réglages des paradoxes.
const WATCHED = new Set(["grades", "artist_genres", "aside", "settings"]);
// « Classer un artiste » (moi.js, CZ_TOP_ARTISTS) : parmi les plus écoutés.
const CZ_TOP_ARTISTS = 150;

/**
 * Tous les album_sur cités dans des agrégats (trimestres, « À faire »,
 * « Un seul titre »…) : leurs albums doivent être dans la tranche.
 * @param {*} x
 * @param {Set<string>} out
 * @return {Set<string>}
 */
function keysIn(x, out = new Set()) {
  if (Array.isArray(x)) {
    for (const y of x) keysIn(y, out);
  } else if (x && typeof x === "object") {
    if (typeof x.album_sur === "string") out.add(x.album_sur);
    for (const y of Object.values(x)) keysIn(y, out);
  }
  return out;
}

/**
 * Tranche de la bibliothèque pour « Moi » (pure, testée) : albums notés ou
 * coups de cœur, ≥ MOI_MIN_LISTENS écoutes, ou cités par un agrégat ; leurs
 * artistes classés ; les réglages et le seuil des paradoxes. Sans les
 * descriptions (l'invité lit le cache, IM-8).
 * @param {Array<Object>} libAll - albums avec curation (withCuration)
 * @param {Map<string, Object>} artistGenres
 * @param {Object} oddities - buildOddities()
 * @param {Set<string>} keys - album_sur cités ailleurs
 * @return {{items: Array<Object>, artists: Object, classify: Array<Object>,
 *   oddity: Object}}
 */
function buildMoiSlice(libAll, artistGenres, oddities, keys) {
  const items = libAll
      .filter((a) => a.grade !== null || a.personal_fav ||
        a.listen_count >= MOI_MIN_LISTENS || keys.has(a.album_sur))
      .map((a) => ({
        album_sur: a.album_sur, artist: a.artist, album: a.album,
        listen_count: a.listen_count, first_listen_y: a.first_listen_y || null,
        cover_url: a.cover_url || null, grade: a.grade,
        personal_fav: a.personal_fav, genre: a.genre, sousgenre: a.sousgenre,
      }));
  const artists = {};
  for (const a of items) {
    const g = artistGenres.get(a.artist);
    if (g) artists[a.artist] = g;
  }
  // « Classer un artiste » sur la bibliothèque ENTIÈRE (moi.js,
  // artistCandidates) : la tranche n'a pas les petits albums, son classement
  // différerait. Même règle : top 150 par écoutes, non classé, au moins un
  // album sans genre ; ses deux albums les plus écoutés pour la carte.
  const totals = new Map();
  for (const a of libAll) {
    if (!a.artist) continue;
    totals.set(a.artist, (totals.get(a.artist) || 0) + a.listen_count);
  }
  const classify = Array.from(totals.entries())
      .sort((x, y) => y[1] - x[1]).slice(0, CZ_TOP_ARTISTS)
      .filter(([artist]) => !artistGenres.get(artist) &&
        libAll.some((a) => a.artist === artist && !a.genre))
      .map(([artist, listens]) => ({artist, listens,
        tops: libAll.filter((a) => a.artist === artist)
            .sort((x, y) => y.listen_count - x.listen_count).slice(0, 2)
            .map((a) => a.album)}));
  return {items, artists, classify, oddity: {threshold: oddities.threshold,
    percentile: oddities.percentile, eligible: oddities.eligible,
    gradeable: oddities.albums_above_threshold}};
}

/**
 * Recalcule ce qui dépend de la curation (portrait, paradoxes, tranche de
 * « Moi ») depuis la bibliothèque déjà calculée — sans Last.fm ni
 * MusicBrainz : une à deux secondes.
 * @param {Object} db - Firestore
 * @param {string} uid
 * @return {Promise<void>}
 */
async function recomputeMoi(db, uid) {
  const get = (id) => db.doc(`cache/${id}`).get()
      .then((s) => (s.exists ? s.data() : null));
  const meta = await get("agg_library_all_meta");
  if (!meta) return; // jamais actualisé : rien à recalculer
  const chunks = await Promise.all(Array.from({length: meta.chunk_count || 0},
      (_, i) => get(`agg_library_all_${i}`)));
  const [curation, artistGenres, settings, aside, recent, quarters, one] =
    await Promise.all([loadCuration(db, uid), loadArtistGenres(db, uid),
      db.doc(`users/${uid}/settings/oddity`).get()
          .then((s) => (s.exists ? s.data() : null)),
      loadAside(db, uid), get("agg_recent"), get("agg_quarters"),
      get("agg_one_track")]);
  const libAll = chunks.flatMap((c) => (c && c.items) || [])
      .map((card) => withCuration(card, curation.get(card.album_sur) || {}));
  const oddities = buildOddities(libAll, settings);
  const keys = keysIn([recent, quarters, one]);
  for (const k of aside.keys()) keys.add(k);
  await writeCache(db, {
    agg_portrait: buildPortrait(libAll, artistGenres),
    agg_oddities: oddities,
    agg_moi: buildMoiSlice(libAll, artistGenres, oddities, keys),
  });
}

// Un geste de curation → « Moi » recalculé. Pas un cron (ADR-005) : il ne
// part que d'une écriture d'Axel.
// ponytail: un recalcul par écriture ; regrouper si des lots de notes
// deviennent fréquents.
exports.onCurationWritten = onDocumentWritten({
  document: "users/{uid}/{col}/{id}",
  region: "europe-west1",
  serviceAccount: "orphee-e7377@appspot.gserviceaccount.com",
  memory: "512MiB",
}, async (event) => {
  const {uid, col, id} = event.params;
  if (!WATCHED.has(col) || (col === "settings" && id !== "oddity")) return;
  const t0 = Date.now();
  await recomputeMoi(getFirestore(), uid);
  logger.info("onCurationWritten", {col, ms: Date.now() - t0});
});

exports.MOI_MIN_LISTENS = MOI_MIN_LISTENS;
exports.keysIn = keysIn;
exports.buildMoiSlice = buildMoiSlice;
exports.recomputeMoi = recomputeMoi;
