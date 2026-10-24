"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {editionKey, isSuspect, canonicalize} = require("../src/albums/canon");
const {pickTrackAlbum, pendingTracks} = require("../src/albums/resolve");

const sc = (artist, album, track, uts = 1) => ({uts, artist, album, track,
  album_sur: `${artist}-${album}`, track_sur: `${artist}-${album}-${track}`});

test("editionKey: éditions réunies, autres disques séparés", () => {
  const k = editionKey;
  assert.equal(k("Night Visions (Deluxe)"), k("Night Visions"));
  assert.equal(k("Night Visions (Expanded Edition / Super Deluxe)"),
      k("Night Visions"));
  assert.equal(k("Absolution XX Anniversary"), k("Absolution"));
  assert.equal(k("The Dark Side Of The Moon [2011 - Remaster]"),
      k("The Dark Side of the Moon"));
  assert.equal(k("Won’t Stand Down - Single"), k("Won’t Stand Down"));
  assert.equal(k("Meteora 20th Anniversary Edition"), k("Meteora"));
  // Remix, live, parties numérotées : d'autres disques.
  assert.notEqual(k("Origin of Symmetry (XX Anniversary RemiXX)"),
      k("Origin of Symmetry"));
  assert.notEqual(k("Absolution (Live)"), k("Absolution"));
  assert.notEqual(k("Chambre 140 (Part.2)"), k("Chambre 140 (Part.1)"));
});

test("editionKey: « expansion », « réédition » seulement si marquées", () => {
  const k = editionKey;
  assert.equal(k("Les étoiles vagabondes : expansion"),
      k("Les étoiles vagabondes"));
  assert.equal(k("Orion (Réédition)"), k("Orion"));
  assert.equal(k("Orion - Réédition"), k("Orion"));
  assert.equal(k("Titre (Expansion)"), k("Titre"));
  // Un titre ordinaire n'est jamais coupé.
  assert.notEqual(k("The Great Expansion"), k("The Great"));
  assert.equal(k("Expansion"), "expansion");
  assert.notEqual(k("Expansion Pack"), k("Pack"));
  // Un sous-titre qui n'est pas une mention d'édition reste.
  assert.notEqual(k("Clancy : Live"), k("Clancy"));
  assert.notEqual(k("Hybrid Theory: Reanimation"), k("Hybrid Theory"));
});

test("isSuspect: vide, « - Single », ou nom du titre", () => {
  assert.equal(isSuspect("", "Unintended"), true);
  assert.equal(isSuspect("Unintended", "Unintended"), true);
  assert.equal(isSuspect("Dis-moi oui - Single", "Dis-moi oui"), true);
  assert.equal(isSuspect("Showbiz", "Unintended"), false);
});

test("canonicalize: titre résolu → son album, éditions réunies", () => {
  const raw = [
    sc("Muse", "Showbiz", "Sunburn"),
    sc("Muse", "Unintended", "Unintended"),
    sc("Muse", "", "Muscle Museum"),
    sc("Muse", "Absolution", "Hysteria"),
    sc("Muse", "Absolution", "Stockholm Syndrome"),
    sc("Muse", "Absolution XX Anniversary", "Hysteria"),
    sc("Muse", "Won’t Stand Down - Single", "Won’t Stand Down"),
    sc("Muse", "Will Of The People", "Kill Or Be Killed"),
  ];
  const resolved = new Map([
    ["Muse-Unintended-Unintended", "Showbiz"],
    ["Muse--Muscle Museum", "Showbiz"],
    ["Muse-Won’t Stand Down - Single-Won’t Stand Down",
      "Will of the People"],
  ]);
  const {scrobbles, variants} = canonicalize(raw, {resolved});
  const albums = scrobbles.map((s) => s.album);
  assert.deepEqual(albums, ["Showbiz", "Showbiz", "Showbiz", "Absolution",
    "Absolution", "Absolution", "Will Of The People", "Will Of The People"]);
  // Fait brut gardé.
  assert.equal(scrobbles[1].raw_album_sur, "Muse-Unintended");
  assert.equal(scrobbles[0].raw_album_sur, undefined);
  assert.deepEqual(variants.get("Muse-Showbiz").map((v) => v.album).sort(),
      ["", "Unintended"]);
});

test("canonicalize: séparation demandée, édition notée canonique", () => {
  const raw = [
    sc("Imagine Dragons", "Night Visions", "Radioactive"),
    sc("Imagine Dragons", "Night Visions", "Demons"),
    sc("Imagine Dragons", "Night Visions (Deluxe)", "Radioactive"),
    sc("Muse", "Unintended", "Unintended"),
  ];
  const resolved = new Map([["Muse-Unintended-Unintended", "Showbiz"]]);
  // Deluxe notée plus récemment : elle porte l'album.
  const graded = new Map([["Imagine Dragons-Night Visions", 100],
    ["Imagine Dragons-Night Visions (Deluxe)", 200]]);
  const splits = new Set(["Muse-Unintended"]);
  const {scrobbles} = canonicalize(raw, {resolved, graded, splits});
  assert.deepEqual(scrobbles.map((s) => s.album_sur), [
    "Imagine Dragons-Night Visions (Deluxe)",
    "Imagine Dragons-Night Visions (Deluxe)",
    "Imagine Dragons-Night Visions (Deluxe)",
    "Muse-Unintended"]);
});

