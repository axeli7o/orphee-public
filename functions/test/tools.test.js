"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterAlbums,
  sortAlbums,
  slimAlbum,
  clampLimit,
  filterMonthsByYear,
} = require("../src/chat/tools");

// ---- Fixtures ----

const albums = [
  {album_sur: "Burial-Untrue", artist: "Burial", album: "Untrue",
    grade: 5, grade_label: "adored", personal_fav: true,
    listen_count: 120, genre: "Électronique", sousgenre: "Dubstep",
    first_listen_y: 2019},
  {album_sur: "Radiohead-In Rainbows", artist: "Radiohead",
    album: "In Rainbows", grade: 5, grade_label: "adored",
    personal_fav: false, listen_count: 200, genre: "Rock",
    sousgenre: "Art rock", first_listen_y: 2017},
  {album_sur: "Moderat-II", artist: "Moderat", album: "II",
    grade: 1, grade_label: "skip", personal_fav: false,
    listen_count: 80, genre: "Électronique", sousgenre: "Techno",
    first_listen_y: 2018},
  {album_sur: "Caribou-Our Love", artist: "Caribou", album: "Our Love",
    grade: null, grade_label: null, personal_fav: false,
    listen_count: 150, genre: "Électronique", sousgenre: "Dance",
    first_listen_y: 2020},
];

const oddSet = new Set(["Moderat-II"]);

// ---- filterAlbums ----

test("filterAlbums: artiste partiel insensible à la casse", () => {
  const r = filterAlbums(albums, {artist: "radio"}, oddSet);
  assert.equal(r.length, 1);
  assert.equal(r[0].album_sur, "Radiohead-In Rainbows");
});

test("filterAlbums: genre partiel", () => {
  const r = filterAlbums(albums, {genre: "électro"}, oddSet);
  assert.equal(r.length, 3);
});

test("filterAlbums: grade_min/grade_max excluent les non notés", () => {
  const r = filterAlbums(albums, {grade_min: 5}, oddSet);
  assert.equal(r.length, 2);
  const low = filterAlbums(albums, {grade_max: 2}, oddSet);
  assert.deepEqual(low.map((a) => a.album_sur), ["Moderat-II"]);
});

test("filterAlbums: is_rated true/false", () => {
  assert.equal(filterAlbums(albums, {is_rated: true}, oddSet).length, 3);
  const unrated = filterAlbums(albums, {is_rated: false}, oddSet);
  assert.deepEqual(unrated.map((a) => a.album_sur), ["Caribou-Our Love"]);
});

test("filterAlbums: is_oddity s'appuie sur le set fourni", () => {
  const r = filterAlbums(albums, {is_oddity: true}, oddSet);
  assert.deepEqual(r.map((a) => a.album_sur), ["Moderat-II"]);
  assert.equal(filterAlbums(albums, {is_oddity: false}, oddSet).length, 3);
});

test("filterAlbums: plage d'années sur first_listen_y", () => {
  const r = filterAlbums(albums, {year_from: 2018, year_to: 2019}, oddSet);
  assert.deepEqual(
      r.map((a) => a.album_sur).sort(),
      ["Burial-Untrue", "Moderat-II"]);
});

test("filterAlbums: critères combinés (ET)", () => {
  const r = filterAlbums(
      albums, {genre: "électro", grade_min: 4}, oddSet);
  assert.deepEqual(r.map((a) => a.album_sur), ["Burial-Untrue"]);
});

test("filterAlbums: sans params retourne tout", () => {
  assert.equal(filterAlbums(albums, {}, oddSet).length, 4);
});

// ---- sortAlbums ----

test("sortAlbums: défaut = listen_count desc, sans muter l'entrée", () => {
  const input = albums.slice();
  const r = sortAlbums(input, undefined);
  assert.deepEqual(
      r.map((a) => a.listen_count), [200, 150, 120, 80]);
  // immutabilité
  assert.deepEqual(input.map((a) => a.album_sur),
      albums.map((a) => a.album_sur));
});

test("sortAlbums: grade desc avec listen_count en tie-break", () => {
  const r = sortAlbums(albums, "grade");
  // deux grade=5 : Radiohead (200) avant Burial (120)
  assert.deepEqual(r.slice(0, 2).map((a) => a.album_sur),
      ["Radiohead-In Rainbows", "Burial-Untrue"]);
});

test("sortAlbums: first_listen desc", () => {
  const r = sortAlbums(albums, "first_listen");
  assert.deepEqual(r.map((a) => a.first_listen_y), [2020, 2019, 2018, 2017]);
});

// ---- slimAlbum ----

test("slimAlbum: réduit aux champs carte, grade null géré", () => {
  const s = slimAlbum(albums[3]);
  assert.deepEqual(s, {
    album_sur: "Caribou-Our Love",
    artist: "Caribou",
    album: "Our Love",
    grade: null,
    grade_label: null,
    commentaire: null,
    listen_count: 150,
    genre: "Électronique",
    sousgenre: "Dance",
    first_listen_y: 2020,
  });
});

test("slimAlbum: grade undefined → null", () => {
  const s = slimAlbum({album_sur: "X-Y", artist: "X", album: "Y"});
  assert.equal(s.grade, null);
  assert.equal(s.listen_count, 0);
});

// ---- clampLimit ----

test("clampLimit: défaut, plafond, valeurs invalides", () => {
  assert.equal(clampLimit(undefined), 25);
  assert.equal(clampLimit(10), 10);
  assert.equal(clampLimit(999), 50);
  assert.equal(clampLimit(0), 25);
  assert.equal(clampLimit(-3), 25);
  assert.equal(clampLimit("abc"), 25);
});

// ---- filterMonthsByYear ----

const md = [
  {month: "2017-11", count: 3},
  {month: "2018-02", count: 5},
  {month: "2019-06", count: 2},
];

test("filterMonthsByYear: sans bornes retourne tout", () => {
  assert.equal(filterMonthsByYear(md).length, 3);
});

test("filterMonthsByYear: borne basse et haute incluses", () => {
  const r = filterMonthsByYear(md, 2018, 2018);
  assert.deepEqual(r.map((m) => m.month), ["2018-02"]);
});

test("filterMonthsByYear: borne basse seule", () => {
  const r = filterMonthsByYear(md, 2018);
  assert.deepEqual(r.map((m) => m.month), ["2018-02", "2019-06"]);
});
