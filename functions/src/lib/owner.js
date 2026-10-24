"use strict";

/**
 * Accès réservé au propriétaire (ADR-041). Le propriétaire est désigné dans
 * config/owner {email}, modifiable depuis la console Firebase seulement
 * (règles : lecture et écriture refusées aux clients). Même vérification que
 * firestore.rules : email Google vérifié, égal à celui de config/owner.
 * Sans config/owner, personne n'entre (échec fermé).
 */

const {HttpsError} = require("firebase-functions/v2/https");

const OWNER_DOC = "config/owner";
const TTL_MS = 60 * 1000;
let cached = null; // {email, at}

/**
 * @param {*} e
 * @return {string} email normalisé (minuscules, sans espaces), "" sinon
 */
function normEmail(e) {
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}

/**
 * Le jeton d'authentification est-il celui du propriétaire ? (pure, testée)
 * @param {?Object} token - request.auth.token
 * @param {string} ownerEmail
 * @return {boolean}
 */
function isOwnerToken(token, ownerEmail) {
  const owner = normEmail(ownerEmail);
  return !!(owner && token && token.email_verified === true &&
    normEmail(token.email) === owner);
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @return {Promise<string>} email du propriétaire ("" si non désigné)
 */
async function ownerEmail(db) {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.email;
  const snap = await db.doc(OWNER_DOC).get();
  const email = snap.exists ? normEmail(snap.data().email) : "";
  cached = {email, at: Date.now()};
  return email;
}

/**
 * Refuse tout appel qui ne vient pas du propriétaire.
 * @param {Object} request - requête onCall
 * @param {FirebaseFirestore.Firestore} db
 */
async function requireOwner(request, db) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth requise.");
  }
  if (!isOwnerToken(request.auth.token, await ownerEmail(db))) {
    throw new HttpsError("permission-denied",
        "Orphée est réservée à son propriétaire.");
  }
}

exports.normEmail = normEmail;
exports.isOwnerToken = isOwnerToken;
exports.requireOwner = requireOwner;
