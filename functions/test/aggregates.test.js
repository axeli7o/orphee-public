"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGlobal,
  buildTopArtists,
  buildTopAlbums,
  buildLibrary,
  libraryCard,
  buildStats,
  buildAlbumStats,
  buildEcho,
  buildOddities,
  buildDays,
  monthKey,
  utsToTimestamp,
} = require("../src/refresh/aggregates");

// ---- Fixtures ----

const scrobbles = [
  {artist: "Artist A", album: "Album X", album_sur: "A-X", uts: 1600000000},
  {artist: "Artist A", album: "Album X", album_sur: "A-X", uts: 1600000100},
  {artist: "Artist A", album: "Album Y", album_sur: "A-Y", uts: 1600000200},
  {artist: "Artist B", album: "Album Z", album_sur: "B-Z", uts: 1500000000},
  // sans artiste/clé : ignoré par top artistes/albums, compté en écoutes/an
  {artist: "", album: "", album_sur: "", uts: 1500000050},
];

// Curation Firestore : grade_label dérivé par buildLibrary.
const curation = new Map([
  ["A-X", {grade: 5, personal_fav: false, genre: "Rock", sousgenre: "Metal"}],
  ["B-Z", {grade: 1, personal_fav: true, genre: "Electro", sousgenre: "House"}],
]);

// ---- utsToTimestamp ----

test("utsToTimestamp: secondes Unix converties en ms", () => {
  assert.equal(utsToTimestamp(1600000000).toMillis(), 1600000000 * 1000);
  assert.equal(utsToTimestamp("1600000000").toMillis(), 1600000000 * 1000);
});

test("utsToTimestamp: millisecondes détectées et conservées", () => {
  assert.equal(utsToTimestamp(1600000000000).toMillis(), 1600000000000);
});

test("utsToTimestamp: entrées invalides → null", () => {
  assert.equal(utsToTimestamp(""), null);
  assert.equal(utsToTimestamp(0), null);
  assert.equal(utsToTimestamp(-5), null);
  assert.equal(utsToTimestamp("abc"), null);
});

// ---- buildLibrary ----

test("buildLibrary: exclut album_sur vides et albums sans titre", () => {
  const sc = [
    ...scrobbles,
    {artist: "Artist C", album: "", album_sur: "C-empty", uts: 1550000000},
  ];
  const {all} = buildLibrary(sc, curation);
  assert.equal(all.length, 3); // C-empty exclu (album=""), "" album_sur ignoré
});

test("buildLibrary: écoutes, grade/label 1-5, genres, first_listen_y", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const ax = all.find((a) => a.album_sur === "A-X");
  assert.equal(ax.listen_count, 2);
  assert.equal(ax.grade, 5);
  assert.equal(ax.grade_label, "adored");
  assert.equal(ax.genre, "Rock");
  assert.equal(ax.first_listen_y, 2020); // uts 1600000000 = 2020-09-13
  const ay = all.find((a) => a.album_sur === "A-Y");
  assert.equal(ay.grade, null);
  assert.equal(ay.genre, "");
});

test("buildLibrary: curated = notés/favoris, favoris en tête", () => {
  const {curated} = buildLibrary(scrobbles, curation);
  // B-Z (coup de cœur) avant A-X malgré note plus basse ; A-Y exclu
  assert.deepEqual(curated.map((c) => c.album_sur), ["B-Z", "A-X"]);
});

// ---- buildGlobal ----

test("buildGlobal: totaux et distribution 1-5", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const g = buildGlobal({
    scrobbles, albums: all, artists: [{}, {}], lastRefresh: "TS",
  });
  assert.equal(g.total_listens, 5);
  assert.equal(g.total_albums, 3); // A-X, A-Y, B-Z (dérivés des scrobbles)
  assert.equal(g.total_artists, 2);
  assert.equal(g.graded_albums, 2); // A-X (5) et B-Z (1)
  assert.deepEqual(g.grade_distribution, {
    skip: 1, nice: 0, great: 0, classic: 0, adored: 1,
  });
  assert.equal(g.last_refresh, "TS");
});

