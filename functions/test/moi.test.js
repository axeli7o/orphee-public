"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {buildMoiSlice, keysIn} = require("../src/refresh/moi");

test("keysIn : tous les album_sur cités, à toute profondeur", () => {
  const k = keysIn([{hot: [{album_sur: "A-1"}], dormant: []},
    {items: [{albums: [{album_sur: "B-2"}], top: {album_sur: "C-3"}}]}, null]);
  assert.deepEqual([...k].sort(), ["A-1", "B-2", "C-3"]);
});

test("buildMoiSlice : notés, très écoutés ou cités ; sans description", () => {
  const card = (sur, n, extra = {}) => ({album_sur: sur, artist: sur[0],
    album: sur, listen_count: n, grade: null, personal_fav: false,
    commentaire: "secret", genre: "", sousgenre: "", ...extra});
  const lib = [
    card("A-noté", 2, {grade: 5}),
    card("B-gros", 25),
    card("C-cité", 3),
    card("D-petit", 2),
  ];
  const s = buildMoiSlice(lib, new Map([["A", {genre: "Rock", sousgenre: ""}]]),
      {threshold: 10, percentile: 90, eligible: [1, 2],
        albums_above_threshold: 1}, new Set(["C-cité"]));
  assert.deepEqual(s.items.map((a) => a.album_sur),
      ["A-noté", "B-gros", "C-cité"]);
  assert.equal(s.items[0].commentaire, undefined);
  assert.deepEqual(s.artists, {A: {genre: "Rock", sousgenre: ""}});
  // B : non classé, top écoutes, un album sans genre → à classer.
  assert.deepEqual(s.classify.map((c) => [c.artist, c.listens, c.tops]),
      [["B", 25, ["B-gros"]], ["C", 3, ["C-cité"]], ["D", 2, ["D-petit"]]]);
  assert.deepEqual(s.oddity,
      {threshold: 10, percentile: 90, eligible: [1, 2], gradeable: 1});
});
