"use strict";

// Détection « remontée de couche » (ADR-032) — fonctions PURES, testables.
//
// Une « remontée de couche » = une modification de Spec/Code qui touche en fait
// une couche de référence (Produit/Modèle) sans le vouloir. La machine ne JUGE
// PAS s'il y a remontée (c'est du sens, donc humain) : elle repère seulement la
// SIGNATURE d'un commit suspect et force la question via le hook commit-msg.
//
// Signaux volontairement étroits (élargissables — cf. ADR-032) :
//  1. firestore.rules touché : c'est la frontière write:false, matérialisation
//     directe des natures de données (IM-1).
//  2. une ligne ajoutée/retirée cite un invariant IM-x ou un processus PM-x.

const REF_TOKEN = /\b(?:IM|PM)-\d+\b/;
const REFERENCE_DOCS = ["docs/PRODUIT.md", "docs/MODELE.md"];

/**
 * Signaux de remontée présents dans un commit.
 * @param {string} diff sortie de `git diff --cached --unified=0`
 * @param {string[]} files fichiers stagés (chemins repo-relatifs)
 * @return {string[]} noms des signaux déclenchés (vide = aucun)
 */
function detectSignals(diff, files) {
  const signals = [];
  if (files.some((f) => f === "firestore.rules")) {
    signals.push("firestore.rules");
  }
  const touchesRef = String(diff)
      .split(/\r?\n/)
      // lignes de contenu ajoutées/retirées, pas les en-têtes +++ / ---
      .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
      .some((l) => REF_TOKEN.test(l));
  if (touchesRef) signals.push("IM-x/PM-x");
  return signals;
}

/**
 * Le commit modifie-t-il déjà une couche de référence ? Si oui, c'est le cas
 * DESCENDANT assumé (le PM change Produit/Modèle en conscience) → pas de gate.
 * @param {string[]} files fichiers stagés
 * @return {boolean}
 */
function touchesReferenceLayer(files) {
  return files.some((f) => REFERENCE_DOCS.includes(f));
}

/**
 * Le message de commit porte-t-il l'accusé « Remontée: … » ?
 * Formes attendues : `Remontée: non — <raison>` ou `Remontée: soumise`.
 * Tolère l'absence d'accent (Remontee). Exige une valeur non vide.
 * @param {string} message message de commit
 * @return {boolean}
 */
function hasRemonteeAck(message) {
  return /^remont[eé]e\s*:\s*\S+/im.test(String(message));
}

module.exports = {
  detectSignals,
  touchesReferenceLayer,
  hasRemonteeAck,
  REFERENCE_DOCS,
};
