"use strict";

/**
 * Cache des réponses MusicBrainz (v2.22.0, ADR-046) : Storage
 * `derived/mb_tracks.json.gz`, fermé aux clients (Functions seules).
 * Dérivé régénérable : clé (artiste|titre) → [sorties|null, date].
 */

const zlib = require("node:zlib");
const {getStorage} = require("firebase-admin/storage");

const FILE = "derived/mb_tracks.json.gz";
// v2 (v2.22.1) : recherche parmi les albums d'abord, artiste principal,
// disque ; les réponses v1 sont ignorées (à réinterroger).
const VERSION = 2;

const file = () => getStorage().bucket().file(FILE);

/**
 * @return {Promise<Object<string, Array>>}
 */
async function readMbCache() {
  const [exists] = await file().exists();
  if (!exists) return {};
  const [buf] = await file().download();
  try {
    const data = JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
    return data.version === VERSION ? data.entries || {} : {};
  } catch (err) {
    return {};
  }
}

/**
 * @param {Object<string, Array>} entries
 * @return {Promise<void>}
 */
async function saveMbCache(entries) {
  await file().save(zlib.gzipSync(Buffer.from(
      JSON.stringify({version: VERSION, entries}), "utf8")),
  {resumable: false, contentType: "application/gzip"});
}

exports.readMbCache = readMbCache;
exports.saveMbCache = saveMbCache;

const CHUNK = 800;

/**
 * Écrit les propositions pour l'onglet Qualité (dérivé, lecture
 * propriétaire seul, écriture Functions seules) : `quality/summary` et
 * `quality/items_{i}` par paquets de 800 ; les paquets en trop d'une
 * écriture précédente sont supprimés.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{summary: Object, items: Array<Object>}} built
 * @return {Promise<void>}
 */
async function writeQuality(db, built) {
  const {FieldValue} = require("firebase-admin/firestore");
  const prev = await db.doc("quality/summary").get();
  const before = prev.exists ? prev.data().chunks || 0 : 0;
  const chunks = Math.ceil(built.items.length / CHUNK);
  const batch = db.batch();
  for (let i = 0; i < chunks; i++) {
    batch.set(db.doc(`quality/items_${i}`),
        {items: built.items.slice(i * CHUNK, (i + 1) * CHUNK)});
  }
  for (let i = chunks; i < before; i++) {
    batch.delete(db.doc(`quality/items_${i}`));
  }
  batch.set(db.doc("quality/summary"), {...built.summary, chunks,
    built_at: FieldValue.serverTimestamp()});
  await batch.commit();
}

exports.writeQuality = writeQuality;
