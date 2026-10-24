/* eslint-disable max-len */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {overlay, overlayList, loadCurationMap} =
  require("../src/chat/curation-overlay");

// Curation live simulée (source `users/{uid}/grades`).
const map = new Map([
  ["Novelists-Coda", {grade: 4, personal_fav: false, commentaire: "Le sourire en coin.", genre: "Rock"}],
  ["Burial-Untrue", {grade: 5, personal_fav: true}],
]);

// ---- LE cas de non-régression (le bug Coda) ----

test("overlay: album noté live est vu noté même si le cache le dit non-noté", () => {
  const stale = {album_sur: "Novelists-Coda", grade: null, grade_label: null};
  overlay(stale, map);
  assert.equal(stale.grade, 4);
  assert.equal(stale.grade_label, "classic");
  assert.equal(stale.commentaire, "Le sourire en coin.");
});

test("overlay: projection cache périmée écrasée par le live (non noté)", () => {
  // Le cache dit « noté 3 » mais l'utilisateur n'a aucune curation live → non noté.
  const stale = {album_sur: "X-Y", grade: 3, grade_label: "great", personal_fav: true};
  overlay(stale, map);
  assert.equal(stale.grade, null);
  assert.equal(stale.grade_label, null);
  assert.equal(stale.personal_fav, false);
});

// ---- champs ----

test("overlay: coup de cœur live", () => {
  const it = {album_sur: "Burial-Untrue", grade: null};
  overlay(it, map);
  assert.equal(it.grade, 5);
  assert.equal(it.grade_label, "adored");
  assert.equal(it.personal_fav, true);
});

test("overlay: genre/commentaire seulement si présents en live", () => {
  const it = {album_sur: "Burial-Untrue", genre: "Electro"};
  overlay(it, map); // pas de genre dans la curation de Burial → on garde l'existant
  assert.equal(it.genre, "Electro");
});

test("overlayList: applique à toute la liste", () => {
  const list = [
    {album_sur: "Novelists-Coda", grade: null},
    {album_sur: "Inconnu-Z", grade: 2}, // pas de curation live → non noté
  ];
  overlayList(list, map);
  assert.equal(list[0].grade, 4);
  assert.equal(list[1].grade, null);
});

// ---- loadCurationMap ----

test("loadCurationMap: construit album_sur → doc, vide si pas d'uid", async () => {
  const fakeDb = {
    collection: () => ({
      get: async () => ({
        forEach: (cb) => {
          cb({id: "A-B", data: () => ({grade: 3})});
          cb({id: "C-D", data: () => ({grade: 1})});
        },
      }),
    }),
  };
  const m = await loadCurationMap(fakeDb, "uid1");
  assert.equal(m.get("A-B").grade, 3);
  assert.equal(m.size, 2);
  assert.equal((await loadCurationMap(fakeDb, null)).size, 0);
});
