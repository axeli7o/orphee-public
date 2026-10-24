"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {baseTitle, buildQuery, parseSearch, compact, propose, mbTargets,
  mbKey, mainArtist, isOtherCut, libraryIndex} = require("../src/quality/mb");
const {isSuspect, editionKey} = require("../src/albums/canon");

const muse = [{name: "Muse", artist: {name: "Muse"}}];
const rel = (id, title, type, sec, date, pos, total, extra = {}) => ({
  id, title, "status": "Official", date,
  "release-group": {"id": `rg-${title}`, "primary-type": type,
    "secondary-types": sec},
  "media": [{"position": 1, "track-count": total, "track-offset": pos - 1,
    "track": [{number: String(pos), title: "x"}]}],
  ...extra,
});

test("baseTitle retire versions, mentions et feat.", () => {
  assert.equal(baseTitle("Muscle Museum (US mix)"), "Muscle Museum");
  assert.equal(baseTitle("Overcompensate [edit]"), "Overcompensate");
  assert.equal(baseTitle("Take My Breath - Single Version"), "Take My Breath");
  assert.equal(baseTitle("I Feel It Coming feat. Daft Punk"),
      "I Feel It Coming");
});

test("buildQuery cherche le titre de base et échappe les guillemets", () => {
  assert.equal(buildQuery("Muse", "Muscle Museum (US mix)", false),
      "recording:\"Muscle Museum\" AND artist:\"Muse\"");
  assert.equal(buildQuery("A \"B\"", "T", false),
      "recording:\"T\" AND artist:\"A \\\"B\\\"\"");
});

const plugInBaby = {recordings: [
  {"title": "Plug In Baby", "artist-credit": muse, "releases": [
    rel("r1", "Plug In Baby", "Single", [], "2001-03-05", 1, 3),
    rel("r2", "Origin of Symmetry", "Album", [], "2001-06-18", 5, 11),
    rel("r3", "Hullabaloo Soundtrack", "Album", ["Live", "Soundtrack"],
        "2002-07-01", 4, 20),
    rel("r4", "Now 49", "Album", ["Compilation"], "2001-07-01", 3, 40,
        {"artist-credit": [{name: "Various Artists"}]}),
    rel("r5", "Origin of Symmetry", "Album", [], "2001-07-17", 5, 12),
  ]},
  {"title": "Plug In Baby", "artist-credit": [{name: "Someone Else"}],
    "releases": [rel("x", "Cover", "Album", [], "1990-01-01", 1, 10)]},
]};

test("parseSearch : même titre, même artiste, sorties officielles", () => {
  const hits = parseSearch(plugInBaby, "Muse", "Plug In Baby");
  assert.deepEqual(hits.map((h) => h.title).sort(), ["Hullabaloo Soundtrack",
    "Origin of Symmetry", "Origin of Symmetry", "Plug In Baby"]);
  const oos = hits.find((h) => h.release === "r2");
  assert.equal(oos.pos, 5);
  assert.equal(oos.total, 11);
  assert.equal(oos.exact, 1);
});

test("compact garde la plus ancienne sortie par album studio", () => {
  const c = compact(parseSearch(plugInBaby, "Muse", "Plug In Baby"));
  const oos = c.filter((h) => h.title === "Origin of Symmetry");
  assert.equal(oos.length, 1);
  assert.equal(oos[0].release, "r2");
});

test("propose : premier album studio, sûr si l'album est dans la "+
    "bibliothèque", () => {
  const hits = compact(parseSearch(plugInBaby, "Muse", "Plug In Baby"));
  const lib = new Set(["origin of symmetry"]);
  const p = propose(hits, "Starboy", {played: "Plug In Baby", library: lib});
  assert.equal(p.kind, "sure");
  assert.equal(p.album, "Origin of Symmetry");
  assert.equal(p.year, "2001");
  assert.equal(p.pos, 5);
  assert.match(p.reason, /piste 5/);
  const out = propose(hits, "Starboy", {played: "Plug In Baby"});
  assert.equal(out.kind, "check");
  assert.equal(out.reason, "Album absent de ta bibliothèque");
  assert.equal(propose(hits, "Origin of Symmetry (XX Anniversary)",
      {played: "Plug In Baby"}).kind, "ok");
});

