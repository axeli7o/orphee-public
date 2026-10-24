"use strict";

/**
 * verifyCatalog (v2.22.0, PM-33, ADR-046) : interroge MusicBrainz pour les
 * titres en attente, les plus écoutés d'abord, à 1 requête par seconde,
 * jusqu'à ~28 min par lancement ; reprend là où il s'est arrêté. À la
 * demande uniquement (ADR-005), réservé au propriétaire (ADR-041).
 * Mode à blanc : n'écrit que le cache des réponses et la progression
 * (`cache/quality_progress`) ; aucun album n'est changé.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

const {requireOwner} = require("../lib/owner");
const S = require("../scrobbles/store");
const {loadCuration} = require("../refresh/curation");
const {applyCanon} = require("../albums");
const {isSuspect} = require("../albums/canon");
const {mbTargets, searchRecording, mbKey, propose, libraryIndex} =
  require("./mb");
const {readMbCache, saveMbCache, writeQuality} = require("./store");
const {buildQuality} = require("./model");

if (getApps().length === 0) initializeApp();

const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";
const PROGRESS = "cache/quality_progress";
const RUN_MS = 28 * 60 * 1000;
const STEP_MS = 1100; // MusicBrainz : 1 requête par seconde au plus
const SAVE_EVERY = 50;
const MAX_FAILS = 5;
const STALE_MS = 3 * 60 * 1000;
const TARGET_OPTS = {maxListens: 4, retryS: 30 * 86400, isSuspect};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.TARGET_OPTS = TARGET_OPTS;

/**
 * Recalcule et écrit les propositions de l'onglet Qualité (PM-31).
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<Object>} scrobbles - écoutes canoniques
 * @param {Object<string, Array>} cache - réponses MusicBrainz
 * @return {Promise<Object>} {summary, items}
 */
async function refreshQuality(db, scrobbles, cache) {
  const now = Math.floor(Date.now() / 1000);
  const built = buildQuality(scrobbles, cache, {
    key: mbKey, propose, library: libraryIndex(scrobbles, 4),
    targets: (sc) => new Set(mbTargets(sc, {}, now, TARGET_OPTS).todo
        .map((t) => t.key)),
  });
  await writeQuality(db, built);
  return built;
}

exports.refreshQuality = refreshQuality;

exports.verifyCatalog = onCall({
  region: "europe-west1", serviceAccount: SERVICE_ACCOUNT,
  timeoutSeconds: 1800, memory: "1GiB",
}, async (request) => {
  const db = getFirestore();
  await requireOwner(request, db);
  const meta = await S.readMeta(db);
  if (!meta || meta.source !== "storage") {
    throw new HttpsError("failed-precondition",
        "Aucune écoute en mémoire : synchronise Last.fm d'abord.");
  }

  // Un seul lancement à la fois (verrou périmé après 3 min sans nouvelles).
  const ref = db.doc(PROGRESS);
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const d = cur.exists ? cur.data() : {};
    const beat = d.updated_at && d.updated_at.toMillis ?
      d.updated_at.toMillis() : 0;
    if (d.running && Date.now() - beat < STALE_MS) {
      throw new HttpsError("already-exists",
          "Une vérification est déjà en cours.");
    }
    tx.set(ref, {running: true, started_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()}, {merge: true});
  });

  const uid = request.auth.uid;
  let looked = 0;
  let remaining = 0;
  let total = 0;
  let down = false;
  let canonScrobbles = null;
  let cacheRef = null;
  try {
    const [scrobbles, curation, cache] = await Promise.all([
      S.readAll(meta), loadCuration(db, uid), readMbCache(),
    ]);
    const canon = await applyCanon(db, uid, scrobbles, curation, null);
    canonScrobbles = canon.scrobbles;
    cacheRef = cache;
    const now = Math.floor(Date.now() / 1000);
    const {todo, total: t} = mbTargets(canon.scrobbles, cache, now,
        TARGET_OPTS);
    total = t;
    remaining = todo.length;
    await ref.set({total, remaining, updated_at: FieldValue.serverTimestamp()},
        {merge: true});

    const t0 = Date.now();
    let fails = 0;
    let unsaved = 0;
    for (const item of todo) {
      if (Date.now() - t0 > RUN_MS || fails >= MAX_FAILS) break;
      const tick = Date.now();
      const hits = await searchRecording(item.artist, item.track);
      if (hits === undefined) {
        fails += 1;
      } else {
        fails = 0;
        cache[item.key] = [hits, now];
        looked += 1;
        remaining -= 1;
        unsaved += 1;
      }
      if (unsaved >= SAVE_EVERY) {
        await saveMbCache(cache);
        unsaved = 0;
        await ref.set({remaining, updated_at: FieldValue.serverTimestamp()},
            {merge: true});
      }
      const wait = STEP_MS - (Date.now() - tick);
      if (wait > 0) await sleep(wait);
    }
    if (unsaved) await saveMbCache(cache);
    down = fails >= MAX_FAILS;
    if (down) {
      logger.warn("verifyCatalog: MusicBrainz ne répond pas", {looked});
    }
  } finally {
    if (canonScrobbles) {
      try {
        await refreshQuality(db, canonScrobbles, cacheRef);
      } catch (err) {
        logger.error("verifyCatalog: propositions non écrites", err);
      }
    }
    await ref.set({running: false, remaining, total, down,
      last_looked: looked, finished_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()}, {merge: true});
  }
  logger.info("verifyCatalog", {looked, remaining, total});
  return {looked, remaining, total};
});
