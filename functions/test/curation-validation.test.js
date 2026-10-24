"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {validateActions, reasonFor} =
  require("../src/chat/curation-validation");

// album_stats simulé : tout existe sauf "Missing-Album".
const albumExists = async (id) => id !== "Missing-Album";

test("validation: grade valide sur album existant → valide", async () => {
  const {valid, invalid} = await validateActions(
      [{type: "grade", album_sur: "Burial-Untrue", grade: 4}], albumExists);
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 0);
});

test("validation: note hors barème → rejet", async () => {
  assert.match(
      await reasonFor({type: "grade", album_sur: "Burial-Untrue", grade: 9},
          albumExists),
      /barème/);
});

test("validation: grade sans note (null/undefined) → rejet", async () => {
  assert.ok(await reasonFor(
      {type: "grade", album_sur: "Burial-Untrue"}, albumExists));
  assert.ok(await reasonFor(
      {type: "grade", album_sur: "Burial-Untrue", grade: null}, albumExists));
});

test("validation: album introuvable → rejet (grade/flag/comment)", async () => {
  for (const type of ["grade", "flag", "comment"]) {
    const action = {type, album_sur: "Missing-Album", grade: 3};
    assert.match(await reasonFor(action, albumExists), /introuvable/);
  }
});

test("validation: ungrade toléré même si album absent", async () => {
  assert.equal(
      await reasonFor({type: "ungrade", album_sur: "Missing-Album"},
          albumExists),
      null);
});

test("validation: album_sur avec / → rejet sans lookup", async () => {
  let looked = false;
  const spy = async () => {
    looked = true; return true;
  };
  assert.match(
      await reasonFor({type: "grade", album_sur: "a/b", grade: 3}, spy),
      /album_sur/);
  assert.equal(looked, false);
});

test("validation: partition valides / invalides", async () => {
  const actions = [
    {type: "grade", album_sur: "Burial-Untrue", grade: 4}, // ok
    {type: "grade", album_sur: "Missing-Album", grade: 4}, // album absent
    {type: "comment", album_sur: "Daft Punk-Discovery", commentaire: "x"}, // ok
  ];
  const {valid, invalid} = await validateActions(actions, albumExists);
  assert.equal(valid.length, 2);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].action.album_sur, "Missing-Album");
  assert.match(invalid[0].reason, /introuvable/); // raison lisible côté client
});
