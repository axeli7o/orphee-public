"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {GRADES, BY_VALUE, GRADE_LABELS, KEYS} = require("../src/grades");
const genGrades = require("../gen-grades");

// ---- Intégrité de la source unique (R1, ADR-026) ----

test("grades: échelle 1-5 complète et ordonnée", () => {
  assert.equal(GRADES.length, 5);
  assert.deepEqual(GRADES.map((g) => g.value), [1, 2, 3, 4, 5]);
});

test("grades: chaque note a key (slug minuscule), label, sens, couleur", () => {
  for (const g of GRADES) {
    assert.equal(typeof g.key, "string");
    assert.equal(g.key, g.key.toLowerCase(), `key ${g.key} minuscule`);
    assert.ok(/^[A-Z]/.test(g.label), `label ${g.label} capitalisé`);
    assert.ok(g.sens && g.sens.length > 0);
    assert.ok(g.color && g.color.bg && g.color.fg);
  }
});

test("grades: keys uniques", () => {
  assert.equal(new Set(KEYS).size, KEYS.length);
});

// ---- Maps dérivées (drop-in du back) ----

test("grades: GRADE_LABELS mappe value → slug minuscule", () => {
  for (const g of GRADES) {
    assert.equal(GRADE_LABELS[g.value], g.key);
  }
  // garde-fou anti-régression : la casse stockée reste minuscule (cf. D-2,
  // fermé côté écriture en étape 2 — ici on ne change pas la sortie cache).
  assert.equal(GRADE_LABELS[5], "adored");
});

test("grades: KEYS suit l'ordre des notes", () => {
  assert.deepEqual(KEYS, ["skip", "nice", "great", "classic", "adored"]);
});

test("grades: BY_VALUE indexe par note", () => {
  assert.equal(BY_VALUE[1].label, "Zappé");
  assert.equal(BY_VALUE[5].label, "Adoré");
});

test("grades: tri alphabétique des libellés = notes décroissantes", () => {
  // Choix d'Axel (v2.10.0) : comme l'échelle anglaise d'origine, trier les
  // libellés A→Z (Sheet, filtres) range du 5 au 1.
  const sorted = GRADES.map((g) => g.label)
      .sort((a, b) => a.localeCompare(b, "fr"));
  assert.deepEqual(sorted, GRADES.slice().reverse().map((g) => g.label));
});

// ---- Canari : artefacts générés synchronisés avec la source ----
// Reproduit le garde-fou pre-commit : refdata.js, SPEC.md et SKILL.md ne
// doivent jamais diverger de functions/src/grades.js (ADR-026).

test("grades: artefacts générés synchronisés avec la source", () => {
  const stale = genGrades.run({check: true});
  assert.deepEqual(stale, [],
      `bloc(s) désynchronisé(s) : ${stale.join(", ")} — lancer npm run gen`);
});
