"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {buildArtists, buildClusters} = require("../src/refresh/artists");

// Écoutes de démonstration : n écoutes d'un artiste dans une année (le 1er
// mars), espacées d'une heure — une séance chacune.
const yearTs = (y) => Date.UTC(y, 2, 1) / 1000;
/**
 * @param {string} artist
 * @param {number} y
 * @param {number} n
 * @return {Array<Object>}
 */
function spread(artist, y, n) {
  return Array.from({length: n},
      (_, i) => ({uts: yearTs(y) + i * 3600, artist}));
}

test("buildArtists : récits sur les années actives, un artiste par récit",
    () => {
      const sc = [];
      for (let y = 2015; y <= 2023; y++) {
        sc.push(...spread("Pilier", y, 30)); // fond, fixe les années
      }
      sc.push(...spread("Fulgu", 2017, 200), ...spread("Fulgu", 2018, 5));
      sc.push(...spread("Nouveau", 2023, 80));
      sc.push(...spread("Revenant", 2015, 60), ...spread("Revenant", 2022, 25),
          ...spread("Revenant", 2023, 10));
      sc.push(...spread("Perdu", 2016, 250));
      const r = buildArtists(sc);
      assert.deepEqual(r.years, [2015, 2016, 2017, 2018, 2019, 2020, 2021,
        2022, 2023]);
      assert.deepEqual(r.rows.piliers, ["Pilier"]);
      assert.deepEqual(r.rows.decouvertes, ["Nouveau"]);
      assert.deepEqual(r.rows.retrouvailles, ["Revenant"]);
      // Perdu (2016 = 100 %) est d'abord une fulgurance : un seul récit, et
      // les fulgurances vont du plus gros pic au plus petit.
      assert.deepEqual(r.rows.fulgurances, ["Perdu", "Fulgu"]);
      assert.equal(r.rows.perdus.length, 0);
      assert.equal(r.series.Fulgu.n, 205);
      assert.equal(r.series.Nouveau.first, 2023);
    });

test("buildArtists : année blanche ignorée, « Souvent avec » par séance",
    () => {
      const sc = [];
      for (const y of [2015, 2016, 2017, 2018]) sc.push(...spread("A", y, 300));
      sc.push({uts: yearTs(2019), artist: "A"}); // année blanche
      // 12 séances en septembre où B et C s'enchaînent (10 min d'écart).
      for (let i = 0; i < 12; i++) {
        const t = Date.UTC(2017, 8, 1) / 1000 + 86400 * i;
        sc.push({uts: t, artist: "B"}, {uts: t + 600, artist: "C"});
      }
      const r = buildArtists(sc);
      assert.ok(!r.years.includes(2019));
      assert.deepEqual(r.with.B, [{a: "C", n: 12}]);
      assert.deepEqual(r.with.C, [{a: "B", n: 12}]);
      assert.equal(r.with.A, undefined); // jamais avec B ou C ≥ 10 fois
    });

test("buildClusters : deux communautés nettes + un pont", () => {
  const sc = [];
  const sess = (arts, t) => arts.forEach((a, i) =>
    sc.push({uts: t + i * 60, artist: a}));
  let t = Date.UTC(2017, 0, 1) / 1000;
  // Monde A : A1/A2/A3 enchaînés 25 fois ; Monde B : B1/B2/B3, 25 fois.
  for (let i = 0; i < 25; i++) {
    sess(["A1", "A2", "A3"], t);
    t += 86400;
  }
  for (let i = 0; i < 25; i++) {
    sess(["B1", "B2", "B3"], t);
    t += 86400;
  }
  // Pont : A1 et B1 enchaînés 22 fois (≥ seuil, mais < les liens internes).
  for (let i = 0; i < 22; i++) {
    sess(["A1", "B1"], t);
    t += 86400;
  }
  const r = buildClusters(sc);
  assert.equal(r.resolution, 1.5);
  assert.equal(r.min_edge, 20);
  assert.equal(r.clusters.length, 2);
  const setOf = (a) => r.clusters.map((c) => new Set(c.members.map((m) => m.a)))
      .find((s) => s.has(a));
  assert.ok(setOf("A1").has("A2") && setOf("A1").has("A3"));
  assert.ok(setOf("B1").has("B2") && setOf("B1").has("B3"));
  assert.notStrictEqual(setOf("A1"), setOf("B1")); // deux mondes distincts
  assert.deepEqual(Object.keys(r.bridges), ["0-1"]); // un seul pont
});

test("buildArtists : « Ta musique » sort des récits, ses titres en tête",
    () => {
      const sc = [];
      for (let y = 2015; y <= 2023; y++) {
        sc.push(...spread("Pilier", y, 30));
        sc.push(...spread("Moi Même", y, 20).map((s, i) =>
          ({...s, track: i % 4 ? "Thème" : "Combat"})));
      }
      const sans = buildArtists(sc);
      assert.ok(sans.rows.piliers.includes("Moi Même"));
      assert.equal(sans.mine, null);
      const r = buildArtists(sc, "  moi même ");
      assert.deepEqual(r.rows.piliers, ["Pilier"]);
      assert.equal(r.mine.artist, "Moi Même");
      assert.deepEqual(r.mine.tracks,
          [{t: "Thème", n: 135}, {t: "Combat", n: 45}]);
      assert.equal(r.series["Moi Même"].n, 180);
    });
