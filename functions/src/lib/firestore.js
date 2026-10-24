"use strict";

/**
 * Write multiple cache documents in a single atomic batch.
 * @param {FirebaseFirestore.Firestore} db
 * @param {Object<string, Object>} docs - map of docId → data
 * @return {Promise<void>}
 */
async function writeCache(db, docs) {
  const batch = db.batch();
  for (const [docId, data] of Object.entries(docs)) {
    const ref = db.collection("cache").doc(docId);
    batch.set(ref, data);
  }
  await batch.commit();
}

const BATCH_LIMIT = 450;

/**
 * Write per-album rich docs to the `album_stats` collection, in batches.
 * Skips album_sur containing "/" (id de doc invalide).
 * @param {FirebaseFirestore.Firestore} db
 * @param {Map<string, Object>} statsMap - album_sur → doc
 * @return {Promise<number>} nombre de docs écrits
 */
async function writeAlbumStats(db, statsMap) {
  const docs = Array.from(statsMap.values())
      .filter((d) => d.album_sur && !d.album_sur.includes("/"));
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
      batch.set(db.collection("album_stats").doc(doc.album_sur), doc);
    }
    await batch.commit();
  }
  return docs.length;
}

exports.writeCache = writeCache;
exports.writeAlbumStats = writeAlbumStats;
