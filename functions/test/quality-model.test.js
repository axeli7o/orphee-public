"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {buildQuality, itemId} = require("../src/quality/model");
const {mbKey, propose} = require("../src/quality/mb");

test("buildQuality : propositions par titre reçu, ok seulement comptés",
    () => {
      const s = (album, track, raw, n) => Array.from({length: n}, () => ({
        artist: "Muse", album, track, album_sur: `Muse-${album}`,
        ...(raw ? {raw_album_sur: `Muse-${raw}`} : {})}));
      const sc = [
        ...s("Absolution", "Hysteria", null, 10),
        ...s("Starboy", "Plug In Baby", null, 2),
        ...s("Absolution", "Time Is Running Out", "Time Is Running Out", 3),
        ...s("Hysteria", "Eternally Missed", null, 1),
        ...s("Showbiz", "Sunburn", null, 1),
      ];
      const oos = {rg: "g", title: "Origin of Symmetry", type: "Album",
        sec: [], date: "2001-06-18", disc: 1, pos: 5, total: 11,
        release: "r1", exact: 1};
      const abs = {...oos, title: "Absolution", date: "2003-09-15", pos: 3,
        total: 14, release: "r2"};
      const single = {rg: "s", title: "", type: "Single", sec: [], date: "",
        disc: 1, pos: 0, total: 0, release: "", exact: 1};
      const cache = {
        [mbKey("Muse", "Plug In Baby")]: [[oos], 1],
        [mbKey("Muse", "Time Is Running Out")]: [[abs], 1],
        [mbKey("Muse", "Eternally Missed")]: [[single], 1],
      };
      const targets = () => new Set([mbKey("Muse", "Plug In Baby"),
        mbKey("Muse", "Time Is Running Out"),
        mbKey("Muse", "Eternally Missed"), mbKey("Muse", "Sunburn")]);
      const {summary, items} = buildQuality(sc, cache, {key: mbKey, propose,
        targets, library: new Map([["muse",
          new Set(["origin of symmetry", "absolution"])]])});
      assert.equal(summary.total_listens, 17);
      assert.equal(summary.base_listens, 13); // 10 Hysteria + 3 ok
      assert.equal(summary.unverified_listens, 1); // Sunburn
      assert.deepEqual(summary.titles,
          {sure: 1, check: 0, keep: 1, unknown: 0, ok: 1, linked: 0});
      assert.deepEqual(items.map((i) => [i.t, i.k, i.n, i.f, i.to]), [
        ["Plug In Baby", "sure", 2, "Starboy", "Origin of Symmetry"],
        ["Eternally Missed", "keep", 1, "Hysteria", ""],
      ]);
      assert.equal(items[0].id, itemId("Muse", "Plug In Baby", "Muse-Starboy"));
      assert.equal(items[0].r, "Starboy");
      assert.equal(items[0].ts, ""); // Origin of Symmetry pas écouté ici
    });

test("buildQuality : rattachés d'office, silencieux, hors santé", () => {
  // « Hysteria » reçu en single, rangé d'office sous Absolution.
  const sc = [
    ...Array.from({length: 4}, () => ({artist: "Muse", album: "Absolution",
      track: "Hysteria", album_sur: "Muse-Absolution",
      raw_album_sur: "Muse-Hysteria - Single"})),
    {artist: "Muse", album: "Absolution", track: "Butterflies",
      album_sur: "Muse-Absolution"},
  ];
  const {summary, items} = buildQuality(sc, {}, {key: mbKey, propose,
    targets: () => new Set(), library: new Map()});
  assert.equal(summary.total_listens, 5);
  assert.equal(summary.base_listens, 5); // la santé ne bouge pas
  assert.equal(summary.titles.linked, 1);
  assert.deepEqual(items.map((i) => [i.t, i.k, i.n, i.f, i.to, i.ts]), [
    ["Hysteria", "linked", 4, "Absolution", "Hysteria - Single",
      "Muse-Hysteria - Single"],
  ]);
  assert.equal(items[0].id,
      itemId("Muse", "Hysteria", "Muse-Hysteria - Single"));
});

test("buildQuality : doute sur un titre déjà rangé → rv (pile À revoir)",
    () => {
      const sc = [
        // Live rangé sur l'album studio : rattaché, hors cache MusicBrainz.
        ...Array.from({length: 3}, () => ({artist: "AC/DC",
          album: "Let There Be Rock", track: "Whole Lotta Rosie",
          album_sur: "AC/DC-Let There Be Rock",
          raw_album_sur: "AC/DC-Live at River Plate"})),
        // Rangé sur un coffret qui porte le nom de l'album.
        ...Array.from({length: 2}, () => ({artist: "John Lennon",
          album: "Imagine", track: "Happy Xmas",
          album_sur: "John Lennon-Imagine",
          raw_album_sur: "John Lennon-Signature Box"})),
        // Rangé sans doute.
        {artist: "Muse", album: "Absolution", track: "Hysteria",
          album_sur: "Muse-Absolution", raw_album_sur: "Muse-Hysteria"},
      ];
      const box = {rg: "g", title: "Imagine", type: "Album", sec: [],
        date: "2018-10-05", disc: 1, pos: 32, total: 59, release: "r",
        exact: 1};
      const cache = {[mbKey("John Lennon", "Happy Xmas")]: [[box], 1]};
      const {items} = buildQuality(sc, cache, {key: mbKey, propose,
        targets: () => new Set([mbKey("John Lennon", "Happy Xmas")]),
        library: new Map([["john lennon", new Set(["imagine"])]])});
      const by = Object.fromEntries(items.map((i) => [i.t, i]));
      assert.equal(by["Whole Lotta Rosie"].rv,
          "Version live rangée sur un album studio");
      assert.equal(by["Whole Lotta Rosie"].k, "linked");
      // « ok » pour le moteur, mais montré pour être revu.
      assert.equal(by["Happy Xmas"].k, "ok");
      assert.match(by["Happy Xmas"].rv, /piste 32 sur 59/);
      assert.equal(by["Hysteria"].rv, undefined);
    });

test("albumNature : libellés dont toutes les écoutes sont à part", () => {
  const {albumNature} = require("../src/quality/model");
  const lib = [
    {album_sur: "Muse-Hysteria", album: "Hysteria", listen_count: 2},
    {album_sur: "Muse-Invincible", album: "Invincible", listen_count: 2},
    {album_sur: "Muse-Absolution", album: "Absolution", listen_count: 50},
    {album_sur: "Muse-Live at Reading", album: "Live at Reading",
      listen_count: 40},
  ];
  const items = [
    {a: "Muse", f: "Hysteria", t: "Eternally Missed", k: "keep", n: 2,
      w: "Seulement sur un single ou un EP"},
    {a: "Muse", f: "Invincible", t: "Knights Of Cydonia [Remix]", k: "keep",
      n: 2, w: "Version remix ou live : à part"},
    // Une face B écoutée sous Absolution n'en fait pas un single.
    {a: "Muse", f: "Absolution", t: "Fury", k: "keep", n: 3,
      w: "Seulement sur un single ou un EP"},
  ];
  assert.deepEqual(Object.fromEntries(albumNature(lib, items)), {
    "Muse-Hysteria": "single",
    "Muse-Invincible": "remix",
    "Muse-Live at Reading": "live",
  });
});