test("propose : reçu comme single ou sans album → sûr même hors " +
    "bibliothèque ; venu d'une compilation → à vérifier", () => {
  const hits = compact(parseSearch(plugInBaby, "Muse", "Plug In Baby"));
  const single = propose(hits, "Plug In Baby",
      {played: "Plug In Baby", single: true});
  assert.equal(single.kind, "sure");
  assert.equal(single.album, "Origin of Symmetry");
  const compil = propose(hits, "Greatest Hits",
      {played: "Plug In Baby", single: false});
  assert.equal(compil.kind, "check");
  assert.equal(compil.reason, "Album absent de ta bibliothèque");
});

test("propose : un album de la bibliothèque passe devant un plus ancien",
    () => {
      const json = {recordings: [{"title": "Free Bird", "artist-credit":
        [{name: "Lynyrd Skynyrd"}], "releases": [
        rel("a", "Pronounced Leh-Nerd Skin-Nerd", "Album", [], "1973-08-13",
            8, 8),
        rel("b", "Obscure", "Album", [], "1970-01-01", 1, 10)]}]};
      const p = propose(compact(parseSearch(json, "Lynyrd Skynyrd",
          "Free Bird")), "Best Of", {played: "Free Bird",
        library: new Set([editionKey("Pronounced Leh-Nerd Skin-Nerd")])});
      assert.equal(p.kind, "sure");
      assert.equal(p.album, "Pronounced Leh-Nerd Skin-Nerd");
    });

test("propose : disque bonus d'une réédition → à vérifier", () => {
  const r = rel("d", "Blurryface", "Album", [], "2016-01-01", 1, 1);
  r.media[0].position = 2;
  const json = {recordings: [{"title": "Heathens", "artist-credit":
    [{name: "Twenty One Pilots"}], "releases": [r]}]};
  const p = propose(compact(parseSearch(json, "Twenty One Pilots",
      "Heathens")), "Heathens", {played: "Heathens",
    library: new Set(["blurryface"])});
  assert.equal(p.kind, "check");
  assert.match(p.reason, /disque bonus/);
});

test("propose : invité ignoré ; remix et live restent à part", () => {
  const json = {recordings: [{"title": "I Feel It Coming",
    "artist-credit": [{name: "The Weeknd"}, {name: "Daft Punk"}],
    "releases": [rel("s", "Starboy", "Album", [], "2016-11-25", 18, 18)]}]};
  const hits = compact(parseSearch(json, "The Weeknd",
      "I Feel It Coming (avec Daft Punk)"));
  const p = propose(hits, "HIT SONGS", {played:
    "I Feel It Coming (avec Daft Punk)", library: new Set(["starboy"])});
  assert.equal(p.kind, "sure");
  assert.equal(propose(hits, "x", {played: "I Feel It Coming (Live)"}).kind,
      "keep");
  assert.equal(isOtherCut("Layla (acoustic live)"), true);
  assert.equal(isOtherCut("Live Forever"), false);
  assert.equal(isOtherCut("Feeling Good (XX Anniversary RemiXX)"), true);
});

test("mainArtist et buildQuery : artiste principal d'un nom composé", () => {
  assert.equal(mainArtist("Doja Cat et The Weeknd"), "Doja Cat");
  assert.equal(mainArtist("PLK & Niska"), "PLK");
  assert.equal(mainArtist("Muse"), "Muse");
  assert.equal(buildQuery("PLK & Niska", "Enna", true),
      "recording:\"Enna\" AND (artist:\"PLK & Niska\" OR " +
      "artist:\"PLK\") AND primarytype:album AND status:official");
  const json = {recordings: [{"title": "You Right", "artist-credit":
    [{name: "Doja Cat"}, {name: "The Weeknd"}], "releases": [
    rel("p", "Planet Her", "Album", [], "2021-06-25", 4, 14)]}]};
  assert.equal(parseSearch(json, "Doja Cat et The Weeknd", "You Right")
      .length, 1);
});

