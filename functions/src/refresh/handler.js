"use strict";

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {requireOwner} = require("../lib/owner");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const scrobbleStore = require("../scrobbles/store");
const {
  buildGlobal,
  buildTopArtists,
  buildTopAlbums,
  buildLibrary,
  libraryCard,
  buildStats,
  buildAlbumStats,
  buildEcho,
  buildOddities,
  buildUnratedTop,
  buildCommuting,
  buildOneTrack,
  buildPortrait,
  buildDays,
} = require("./aggregates");
const {loadCuration, loadArtistGenres} = require("./curation");
const {buildQuarters} = require("./quarters");
const {buildRecent} = require("./selection");
const {buildAsideDays, loadAside} = require("./aside");
const {writeCache, writeAlbumStats} = require("../lib/firestore");
const {enrichCovers} = require("../covers");
const {enrichArtistImages} = require("../covers/artists");
const {applyCanon} = require("../albums");
const {refreshQuality} = require("../quality");
const {albumNature} = require("../quality/model");
const {readMbCache} = require("../quality/store");
const {buildMoiSlice, keysIn} = require("./moi");
const {buildArtists, buildClusters} = require("./artists");

if (getApps().length === 0) {
  initializeApp();
}

// Seconde source de pochettes (Last.fm album.getInfo).
const lastfmKey = defineSecret("LASTFM_API_KEY");
const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";
const LIBRARY_CHUNK_SIZE = 1000;
// Fiche riche (album_stats) calculée pour : noté OU ≥ ce nombre d'écoutes.
const ALBUM_STATS_MIN_LISTENS = 10;
// Libellés bruts montrés sur la fiche d'un album canonique.
const VARIANTS_MAX = 12;