test("pickTrackAlbum: même artiste, pas un single du titre", () => {
  const j = (title, artist) => ({track: {album: {title, artist}}});
  assert.equal(pickTrackAlbum(j("Showbiz", "Muse"), "Muse", "Unintended"),
      "Showbiz");
  assert.equal(pickTrackAlbum(j("Now 92", "Various Artists"), "Muse",
      "Unintended"), null);
  assert.equal(pickTrackAlbum(j("Unintended", "Muse"), "Muse",
      "Unintended"), null);
  assert.equal(pickTrackAlbum({}, "Muse", "Unintended"), null);
});

test("pendingTracks: suspects non résolus, plus écoutés d'abord", () => {
  const raw = [sc("A", "X", "X"), sc("B", "", "Y"), sc("B", "", "Y"),
    sc("C", "Album", "Z"), sc("D", "W", "W")];
  const now = 100 * 86400;
  const cache = {"D-W-W": [null, now - 86400]};
  assert.deepEqual(pendingTracks(raw, cache, now).map((t) => t.track_sur),
      ["B--Y", "A-X-X"]);
  // « inconnu » depuis plus de 30 jours : on réessaie.
  cache["D-W-W"] = [null, now - 31 * 86400];
  assert.equal(pendingTracks(raw, cache, now).length, 3);
});

// ---- Corrections appliquées (E10, v2.30.0) ----
test("canonicalize : une correction appliquée fixe l'album, puis rejoint " +
    "ses éditions", () => {
  const {correctionKey} = require("../src/albums/canon");
  const s = [sc("Muse", "Starboy", "Plug In Baby"),
    sc("Muse", "Origin of Symmetry (Deluxe Edition)", "Bliss")];
  const applied = new Map([[correctionKey("Muse", "Plug In Baby",
      "Muse-Starboy"), "Origin of Symmetry"]]);
  const out = canonicalize(s, {applied}).scrobbles;
  // Même groupe d'éditions que l'album de la bibliothèque.
  assert.equal(out[0].album_sur, out[1].album_sur);
  assert.equal(out[0].raw_album_sur, "Muse-Starboy");
  // Sans correction : rien ne bouge (pas de libellé suspect).
  assert.equal(canonicalize(s).scrobbles[0].album_sur, "Muse-Starboy");
});

test("canonicalize : la correction appliquée passe avant une séparation " +
    "et avant Last.fm", () => {
  const {correctionKey} = require("../src/albums/canon");
  const s = [sc("Lorenzo", "Fume à fond", "Fume à fond")];
  const applied = new Map([[correctionKey("Lorenzo", "Fume à fond",
      "Lorenzo-Fume à fond"), "Rien à Branler"]]);
  const out = canonicalize(s, {applied,
    splits: new Set(["Lorenzo-Fume à fond"]),
    resolved: new Map([[s[0].track_sur, "Autre"]])}).scrobbles;
  assert.equal(out[0].album_sur, "Lorenzo-Rien à Branler");
});

// ---- « Remettre à part » et migration des séparations (v2.32.0) ----
test("canonicalize : « remettre à part » garde le libellé reçu tel quel",
    () => {
      const {correctionKey} = require("../src/albums/canon");
      const s = [sc("Muse", "Hysteria - Single", "Hysteria"),
        sc("Muse", "Absolution", "Butterflies")];
      const resolved = new Map([[s[0].track_sur, "Absolution"]]);
      // Sans correction : rangé d'office sous Absolution.
      assert.equal(canonicalize(s, {resolved}).scrobbles[0].album_sur,
          "Muse-Absolution");
      const applied = new Map([[correctionKey("Muse", "Hysteria",
          "Muse-Hysteria - Single"), "Hysteria - Single"]]);
      const out = canonicalize(s, {resolved, applied}).scrobbles;
      assert.equal(out[0].album_sur, "Muse-Hysteria - Single");
      assert.equal(out[0].raw_album_sur, undefined);
    });

test("splitCorrections : une correction par titre du libellé séparé", () => {
  const {splitCorrections} = require("../src/albums");
  const s = [sc("Muse", "Hysteria - Single", "Hysteria"),
    sc("Muse", "Hysteria - Single", "Hysteria"),
    sc("Muse", "Hysteria - Single", "Eternally Missed"),
    sc("Muse", "Absolution", "Butterflies")];
  const out = splitCorrections(s, new Set(["Muse-Hysteria - Single"]));
  assert.deepEqual(out.map((c) => [c.track, c.raw, c.title]), [
    ["Hysteria", "Muse-Hysteria - Single", "Hysteria - Single"],
    ["Eternally Missed", "Muse-Hysteria - Single", "Hysteria - Single"],
  ]);
  assert.deepEqual(splitCorrections(s, new Set()), []);
});
