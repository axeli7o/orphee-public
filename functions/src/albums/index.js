"use strict";

/**
 * Album canonique appliqué aux écoutes (v2.21.0, PM-29) : séparations
 * demandées par Axel (curation `album_splits`), notes (l'édition notée le
 * plus récemment devient canonique), titres résolus (Last.fm).
 */

const {canonicalize, correctionKey} = require("./canon");
const {trackAlbums} = require("./resolve");

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @return {Promise<Set<string>>} album_sur bruts à ne pas rattacher
 */
async function loadSplits(db, uid) {
  const snap = await db.collection(`users/${uid}/album_splits`).get();
  const out = new Set();
  snap.forEach((d) => {
    const v = d.data().album_sur;
    if (typeof v === "string" && v) out.add(v);
  });
  return out;
}

/**
 * Séparations (album_splits) → corrections appliquées (v2.32.0, ADR-046) :
 * « Séparer » quitte la fiche album ; une séparation devient, pour chaque
 * titre reçu sous ce libellé, une correction « remettre à part » (vers le
 * libellé lui-même), dans un lot annulable. Pure, testée.
 * @param {Array<Object>} scrobbles - bruts
 * @param {Set<string>} splits - album_sur bruts séparés
 * @return {Array<{artist: string, track: string, raw: string,
 *   title: string}>} une entrée par (artiste, titre, libellé)
 */
function splitCorrections(scrobbles, splits) {
  const out = new Map();
  if (!splits.size) return [];
  for (const s of scrobbles) {
    const raw = s.album_sur;
    if (!raw || !splits.has(raw) || !s.artist || !s.track) continue;
    const k = correctionKey(s.artist, s.track, raw);
    if (out.has(k)) continue;
    out.set(k, {artist: s.artist, track: s.track, raw,
      title: raw.slice(String(s.artist).length + 1)});
  }
  return Array.from(out.values());
}

/**
 * Migre les séparations en corrections appliquées (une fois : les
 * séparations sont supprimées ensuite). Écrit dans la curation d'Axel ce
 * qu'il avait déjà décidé, sous une autre forme (IM-9) — rien de neuf.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {Array<Object>} scrobbles - bruts
 * @param {Set<string>} splits
 * @return {Promise<number>} corrections écrites
 */
async function migrateSplits(db, uid, scrobbles, splits) {
  if (!splits.size) return 0;
  const list = splitCorrections(scrobbles, splits);
  const {itemId} = require("../quality/model");
  const {FieldValue} = require("firebase-admin/firestore");
  const at = FieldValue.serverTimestamp();
  const batchId = "separations";
  const ops = list.map((c) => (b) => b.set(
      db.doc(`users/${uid}/applied_corrections/${itemId(c.artist, c.track,
          c.raw)}`),
      {artist: c.artist, track: c.track, raw_album_sur: c.raw,
        to_album: c.title, to_album_sur: c.raw, source: "split",
        batch: batchId, at}));
  ops.push((b) => b.set(db.doc(`users/${uid}/correction_batches/${batchId}`),
      {at, count: list.length, carried: [], source: "split"}, {merge: true}));
  for (const raw of splits) {
    ops.push((b) => b.delete(db.doc(
        `users/${uid}/album_splits/${encodeURIComponent(raw)}`)));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 400)) op(b);
    await b.commit();
  }
  return list.length;
}

/**
 * Corrections appliquées par Axel (E10, v2.30.0) : clé → titre de l'album.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @return {Promise<Map<string, string>>}
 */
async function loadApplied(db, uid) {
  const snap = await db.collection(`users/${uid}/applied_corrections`).get();
  const out = new Map();
  snap.forEach((d) => {
    const c = d.data();
    if (c.artist && c.track && c.raw_album_sur && c.to_album) {
      out.set(correctionKey(c.artist, c.track, c.raw_album_sur), c.to_album);
    }
  });
  return out;
}

/**
 * @param {Map<string, Object>} curationByKey
 * @return {Map<string, number>} album_sur noté → date de la note (ms)
 */
function gradedDates(curationByKey) {
  const out = new Map();
  for (const [k, c] of curationByKey) {
    if (c.grade === undefined || c.grade === null) continue;
    const ts = c.updated_at || c.graded_at;
    out.set(k, ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0);
  }
  return out;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {Array<Object>} scrobbles - bruts
 * @param {Map<string, Object>} curationByKey
 * @param {?string} apiKey - null : pas de résolution réseau
 * @return {Promise<{scrobbles: Array<Object>, variants: Map,
 *   pending: number, trackCache: Object}>}
 */
async function applyCanon(db, uid, scrobbles, curationByKey, apiKey) {
  // Séparations restantes (avant v2.32.0) : migrées d'abord, puis lues
  // comme corrections appliquées.
  const legacy = await loadSplits(db, uid);
  await migrateSplits(db, uid, scrobbles, legacy);
  const splits = new Set();
  const [applied, {resolved, pending, cache}] = await Promise.all([
    loadApplied(db, uid), trackAlbums(scrobbles, apiKey),
  ]);
  const out = canonicalize(scrobbles,
      {resolved, splits, applied, graded: gradedDates(curationByKey)});
  return {...out, applied: applied.size, pending, trackCache: cache};
}

exports.applyCanon = applyCanon;
exports.splitCorrections = splitCorrections;
exports.gradedDates = gradedDates;