test("propose : autre version → à vérifier", () => {
  const json = {recordings: [
    {"title": "Muscle Museum (US mix)", "artist-credit": muse, "releases": [
      rel("s", "Muscle Museum", "Single", [], "2000-01-01", 1, 4)]},
    {"title": "Muscle Museum", "artist-credit": muse, "releases": [
      rel("a", "Showbiz", "Album", [], "1999-10-04", 2, 12)]},
  ]};
  const p = propose(compact(parseSearch(json, "Muse",
      "Muscle Museum (US mix)")), "Muscle Museum");
  assert.equal(p.kind, "check");
  assert.equal(p.album, "Showbiz");
  assert.equal(p.exact, 0);
});

test("propose : face B, bande originale, inconnu", () => {
  const faceB = {recordings: [{"title": "Eternally Missed",
    "artist-credit": muse, "releases": [
      rel("s", "Hysteria", "Single", [], "2003-12-01", 2, 3)]}]};
  const p = propose(compact(parseSearch(faceB, "Muse", "Eternally Missed")),
      "Hysteria");
  assert.equal(p.kind, "keep");
  assert.equal(p.reason, "Seulement sur un single ou un EP");
  const ost = {recordings: [{"title": "Neutron Star Collision",
    "artist-credit": muse, "releases": [
      rel("o", "Eclipse", "Album", ["Soundtrack"], "2010-06-08", 1, 15)]}]};
  assert.equal(propose(compact(parseSearch(ost, "Muse",
      "Neutron Star Collision")), "x").reason, "Bande originale");
  assert.equal(propose(null, "x").kind, "unknown");
});

test("propose : deux albums la même année → à vérifier", () => {
  const json = {recordings: [{"title": "T", "artist-credit": muse, "releases": [
    rel("a", "Album A", "Album", [], "2010-01-01", 1, 10),
    rel("b", "Album B", "Album", [], "2010-05-01", 3, 10)]}]};
  const p = propose(compact(parseSearch(json, "Muse", "T")), "Single T");
  assert.equal(p.kind, "check");
  assert.equal(p.album, "Album A");
});

test("mbTargets : petits albums et libellés suspects, plus écoutés d'abord",
    () => {
      const big = Array.from({length: 5}, (_, i) => ({uts: i, artist: "Muse",
        album: "Absolution", album_sur: "Muse-Absolution",
        track: "Hysteria"}));
      const sc = [...big,
        {artist: "Muse", album: "Starboy", album_sur: "Muse-Starboy",
          track: "Plug In Baby"},
        {artist: "Muse", album: "Starboy", album_sur: "Muse-Starboy",
          track: "Plug In Baby"},
        {artist: "Muse", album: "Hysteria", album_sur: "Muse-Hysteria",
          track: "Eternally Missed"},
        {artist: "Muse", album: "Absolution", album_sur: "Muse-Absolution",
          raw_album_sur: "Muse-Time Is Running Out",
          track: "Time Is Running Out"},
      ];
      const cache = {[mbKey("Muse", "Eternally Missed")]: [[{}], 100]};
      const {todo, total} = mbTargets(sc, cache, 200,
          {maxListens: 4, retryS: 1000, isSuspect});
      assert.equal(total, 3);
      assert.deepEqual(todo.map((t) => t.track),
          ["Plug In Baby", "Time Is Running Out"]);
      const stale = {[mbKey("Muse", "Plug In Baby")]: [null, 0]};
      assert.equal(mbTargets(sc, stale, 2000, {maxListens: 4, retryS: 1000,
        isSuspect}).todo.length, 3);
    });

test("libraryIndex : albums de plus de N écoutes, par artiste", () => {
  const s = (album, n) => Array.from({length: n}, () => ({artist: "Muse",
    album, album_sur: `Muse-${album}`}));
  const idx = libraryIndex([...s("Absolution", 5),
    ...s("Hysteria", 2)], 4);
  assert.deepEqual(Array.from(idx.get("muse")), ["absolution"]);
});

test("albumKey : même album écrit autrement", () => {
  const {albumKey} = require("../src/quality/mb");
  assert.equal(albumKey("High Visceral, Pt. 2"),
      albumKey("High Visceral {Part Two}"));
  assert.equal(albumKey("Chambre 140 (Part II)"), albumKey("Chambre 140 Pt 2"));
  assert.equal(albumKey("Street Bangerz Volume 6"),
      albumKey("Street Bangerz Vol. 6"));
  assert.notEqual(albumKey("High Visceral, Pt. 1"),
      albumKey("High Visceral, Pt. 2"));
});

