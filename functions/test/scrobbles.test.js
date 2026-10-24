"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const M = require("../src/scrobbles/model");

const lf = (uts, artist, album, name, extra = {}) => ({
  artist: {"#text": artist}, album: {"#text": album}, name,
  date: uts === null ? undefined : {uts: String(uts)}, ...extra,
});

test("fromLastfm: normalise, clés à l'identique de la Sheet", () => {
  const s = M.fromLastfm(lf(1700000000, "Muse", "Drones", "Dead Inside"));
  assert.deepEqual(s, {
    uts: 1700000000, artist: "Muse", album: "Drones", track: "Dead Inside",
    album_sur: "Muse-Drones", track_sur: "Muse-Drones-Dead Inside",
  });
});

test("fromLastfm: « now playing » et lignes sans date ignorés", () => {
  assert.equal(M.fromLastfm(lf(null, "A", "B", "C",
      {"@attr": {nowplaying: "true"}})), null);
  assert.equal(M.fromLastfm(lf(null, "A", "B", "C")), null);
  assert.equal(M.fromLastfm(lf(1700000000, "", "B", "C")), null);
});

test("fromLastfm: album vide → clé terminée par « - » (comme la Sheet)", () => {
  assert.equal(M.fromLastfm(lf(1, "A", "", "C")).album_sur, "A-");
});

test("merge: idempotent sur (uts, track_sur), append-only, trié", () => {
  const a = M.fromLastfm(lf(10, "A", "B", "x"));
  const b = M.fromLastfm(lf(20, "A", "B", "y"));
  const c = M.fromLastfm(lf(30, "A", "B", "x"));
  const r1 = M.merge([a], [b, c, a]);
  assert.equal(r1.added, 2);
  assert.deepEqual(r1.list.map((s) => s.uts), [30, 20, 10]);
  // Rejouer la même fenêtre n'ajoute rien.
  const r2 = M.merge(r1.list, [a, b, c]);
  assert.equal(r2.added, 0);
  assert.equal(r2.list.length, 3);
});

test("byYear / yearOf: partition UTC", () => {
  const list = [{uts: Date.UTC(2025, 11, 31, 23) / 1000},
    {uts: Date.UTC(2026, 0, 1, 0) / 1000}];
  const p = M.byYear(list);
  assert.deepEqual([...p.keys()].sort(), [2025, 2026]);
});

// ---- Last.fm : fenêtre figée, pagination, tout-ou-rien ----
const {fetchWindow} = require("../src/scrobbles/lastfm");

/**
 * Faux Last.fm : `pages` = tableaux de lignes ; erreur à la page `failAt`.
 * @param {Array<Array<Object>>} pages
 * @param {number} [failAt]
 * @return {{fetchImpl: Function, calls: Array<string>}}
 */
function fakeLastfm(pages, failAt) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = parseInt(new URL(url).searchParams.get("page"), 10);
    if (page === failAt) {
      return {ok: false, status: 500, json: async () => ({})};
    }
    return {ok: true, status: 200, json: async () => ({recenttracks: {
      "track": pages[page - 1],
      "@attr": {totalPages: String(pages.length)},
    }})};
  };
  return {fetchImpl, calls};
}

test("fetchWindow: toutes les pages, now playing et hors fenêtre exclus",
    async () => {
      const {fetchImpl, calls} = fakeLastfm([
        [lf(null, "A", "B", "np", {"@attr": {nowplaying: "true"}}),
          lf(300, "A", "B", "x"), lf(250, "A", "B", "y")],
        [lf(200, "A", "B", "z"), lf(100, "A", "B", "old")],
      ]);
      const out = await fetchWindow({user: "u", apiKey: "k", from: 100,
        to: 300, fetchImpl});
      assert.deepEqual(out.map((s) => s.uts), [300, 250, 200]);
      assert.equal(calls.length, 2);
      const q = new URL(calls[0]).searchParams;
      assert.equal(q.get("from"), "101"); // l'écoute connue est exclue
      assert.equal(q.get("to"), "300");
    });

test("fetchWindow: une page en échec → toute la fenêtre échoue", async () => {
  const {fetchImpl} = fakeLastfm([[lf(300, "A", "B", "x")],
    [lf(200, "A", "B", "y")]], 2);
  await assert.rejects(fetchWindow({user: "u", apiKey: "k", from: 0,
    to: 300, fetchImpl}), /Last\.fm/);
});