// ---- buildTopArtists ----

test("buildTopArtists: tri par écoutes, top_album et last_played", () => {
  const {items} = buildTopArtists(scrobbles);
  assert.equal(items.length, 2);
  assert.equal(items[0].artist, "Artist A");
  assert.equal(items[0].count, 3);
  assert.equal(items[0].top_album, "A-X");
  assert.equal(items[0].last_played.toMillis(), 1600000200 * 1000);
});

// ---- buildTopAlbums ----

test("buildTopAlbums: tri, jointure curation et grade 1-5", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const {items} = buildTopAlbums(scrobbles, all);
  assert.equal(items[0].album_sur, "A-X");
  assert.equal(items[0].count, 2);
  assert.equal(items[0].grade, 5);
  const bz = items.find((i) => i.album_sur === "B-Z");
  assert.equal(bz.grade, 1);
  assert.equal(bz.personal_fav, true);
});

// ---- buildStats ----

test("buildStats: distribution des notes 1-5", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const s = buildStats(scrobbles, all);
  assert.deepEqual(s.grade_distribution, {1: 1, 2: 0, 3: 0, 4: 0, 5: 1});
});

test("buildStats: genres (écoutes) + bucket Non classé", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const s = buildStats(scrobbles, all);
  assert.equal(s.genre_distribution[0].genre, "Rock");
  assert.equal(s.genre_distribution[0].listens, 2);
  const nc = s.genre_distribution.find((g) => g.genre === "Non classé");
  assert.equal(nc.listens, 1); // A-Y sans genre
});

test("buildStats: écoutes par année, triées", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const s = buildStats(scrobbles, all);
  const perYear = s.listens_per_year
      .map((x) => ({year: x.year, count: x.count}));
  assert.deepEqual(perYear, [
    {year: 2017, count: 2},
    {year: 2020, count: 3},
  ]);
  // Chaque créneau porte son album typique (ou null si rien de connu).
  assert.ok(s.listens_per_year.every((x) => "top" in x));
});

test("buildStats: écoutes par mois (1-12) et par jour de semaine (0-6)", () => {
  const {all} = buildLibrary(scrobbles, curation);
  const s = buildStats(scrobbles, all);
  assert.equal(s.by_month.length, 12);
  assert.equal(s.by_weekday.length, 7);
  const month = (n) => s.by_month.find((x) => x.month === n).count;
  assert.equal(month(7), 2); // juillet 2017 (uts 15000000xx)
  assert.equal(month(9), 3); // septembre 2020 (uts 16000000xx)
  assert.equal(month(1), 0);
  const wd = (n) => s.by_weekday.find((x) => x.weekday === n).count;
  assert.equal(wd(0), 3); // dimanche 13 sept 2020
  assert.equal(wd(5), 2); // vendredi 14 juil 2017
  assert.equal(wd(1), 0);
  // total cohérent : 5 scrobbles (y compris celui sans clé)
  assert.equal(s.by_month.reduce((a, x) => a + x.count, 0), 5);
  assert.equal(s.by_weekday.reduce((a, x) => a + x.count, 0), 5);
});

// ---- libraryCard (chunks sans curation, ADR-031) ----

test("libraryCard: carte = faits + dérivé, AUCUNE curation", () => {
  const card = libraryCard({
    album_sur: "A-B", artist: "A", album: "B", listen_count: 5,
    first_listen_y: 2020, cover_url: "u",
    grade: 4, grade_label: "classic", personal_fav: true,
    commentaire: "x", genre: "Rock", sousgenre: "Hard",
  });
  assert.deepEqual(card, {
    album_sur: "A-B", artist: "A", album: "B", listen_count: 5,
    first_listen_y: 2020, cover_url: "u",
  });
  for (const f of ["grade", "grade_label", "personal_fav", "commentaire",
    "genre", "sousgenre"]) {
    assert.equal(f in card, false, `${f} ne doit pas fuiter dans la carte`);
  }
});