exports.refreshCache = onCall(
    {
      region: "europe-west1",
      serviceAccount: SERVICE_ACCOUNT,
      secrets: [lastfmKey],
      timeoutSeconds: 300,
      memory: "512MiB",
    },
    async (request) => {
      // Réservé au propriétaire (ADR-041).
      await requireOwner(request, getFirestore());

      const t0 = Date.now();
      logger.info("refreshCache start", {uid: request.auth.uid});

      const db = getFirestore();
      // Écoutes : Cloud Storage, alimenté par la synchro Last.fm (ADR-034).
      // La Sheet n'est plus lue du tout (ADR-044).
      const meta = await scrobbleStore.readMeta(db);
      if (!meta || meta.source !== "storage") {
        throw new HttpsError("failed-precondition",
            "Aucune écoute en mémoire : synchronise Last.fm d'abord.");
      }
      const rawScrobbles = await scrobbleStore.readAll(meta);

      // Curation (notes/genres) = Firestore. Albums dérivés des scrobbles
      // (ADR-014). Le seed one-shot import_v0 (ADR-013) a déjà été exécuté.
      const curationByKey = await loadCuration(db, request.auth.uid);
      // Album canonique (PM-29) : les écoutes brutes ne changent pas ; tous
      // les calculs portent sur l'album de référence.
      const canon = await applyCanon(db, request.auth.uid, rawScrobbles,
          curationByKey,
          process.env.FUNCTIONS_EMULATOR === "true" ? null : lastfmKey.value());
      const scrobbles = canon.scrobbles;
      // Onglet Qualité (PM-31) : propositions recalculées en parallèle.
      const qualityDone = readMbCache()
          .then((c) => refreshQuality(db, scrobbles, c))
          .catch((err) => logger.error("refreshCache: qualité", err));
      const {all: libAll, curated: libCurated} = buildLibrary(
          scrobbles,
          curationByKey,
      );
      for (const a of libAll) {
        const v = canon.variants.get(a.album_sur);
        if (v) a.variants = v.slice(0, VARIANTS_MAX);
      }

      logger.info("scrobbles read", {
        scrobbles: scrobbles.length,
        albums: libAll.length,
        curated: curationByKey.size,
        ms: Date.now() - t0,
      });

      const lastRefresh = Timestamp.now();
      const aggGlobal = buildGlobal({
        scrobbles,
        albums: libAll,
        lastRefresh,
      });
      const aggTopArtists = buildTopArtists(scrobbles);

      // Oddity + non notés : lire les settings utilisateur (defaults si absent)
      const odditySnap = await db
          .doc(`users/${request.auth.uid}/settings/oddity`)
          .get();
      const odditySettings = odditySnap.exists ? odditySnap.data() : null;
      const profileSnap = await db
          .doc(`users/${request.auth.uid}/settings/profile`)
          .get();
      const artistName = profileSnap.exists ?
        String(profileSnap.data().artist_name || "") : "";
      const aggOddities = buildOddities(libAll, odditySettings);
      aggGlobal.albums_above_threshold = aggOddities.albums_above_threshold;
      aggGlobal.graded_above_threshold = aggOddities.graded_above_threshold;
      // Album canonique (PM-29) : titres restant à rattacher, montrés dans
      // Réglages › Synchronisation.
      aggGlobal.canon_pending = canon.pending;
      aggGlobal.canon_merged = canon.variants.size;
      const aggUnratedTop = buildUnratedTop(libAll);

      // Fiches riches par album (set restreint : noté OU très écouté).
      const identityByKey = new Map();
      for (const a of libAll) {
        identityByKey.set(a.album_sur, {artist: a.artist, album: a.album});
      }
      const albumStatsSet = new Set();
      for (const a of libAll) {
        if (a.grade !== null || a.listen_count >= ALBUM_STATS_MIN_LISTENS) {
          albumStatsSet.add(a.album_sur);
        }
      }

      // Pochettes : résolues via Deezer pour le set gradeable, cachées dans
      // la collection covers (ADR-015). On enrichit libAll.cover_url avant
      // l'écriture des chunks ; le frontend (covers.js) le consomme tel quel.
      // Pochettes : tout ce que l'app montre — fiches riches + albums « très
      // écoutés » des bacs (seuil Oddity, qui peut être sous 10 écoutes).
      const coverSet = new Set(albumStatsSet);
      for (const a of libAll) {
        if (aggOddities.threshold && a.listen_count >= aggOddities.threshold) {
          coverSet.add(a.album_sur);
        }
      }
      const coverUrls = await enrichCovers(db, libAll, coverSet,
          process.env.FUNCTIONS_EMULATOR === "true" ? null : lastfmKey.value());
      for (const a of libAll) {
        const url = coverUrls.get(a.album_sur);
        if (url) a.cover_url = url;
      }
      // buildTopAlbums + buildStats après enrichCovers pour que l'album du
      // créneau (listens_per_year/by_month/by_weekday[].top) ait sa cover_url.
      const aggTopAlbums = buildTopAlbums(scrobbles, libAll);
      const aggStats = buildStats(scrobbles, libAll);
      const albumStats = buildAlbumStats(
          scrobbles, albumStatsSet, identityByKey,
      );
      const echoByKey = buildEcho(scrobbles, albumStatsSet, identityByKey);
      for (const [key, doc] of albumStats) {
        const e = echoByKey.get(key) || {ref: 0, items: []};
        doc.echo = e.items;
        doc.echo_ref = e.ref;
      }

      // Trimestres & humeurs (v3, PM-19) — après enrichCovers (cover_url).
      // Classification d'artiste (E8) : importée une fois depuis la Sheet,
      // puis l'app fait foi. Genre effectif = album, sinon artiste.
      const artistGenres =
        await loadArtistGenres(db, request.auth.uid);
      // Commuting + signatures de créneau (PM-18, ADR-050) : genre effectif.
      const aggCommuting = buildCommuting(scrobbles, libAll, artistGenres);
      const aggQuarters = buildQuarters(scrobbles, libAll, artistGenres);
      // Répartition des humeurs : sert à calibrer les seuils sur la vraie
      // bibliothèque (quarters.js, MOOD_RULES).
      const moodCount = {};
      for (const q of aggQuarters.items) {
        const k = q.mood || "aucune:" + q.mood_reason;
        moodCount[k] = (moodCount[k] || 0) + 1;
      }
      logger.info("quarters moods", moodCount);

      // Singles, faces B, remix, lives : « À part » sur la fiche artiste
      // (v2.36.0), d'après les propositions Qualité.
      const quality = await qualityDone;
      if (quality) {
        const nat = albumNature(libAll, quality.items);
        for (const a of libAll) {
          if (nat.has(a.album_sur)) a.nature = nat.get(a.album_sur);
        }
      }

      // « Moi » préparé d'avance (v2.38.0, ADR-049) : aussi recalculé à
      // chaque geste de curation (onCurationWritten).
      const aggRecent = buildRecent(scrobbles, libAll, artistGenres);
      // « Ces jours-ci » (PM-39, ADR-050) — après enrichCovers (cover_url).
      const aggDays = buildDays(scrobbles, libAll, artistGenres);
      const aggOneTrack = buildOneTrack(albumStats, libAll);
      const aside = await loadAside(db, request.auth.uid);
      const moiKeys = keysIn([aggRecent, aggQuarters, aggOneTrack]);
      for (const k of aside.keys()) moiKeys.add(k);

      const docs = {
        "agg_global": aggGlobal,
        "agg_top_artists_alltime": aggTopArtists,
        "agg_top_albums_alltime": aggTopAlbums,
        "agg_stats": aggStats,
        "agg_library_curated": {items: libCurated},
        "agg_oddities": aggOddities,
        "agg_unrated_top": aggUnratedTop,
        "agg_commuting": aggCommuting,
        "agg_quarters": aggQuarters,
        // Portrait de « Moi », premier jet (v2.37.0, ADR-048).
        "agg_portrait": buildPortrait(libAll, artistGenres),
        // « Un seul titre » (v2.34.0) : albums tenus par un titre.
        "agg_one_track": aggOneTrack,
        "agg_moi": buildMoiSlice(libAll, artistGenres, aggOddities, moiKeys),
        // Vue « Artistes » (v2.40.0, PM-37) : récits et « Souvent avec ».
        // « Ta musique » (v2.42.0) : le nom d'artiste d'Axel, s'il en a un.
        "agg_artists": buildArtists(scrobbles, artistName),
        // « Tes mondes » (PM-40, ADR-052) : clusters d'artistes enchaînés
        // ensemble (Louvain sur la co-écoute), archipel depuis la fiche.
        "agg_clusters": buildClusters(scrobbles),
        // Images des artistes les plus écoutés (fiche artiste, PM-26).
        "agg_artist_images": await enrichArtistImages(db, libAll),
        // Matière de « À qualifier » + netteté (PM-22/23, selection.js).
        "agg_recent": aggRecent,
        // « Ces jours-ci » (PM-39, ADR-050) : accroche en tête de « Moi ».
        "agg_days": aggDays,
      };

      const chunkCount = Math.ceil(libAll.length / LIBRARY_CHUNK_SIZE);
      docs["agg_library_all_meta"] = {
        count: libAll.length,
        chunk_count: chunkCount,
        chunk_size: LIBRARY_CHUNK_SIZE,
      };
      for (let i = 0; i < chunkCount; i++) {
        docs[`agg_library_all_${i}`] = {
          // Cartes SANS curation (ADR-031) : la curation est lue live à sa
          // source (front applyCuration / Orphée curation-overlay), jamais ici.
          items: libAll
              .slice(i * LIBRARY_CHUNK_SIZE, (i + 1) * LIBRARY_CHUNK_SIZE)
              .map(libraryCard),
        };
      }

      await writeCache(db, docs);
      // Pile « Mis de côté » (E11, PM-35/36) : jours d'écoute depuis la mise
      // de côté. Lu par le propriétaire seul (l'invité ne voit pas la pile).
      await db.doc("private/aside").set({
        items: buildAsideDays(scrobbles, aside),
        computed_at: lastRefresh,
      });
      const albumStatsWritten = await writeAlbumStats(db, albumStats);

      logger.info("refreshCache done", {
        total_listens: aggGlobal.total_listens,
        total_albums: aggGlobal.total_albums,
        graded_albums: aggGlobal.graded_albums,
        library_all: libAll.length,
        library_curated: libCurated.length,
        album_stats: albumStatsWritten,
        chunks: chunkCount,
        canon_merged: canon.variants.size,
        canon_pending: canon.pending,
        ms: Date.now() - t0,
      });

      return {
        total_listens: aggGlobal.total_listens,
        total_albums: aggGlobal.total_albums,
        graded_albums: aggGlobal.graded_albums,
        library_all: libAll.length,
        library_curated: libCurated.length,
        canon_pending: canon.pending,
        last_refresh: lastRefresh.toDate().toISOString(),
      };
    },
);
