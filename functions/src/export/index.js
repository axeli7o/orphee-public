"use strict";

/**
 * exportListens (v2.20.0) : export allégé (JSON compact) des écoutes et de
 * la curation utile à l'analyse. Lecture seule, réservé au propriétaire
 * (ADR-041) — jamais à un invité (IM-8).
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

const {requireOwner} = require("../lib/owner");
const S = require("../scrobbles/store");
const {buildLibrary} = require("../refresh/aggregates");
const {loadCuration, loadArtistGenres} = require("../refresh/curation");
const {buildExport, buildDiag, buildQualityReview} = require("./model");
const {isSuspect} = require("../albums/canon");
const {applyCanon} = require("../albums");
const {mbKey, propose, libraryIndex} = require("../quality/mb");
const {fold} = require("../albums/canon");
const {readMbCache} = require("../quality/store");

if (getApps().length === 0) initializeApp();

const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";

exports.exportListens = onCall({
  region: "europe-west1", serviceAccount: SERVICE_ACCOUNT,
  timeoutSeconds: 120, memory: "512MiB",
}, async (request) => {
  const db = getFirestore();
  await requireOwner(request, db);
  const meta = await S.readMeta(db);
  if (!meta || meta.source !== "storage") {
    throw new HttpsError("failed-precondition",
        "Aucune écoute en mémoire : synchronise Last.fm d'abord.");
  }
  const uid = request.auth.uid;
  const docs = (snap) => snap.docs.map((d) => ({id: d.id, ...d.data()}));
  const [scrobbles, curation, artistGenres, mbCache, arbs, later, applied] =
    await Promise.all([
      S.readAll(meta), loadCuration(db, uid), loadArtistGenres(db, uid),
      readMbCache(),
      db.collection(`users/${uid}/album_arbitrations`).get().then(docs),
      db.collection(`users/${uid}/quality_later`).get().then(docs),
      db.collection(`users/${uid}/applied_corrections`).get().then(docs),
    ]);
  // Albums canoniques, sans résolution réseau (cache seulement).
  const canon = await applyCanon(db, uid, scrobbles, curation, null);
  const {all: libAll} = buildLibrary(canon.scrobbles, curation);
  const out = buildExport(canon.scrobbles, libAll, artistGenres,
      new Date().toISOString());
  out.diag = buildDiag(canon.scrobbles, canon.trackCache || {}, isSuspect,
      {cache: mbCache, key: mbKey, propose, fold,
        library: libraryIndex(canon.scrobbles, 4)});
  // Revue Qualité : décisions et titres passés, à regarder ensemble.
  out.quality = buildQualityReview(arbs, later, applied);
  logger.info("exportListens",
      {albums: out.albums.length, listens: out.listens.length});
  return out;
});
