"use strict";

/**
 * Album de référence d'un titre (v2.21.0, PM-29) : Last.fm track.getInfo,
 * pour les écoutes au libellé d'album suspect (vide, « - Single », nom du
 * titre). Dérivé régénérable, mis en cache sur Storage
 * (`derived/track_albums.json.gz`, fermé aux clients) ; résolu par lots à
 * chaque « Actualiser », les titres les plus écoutés d'abord.
 */

const zlib = require("node:zlib");
const logger = require("firebase-functions/logger");
const {getStorage} = require("firebase-admin/storage");
const {fold, isSuspect, SUFFIX} = require("./canon");

const API = "https://ws.audioscrobbler.com/2.0/";
const FILE = "derived/track_albums.json.gz";
const TIMEOUT_MS = 5000;
const RETRY_AFTER_S = 30 * 86400;
const TIME_BUDGET_MS = 45000;
const CONCURRENCY = 4;

/**
 * Album d'une réponse track.getInfo, s'il est fiable (pure, testée) : même
 * artiste (pas une compilation), et pas lui-même un single du titre.
 * @param {Object} json
 * @param {string} artist
 * @param {string} track
 * @return {?string}
 */
function pickTrackAlbum(json, artist, track) {
  const a = json && json.track && json.track.album;
  const title = a && typeof a.title === "string" ? a.title.trim() : "";
  if (!title) return null;
  if (a.artist && fold(a.artist) !== fold(artist)) return null;
  if (SUFFIX.test(title) || isSuspect(title, track)) return null;
  return title;
}

/**
 * Titres à résoudre (pure, testée) : suspects, pas encore en cache (ou
 * « inconnu » depuis plus de 30 jours), les plus écoutés d'abord.
 * @param {Array<Object>} scrobbles
 * @param {Object<string, Array>} cache - track_sur → [album|null, uts]
 * @param {number} now - secondes
 * @return {Array<{track_sur: string, artist: string, track: string}>}
 */
function pendingTracks(scrobbles, cache, now) {
  const counts = new Map();
  for (const s of scrobbles) {
    if (!s.track_sur || !s.track || !isSuspect(s.album, s.track)) continue;
    const hit = cache[s.track_sur];
    if (hit && (hit[0] || now - hit[1] < RETRY_AFTER_S)) continue;
    const c = counts.get(s.track_sur);
    if (c) {
      c.n += 1;
    } else {
      counts.set(s.track_sur, {track_sur: s.track_sur, artist: s.artist,
        track: s.track, n: 1});
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.n - a.n)
      .map((c) => ({track_sur: c.track_sur, artist: c.artist,
        track: c.track}));
}

/**
 * @param {string} artist
 * @param {string} track
 * @param {string} apiKey
 * @return {Promise<?string|undefined>} undefined si le réseau a échoué
 *   (rien n'est mis en cache)
 */
async function lookup(artist, track, apiKey) {
  const url = new URL(API);
  url.search = new URLSearchParams({method: "track.getinfo", artist, track,
    api_key: apiKey, format: "json", autocorrect: "1"}).toString();
  try {
    const res = await fetch(url.toString(), {
      headers: {"User-Agent": "Orphee/1.0 (usage personnel)"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return res.status === 404 ? null : undefined;
    return pickTrackAlbum(await res.json(), artist, track);
  } catch (err) {
    return undefined;
  }
}

const file = () => getStorage().bucket().file(FILE);

/**
 * @return {Promise<Object<string, Array>>}
 */
async function readCache() {
  const [exists] = await file().exists();
  if (!exists) return {};
  const [buf] = await file().download();
  try {
    return JSON.parse(zlib.gunzipSync(buf).toString("utf8")).entries || {};
  } catch (err) {
    return {};
  }
}

/**
 * Résout un lot de titres suspects (si une clé est fournie) et renvoie la
 * table complète track_sur → album de référence.
 * @param {Array<Object>} scrobbles
 * @param {?string} apiKey - null : pas de réseau (émulateur, export)
 * @return {Promise<{resolved: Map<string, string>, pending: number,
 *   looked: number, cache: Object<string, Array>}>} cache : table brute
 *   (album ou null « inconnu », date), pour le diagnostic de l'export
 */
async function trackAlbums(scrobbles, apiKey) {
  const cache = await readCache();
  const now = Math.floor(Date.now() / 1000);
  const todo = pendingTracks(scrobbles, cache, now);
  let looked = 0;
  if (apiKey && todo.length) {
    const t0 = Date.now();
    let i = 0;
    const worker = async () => {
      while (i < todo.length && Date.now() - t0 < TIME_BUDGET_MS) {
        const t = todo[i++];
        const album = await lookup(t.artist, t.track, apiKey);
        if (album === undefined) continue;
        cache[t.track_sur] = [album, now];
        looked += 1;
      }
    };
    await Promise.all(Array.from({length: CONCURRENCY}, worker));
    if (looked) {
      await file().save(zlib.gzipSync(Buffer.from(
          JSON.stringify({version: 1, entries: cache}), "utf8")),
      {resumable: false, contentType: "application/gzip"});
    }
    logger.info("trackAlbums", {looked, pending: todo.length - looked});
  }
  const resolved = new Map();
  for (const [k, v] of Object.entries(cache)) if (v[0]) resolved.set(k, v[0]);
  return {resolved, pending: Math.max(0, todo.length - looked), looked,
    cache};
}

exports.pickTrackAlbum = pickTrackAlbum;
exports.pendingTracks = pendingTracks;
exports.trackAlbums = trackAlbums;
