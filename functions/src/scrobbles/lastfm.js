"use strict";

/**
 * Last.fm, lecture seule (ADR-034) : user.getRecentTracks sur une fenêtre
 * FIGÉE (from, to], toutes les pages, ≤ 5 requêtes/s. Tout-ou-rien : une
 * page en échec fait échouer la fenêtre entière (le curseur n'avance pas).
 */

const API = "https://ws.audioscrobbler.com/2.0/";
const PAGE_SIZE = 200;
const SPACING_MS = 250; // ≤ 5 req/s, avec de la marge
const TIMEOUT_MS = 10000;
const MAX_PAGES = 500; // garde-fou : 100 000 écoutes par synchro
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const {fromLastfm} = require("./model");

/**
 * @param {Object} o
 * @param {string} o.user
 * @param {string} o.apiKey
 * @param {number} o.from - uts exclu (dernière écoute connue)
 * @param {number} o.to - uts inclus (instant du clic)
 * @param {Function} [o.fetchImpl] - pour les tests
 * @return {Promise<Array<Object>>} écoutes normalisées
 */
async function fetchWindow({user, apiKey, from, to, fetchImpl}) {
  const doFetch = fetchImpl || fetch;
  const out = [];
  let page = 1;
  let pages = 1;
  do {
    const url = new URL(API);
    url.search = new URLSearchParams({
      method: "user.getrecenttracks", user, api_key: apiKey, format: "json",
      limit: String(PAGE_SIZE), page: String(page),
      // Last.fm : from et to inclusifs → from + 1 pour exclure le connu.
      from: String(from + 1), to: String(to),
    }).toString();
    const res = await doFetch(url.toString(), {
      headers: {"User-Agent": "Orphee/1.0 (usage personnel)"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
      const msg = (json && json.message) || `HTTP ${res.status}`;
      throw new Error(`Last.fm : ${msg}`);
    }
    const rt = json.recenttracks || {};
    const attr = rt["@attr"] || {};
    pages = Math.min(parseInt(attr.totalPages, 10) || 1, MAX_PAGES);
    const tracks = Array.isArray(rt.track) ? rt.track :
      (rt.track ? [rt.track] : []);
    for (const t of tracks) {
      const s = fromLastfm(t);
      if (s && s.uts > from && s.uts <= to) out.push(s);
    }
    page++;
    if (page <= pages) await sleep(SPACING_MS);
  } while (page <= pages);
  return out;
}

exports.fetchWindow = fetchWindow;
exports.PAGE_SIZE = PAGE_SIZE;
