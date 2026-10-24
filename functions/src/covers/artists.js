"use strict";

/**
 * Images d'artistes (fiche artiste, PM-26) — même principe que les pochettes
 * (ADR-015) : résolues côté serveur via l'API publique Deezer (aucune clé),
 * mises en cache dans cache/agg_artist_images et réutilisées d'un refresh à
 * l'autre. Dérivé régénérable (IM-5) ; jamais une source.
 *
 * Correspondance STRICTE sur le nom (normalisé) : mieux vaut pas d'image
 * qu'une image d'un homonyme.
 */

const logger = require("firebase-functions/logger");

const SEARCH_URL = "https://api.deezer.com/search/artist";
const TOP_ARTISTS = 150;
const MAX_RESOLVE_PER_RUN = 150;
// Version des règles de choix : à chaque changement, tout est re-cherché
// une fois (v2 : homonymes départagés par nb_fan, silhouette d41d8…).
const RULES_VERSION = 3;
const ALBUM_SEARCH_URL = "https://api.deezer.com/search/album";
// Albums de l'artiste servant à le reconnaître (les plus écoutés d'abord).
const PROBE_ALBUMS = 2;
const REQUEST_SPACING_MS = 120;
const TIMEOUT_MS = 5000;
// Budget total par refresh : une panne de Deezer ne doit jamais faire
// dépasser le timeout de refreshCache (300 s).
const BUDGET_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} s
 * @return {string} nom comparable (minuscules, sans accents ni ponctuation)
 */
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Images par défaut de Deezer (silhouette grise) : URL sans empreinte
 * (« /images/artist//… ») ou empreinte d'un fichier vide
 * (d41d8cd98f00b204e9800998ecf8427e). Pas une photo : on les traite comme rien.
 * @param {?string} url
 * @return {boolean}
 */
function isPlaceholder(url) {
  return typeof url === "string" &&
    (/\/images\/artist\/\//.test(url) ||
      url.includes("d41d8cd98f00b204e9800998ecf8427e"));
}

/**
 * Parmi les résultats Deezer au nom exact et avec une vraie photo, le plus
 * suivi (nb_fan) : un homonyme obscur ne prend pas la place du bon artiste
 * (pure, testée).
 * @param {Array<Object>} results - data[] de /search/artist
 * @param {string} name
 * @return {?string} URL d'image, ou null
 */
function pickArtistImage(results, name) {
  const target = normName(name);
  if (!target) return null;
  let best = null;
  for (const r of results || []) {
    if (normName(r.name) !== target) continue;
    const url = r.picture_xl || r.picture_big || r.picture_medium || null;
    if (!url || isPlaceholder(url)) continue;
    const fans = Number(r.nb_fan) || 0;
    if (!best || fans > best.fans) best = {url, fans};
  }
  return best ? best.url : null;
}

/**
 * Photo de l'artiste d'un résultat de recherche d'ALBUM (pure, testée) :
 * l'album que tu écoutes désigne le bon artiste, là où le nom seul est
 * ambigu (plusieurs « Last Train », « Muse »…).
 * @param {Array<Object>} results - data[] de /search/album
 * @param {string} name
 * @return {?string}
 */
function pickArtistFromAlbums(results, name) {
  const target = normName(name);
  for (const r of results || []) {
    const a = r && r.artist;
    if (!a || normName(a.name) !== target) continue;
    const url = a.picture_xl || a.picture_big || a.picture_medium || null;
    if (url && !isPlaceholder(url)) return url;
  }
  return null;
}

/**
 * Albums les plus écoutés de chaque artiste (pure).
 * @param {Array<Object>} libAll
 * @return {Map<string, Array<string>>} artiste → titres
 */
function albumsByArtist(libAll) {
  const out = new Map();
  const sorted = libAll.slice().sort((x, y) =>
    (y.listen_count || 0) - (x.listen_count || 0));
  for (const a of sorted) {
    if (!a.artist || !a.album) continue;
    const list = out.get(a.artist) || [];
    if (list.length < PROBE_ALBUMS) list.push(a.album);
    out.set(a.artist, list);
  }
  return out;
}

/**
 * Artistes les plus écoutés de la bibliothèque (pure).
 * @param {Array<Object>} libAll
 * @param {number} n
 * @return {Array<string>}
 */
function topArtists(libAll, n = TOP_ARTISTS) {
  const totals = new Map();
  for (const a of libAll) {
    if (!a.artist) continue;
    totals.set(a.artist, (totals.get(a.artist) || 0) + (a.listen_count || 0));
  }
  return Array.from(totals.entries())
      .sort((x, y) => y[1] - x[1]).slice(0, n).map(([name]) => name);
}

/**
 * @param {string} url
 * @return {Promise<?Object|undefined>} JSON, ou undefined (échec réseau)
 */
async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: {Accept: "application/json"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    return await res.json();
  } catch (err) {
    logger.warn("deezer artist search failed", {message: err.message});
    return undefined;
  }
}