// ---- monthKey & buildAlbumStats ----

test("monthKey: YYYY-MM ou null", () => {
  assert.equal(monthKey(1600000000), "2020-09");
  assert.equal(monthKey(1500000000), "2017-07");
  assert.equal(monthKey(""), null);
});

test("buildAlbumStats: stats riches, restreintes au set", () => {
  const sc = [
    {album_sur: "A-X", track: "t1", uts: 1600000000}, // 2020-09
    {album_sur: "A-X", track: "t1", uts: 1600100000}, // 2020-09
    {album_sur: "A-X", track: "t2", uts: 1605000000}, // 2020-11
    {album_sur: "B-Z", track: "z1", uts: 1500000000}, // 2017-07
    {album_sur: "OUT", track: "o", uts: 1600000000}, // hors set
  ];
  const set = new Set(["A-X", "B-Z"]);
  const ident = new Map([
    ["A-X", {artist: "Artist A", album: "Album X"}],
    ["B-Z", {artist: "Artist B", album: "Album Z"}],
  ]);
  const stats = buildAlbumStats(sc, set, ident);

  assert.equal(stats.has("OUT"), false);
  const ax = stats.get("A-X");
  assert.equal(ax.listen_count, 3);
  assert.equal(ax.unique_tracks_played, 2);
  assert.equal(ax.artist, "Artist A");
  assert.deepEqual(ax.top_tracks, [
    {track: "t1", count: 2}, {track: "t2", count: 1},
  ]);
  assert.deepEqual(ax.monthly_distribution, [
    {month: "2020-09", count: 2}, {month: "2020-11", count: 1},
  ]);
  assert.equal(ax.first_listen.toMillis(), 1600000000 * 1000);
  assert.equal(ax.last_played.toMillis(), 1605000000 * 1000);
});

// ---- buildEcho ----

test("buildEcho: compagnons dans la fenêtre du pic, junk exclu", () => {
  const sc = [
    {album_sur: "A-X", uts: 1600000000}, // 2020-09 (pic, 2 plays)
    {album_sur: "A-X", uts: 1600100000}, // 2020-09
    {album_sur: "A-X", uts: 1605000000}, // 2020-11
    {album_sur: "Y", uts: 1600200000}, // 2020-09 (dans fenêtre)
    {album_sur: "Y", uts: 1605100000}, // 2020-11 (dans fenêtre)
    {album_sur: "Z", uts: 1500000000}, // 2017-07 (hors fenêtre)
    {album_sur: "W-", uts: 1600300000}, // 2020-09 mais sans titre
  ];
  const ident = new Map([
    ["A-X", {artist: "A", album: "X"}],
    ["Y", {artist: "Artist Y", album: "Album Y"}],
    ["Z", {artist: "Artist Z", album: "Album Z"}],
    ["W-", {artist: "W", album: ""}],
  ]);
  const r = buildEcho(sc, new Set(["A-X"]), ident, {});
  const x = r.get("A-X");
  assert.equal(x.ref, 3); // A-X : 2 (2020-09) + 1 (2020-11) dans la fenêtre
  assert.equal(x.items.length, 1); // Z hors fenêtre, W- sans titre
  assert.equal(x.items[0].album_sur, "Y");
  assert.equal(x.items[0].score, 2);
  assert.equal(x.items[0].album, "Album Y");
});

test("buildEcho: album solitaire → items vide", () => {
  const sc = [{album_sur: "A-X", uts: 1600000000}];
  const ident = new Map([["A-X", {artist: "A", album: "X"}]]);
  assert.deepEqual(buildEcho(sc, new Set(["A-X"]), ident, {}).get("A-X").items,
      []);
});

// ---- buildOddities ----

