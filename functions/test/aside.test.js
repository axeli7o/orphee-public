"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {buildAsideDays} = require("../src/refresh/aside");

const H = 3600;
// 2026-09-01 12:00 UTC
const T0 = Date.UTC(2026, 8, 1, 12) / 1000;

test("buildAsideDays : un jour = sa dernière écoute, après la date", () => {
  const scrobbles = [
    {album_sur: "A-x", uts: T0 - 5 * 24 * H}, // avant : ignorée
    {album_sur: "A-x", uts: T0 + H},
    {album_sur: "A-x", uts: T0 + 2 * H}, // même jour : garde la dernière
    {album_sur: "A-x", uts: T0 + 26 * H},
    {album_sur: "B-y", uts: T0 + H}, // pas mis de côté
  ];
  const out = buildAsideDays(scrobbles, new Map([["A-x", T0 * 1000]]));
  assert.deepStrictEqual(out, {"A-x": [T0 + 2 * H, T0 + 26 * H]});
});

test("buildAsideDays : jamais réécouté → liste vide", () => {
  const out = buildAsideDays([], new Map([["A-x", T0 * 1000]]));
  assert.deepStrictEqual(out, {"A-x": []});
});

test("buildAsideDays : jour à l’heure de Paris", () => {
  const night = Date.UTC(2026, 8, 1, 23, 30) / 1000;
  const scrobbles = [
    {album_sur: "A-x", uts: night - 2 * H}, // 21 h 30 UTC → 1er sept.
    {album_sur: "A-x", uts: night}, // 0 h 30 à Paris → 2 sept.
  ];
  const out = buildAsideDays(scrobbles, new Map([["A-x", 0]]));
  assert.strictEqual(out["A-x"].length, 2);
});

test("buildAsideDays : uts en texte accepté, pas de pile → objet vide", () => {
  const none = buildAsideDays([{album_sur: "A-x", uts: "5"}], new Map());
  assert.deepStrictEqual(none, {});
  const out = buildAsideDays([{album_sur: "A-x", uts: String(T0)}],
      new Map([["A-x", 0]]));
  assert.deepStrictEqual(out, {"A-x": [T0]});
});
