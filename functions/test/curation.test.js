/* eslint-disable max-len */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Le builder est un module UMD servi au navigateur ET require-able ici (ADR-027).
const {buildCurationMutation, gradeLabel, isGradeInRange} =
  require("../../public/js/curation.js");

// ---- grade ----

test("curation: grade valide → set merge, sans grade_label", () => {
  const m = buildCurationMutation({type: "grade", album_sur: "A-B", grade: 3});
  assert.equal(m.valid, true);
  assert.equal(m.op, "set");
  assert.equal(m.merge, true);
  assert.equal(m.fields.grade, 3);
  assert.equal(m.fields.personal_fav, false);
  assert.equal(m.fields.commentaire, "");
  assert.equal("grade_label" in m.fields, false);
  assert.deepEqual(m.timestamps, ["updated_at"]);
});

test("curation: grade avec isFirst → graded_at ajouté", () => {
  const m = buildCurationMutation(
      {type: "grade", album_sur: "A-B", grade: 5, isFirst: true});
  assert.deepEqual(m.timestamps, ["updated_at", "graded_at"]);
});

test("curation: grade null autorisé (déclassement)", () => {
  const m = buildCurationMutation(
      {type: "grade", album_sur: "A-B", grade: null});
  assert.equal(m.valid, true);
  assert.equal(m.fields.grade, null);
});

test("curation: grade hors barème → invalide", () => {
  for (const g of [0, 6, 7, 2.5, -1]) {
    const m = buildCurationMutation({type: "grade", album_sur: "A-B", grade: g});
    assert.equal(m.valid, false, `grade ${g} doit être rejeté`);
    assert.match(m.reason, /barème/);
  }
});

test("curation: grade en chaîne numérique coercé", () => {
  const m = buildCurationMutation({type: "grade", album_sur: "A-B", grade: "4"});
  assert.equal(m.valid, true);
  assert.equal(m.fields.grade, 4);
});

test("curation: genre/sousgenre inclus seulement si fournis", () => {
  const withClass = buildCurationMutation(
      {type: "grade", album_sur: "A-B", grade: 3, genre: "Rock", sousgenre: ""});
  assert.equal(withClass.fields.genre, "Rock");
  assert.equal(withClass.fields.sousgenre, "");
  const chat = buildCurationMutation({type: "grade", album_sur: "A-B", grade: 3});
  assert.equal("genre" in chat.fields, false);
  assert.equal("sousgenre" in chat.fields, false);
});

test("curation: personal_fav coercé en booléen", () => {
  const m = buildCurationMutation(
      {type: "grade", album_sur: "A-B", grade: 3, personal_fav: "yes"});
  assert.equal(m.fields.personal_fav, true);
});

// ---- flag / comment / ungrade ----

test("curation: flag → set merge personal_fav seul", () => {
  const m = buildCurationMutation(
      {type: "flag", album_sur: "A-B", personal_fav: true});
  assert.deepEqual(m.fields, {personal_fav: true});
  assert.equal("grade" in m.fields, false);
});

test("curation: comment → commentaire seul, défaut vide", () => {
  const m = buildCurationMutation({type: "comment", album_sur: "A-B"});
  assert.equal(m.fields.commentaire, "");
  assert.equal("grade" in m.fields, false);
});

test("curation: ungrade → delete", () => {
  const m = buildCurationMutation({type: "ungrade", album_sur: "A-B"});
  assert.equal(m.valid, true);
  assert.equal(m.op, "delete");
});

// ---- garde-fous ----

test("curation: album_sur avec / ou vide → invalide", () => {
  assert.equal(buildCurationMutation(
      {type: "grade", album_sur: "a/b", grade: 3}).valid, false);
  assert.equal(buildCurationMutation(
      {type: "grade", album_sur: "", grade: 3}).valid, false);
});

test("curation: type inconnu → invalide", () => {
  const m = buildCurationMutation({type: "wat", album_sur: "A-B"});
  assert.equal(m.valid, false);
});

// ---- helpers ----

test("curation: gradeLabel dérive depuis la map (jamais stocké)", () => {
  const map = {1: "Skip", 5: "Adored"};
  assert.equal(gradeLabel(5, map), "Adored");
  assert.equal(gradeLabel(null, map), null);
  assert.equal(gradeLabel(3, map), null);
});

test("curation: isGradeInRange", () => {
  assert.equal(isGradeInRange(1), true);
  assert.equal(isGradeInRange(5), true);
  assert.equal(isGradeInRange(0), false);
  assert.equal(isGradeInRange(2.5), false);
});
