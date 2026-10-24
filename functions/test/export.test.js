"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {buildExport} = require("../src/export/model");

const sc = (uts, artist, album) =>
  ({uts, artist, album, album_sur: `${artist}-${album}`,
    track: "secret", track_sur: `${artist}-${album}-secret`});

test("buildExport: albums une fois, écoutes triées [uts, n°]", () => {
  const scrobbles = [sc(30, "Muse", "Absolution"),
    sc(10, "PNL", "Dans la légende"),
    sc(20, "Muse", "Absolution"), {uts: 5, artist: "X", album: ""}];
  const libAll = [{album_sur: "Muse-Absolution", artist: "Muse",
    album: "Absolution", genre: "Rock", sousgenre: "Alternative", grade: 4,
    commentaire: "privé"}];
  const g = new Map([["PNL", {genre: "Rap", sousgenre: "Cloud"}]]);
  const out = buildExport(scrobbles, libAll, g, "2026-10-10T00:00:00Z");
  assert.equal(out.version, 1);
  assert.deepEqual(out.albums, [
    ["Muse", "Absolution", "Rock", "Alternative", 4],
    ["PNL", "Dans la légende", "Rap", "Cloud", null],
  ]);
  assert.deepEqual(out.listens, [[10, 1], [20, 0], [30, 0]]);
  // Ni titres de morceaux ni commentaires.
  const raw = JSON.stringify(out);
  assert.ok(!raw.includes("secret"));
  assert.ok(!raw.includes("privé"));
});

test("buildExport: titre le plus écouté par album (≥ 5 écoutes)", () => {
  const t = (uts, track) => ({uts, artist: "Iris", album: "Album X", track,
    album_sur: "Iris-Album X"});
  const scrobbles = [...[1, 2, 3, 4, 5, 6].map((u) => t(u, "Eden Drugs")),
    t(7, "Titre B"), t(8, "Titre C"),
    {uts: 9, artist: "A", album: "Petit", track: "Seul", album_sur: "A-Petit"}];
  const out = buildExport(scrobbles, [], new Map(), "2026-10-12T00:00:00Z");
  assert.deepEqual(out.columns.tops,
      ["album", "track", "listens", "distinct_tracks"]);
  // L'album « Petit » (1 écoute) n'a pas de ligne.
  assert.deepEqual(out.tops, [[0, "Eden Drugs", 6, 3]]);
});

test("buildDiag: petits albums, morceau, suspect, réponse Last.fm", () => {
  const {buildDiag} = require("../src/export/model");
  const {isSuspect} = require("../src/albums/canon");
  const s = (album, track, raw) => ({artist: "Muse", album, track,
    album_sur: `Muse-${album}`, track_sur: `Muse-${raw || album}-${track}`,
    ...(raw !== undefined ? {raw_album_sur: `Muse-${raw}`} : {})});
  const scrobbles = [s("Hysteria", "Hysteria"), s("Hysteria", "Hysteria"),
    s("Starboy", "Starboy (feat. X)"), s("Showbiz", "Unintended", "Unintended"),
    ...Array.from({length: 5}, () => s("Absolution", "Time"))];
  const cache = {"Muse-Hysteria-Hysteria": [null, 1],
    "Muse-Unintended-Unintended": ["Showbiz", 1]};
  const {rows} = buildDiag(scrobbles, cache, isSuspect);
  assert.deepEqual(rows, [
    ["Muse", "Hysteria", "Hysteria", "Hysteria", 1, null],
    ["Muse", "Starboy", "Starboy", "Starboy (feat. X)", 0, ""],
    ["Muse", "Showbiz", "Unintended", "Unintended", 1, "Showbiz"],
  ]);
});

test("buildDiag: proposition MusicBrainz (mode à blanc) et suspects", () => {
  const {buildDiag} = require("../src/export/model");
  const {isSuspect} = require("../src/albums/canon");
  const {mbKey, propose} = require("../src/quality/mb");
  const {fold} = require("../src/albums/canon");
  const big = Array.from({length: 5}, () => ({artist: "Muse",
    album: "Absolution", track: "Hysteria", album_sur: "Muse-Absolution",
    track_sur: "Muse-Hysteria-Hysteria", raw_album_sur: "Muse-Hysteria"}));
  const sc = [...big, {artist: "Muse", album: "Starboy", track: "Plug In Baby",
    album_sur: "Muse-Starboy", track_sur: "Muse-Starboy-Plug In Baby"}];
  const hit = {rg: "g", title: "Origin of Symmetry", type: "Album", sec: [],
    date: "2001-06-18", disc: 1, pos: 5, total: 11, release: "r", exact: 1};
  const mb = {cache: {[mbKey("Muse", "Plug In Baby")]: [[hit], 1]},
    key: mbKey, propose, fold,
    library: new Map([["muse", new Set(["origin of symmetry"])]])};
  const {columns, rows} = buildDiag(sc, {}, isSuspect, mb);
  assert.equal(columns.length, 12);
  assert.deepEqual(rows, [
    ["Muse", "Absolution", "Hysteria", "Hysteria", 1, "",
      "", "", "", "", 0, ""],
    ["Muse", "Starboy", "Starboy", "Plug In Baby", 0, "",
      "sure", "Origin of Symmetry", "2001", "5/11", 1,
      "Sur Origin of Symmetry (2001), piste 5"],
  ]);
});

test("buildQualityReview : décisions + passés non tranchés, triés", () => {
  const {buildQualityReview} = require("../src/export/model");
  const ts = {toDate: () => new Date("2026-10-11T10:00:00Z")};
  const out = buildQualityReview(
      [{id: "a", artist: "Muse", track: "Hysteria", raw_album_sur: "Muse-X",
        decision: "keep", at: ts}],
      [{id: "a", artist: "Muse", track: "Hysteria", listens: 9},
        {id: "b", artist: "Nekfeu", track: "Ciel", listens: 3,
          proposed_album: "Feu", at: ts},
        {id: "c", artist: "Abba", track: "SOS", listens: 12}]);
  assert.equal(out.decisions.length, 1);
  assert.equal(out.decisions[0].at, "2026-10-11T10:00:00.000Z");
  assert.deepEqual(out.later.map((l) => l.track), ["SOS", "Ciel"]);
  assert.equal(out.later[1].proposed_album, "Feu");
  assert.deepEqual(out.applied, []);
});

test("buildQualityReview : proposition au moment de trancher, appliqués",
    () => {
      const {buildQualityReview} = require("../src/export/model");
      const out = buildQualityReview(
          [{id: "a", artist: "Muse", track: "Hysteria", decision: "move",
            to_album: "Absolution", proposed_album: "Absolution",
            proposed_kind: "check", proposed_reason: "Autre version",
            reviewed: true}],
          [],
          [{id: "a", artist: "Muse", track: "Hysteria",
            raw_album_sur: "Muse-X", to_album: "Absolution", source: "axel",
            batch: "b1"}]);
      assert.equal(out.decisions[0].proposed_kind, "check");
      assert.equal(out.decisions[0].reviewed, 1);
      assert.deepEqual(out.applied.map((c) => [c.track, c.source, c.batch]),
          [["Hysteria", "axel", "b1"]]);
    });