test("buildOddities: albums_above_threshold >= seuil percentile", () => {
  const lib = [
    {album_sur: "A", listen_count: 1, grade: 1, grade_label: "skip"},
    {album_sur: "B", listen_count: 5, grade: 2, grade_label: "nice"},
    {album_sur: "C", listen_count: 10, grade: 3, grade_label: "great"},
    {album_sur: "D", listen_count: 20, grade: null, grade_label: null},
    {album_sur: "E", listen_count: 50, grade: 1, grade_label: "skip"},
  ];
  // percentile 80 sur [1,5,10,20,50] triés → idx=ceil(0.8*5)-1=3 → threshold=20
  const r = buildOddities(lib, {percentile: 80, eligible: [1, 2]});
  assert.equal(r.threshold, 20);
  assert.equal(r.albums_above_threshold, 2); // D(20) et E(50)
  // graded_above_threshold : D est non noté → seul E(50, grade=1) → 1
  assert.equal(r.graded_above_threshold, 1);
  // seul E : grade éligible ET >= seuil
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].album_sur, "E");
});

test("buildOddities: graded_above_threshold <= albums_above_threshold", () => {
  // Albums notés sous le seuil ne doivent pas gonfler le numérateur
  const lib = [
    // noté, sous seuil
    {album_sur: "A", listen_count: 1, grade: 5, grade_label: "adored"},
    // noté, sous seuil
    {album_sur: "B", listen_count: 1, grade: 4, grade_label: "classic"},
    // noté, au-dessus
    {album_sur: "C", listen_count: 100, grade: 3, grade_label: "great"},
    // non noté, au-dessus
    {album_sur: "D", listen_count: 200, grade: null, grade_label: null},
  ];
  const r = buildOddities(lib, {percentile: 75, eligible: [1, 2]});
  assert.ok(r.graded_above_threshold <= r.albums_above_threshold);
});

test("buildOddities: bibliothèque vide → albums_above_threshold = 0", () => {
  const r = buildOddities([], null);
  assert.equal(r.albums_above_threshold, 0);
  assert.equal(r.graded_above_threshold, 0);
  assert.equal(r.items.length, 0);
});

// ---- « Ma journée » (v2.28.0) ----
test("buildCommuting : album par heure et par moment, heures de Paris", () => {
  const {buildCommuting, DAY_MOMENTS} = require("../src/refresh/aggregates");
  // 7 h UTC = 8 h à Paris (trajet du matin) ; 22 h UTC = 23 h (soirée).
  const at = (h) => Date.UTC(2026, 0, 5, h) / 1000;
  const sc = (h, album) => ({uts: at(h), artist: "A", album,
    album_sur: `A-${album}`});
  const scrobbles = [sc(7, "Matin"), sc(7, "Matin"), sc(7, "Autre"),
    sc(6, "Matin"), sc(22, "Nuit"), sc(22, "Nuit")];
  const lib = [{album_sur: "A-Matin", artist: "A", album: "Matin"},
    {album_sur: "A-Autre", artist: "A", album: "Autre"},
    {album_sur: "A-Nuit", artist: "A", album: "Nuit"}];
  const out = buildCommuting(scrobbles, lib);
  assert.equal(out.hour_top[8].album, "Matin");
  assert.equal(out.hour_top[8].count, 2);
  assert.equal(out.hour_top[3], null);
  const m = Object.fromEntries(out.moments.map((x) => [x.key, x]));
  assert.equal(m.matin.count, 4); // 7 h + 8 h à Paris
  assert.equal(m.matin.top.album, "Matin");
  assert.equal(m.soiree.top.album, "Nuit");
  assert.equal(m.nuit.top, null);
  // Les moments couvrent les 24 heures, sans recouvrement.
  const hours = DAY_MOMENTS.flatMap((x) =>
    Array.from({length: x.to - x.from + 1}, (_, i) => x.from + i));
  assert.deepEqual(hours.sort((a, b) => a - b),
      Array.from({length: 24}, (_, i) => i));
});