/**
 * Photo d'un artiste : d'abord via ses albums (sûr), sinon par son nom
 * (homonymes départagés par nb_fan).
 * @param {string} name
 * @param {Array<string>} albums - ses albums les plus écoutés
 * @return {Promise<?string|undefined>} URL ; null = introuvable (mémorisé) ;
 *   undefined = échec réseau (retenté au refresh suivant)
 */
async function resolveArtistImage(name, albums = []) {
  let failed = false;
  for (const album of albums) {
    const q = `artist:"${name}" album:"${album}"`;
    const json = await getJson(
        `${ALBUM_SEARCH_URL}?q=${encodeURIComponent(q)}`);
    if (json === undefined) {
      failed = true;
      continue;
    }
    const url = pickArtistFromAlbums(json && json.data, name);
    if (url) return url;
    await sleep(REQUEST_SPACING_MS);
  }
  const json = await getJson(
      `${SEARCH_URL}?q=${encodeURIComponent(`artist:"${name}"`)}`);
  if (json === undefined) return undefined;
  const url = pickArtistImage(json && json.data, name);
  return url || (failed ? undefined : null);
}

/**
 * Complète le cache d'images (au plus MAX_RESOLVE_PER_RUN nouvelles
 * résolutions par refresh ; le reste aux suivants).
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<Object>} libAll
 * @return {Promise<{images: Object<string, ?string>, rules_version: number}>}
 */
async function enrichArtistImages(db, libAll) {
  const snap = await db.doc("cache/agg_artist_images").get();
  const stale = !snap.exists || snap.data().rules_version !== RULES_VERSION;
  const prev = (snap.exists && snap.data().images) || {};
  // Règles changées : tout est re-cherché, mais une image déjà connue reste
  // affichée tant que son tour n'est pas venu (pas de visages qui
  // disparaissent entre deux refresh).
  const redo = new Set(stale ? Object.keys(prev) :
    (snap.exists && snap.data().redo) || []);
  const probes = albumsByArtist(libAll);
  const images = {};
  let resolved = 0;
  const deadline = Date.now() + BUDGET_MS;
  for (const name of topArtists(libAll)) {
    // Une silhouette mémorisée avant ce filtre est re-cherchée.
    const known = Object.prototype.hasOwnProperty.call(prev, name);
    if (known && !isPlaceholder(prev[name]) && !redo.has(name)) {
      images[name] = prev[name];
      continue;
    }
    if (resolved >= MAX_RESOLVE_PER_RUN || Date.now() > deadline) {
      if (known && !isPlaceholder(prev[name])) images[name] = prev[name];
      continue;
    }
    const url = await resolveArtistImage(name, probes.get(name) || []);
    redo.delete(name);
    if (url !== undefined) images[name] = url; // échec réseau : pas mémorisé
    else if (known) images[name] = prev[name];
    resolved++;
    await sleep(REQUEST_SPACING_MS);
  }
  logger.info("artist images", {
    known: Object.keys(images).length, resolved,
  });
  return {images, rules_version: RULES_VERSION, redo: Array.from(redo)};
}

exports.normName = normName;
exports.isPlaceholder = isPlaceholder;
exports.pickArtistImage = pickArtistImage;
exports.pickArtistFromAlbums = pickArtistFromAlbums;
exports.albumsByArtist = albumsByArtist;
exports.topArtists = topArtists;
exports.enrichArtistImages = enrichArtistImages;
