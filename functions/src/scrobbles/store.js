"use strict";

/**
 * Écoutes sur Cloud Storage (ADR-034) : `scrobbles/{YYYY}.ndjson.gz`, une
 * ligne = une écoute. Bucket fermé aux clients (storage.rules deny-all) ;
 * seules les Functions lisent et écrivent (admin SDK).
 * État de la copie : `cache/scrobbles_meta` (dernière écoute, comptes par
 * année, dates de migration et de synchro).
 */

const zlib = require("node:zlib");
const {getStorage} = require("firebase-admin/storage");

const PREFIX = "scrobbles/";
const META_DOC = "cache/scrobbles_meta";

const bucket = () => getStorage().bucket();
const fileOf = (year) => bucket().file(`${PREFIX}${year}.ndjson.gz`);

/**
 * @param {Array<Object>} list
 * @return {Buffer}
 */
function encode(list) {
  const body = list.map((s) => JSON.stringify(s)).join("\n");
  return zlib.gzipSync(Buffer.from(body, "utf8"));
}

/**
 * @param {Buffer} buf
 * @return {Array<Object>}
 */
function decode(buf) {
  const body = zlib.gunzipSync(buf).toString("utf8");
  return body ? body.split("\n").filter(Boolean).map((l) => JSON.parse(l)) :
    [];
}

/**
 * @param {number} year
 * @return {Promise<Array<Object>>} écoutes de l'année ([] si absente)
 */
async function readYear(year) {
  const f = fileOf(year);
  const [exists] = await f.exists();
  if (!exists) return [];
  const [buf] = await f.download();
  return decode(buf);
}

/**
 * @param {number} year
 * @param {Array<Object>} list
 */
async function writeYear(year, list) {
  await fileOf(year).save(encode(list), {
    resumable: false,
    contentType: "application/x-ndjson",
    metadata: {contentEncoding: "identity"},
  });
}

/**
 * Toutes les écoutes, toutes années.
 * @param {Object} meta - cache/scrobbles_meta
 * @return {Promise<Array<Object>>}
 */
async function readAll(meta) {
  const years = Object.keys((meta && meta.years) || {}).map(Number);
  const parts = await Promise.all(years.map(readYear));
  return parts.flat();
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @return {Promise<?Object>} meta, ou null si les écoutes sont encore dans
 *   la Sheet (avant migration)
 */
async function readMeta(db) {
  const snap = await db.doc(META_DOC).get();
  return snap.exists ? snap.data() : null;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Object} meta
 */
async function writeMeta(db, meta) {
  await db.doc(META_DOC).set(meta, {merge: true});
}

exports.encode = encode;
exports.decode = decode;
exports.readYear = readYear;
exports.writeYear = writeYear;
exports.readAll = readAll;
exports.readMeta = readMeta;
exports.writeMeta = writeMeta;
