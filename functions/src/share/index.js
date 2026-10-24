"use strict";

/**
 * Partager ma bibliothèque (PM-28, ADR-042) : un accès invité d'1 h, en
 * lecture seule.
 * - createShare (propriétaire) : un jeton aléatoire (256 bits) ; seule son
 *   empreinte SHA-256 est stockée (shares/{empreinte}). Un seul accès à la
 *   fois : en créer un coupe le précédent.
 * - joinShare (compte anonyme) : échange le jeton contre un accès
 *   (guests/{uid}) borné par la même échéance.
 * - revokeShare (propriétaire) : coupe tout, immédiatement.
 * Ce sont les règles Firestore qui bornent l'invité (lecture seule, échéance
 * vérifiée côté serveur, accès supprimé = plus rien) ; ces fonctions ne font
 * qu'ouvrir et fermer la porte.
 */

const crypto = require("node:crypto");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {requireOwner} = require("../lib/owner");

if (getApps().length === 0) initializeApp();

const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";
const OPTS = {region: "europe-west1", serviceAccount: SERVICE_ACCOUNT,
  timeoutSeconds: 30, memory: "256MiB"};
const DURATION_MS = 60 * 60 * 1000; // 1 h (décision du PM)
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url

/** @return {string} jeton aléatoire, 32 octets en base64url (43 car.) */
function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * @param {string} token
 * @return {string} empreinte SHA-256 (hex) : seule trace stockée
 */
function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * @param {*} token
 * @return {boolean} forme valide (pure, testée)
 */
function isValidToken(token) {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/**
 * Supprime tous les accès (shares) et invités (guests).
 * @param {FirebaseFirestore.Firestore} db
 */
async function revokeAll(db) {
  const [shares, guests] = await Promise.all([
    db.collection("shares").get(), db.collection("guests").get(),
  ]);
  const docs = shares.docs.concat(guests.docs);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

exports.createShare = onCall(OPTS, async (request) => {
  const db = getFirestore();
  await requireOwner(request, db);
  await revokeAll(db);
  const token = newToken();
  const until = Date.now() + DURATION_MS;
  await db.doc(`shares/${hashToken(token)}`).set({
    owner: request.auth.uid,
    created_at: Timestamp.now(),
    until: Timestamp.fromMillis(until),
  });
  return {token, until};
});

exports.joinShare = onCall(OPTS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth requise.");
  }
  const provider = request.auth.token.firebase &&
    request.auth.token.firebase.sign_in_provider;
  if (provider !== "anonymous") {
    throw new HttpsError("failed-precondition",
        "Un lien d'invitation s'ouvre sans compte.");
  }
  const token = (request.data || {}).token;
  if (!isValidToken(token)) {
    throw new HttpsError("not-found", "Ce lien n'est plus valable.");
  }
  const db = getFirestore();
  const hash = hashToken(token);
  const snap = await db.doc(`shares/${hash}`).get();
  const share = snap.exists ? snap.data() : null;
  if (!share || share.until.toMillis() <= Date.now()) {
    throw new HttpsError("not-found", "Ce lien n'est plus valable.");
  }
  await db.doc(`guests/${request.auth.uid}`).set({
    owner: share.owner,
    share: hash,
    until: share.until,
    joined_at: Timestamp.now(),
  });
  return {owner: share.owner, until: share.until.toMillis()};
});

exports.revokeShare = onCall(OPTS, async (request) => {
  const db = getFirestore();
  await requireOwner(request, db);
  await revokeAll(db);
  return {ok: true};
});

exports.newToken = newToken;
exports.hashToken = hashToken;
exports.isValidToken = isValidToken;
exports.DURATION_MS = DURATION_MS;