test("propose : déjà au bon album sous un autre libellé → ok", () => {
  const json = {recordings: [{"title": "November", "artist-credit":
    [{name: "Psychedelic Porn Crumpets"}], "releases": [
    rel("a", "High Visceral {Part Two}", "Album", [], "2017-12-01", 10, 10),
    {...rel("b", "High Visceral, Pt. 2", "Album", [], "2018-02-01", 10, 10),
      "release-group": {"id": "rg-High Visceral {Part Two}",
        "primary-type": "Album", "secondary-types": []}}]}]};
  const hits = compact(parseSearch(json, "Psychedelic Porn Crumpets",
      "November"));
  assert.equal(propose(hits, "High Visceral, Pt. 2",
      {played: "November"}).kind, "ok");
  // Même sans l'autre sortie, la clé suffit.
  assert.equal(propose([hits[0]].map((h) => ({...h, alt: undefined})),
      "High Visceral, Pt. 2", {played: "November"}).kind, "ok");
});

test("isLiveLabel : albums live et acoustiques, pas les titres « Live … »",
    () => {
      const {isLiveLabel} = require("../src/quality/mb");
      for (const l of ["Live at River Plate", "Live (Collector's Edition)",
        "With Orchestra Live", "MTV Unplugged in New York",
        "Delta Acoustic Sessions: Live From Electric Lady",
        "Black Pumas Recorded Live at Arlyn Studios", "Bad Blood (Live)",
        "Live Au Zénith"]) assert.ok(isLiveLabel(l), l);
      for (const l of ["Live Through This", "Live Forever", "Alive",
        "Dying to Live", "I can live in silence.", "Acoustic Soul",
        "The Groove Sessions, Vol. 3", "Imagine", ""]) {
        assert.ok(!isLiveLabel(l), l);
      }
    });

test("propose : reçu sur un album live → reste à part", () => {
  const studio = {rg: "g", title: "Let There Be Rock", type: "Album",
    sec: [], date: "1977-03-21", disc: 1, pos: 8, total: 8, release: "r",
    exact: 1};
  const p = propose([studio], "Live at River Plate", {
    played: "Whole Lotta Rosie", label: "Live at River Plate",
    library: new Set(["let there be rock"])});
  assert.equal(p.kind, "keep");
  assert.equal(p.reason, "Album live : à part");
});

test("propose : piste au-delà de l'album d'origine → disque bonus", () => {
  const box = {rg: "g", title: "Imagine", type: "Album", sec: [],
    date: "2018-10-05", disc: 1, pos: 32, total: 59, release: "r",
    exact: 1};
  const p = propose([box], "Gimme Some Truth", {played: "Happy Xmas",
    library: new Set(["imagine"])});
  assert.equal(p.kind, "check");
  assert.equal(p.reason, "Sur un disque bonus d’une réédition");
});

test("doubtOf : live sur un studio, ou coffret au nom de l'album", () => {
  const {doubtOf} = require("../src/quality/mb");
  assert.equal(doubtOf("Live in Copenhagen", "Into the Great Wide Yonder",
      null), "Version live rangée sur un album studio");
  assert.match(doubtOf("Signature Box", "Imagine",
      {kind: "ok", pos: 32, total: 59}), /piste 32 sur 59/);
  // Album d'origine, piste plausible ; live rangé sur un live ; libellé
  // inchangé : aucun doute.
  assert.equal(doubtOf("Greatest Hits", "Hooray for Boobies",
      {kind: "ok", pos: 10, total: 45}), "");
  // Fin d'une Deluxe de 22 titres : un album, pas un coffret.
  assert.equal(doubtOf("Fine China", "X (Deluxe Version)",
      {kind: "ok", pos: 21, total: 22}), "");
  assert.equal(doubtOf("Live (Collector's Edition)", "Live at River Plate",
      null), "");
  assert.equal(doubtOf("Live", "Live", null), "");
});