test("buildCommuting : album typique du moment, pas le plus écouté", () => {
  const {buildCommuting} = require("../src/refresh/aggregates");
  const at = (h, i) => Date.UTC(2026, 0, 5 + i, h) / 1000;
  const sc = (h, i, album) => ({uts: at(h, i), artist: "A", album,
    album_sur: `A-${album}`});
  const s = [];
  // « Partout » : 60 écoutes réparties sur toute la journée (dont 8 le matin).
  for (let i = 0; i < 60; i++) s.push(sc(i % 24, i, "Partout"));
  // « Trajet » : 6 écoutes, toutes le matin (7 h UTC = 8 h à Paris).
  for (let i = 0; i < 6; i++) s.push(sc(7, i, "Trajet"));
  const lib = ["Partout", "Trajet"].map((a) =>
    ({album_sur: `A-${a}`, artist: "A", album: a}));
  const out = buildCommuting(s, lib);
  const m = Object.fromEntries(out.moments.map((x) => [x.key, x]));
  assert.equal(m.matin.top.album, "Trajet");
  assert.equal(m.journee.top.album, "Partout");
});

test("Ma journée, top albums : une écoute sans album n'en est pas un", () => {
  const {buildCommuting, buildTopAlbums} = require("../src/refresh/aggregates");
  const at = (i) => Date.UTC(2026, 0, 5 + i, 7) / 1000;
  const s = [];
  // Vidéo YouTube scrobblée sans album : « Artiste- », hors bibliothèque.
  for (let i = 0; i < 9; i++) {
    s.push({uts: at(i), artist: "Dark", album: "", album_sur: "Dark-"});
  }
  for (let i = 0; i < 6; i++) {
    s.push({uts: at(i), artist: "A", album: "Vrai", album_sur: "A-Vrai"});
  }
  const lib = [{album_sur: "A-Vrai", artist: "A", album: "Vrai"}];
  const out = buildCommuting(s, lib);
  const m = Object.fromEntries(out.moments.map((x) => [x.key, x]));
  assert.equal(m.matin.count, 15); // le volume compte toutes les écoutes
  assert.equal(m.matin.top.album, "Vrai");
  assert.deepEqual(out.matin.map((a) => a.album), ["Vrai"]);
  const top = buildTopAlbums(s, lib);
  assert.deepEqual(top.items.map((a) => a.album_sur), ["A-Vrai"]);
});

test("buildOneTrack : un titre qui tient l'album (EDEN « drugs »)", () => {
  const {buildOneTrack} = require("../src/refresh/aggregates");
  const st = (album, top, total, distinct) => ({artist: "A", album,
    listen_count: total, unique_tracks_played: distinct,
    top_tracks: [{track: "T", count: top}]});
  const m = new Map([
    ["A-drugs", st("i think you think too much of me", 54, 126, 7)], // ×3,0
    ["A-big", st("Gros album", 23, 129, 23)], // 18 % : noyé, écarté
    ["A-two", st("Deux titres", 24, 27, 2)], // 2 titres joués : écarté
    ["A-few", st("Peu", 15, 20, 4)], // < 20 écoutes : écarté
    ["A-", st("", 40, 50, 5)], // sans album : écarté
  ]);
  const lib = [{album_sur: "A-drugs", cover_url: "https://x/c.jpg"}];
  const {items} = buildOneTrack(m, lib);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {album_sur: "A-drugs", artist: "A",
    album: "i think you think too much of me", cover_url: "https://x/c.jpg",
    track: "T", n: 54, total: 126, distinct: 7, share: 0.43, ratio: 3});
});

