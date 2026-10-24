"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {normName, isPlaceholder, pickArtistImage, topArtists} =
  require("../src/covers/artists");

test("normName: accents, casse, ponctuation, &", () => {
  assert.equal(normName("Ólafur Arnalds"), "olafur arnalds");
  assert.equal(normName("Chase & Status"), "chase and status");
  assert.equal(normName("AC/DC"), "ac dc");
});

test("pickArtistImage: correspondance stricte, sinon rien", () => {
  const results = [
    {name: "Daft Punk Tribute", picture_xl: "x"},
    {name: "Daft Punk", picture_xl: "https://img/dp-xl", picture_big: "b"},
  ];
  assert.equal(pickArtistImage(results, "daft punk"), "https://img/dp-xl");
  // Pas d'homonyme approximatif.
  assert.equal(pickArtistImage([{name: "Phoenix Rising",
    picture_xl: "y"}], "Phoenix"), null);
  assert.equal(pickArtistImage(null, "X"), null);
});

test("pickArtistImage: la silhouette Deezer ne compte pas", () => {
  const cdn = "https://e-cdns-images.dzcdn.net/images/artist/";
  const ph = cdn + "/1000x1000-000000-80-0-0.jpg";
  const real = cdn + "abc123/1000x1000-000000-80-0-0.jpg";
  assert.equal(isPlaceholder(ph), true);
  assert.equal(isPlaceholder(real), false);
  assert.equal(isPlaceholder(null), false);
  // Homonyme exact sans photo, puis le bon : on prend celui qui a une photo.
  assert.equal(pickArtistImage([{name: "Last Train", picture_xl: ph},
    {name: "Last Train", picture_xl: real}], "Last Train"), real);
  assert.equal(pickArtistImage([{name: "Last Train", picture_xl: ph}],
      "Last Train"), null);
});

test("topArtists: cumul des écoutes par artiste", () => {
  const lib = [
    {artist: "A", listen_count: 10}, {artist: "B", listen_count: 30},
    {artist: "A", listen_count: 25}, {artist: "", listen_count: 99},
  ];
  assert.deepEqual(topArtists(lib, 2), ["A", "B"]);
});

test("pickArtistImage: homonymes → le plus suivi ; silhouette d41d8 ignorée",
    () => {
      const cdn = "https://e-cdns-images.dzcdn.net/images/artist/";
      const r = [
        {name: "PLK", picture_xl: cdn + "obscur/1.jpg", nb_fan: 12},
        {name: "PLK", picture_xl: cdn + "vrai/1.jpg", nb_fan: 900000},
        {name: "PLK", nb_fan: 5000000,
          picture_xl: cdn + "d41d8cd98f00b204e9800998ecf8427e/x.jpg"},
      ];
      assert.equal(pickArtistImage(r, "PLK"), cdn + "vrai/1.jpg");
    });

test("pickArtistFromAlbums: l'album désigne le bon artiste", () => {
  const {pickArtistFromAlbums} = require("../src/covers/artists");
  const cdn = "https://e-cdns-images.dzcdn.net/images/artist/";
  const r = [{title: "Weathering", artist: {name: "Last Train",
    picture_xl: cdn + "bon/1.jpg"}}];
  assert.equal(pickArtistFromAlbums(r, "Last Train"), cdn + "bon/1.jpg");
  // Autre artiste dans les résultats : ignoré.
  assert.equal(pickArtistFromAlbums([{artist: {name: "Muse Dash",
    picture_xl: cdn + "x/1.jpg"}}], "Muse"), null);
});

test("albumsByArtist: ses 2 albums les plus écoutés", () => {
  const {albumsByArtist} = require("../src/covers/artists");
  const m = albumsByArtist([
    {artist: "Muse", album: "Drones", listen_count: 5},
    {artist: "Muse", album: "Absolution", listen_count: 50},
    {artist: "Muse", album: "Origin", listen_count: 20},
  ]);
  assert.deepEqual(m.get("Muse"), ["Absolution", "Origin"]);
});
