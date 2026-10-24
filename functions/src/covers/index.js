"use strict";

const logger = require("firebase-functions/logger");
const {Timestamp} = require("firebase-admin/firestore");

const {resolveCover} = require("./deezer");
const {resolveLastfmCover} = require("./lastfm");

const COLLECTION = "covers";
// Overrides manuels : album_sur → URL hébergée dans public/ (Firebase
// Hosting). Pour les albums absents de Deezer. Appliqués en priorité,
// source:"manual", jamais écrasés par une résolution Deezer (ADR-015).
const MANUAL_OVERRIDES = {
  "Axel Mercier-":
    "https://orphee-e7377.web.app/img/covers/chronicle-of-the-chained.jpg",
};
const BATCH_LIMIT = 450;
// Cap de résolutions Deezer par run pour rester sous le timeout 300s.
// Le reste est résolu aux refresh suivants (le cache persiste).
const MAX_RESOLVE_PER_RUN = 200;
// Un album introuvable est re-cherché au bout de ce délai (Deezer et
// Last.fm s'enrichissent, et les règles de recherche aussi).
const RETRY_DAYS = 30;
// Espacement entre requêtes Deezer (~8 req/s, sous la limite 50 req/5s).
const REQUEST_SPACING_MS = 120;
// album_sur contenant "/" = id de doc invalide (cf. writeAlbumStats).
const isValidId = (id) => id && !id.includes("/");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Charge la collection covers existante en map album_sur → {url, source,
 * not_found}.
 * @param {FirebaseFirestore.Firestore} db
 * @return {Promise<Map<string, Object>>}
 */
async function loadCovers(db) {
  const snap = await db.collection(COLLECTION).get();
  const map = new Map();
  snap.forEach((doc) => map.set(doc.id, doc.data()));
  return map;
}

/**
 * Écrit les nouveaux docs covers par batch.
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<[string, Object]>} entries - [album_sur, data]
 * @return {Promise<void>}
 */
async function writeCovers(db, entries) {
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const [id, data] of entries.slice(i, i + BATCH_LIMIT)) {
      batch.set(db.collection(COLLECTION).doc(id), data);
    }
    await batch.commit();
  }
}

/**
 * Résout et cache les pochettes pour le set d'albums gradeables, puis
 * renvoie une map album_sur → url (URL résolue uniquement). Respecte les
 * entrées manuelles (jamais écrasées) et le cache (un album déjà cherché,
 * trouvé ou non, n'est pas re-sollicité).
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<Object>} libAll - items {album_sur, artist, album, ...}
 * @param {Set<string>} gradeableSet - album_sur à résoudre
 * @param {?string} [lastfmKey] - clé Last.fm (seconde source)
 * @return {Promise<Map<string, string>>} album_sur → url
 */
async function enrichCovers(db, libAll, gradeableSet, lastfmKey) {
  const cache = await loadCovers(db);
  const byKey = new Map();
  for (const a of libAll) byKey.set(a.album_sur, a);

  const newEntries = [];

  // Overrides manuels : posés en priorité, écrits si absents/changés du
  // cache. Toujours dans le set final même hors gradeable.
  for (const [key, url] of Object.entries(MANUAL_OVERRIDES)) {
    if (!isValidId(key)) continue;
    if (!byKey.has(key)) continue; // album absent de la bibliothèque
    const cur = cache.get(key);
    const entry = {
      url, source: "manual", not_found: false, resolved_at: Timestamp.now(),
    };
    cache.set(key, entry);
    if (!cur || cur.source !== "manual" || cur.url !== url) {
      newEntries.push([key, entry]);
    }
  }

  const toResolve = [];
  for (const key of gradeableSet) {
    if (!isValidId(key)) continue;
    const c = cache.get(key);
    // Déjà résolu / manuel ; un introuvable est retenté après RETRY_DAYS.
    if (c && !(c.not_found && c.resolved_at &&
      Date.now() - c.resolved_at.toMillis() > RETRY_DAYS * 86400000)) {
      continue;
    }
    if (!byKey.has(key)) continue;
    toResolve.push(key);
  }

  let resolved = 0;
  let found = 0;
  for (const key of toResolve) {
    if (resolved >= MAX_RESOLVE_PER_RUN) break;
    const a = byKey.get(key);
    // Deezer (1000 px) d'abord, Last.fm en secours.
    let source = "deezer";
    let url = await resolveCover(a.artist, a.album);
    if (!url && lastfmKey) {
      url = await resolveLastfmCover(a.artist, a.album, lastfmKey);
      if (url) source = "lastfm";
    }
    resolved++;
    if (url) found++;
    newEntries.push([key, {
      url: url || null,
      source,
      not_found: !url,
      resolved_at: Timestamp.now(),
    }]);
    if (resolved < toResolve.length) await sleep(REQUEST_SPACING_MS);
  }

  if (newEntries.length > 0) await writeCovers(db, newEntries);

  // Map finale : cache existant + nouveaux, URL non-nulles uniquement.
  for (const [key, data] of newEntries) cache.set(key, data);
  const urls = new Map();
  for (const [key, data] of cache) {
    if (data && data.url) urls.set(key, data.url);
  }

  logger.info("covers enriched", {
    cached: cache.size - newEntries.length,
    resolved,
    found,
    pending: toResolve.length - resolved,
    with_url: urls.size,
  });

  return urls;
}

exports.enrichCovers = enrichCovers;
