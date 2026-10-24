"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {buildRecent, HOT_DAYS} = require("../src/refresh/selection");

const DAY = 86400;
const REF = Date.UTC(2026, 7, 4) / 1000; // dernière écoute connue
const sc = (key, uts) => ({album_sur: key, uts});
const lib = (key, n) => ({album_sur: key, listen_count: n});

test("buildRecent: « récent » = fenêtre avant la DERNIÈRE écoute", () => {
  const scrobbles = [
    sc("A", REF), sc("A", REF - DAY), sc("A", REF - 2 * DAY),
    sc("B", REF - 3 * DAY),
    sc("C", REF - (HOT_DAYS + 5) * DAY), // hors fenêtre
  ];
  const libAll = [lib("A", 3), lib("B", 1), lib("C", 1)];
  const r = buildRecent(scrobbles, libAll, new Map());
  assert.equal(r.ref_uts, REF);
  assert.deepEqual(r.hot,
      [{album_sur: "A", count: 3}, {album_sur: "B", count: 1}]);
});

test("buildRecent: dormants = très écoutés, plus écoutés depuis 2 ans", () => {
  const old = REF - 3 * 365 * DAY;
  const scrobbles = [sc("Old", old), sc("Older", old - DAY), sc("Now", REF)];
  const libAll = [lib("Old", 50), lib("Older", 200), lib("Now", 999)];
  const r = buildRecent(scrobbles, libAll, new Map());
  assert.deepEqual(r.dormant.map((d) => d.album_sur), ["Older", "Old"]);
  assert.equal(r.dormant[1].last_uts, old);
});

test("buildRecent: artistes classés (E8) et cas vide", () => {
  const artists = new Map([["X", {genre: "Rock", sousgenre: ""}]]);
  assert.deepEqual(buildRecent([], [], artists),
      {ref_uts: null, hot_days: HOT_DAYS, hot: [], dormant: [],
        classified_artists: ["X"]});
});
