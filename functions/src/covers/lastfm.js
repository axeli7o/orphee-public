"use strict";

/**
 * Pochette via Last.fm (album.getInfo, clé LASTFM_API_KEY) : seconde source
 * quand Deezer ne trouve pas. Last.fm connaît presque tout ce qui a été
 * scrobblé. Son image par défaut (étoile grise) ne compte pas.
 */

const logger = require("firebase-functions/logger");

const API = "https://ws.audioscrobbler.com/2.0/";
const TIMEOUT_MS = 5000;
const PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";
const SIZES = ["mega", "extralarge", "large"];

/**
 * Meilleure image d'une réponse album.getInfo (pure, testée).
 * @param {Object} json
 * @return {?string}
 */
function pickImage(json) {
  const imgs = (json && json.album && json.album.image) || [];
  for (const size of SIZES) {
    const hit = imgs.find((i) => i && i.size === size);
    const url = hit && hit["#text"];
    if (url && /^https:\/\//.test(url) && !url.includes(PLACEHOLDER)) {
      return url;
    }
  }
  return null;
}

/**
 * @param {string} artist
 * @param {string} album
 * @param {string} apiKey
 * @return {Promise<?string>}
 */
async function resolveLastfmCover(artist, album, apiKey) {
  if (!apiKey || !artist || !album) return null;
  const url = new URL(API);
  url.search = new URLSearchParams({
    method: "album.getinfo", artist, album, api_key: apiKey,
    format: "json", autocorrect: "1",
  }).toString();
  try {
    const res = await fetch(url.toString(), {
      headers: {"User-Agent": "Orphee/1.0 (usage personnel)"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return pickImage(await res.json());
  } catch (err) {
    logger.warn("lastfm cover failed", {message: err.message});
    return null;
  }
}

exports.pickImage = pickImage;
exports.resolveLastfmCover = resolveLastfmCover;
