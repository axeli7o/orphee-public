"use strict";

// Validation des actions de curation émises par Orphée (proxy d'Axel, IM-7 /
// ADR-027), exécutée côté serveur dans chatOrphee AVANT de renvoyer les actions
// au client. Principe : une erreur reste une erreur. Une action invalide n'est
// jamais appliquée ni « auto-corrigée » par le modèle — elle est renvoyée au
// client comme rejet (affiché en bulle dismissible). Logique pure et testable :
// l'existence de l'album est injectée via `albumExists(album_sur) → bool`.

const {GRADES} = require("../grades");

const VALID_GRADES = new Set(GRADES.map((g) => g.value));

/**
 * Raison de rejet d'une action, ou null si valide.
 * @param {Object} action {type, album_sur, grade, ...}
 * @param {function(string): Promise<boolean>} albumExists
 * @return {Promise<?string>} message de rejet, ou null
 */
async function reasonFor(action, albumExists) {
  const id = action && action.album_sur;
  if (!id || typeof id !== "string" || id.includes("/")) {
    return "album_sur invalide";
  }
  // ungrade : suppression idempotente, tolérée même si l'album n'existe pas.
  if (action.type === "ungrade") return null;
  // grade : une note concrète du barème est requise (null/hors 1-5 → rejet).
  if (action.type === "grade" && !VALID_GRADES.has(action.grade)) {
    return "note hors barème (1-5)";
  }
  // grade / flag / comment : l'album doit exister dans la bibliothèque.
  const exists = await albumExists(id);
  if (!exists) return "album introuvable dans la bibliothèque";
  return null;
}

/**
 * Partitionne les actions en valides / invalides.
 * @param {Object[]} actions
 * @param {function(string): Promise<boolean>} albumExists
 * @return {Promise<Object>} {valid:[], invalid:[{action, reason}]}
 */
async function validateActions(actions, albumExists) {
  const valid = [];
  const invalid = [];
  for (const action of actions || []) {
    const reason = await reasonFor(action, albumExists);
    if (reason) invalid.push({action, reason});
    else valid.push(action);
  }
  return {valid, invalid};
}

module.exports = {validateActions, reasonFor};
