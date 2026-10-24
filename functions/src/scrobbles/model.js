"use strict";

/**
 * Écoutes (faits, IM-1) — forme et identité (ADR-034). Fonctions pures,
 * testées : normalisation d'une écoute Last.fm, clés *_sur à l'identique de
 * la Sheet, fusion idempotente, partition par année.
 */

/**
 * Clé d'album, à l'identique de la Sheet (IM-4) : `{artist}-{album}`.
 * @param {string} artist
 * @param {string} album
 * @return {string}
 */
function albumSur(artist, album) {
  return `${artist}-${album}`;
}

/**
 * Clé de titre, à l'identique de la Sheet : `{artist}-{album}-{track}`.
 * @param {string} artist
 * @param {string} album
 * @param {string} track
 * @return {string}
 */
function trackSur(artist, album, track) {
  return `${artist}-${album}-${track}`;
}

/**
 * Identité d'une écoute : (instant, titre joué).
 * @param {{uts: number, track_sur: string}} s
 * @return {string}
 */
function identity(s) {
  return `${s.uts}|${s.track_sur}`;
}

// Texte brut, NON rogné : la Sheet concatène les valeurs telles quelles, et
// une clé doit se recalculer à l'identique (un espace compte).
const text = (v) => (v === undefined || v === null ? "" : String(v));
const textOf = (v) => (v && typeof v === "object" ? text(v["#text"]) : text(v));

/**
 * Une ligne de user.getRecentTracks → écoute, ou null (« now playing » sans
 * date, ou ligne inexploitable).
 * @param {Object} t
 * @return {?Object}
 */
function fromLastfm(t) {
  if (!t || (t["@attr"] && t["@attr"].nowplaying === "true")) return null;
  const uts = parseInt(t.date && t.date.uts, 10);
  if (!Number.isFinite(uts) || uts <= 0) return null;
  const artist = textOf(t.artist);
  const album = textOf(t.album);
  const track = text(t.name);
  if (!artist.trim() || !track.trim()) return null;
  return {
    uts, artist, album, track,
    album_sur: albumSur(artist, album),
    track_sur: trackSur(artist, album, track),
  };
}

/**
 * @param {number} uts
 * @return {number} année UTC
 */
function yearOf(uts) {
  return new Date(uts * 1000).getUTCFullYear();
}

/**
 * @param {Array<Object>} list
 * @return {Map<number, Array<Object>>}
 */
function byYear(list) {
  const out = new Map();
  for (const s of list) {
    const y = yearOf(s.uts);
    if (!out.has(y)) out.set(y, []);
    out.get(y).push(s);
  }
  return out;
}

/**
 * Fusion idempotente (append-only) : ajoute les écoutes absentes, par
 * identité ; ne modifie ni ne retire jamais une écoute déjà là. Résultat
 * trié du plus récent au plus ancien.
 * @param {Array<Object>} existing
 * @param {Array<Object>} incoming
 * @return {{list: Array<Object>, added: number}}
 */
function merge(existing, incoming) {
  const seen = new Set(existing.map(identity));
  const list = existing.slice();
  let added = 0;
  for (const s of incoming) {
    const id = identity(s);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push(s);
    added++;
  }
  list.sort((a, b) => b.uts - a.uts);
  return {list, added};
}

exports.albumSur = albumSur;
exports.trackSur = trackSur;
exports.identity = identity;
exports.fromLastfm = fromLastfm;
exports.yearOf = yearOf;
exports.byYear = byYear;
exports.merge = merge;
