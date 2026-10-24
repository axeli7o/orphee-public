"use strict";

/**
 * Matière du « Signal de la pile » (MODELE : segmentation dérivée de la
 * Mise de côté E11, PM-35/PM-36 ; IM-6 : ne touche jamais la curation).
 *
 * Pour chaque album mis de côté, les jours où il a été écouté depuis sa
 * mise de côté, chacun représenté par sa DERNIÈRE écoute (uts). Le client
 * compte les jours dont la dernière écoute suit la date de mise de côté
 * LUE EN DIRECT (ADR-031) : « Garder » remet la date au jour sans attendre
 * d'actualisation, et aucune règle de calendrier n'est dupliquée côté
 * client. Jour = heure de Paris approximée (UTC+1), comme Commuting.
 */

const DAY = 86400;
const PARIS = 3600;

/**
 * @param {Array<Object>} scrobbles - écoutes canoniques ({album_sur, uts})
 * @param {Map<string, number>} aside - album_sur → date de mise de côté (ms)
 * @return {Object<string, Array<number>>} album_sur → dernières écoutes de
 *   chaque jour (uts, croissants), depuis la mise de côté seulement
 */
function buildAsideDays(scrobbles, aside) {
  const out = {};
  if (!(aside instanceof Map) || !aside.size) return out;
  const days = new Map();
  for (const s of scrobbles) {
    const at = aside.get(s.album_sur);
    if (at === undefined) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts * 1000 < at) continue;
    const d = Math.floor((uts + PARIS) / DAY);
    let m = days.get(s.album_sur);
    if (!m) days.set(s.album_sur, m = new Map());
    if (uts > (m.get(d) || 0)) m.set(d, uts);
  }
  for (const key of aside.keys()) {
    const m = days.get(key);
    out[key] = m ? Array.from(m.values()).sort((x, y) => x - y) : [];
  }
  return out;
}

/**
 * Lit users/{uid}/aside (curation E11) → Map album_sur → date (ms).
 * @param {Object} db - Firestore
 * @param {string} uid
 * @return {Promise<Map<string, number>>}
 */
async function loadAside(db, uid) {
  const snap = await db.collection(`users/${uid}/aside`).get();
  const m = new Map();
  snap.forEach((d) => {
    const at = d.data().at;
    if (typeof at === "number" && Number.isFinite(at)) m.set(d.id, at);
  });
  return m;
}

exports.buildAsideDays = buildAsideDays;
exports.loadAside = loadAside;
