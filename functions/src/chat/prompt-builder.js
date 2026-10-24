/* eslint-disable max-len */
"use strict";

const {KEYS} = require("../grades");
const {loadCurationMap, overlayList} = require("./curation-overlay");

const TOP_CHAT_N = 20;
const TOP_ODDITY_N = 5;
const TOP_UNRATED_N = 5;

/**
 * Lit les agrégats du cache Firestore et construit le bloc [CONTEXTE] injecté
 * dans chaque message utilisateur. Lectures en parallèle pour limiter la latence.
 * La curation est lue LIVE et superposée (ADR-031), jamais depuis le cache.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid utilisateur, pour la curation live
 * @return {Promise<string>}
 */
async function buildContext(db, uid) {
  const [globalSnap, topArtistsSnap, topAlbumsSnap, odditiesSnap, unratedSnap,
    curation] =
    await Promise.all([
      db.collection("cache").doc("agg_global").get(),
      db.collection("cache").doc("agg_top_artists_alltime").get(),
      db.collection("cache").doc("agg_top_albums_alltime").get(),
      db.collection("cache").doc("agg_oddities").get(),
      db.collection("cache").doc("agg_unrated_top").get(),
      loadCurationMap(db, uid),
    ]);

  const global = globalSnap.exists ? globalSnap.data() : {};
  const topArtists = topArtistsSnap.exists ? (topArtistsSnap.data().items || []) : [];
  const topAlbums = topAlbumsSnap.exists ? (topAlbumsSnap.data().items || []) : [];
  const oddities = odditiesSnap.exists ? (odditiesSnap.data().items || []) : [];
  let unrated = unratedSnap.exists ? (unratedSnap.data().items || []) : [];

  // Curation LIVE (IM-5/ADR-031) : le cache porte une projection figée au
  // dernier refresh ; on la remplace par la source `users/{uid}/grades`. Les
  // albums depuis notés sont retirés de la liste « non notés » (sinon Orphée
  // les re-propose et croit qu'ils ne sont pas notés).
  overlayList(topAlbums, curation);
  overlayList(oddities, curation);
  overlayList(unrated, curation);
  unrated = unrated.filter((a) => a.grade === null || a.grade === undefined);

  const now = new Date().toISOString().split("T")[0];

  const gradeMap = global.grade_distribution || {};
  const gradeDist = KEYS
      .map((k) => `${k}: ${gradeMap[k] || 0}`)
      .join(", ");

  const topArtistsList = topArtists
      .slice(0, TOP_CHAT_N)
      .map((a, i) => `${i + 1}. ${a.artist} (${a.count} écoutes)`)
      .join(" · ");

  const topAlbumsList = topAlbums
      .slice(0, TOP_CHAT_N)
      .map((a, i) => {
        const grade = a.grade !== null && a.grade !== undefined ? `note ${a.grade}` : "non noté";
        // album_sur = clé Firestore à utiliser dans les tags [GRADE], [FOCUS], etc.
        return `${i + 1}. ${a.album} — ${a.artist} (${a.count} écoutes, ${grade})` +
          (a.album_sur ? ` [id:${a.album_sur}]` : "");
      })
      .join("\n");

  const oddityList = oddities
      .slice(0, TOP_ODDITY_N)
      .map((a) => {
        const id = a.album_sur ? ` [id:${a.album_sur}]` : "";
        return `${a.album} — ${a.artist} (${a.listen_count} écoutes, ${a.grade_label})${id}`;
      })
      .join(" · ");

  const unratedList = unrated
      .slice(0, TOP_UNRATED_N)
      .map((a) => {
        const id = a.album_sur ? ` [id:${a.album_sur}]` : "";
        return `${a.album} — ${a.artist} (${a.listen_count} écoutes)${id}`;
      })
      .join(" · ");

  const lastRefresh = formatLastRefresh(global.last_refresh);

  return `[CONTEXTE]
Date : ${now}

[BIBLIOTHÈQUE]
Total écoutes : ${global.total_listens || 0}
Total albums : ${global.total_albums || 0} (${global.graded_albums || 0} notés)
Distribution des notes : ${gradeDist}
Top ${TOP_CHAT_N} artistes (tout temps) : ${topArtistsList || "—"}
Top ${TOP_CHAT_N} albums (tout temps) :
${topAlbumsList || "—"}
Top ${TOP_ODDITY_N} Oddity : ${oddityList || "—"}
Albums non notés mais très écoutés : ${unratedList || "—"}

[PARAMÈTRES]
Dernier refresh : ${lastRefresh}
[/CONTEXTE]`;
}

/**
 * @param {*} ts - Firestore Timestamp, Date, ou null
 * @return {string}
 */
function formatLastRefresh(ts) {
  if (!ts) return "inconnu";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split("T")[0];
  } catch (e) {
    return "inconnu";
  }
}

exports.buildContext = buildContext;