test("buildPortrait : territoires et netteté comme Moi", () => {
  const {buildPortrait} = require("../src/refresh/aggregates");
  const lib = [
    {artist: "Muse", listen_count: 60, grade: 5, genre: "Rock",
      sousgenre: "Alternative"},
    {artist: "Nekfeu", listen_count: 30, grade: null, genre: "", sousgenre: ""},
    {artist: "Podcasteur", listen_count: 50, grade: 3, genre: "Podcast",
      sousgenre: "Podcast"},
    {artist: "Inconnu", listen_count: 10, grade: 2, genre: "", sousgenre: ""},
  ];
  const p = buildPortrait(lib, new Map([["Nekfeu",
    {genre: "Rap", sousgenre: "Français"}]]));
  assert.deepEqual(p.territories.map((t) => [t.genre, t.share, t.sousgenre,
    t.artists]), [["Rock", 67, "Alternative", ["Muse"]],
    ["Rap", 33, "Français", ["Nekfeu"]]]);
  // Notés ET classés : Muse 60 + Podcasteur 50 sur 150.
  assert.equal(p.sharp, 73);
});

// ---- buildDays (« Ces jours-ci », PM-39, ADR-050) ----

test("buildDays : fenêtre 30 j relative, phase/album/genre par créneau", () => {
  const DAY = 86400; const ref = 1700000000;
  const sc = [];
  const ev = (artist, sur, uts) =>
    ({artist, album: sur, album_sur: sur, uts});
  // 10 écoutes récentes d'un album (artiste Nowww, Rock) dans la fenêtre.
  for (let i = 0; i < 10; i++) sc.push(ev("Nowww", "N-H", ref - i * 3600));
  // Base « tous temps » hors fenêtre (pour le lift) : Nowww 1×, Past 1×.
  sc.push(ev("Nowww", "N-H", ref - 200 * DAY));
  sc.push(ev("Past", "P-O", ref - 200 * DAY));
  const cur = new Map([
    ["N-H", {genre: "Rock", sousgenre: ""}],
    ["P-O", {genre: "Jazz", sousgenre: ""}],
  ]);
  const {all} = buildLibrary(sc, cur);
  const d = buildDays(sc, all, new Map());
  assert.equal(d.total, 10); // seules les 10 récentes
  assert.equal(d.daily.length, 30);
  assert.equal(d.daily.reduce((a, b) => a + b, 0), 10);
  assert.equal(d.phase[0].artist, "Nowww");
  assert.equal(d.phase[0].n, 10);
  assert.ok(d.phase[0].lift >= 1); // sur-représenté
  assert.equal(d.album.album_sur, "N-H");
  assert.equal(d.album.count, 10);
  assert.equal(d.genre.genre, "Rock");
});

test("buildDays : rien sans écoute", () => {
  const d = buildDays([], [], new Map());
  assert.deepEqual(d, {total: 0, daily: [], phase: [], album: null,
    genre: null, days: 30});
});

// ---- buildCommuting : signatures de créneau (PM-18, ADR-050) ----

test("buildCommuting : signatures — sur-représentation par créneau", () => {
  const {buildCommuting} = require("../src/refresh/aggregates");
  const at = (h) => Date.UTC(2026, 0, 5, h) / 1000; // UTC h → (h+1) Paris
  const ev = (artist, sur, h) =>
    ({artist, album: sur, album_sur: sur, uts: at(h)});
  const sc = [
    // matin = 7-9 h Paris = 6-8 h UTC. Sun y domine (4/4).
    ev("Sun", "S-M", 6), ev("Sun", "S-M", 6),
    ev("Sun", "S-M", 7), ev("Sun", "S-M", 8),
    // Day surtout en milieu de journée (1 seule écoute en matin).
    ev("Day", "D-X", 12), ev("Day", "D-X", 13),
    ev("Day", "D-X", 14), ev("Day", "D-X", 6),
  ];
  const cur = new Map([
    ["S-M", {genre: "Jazz", sousgenre: ""}],
    ["D-X", {genre: "Pop", sousgenre: ""}],
  ]);
  const {all} = buildLibrary(sc, cur);
  const out = buildCommuting(sc, all, new Map());
  assert.equal(out.signatures.matin.artists[0].artist, "Sun");
  assert.equal(out.signatures.matin.genres[0].genre, "Jazz");
});
