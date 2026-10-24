"use strict";

/**
 * Matière de la Sélection « À qualifier » (PM-22, MODELE : Sélection —
 * segmentation dérivée qui ne décide rien, IM-6/IM-7) et de la Netteté du
 * portrait (PM-23).
 *
 * Le serveur ne fournit que des FAITS récents ; le choix final (« pas encore
 * noté », « encore Adoré ? ») se fait côté client sur la curation LIVE
 * (ADR-031) — une note posée à l'instant doit sortir de la sélection.
 *
 * « Récent » est relatif à la DERNIÈRE écoute connue, pas à l'horloge : avec
 * un import manuel en retard, « ces 30 derniers jours » reste parlant.
 */

const HOT_DAYS = 30;
const DORMANT_YEARS = 2;
const LIST_N = 30;

/**
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} libAll - sortie buildLibrary().all
 * @param {Map<string, Object>} artistGenres - classification d'artiste (E8)
 * @return {Object} {ref_uts, hot_days, hot[{album_sur, count}],
 *   dormant[{album_sur, last_uts}], classified_artists[]}
 */
function buildRecent(scrobbles, libAll, artistGenres) {
  let ref = 0;
  const last = new Map();
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    if (uts > ref) ref = uts;
    if (uts > (last.get(s.album_sur) || 0)) last.set(s.album_sur, uts);
  }
  const classified = artistGenres instanceof Map ?
    Array.from(artistGenres.keys()) : [];
  if (!ref) {
    return {ref_uts: null, hot_days: HOT_DAYS, hot: [], dormant: [],
      classified_artists: classified};
  }

  // Albums les plus écoutés sur les HOT_DAYS jours avant la dernière écoute.
  const since = ref - HOT_DAYS * 86400;
  const hotCount = new Map();
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (uts > since) {
      hotCount.set(s.album_sur, (hotCount.get(s.album_sur) || 0) + 1);
    }
  }
  const hot = Array.from(hotCount.entries())
      .sort((x, y) => y[1] - x[1])
      .slice(0, LIST_N)
      .map(([key, count]) => ({album_sur: key, count}));

  // Albums très écoutés mais plus écoutés depuis DORMANT_YEARS ans.
  const asleep = ref - DORMANT_YEARS * 365.25 * 86400;
  const dormant = libAll
      .filter((a) => (last.get(a.album_sur) || 0) < asleep)
      .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0))
      .slice(0, LIST_N)
      .map((a) => ({
        album_sur: a.album_sur,
        last_uts: last.get(a.album_sur) || null,
      }));

  return {ref_uts: ref, hot_days: HOT_DAYS, hot, dormant,
    classified_artists: classified};
}

exports.HOT_DAYS = HOT_DAYS;
exports.DORMANT_YEARS = DORMANT_YEARS;
exports.buildRecent = buildRecent;
