"use strict";

const logger = require("firebase-functions/logger");

const SEARCH_URL = "https://api.deezer.com/search/album";
const TIMEOUT_MS = 5000;

// Mentions d'édition qui font échouer une recherche stricte :
// « Sanctuary (Deluxe Edition) », « Hollow - EP », « X [Remastered 2011] ».
const EDITION = new RegExp(
    "\\s*[\\(\\[][^\\)\\]]*(deluxe|edition|édition|remaster|version|" +
    "anniversary|expanded|bonus|live|mono|stereo)[^\\)\\]]*[\\)\\]]\\s*",
    "gi");
const SUFFIX = /\s+-\s+(ep|single|deluxe|remastered.*|.*version)$/i;

/**
 * Titre sans mentions d'édition (pure, testée).
 * @param {string} title
 * @return {string}
 */
function cleanTitle(title) {
  return String(title || "").replace(EDITION, " ").replace(SUFFIX, "")
      .replace(/\s{2,}/g, " ").trim();
}

/**
 * @param {string} q - requête Deezer avancée
 * @return {Promise<?string>} cover_xl du premier résultat
 */
async function search(q) {
  try {
    const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, {
      headers: {Accept: "application/json"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn("deezer search non-ok", {status: res.status});
      return null;
    }
    const json = await res.json();
    const first = json && Array.isArray(json.data) ? json.data[0] : null;
    if (!first) return null;
    return first.cover_xl || first.cover_big || first.cover_medium || null;
  } catch (err) {
    logger.warn("deezer search failed", {message: err.message});
    return null;
  }
}

/**
 * Pochette via l'API publique Deezer (aucune clé) : titre exact, puis titre
 * sans mention d'édition.
 * @param {string} artist
 * @param {string} album
 * @return {Promise<string|null>}
 */
async function resolveCover(artist, album) {
  const a = (artist || "").trim();
  const t = (album || "").trim();
  if (!a || !t) return null;
  const exact = await search(`artist:"${a}" album:"${t}"`);
  if (exact) return exact;
  const c = cleanTitle(t);
  if (c && c !== t) return search(`artist:"${a}" album:"${c}"`);
  return null;
}

exports.resolveCover = resolveCover;
exports.cleanTitle = cleanTitle;
