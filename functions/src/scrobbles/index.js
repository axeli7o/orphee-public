"use strict";

/**
 * Synchro Last.fm (PM-01, ADR-034). La migration unique depuis la Sheet
 * (migrateScrobbles, v2.16.x) est faite et retirée ; la Sheet n'est plus lue
 * (ADR-044).
 * - syncLastfm : fenêtre figée (dernière écoute connue, instant du clic],
 *   fusion idempotente dans les années touchées, tout-ou-rien.
 * Réservées au propriétaire (ADR-041). « Actualiser » enchaîne syncLastfm
 * puis refreshCache, qui relit les écoutes depuis Storage.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const {requireOwner} = require("../lib/owner");
const M = require("./model");
const S = require("./store");
const {fetchWindow} = require("./lastfm");

if (getApps().length === 0) initializeApp();

const lastfmKey = defineSecret("LASTFM_API_KEY");
const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";
const USER_RE = /^[A-Za-z0-9_-]{2,40}$/;
const EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";


/**
 * Mode local : quelques écoutes fictives après la dernière connue (pas de
 * clé ni de réseau dans l'émulateur).
 * @param {Array<Object>} recent
 * @param {number} from
 * @param {number} to
 * @return {Array<Object>}
 */
function fakeWindow(recent, from, to) {
  const out = [];
  const pool = recent.slice(0, 20);
  for (let i = 0; i < 12 && pool.length; i++) {
    const base = pool[i % pool.length];
    const uts = Math.min(to, from + 600 * (i + 1));
    if (uts > from) out.push({...base, uts});
  }
  return out;
}

exports.syncLastfm = onCall({
  region: "europe-west1", serviceAccount: SERVICE_ACCOUNT,
  secrets: [lastfmKey], timeoutSeconds: 300, memory: "512MiB",
}, async (request) => {
  const db = getFirestore();
  await requireOwner(request, db);
  const meta = await S.readMeta(db);
  if (!meta || meta.source !== "storage") {
    throw new HttpsError("failed-precondition",
        "Aucune écoute en mémoire Storage : " +
        "la synchronisation ne peut pas démarrer.");
  }
  const prof = await db.doc(`users/${request.auth.uid}/settings/profile`)
      .get();
  const user = prof.exists ? prof.data().lastfm_user : "";
  if (!user || !USER_RE.test(user)) {
    throw new HttpsError("failed-precondition",
        "Renseigne ton nom Last.fm dans Réglages › Compte.");
  }
  // Fenêtre figée : (dernière écoute connue, instant du clic].
  const from = meta.last_uts || 0;
  const to = Math.floor(Date.now() / 1000);
  let incoming;
  try {
    incoming = EMULATOR ?
      fakeWindow(await S.readYear(M.yearOf(from || to)), from, to) :
      await fetchWindow({user, apiKey: lastfmKey.value(), from, to});
  } catch (err) {
    logger.warn("syncLastfm fetch failed", {message: err.message});
    throw new HttpsError("unavailable",
        "Last.fm ne répond pas : réessaie dans un moment.");
  }
  // Fusion par année touchée ; écriture seulement si toute la fenêtre est
  // lue (on est ici : fetchWindow est tout-ou-rien).
  const parts = M.byYear(incoming);
  const years = {...(meta.years || {})};
  let added = 0;
  let lastUts = from;
  for (const [year, list] of parts) {
    const merged = M.merge(await S.readYear(year), list);
    if (merged.added) await S.writeYear(year, merged.list);
    added += merged.added;
    years[String(year)] = merged.list.length;
    for (const s of list) lastUts = Math.max(lastUts, s.uts);
  }
  await S.writeMeta(db, {
    last_uts: lastUts, years,
    total: Object.values(years).reduce((a, b) => a + b, 0),
    synced_at: Timestamp.now(), last_added: added,
  });
  logger.info("syncLastfm", {from, to, fetched: incoming.length, added});
  return {added, last_uts: lastUts};
});
