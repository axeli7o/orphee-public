/* eslint-disable max-len */
"use strict";

// Source de vérité UNIQUE du référentiel des notes (R1 du MODELE, ADR-026).
// Données pures, sans logique. En DÉRIVENT, sans recopie :
//   - public/js/refdata.js  (front : ORPHEE_GRADES + ORPHEE_GRADE_COLORS, GÉNÉRÉ)
//   - functions/src/refresh/aggregates.js + chat/prompt-builder.js (back : require)
//   - les tables d'échelle de docs/SPEC.md et docs/SKILL.md (GÉNÉRÉES)
// Génération + garde-fou : `npm --prefix functions run gen` ; canari pre-commit.
// Ne JAMAIS redéfinir une note ailleurs — éditer ici puis régénérer.
//
// Champs :
//   value  note 1..5
//   key    slug minuscule — clés de grade_distribution ET grade_label du cache
//   label  libellé canonique d'affichage (ORPHEE_GRADES) — français depuis
//          v2.10.0, ordre alphabétique = ordre décroissant des notes (tri
//          A→Z : Adoré, Culte, Génial, Sympa, Zappé)
//   key    reste le slug anglais historique (stable : cache, distribution)
//   sens   glose courte
//   color  {bg, fg} du badge (ORPHEE_GRADE_COLORS)

const GRADES = [
  {value: 1, key: "skip", label: "Zappé", sens: "Pas pour moi / à éviter", color: {bg: "#6b6b73", fg: "#e8eae9"}},
  {value: 2, key: "nice", label: "Sympa", sens: "Agréable, sans plus", color: {bg: "#5a9cdc", fg: "#08121c"}},
  {value: 3, key: "great", label: "Génial", sens: "Vraiment bien", color: {bg: "#3fc58e", fg: "#062012"}},
  {value: 4, key: "classic", label: "Culte", sens: "Intemporel", color: {bg: "#ff5fa2", fg: "#2a0716"}},
  {value: 5, key: "adored", label: "Adoré", sens: "Top du top", color: {bg: "#e0a23f", fg: "#241804"}},
];

// Maps dérivées prêtes à l'emploi pour le back.
const BY_VALUE = Object.fromEntries(GRADES.map((g) => [g.value, g]));
// value → slug minuscule : c'est le grade_label stocké dans le cache (régénéré)
// et la clé de grade_distribution. Drop-in de l'ancien GRADE_LABELS en dur.
const GRADE_LABELS = Object.fromEntries(GRADES.map((g) => [g.value, g.key]));
// slugs dans l'ordre des notes (clés de grade_distribution, prompt).
const KEYS = GRADES.map((g) => g.key);

module.exports = {GRADES, BY_VALUE, GRADE_LABELS, KEYS};
