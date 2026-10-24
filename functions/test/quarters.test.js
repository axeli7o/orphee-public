"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MIN_LISTENS,
  quarterOf,
  assignMood,
  assignMoodRelative,
  baselineOf,
  BASELINE_MIN,
  buildQuarters,
} = require("../src/refresh/quarters");

// uts d'un instant UTC (mois 1-12), pour écrire les fixtures lisiblement.
const at = (y, m, d = 10, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;
/**
 * n écoutes d'un album, réparties sur les jours d'un mois.
 * @param {number} n
 * @param {string} artist
 * @param {string} album
 * @param {number} y
 * @param {number} m
 * @param {number} h - heure UTC
 * @return {Array<Object>}
 */
function plays(n, artist, album, y, m, h = 12) {
  return Array.from({length: n}, (_, i) => ({
    artist, album, album_sur: `${artist}-${album}`,
    uts: at(y, m, 1 + (i % 27), h),
  }));
}
const lib = (artist, album, genre = "", sousgenre = "") => ({
  album_sur: `${artist}-${album}`, artist, album, genre, sousgenre,
  cover_url: null,
});

// ---- quarterOf ----

test("quarterOf: trimestres calendaires UTC", () => {
  assert.deepEqual(
      [at(2024, 1), at(2024, 3, 31, 23), at(2024, 4, 1, 0), at(2024, 12)]
          .map((u) => quarterOf(u).key),
      ["2024-T1", "2024-T1", "2024-T2", "2024-T4"]);
  assert.equal(quarterOf(0), null);
});

// ---- assignMood ----

test("assignMood: trop peu d'écoutes → pas d'humeur", () => {
  assert.deepEqual(assignMood({listens: MIN_LISTENS - 1, top_share: 0.9}),
      {mood: null, score: 0, reason: "volume"});
});

test("assignMood: aucun seuil atteint → pas d'humeur (pas d'étiquette)", () => {
  // 17 % sur un album : sous le seuil d'obsession (30 %) → rien ne domine.
  const r = assignMood({listens: 900, top_share: 0.17, new_share: 0.2});
  assert.equal(r.mood, null);
  assert.equal(r.reason, "mixte");
});

test("assignMood: l'indicateur qui dépasse le plus son seuil l'emporte", () => {
  // top_share 0.45 / 0.30 = 1.5 ; rap_share 0.50 / 0.40 = 1.25
  const r = assignMood({listens: 100, top_share: 0.45, rap_share: 0.5});
  assert.equal(r.mood, "obsession");
  assert.equal(r.score, 1.5);
});

test("assignMood: chaque règle peut gagner", () => {
  const base = {listens: 100, top_share: 0, intense_share: 0, rap_share: 0,
    calm_share: 0, new_share: 0, old_share: 0};
  const cases = {
    obsession: {top_share: 0.4},
    intensite: {intense_share: 0.5},
    energie: {rap_share: 0.6},
    introspection: {calm_share: 0.5},
    exploration: {new_share: 0.7},
    ancrage: {old_share: 0.9},
  };
  for (const [mood, m] of Object.entries(cases)) {
    assert.equal(assignMood({...base, ...m}).mood, mood, mood);
  }
});

// ---- buildQuarters ----

test("buildQuarters: humeurs, genre d'artiste en repli, bascule", () => {
  const scrobbles = [
    // 2024-T1 : 40 écoutes de rap sur 4 albums (≤ 25 % chacun) → énergie
    ...plays(10, "PNL", "A", 2024, 1), ...plays(10, "PNL", "B", 2024, 2),
    ...plays(10, "Booba", "C", 2024, 2), ...plays(10, "Booba", "D", 2024, 3),
    // 2024-T2 : 40 écoutes de metal, dont un album classé seulement via
    // l'artiste (onglet Artists) → intensité, bascule depuis énergie
    ...plays(10, "Rammstein", "M1", 2024, 4),
    ...plays(10, "Rammstein", "M2", 2024, 5),
    ...plays(10, "SOAD", "T", 2024, 5), ...plays(10, "SOAD", "U", 2024, 6),
    // 2024-T3 : 5 écoutes seulement → pas d'humeur
    ...plays(5, "PNL", "A", 2024, 8),
  ];
  const libAll = [
    lib("PNL", "A", "Rap", "Cloud"), lib("PNL", "B", "Rap", "Cloud"),
    lib("Booba", "C", "Rap", "Trap"), lib("Booba", "D", "Rap", "Trap"),
    lib("Rammstein", "M1", "Rock", "Metal"),
    lib("Rammstein", "M2", "Rock", "Metal"),
    lib("SOAD", "T"), lib("SOAD", "U"), // non classés → genre de l'artiste
  ];
  // Classification d'artiste (E8) : SOAD classé au niveau artiste seulement.
  const artistGenres =
    new Map([["SOAD", {genre: "Rock", sousgenre: "Metal"}]]);
  const {items} = buildQuarters(scrobbles, libAll, artistGenres);

  assert.deepEqual(items.map((q) => q.key), ["2024-T1", "2024-T2", "2024-T3"]);
  const [t1, t2, t3] = items;

  assert.equal(t1.mood, "energie");
  assert.equal(t1.metrics.rap_share, 1);
  assert.equal(t1.bascule, false); // premier trimestre : rien à comparer

  assert.equal(t2.mood, "intensite");
  assert.equal(t2.metrics.intense_share, 1); // SOAD compté via l'artiste
  assert.equal(t2.bascule, true);
  assert.equal(t2.prev_mood, "energie");
  assert.deepEqual(t2.genres, [{genre: "Rock", share: 1}]);
  assert.equal(t2.albums.length, 4);
  assert.equal(t2.metrics.new_albums, 4);

  assert.equal(t3.mood, null);
  assert.equal(t3.bascule, false);
});

test("buildQuarters: découverte vs ancrage", () => {
  const scrobbles = [
    ...plays(40, "Daft Punk", "Discovery", 2018, 5), // découvert en 2018
    ...plays(40, "Daft Punk", "Discovery", 2024, 5), // réécouté 6 ans après
  ];
  const libAll = [lib("Daft Punk", "Discovery", "Electro", "House")];
  const {items} = buildQuarters(scrobbles, libAll, new Map());
  const [y2018, y2024] = items;
  assert.equal(y2018.metrics.new_share, 1);
  assert.equal(y2018.metrics.old_share, 0);
  assert.equal(y2024.metrics.new_share, 0);
  assert.equal(y2024.metrics.old_share, 1);
  // Un seul album = 100 % des écoutes : l'obsession (1/0.30) l'emporte sur
  // l'ancrage (1/0.50) — c'est la règle de priorité par score.
  assert.equal(y2024.mood, "obsession");
});

test("buildQuarters: écoutes de nuit comptent comme introspection", () => {
  const scrobbles = [
    ...plays(10, "X", "1", 2025, 1, 23), ...plays(10, "X", "2", 2025, 1, 23),
    ...plays(10, "X", "3", 2025, 2, 23), ...plays(10, "X", "4", 2025, 2, 23),
  ];
  const libAll = ["1", "2", "3", "4"].map((n) => lib("X", n, "Pop", "Pop"));
  const {items} = buildQuarters(scrobbles, libAll, new Map());
  assert.equal(items[0].metrics.night_share, 1);
  assert.equal(items[0].mood, "introspection");
});

// ---- Comparaison à soi (v2.14.0) ----

// Un gros découvreur : ~60 % de nouveautés à chaque trimestre.
const habit = (over = {}) => ({listens: 300, top_share: 0.12, rap_share: 0.2,
  intense_share: 0.05, calm_share: 0.1, new_share: 0.6, old_share: 0.1,
  ...over});

test("baselineOf: moyenne et écart-type par indicateur", () => {
  const b = baselineOf([habit({new_share: 0.5}), habit({new_share: 0.7})]);
  assert.equal(Math.round(b.new_share.mean * 100), 60);
  assert.equal(Math.round(b.new_share.sd * 100), 10);
});

test("assignMoodRelative: dans ses habitudes → pas d'humeur", () => {
  const base = baselineOf([habit({new_share: 0.55}), habit({new_share: 0.65}),
    habit(), habit()]);
  // 60 % de nouveautés : beaucoup dans l'absolu, mais habituel pour lui.
  const r = assignMoodRelative(habit(), base);
  assert.equal(r.mood, null);
  assert.equal(r.reason, "habitudes");
  // Les seuils absolus, eux, auraient dit « Exploration » à chaque fois.
  assert.equal(assignMood(habit()).mood, "exploration");
});

test("assignMoodRelative: ce qui s'écarte le plus de l'habitude gagne", () => {
  const base = baselineOf([habit(), habit({rap_share: 0.15}),
    habit({rap_share: 0.25}), habit({top_share: 0.1})]);
  assert.equal(assignMoodRelative(habit({rap_share: 0.5}), base).mood,
      "energie");
  assert.equal(assignMoodRelative(habit({top_share: 0.4}), base).mood,
      "obsession");
  // Plus de nouveautés que d'habitude : là, c'est « Exploration ».
  assert.equal(assignMoodRelative(habit({new_share: 0.9}), base).mood,
      "exploration");
});

test("assignMoodRelative: indicateur trop faible, pas d'humeur", () => {
  // Rap qui passe de 0 à 8 % : écart énorme, mais 8 % n'est pas « Énergie ».
  const base = baselineOf([habit({rap_share: 0}), habit({rap_share: 0}),
    habit({rap_share: 0}), habit({rap_share: 0})]);
  assert.notEqual(assignMoodRelative(habit({rap_share: 0.08}), base).mood,
      "energie");
});

test("assignMoodRelative: trop peu d'écoutes → volume", () => {
  const base = baselineOf([habit(), habit()]);
  assert.equal(assignMoodRelative(habit({listens: MIN_LISTENS - 1}), base)
      .reason, "volume");
});

test("buildQuarters: comparaison à soi au-delà de " + BASELINE_MIN +
    " trimestres, dernier trimestre incomplet", () => {
  const scrobbles = [];
  const libAll = [];
  // 8 trimestres 2023-2024, chacun : 40 écoutes de 4 albums nouveaux de rock
  // (100 % de nouveautés, habituel) ; 2024-T4 : un seul album en boucle.
  for (let i = 0; i < 8; i++) {
    const y = 2023 + Math.floor(i / 4);
    const m = (i % 4) * 3 + 1;
    for (let j = 0; j < 4; j++) {
      const album = `Q${i}A${j}`;
      libAll.push(lib("Band", album, "Rock", "Alternative"));
      scrobbles.push(...plays(i === 7 && j > 0 ? 3 : 10, "Band", album, y, m));
    }
    if (i === 7) scrobbles.push(...plays(40, "Band", "Q7A0", y, m + 1));
  }
  const {items} = buildQuarters(scrobbles, libAll, new Map());
  assert.equal(items.length, 8);
  assert.equal(items[0].mood_rule, "relative");
  // Découvrir à chaque trimestre est son habitude : pas d'« Exploration ».
  assert.equal(items[2].mood, null);
  assert.equal(items[2].mood_reason, "habitudes");
  // Le dernier trimestre : un album en boucle → Obsession ; données
  // arrêtées en novembre → incomplet.
  const last = items[7];
  assert.equal(last.mood, "obsession");
  assert.equal(last.partial, true);
  assert.ok(last.data_until > 0);
  assert.ok(last.baseline && typeof last.baseline.top_share === "number");
  assert.equal(items[6].partial, false);
});

// ---- Mes années (v2.15.0) ----

test("buildQuarters: années — album, découverte, humeur, en cours", () => {
  const scrobbles = [];
  const libAll = [];
  // 2020-2023 : chaque année 4 albums de rock découverts, 10 écoutes chacun.
  for (let y = 2020; y <= 2023; y++) {
    for (let j = 0; j < 4; j++) {
      libAll.push(lib("Band", `${y}-${j}`, "Rock", "Alternative"));
      scrobbles.push(...plays(10, "Band", `${y}-${j}`, y, 3));
    }
  }
  // 2024 (en cours, arrêtée en mars) : un album en boucle + une découverte.
  libAll.push(lib("Loop", "One", "Rock", "Alternative"));
  libAll.push(lib("New", "Two", "Rock", "Alternative"));
  scrobbles.push(...plays(40, "Loop", "One", 2024, 2));
  scrobbles.push(...plays(5, "New", "Two", 2024, 3));
  const {years} = buildQuarters(scrobbles, libAll, new Map());

  assert.deepEqual(years.map((y) => y.y), [2024, 2023, 2022, 2021, 2020]);
  const [y24, y23] = years;
  assert.equal(y24.partial, true);
  assert.ok(y24.data_until > 0);
  assert.equal(y24.top.album, "One");
  assert.equal(y24.top.count, 40);
  // La découverte de l'année n'est pas l'album de l'année quand il y a mieux.
  assert.equal(y24.discovery.album, "Two");
  assert.equal(y24.mood, "obsession");
  // Années habituelles (4 albums découverts chaque fois) : pas d'humeur.
  assert.equal(y23.mood, null);
  assert.equal(y23.mood_reason, "habitudes");
  assert.equal(y23.partial, false);
});

test("buildQuarters: une écoute sans album n'est pas un album", () => {
  // « 3 Hours of Dark Fantasy Music- » : vidéo YouTube scrobblée sans album,
  // absente de la bibliothèque (IM-4).
  const scrobbles = [
    ...plays(50, "3 Hours of Dark Fantasy Music", "", 2023, 11),
    ...plays(20, "Muse", "Absolution", 2023, 11),
  ];
  const libAll = [lib("Muse", "Absolution", "Rock", "Alternative")];
  const {items, years} = buildQuarters(scrobbles, libAll, new Map());
  const q = items.find((x) => x.key === "2023-T4");
  assert.equal(q.listens, 70);
  assert.deepEqual(q.albums.map((a) => a.album), ["Absolution"]);
  assert.equal(q.metrics.new_albums, 1);
  assert.equal(q.metrics.distinct_albums, 1);
  const y = years.find((x) => x.y === 2023);
  assert.equal(y.top.album, "Absolution");
});

test("buildQuarters: l'album d'une année illustre son titre", () => {
  const scrobbles = [];
  const libAll = [];
  // 2020-2023 : du rock alternatif, chaque année, comme d'habitude.
  for (let y = 2020; y <= 2023; y++) {
    for (let j = 0; j < 4; j++) {
      libAll.push(lib("Band", `${y}-${j}`, "Rock", "Alternative"));
      scrobbles.push(...plays(30, "Band", `${y}-${j}`, y, 3 + j));
    }
  }
  // Feu (rap) chaque année — en 2023, n°1 de l'année (50) sans être une
  // fulgurance ; le rock domine toujours.
  libAll.push(lib("Nekfeu", "Feu", "Rap", "Modern"));
  for (let y = 2020; y <= 2022; y++) {
    scrobbles.push(...plays(40, "Nekfeu", "Feu", y, 9));
  }
  scrobbles.push(...plays(50, "Nekfeu", "Feu", 2023, 9));
  const {years} = buildQuarters(scrobbles, libAll, new Map());
  const y23 = years.find((x) => x.y === 2023);
  assert.equal(y23.highlight.genre, "Rock");
  // Le titre dit « Rock » : l'album affiché est du rock, pas Feu.
  assert.equal(y23.top.artist, "Band");
});

test("buildQuarters: écoutes classées par genre|sous-genre", () => {
  const scrobbles = [
    ...plays(30, "Muse", "Absolution", 2023, 11),
    ...plays(10, "Nekfeu", "Feu", 2023, 11),
    ...plays(5, "Inconnu", "Sans genre", 2023, 11),
  ];
  const libAll = [lib("Muse", "Absolution", "Rock", "Alternative"),
    lib("Nekfeu", "Feu", "", ""), lib("Inconnu", "Sans genre")];
  // Feu sans genre d'album : genre de l'artiste (MODELE E8).
  const artistGenres = new Map([
    ["Nekfeu", {genre: "Rap", sousgenre: "Modern"}]]);
  const {items} = buildQuarters(scrobbles, libAll, artistGenres);
  const q = items.find((x) => x.key === "2023-T4");
  assert.deepEqual(q.styles, {"Rock|Alternative": 30, "Rap|Modern": 10});
  assert.equal(q.listens, 45); // dont 5 sans genre
});

test("blankYears: une année presque sans écoutes est blanche", () => {
  const {blankYears} = require("../src/refresh/quarters");
  const ys = [{y: 2017, listens: 5000}, {y: 2018, listens: 6000},
    {y: 2019, listens: 12}, {y: 2022, listens: 4000}];
  assert.deepEqual([...blankYears(ys)], [2019]);
  // Petite bibliothèque : rien n'est blanc.
  assert.equal(blankYears([{y: 1, listens: 40}, {y: 2, listens: 30}]).size, 0);
});

test("buildQuarters: style dominant (genre · sous-genre)", () => {
  const scrobbles = [...plays(30, "PNL", "A", 2024, 1),
    ...plays(10, "Muse", "D", 2024, 2)];
  const libAll = [lib("PNL", "A", "Rap", "Cloud"),
    lib("Muse", "D", "Rock", "Alternative")];
  const {items, years} = buildQuarters(scrobbles, libAll, new Map());
  assert.deepEqual(years[0].style,
      {genre: "Rap", sousgenre: "Cloud", share: 0.75});
  assert.equal(items[0].style.genre, "Rap");
});

// ---- yearHighlights (v2.19.0) ----

/**
 * Une année synthétique pour yearHighlights.
 * @param {Object<string, number>} artists - nom → écoutes
 * @param {Object<string, number>} styles - "g|sg" → écoutes
 * @return {Object}
 */
function yr(artists, styles) {
  const listens = Object.values(artists).reduce((a, b) => a + b, 0);
  return {listens,
    artists: new Map(Object.entries(artists)
        .map(([k, n]) => [k.toLowerCase(), {name: k, n}])),
    styles: new Map(Object.entries(styles))};
}

test("yearHighlights: première année → style dominant", () => {
  const {yearHighlights} = require("../src/refresh/quarters");
  const [h] = yearHighlights([yr({Muse: 80, PNL: 20},
      {"Rock|Alternative": 80, "Rap|Cloud": 20})]);
  assert.equal(h.kind, "dominant");
  assert.equal(h.sousgenre, "Alternative");
});

test("yearHighlights: un artiste qui explose → fulgurance", () => {
  const {yearHighlights} = require("../src/refresh/quarters");
  const st = {"Rock|Alternative": 100};
  const hs = yearHighlights([
    yr({Muse: 90, Other: 10}, st),
    yr({Muse: 85, Other: 15}, st),
    // Twenty One Pilots absent avant, 20 % cette année.
    yr({"Muse": 70, "Other": 10, "Twenty One Pilots": 20}, st),
  ]);
  assert.equal(hs[2].kind, "surge");
  assert.equal(hs[2].artist, "Twenty One Pilots");
  assert.equal(hs[2].share, 0.2);
  // Muse et Other, stables : pas de fulgurance l'an 2 → comme d'hab.
  assert.equal(hs[1].kind, "usual");
});

test("yearHighlights: hausse ×4 nécessaire pour un artiste déjà là", () => {
  const {yearHighlights} = require("../src/refresh/quarters");
  const st = {"Rock|Alternative": 100};
  const hs = yearHighlights([
    yr({A: 90, B: 10}, st),
    yr({A: 70, B: 30}, st), // ×3 seulement
    yr({A: 50, B: 50}, st), // ×1,7 sa meilleure part passée
  ]);
  assert.equal(hs[1].kind, "usual");
  assert.equal(hs[2].kind, "usual");
});

test("yearHighlights: 2e année d'un artiste adopté, plus un pic", () => {
  const {yearHighlights} = require("../src/refresh/quarters");
  const st = {"Rock|Alternative": 100};
  const hs = yearHighlights([
    yr({A: 100}, st), yr({A: 100}, st), yr({A: 100}, st),
    yr({A: 60, Stromae: 40}, st),
    yr({A: 55, Stromae: 45}, st),
  ]);
  assert.equal(hs[3].artist, "Stromae");
  assert.equal(hs[4].kind, "usual");
});

test("yearHighlights: sinon un sous-genre au-dessus de l'habitude", () => {
  const {yearHighlights} = require("../src/refresh/quarters");
  const hs = yearHighlights([
    yr({A: 50, B: 50}, {"Rock|Alternative": 95, "Rap|Cloud": 5}),
    yr({A: 50, B: 50}, {"Rock|Alternative": 80, "Rap|Cloud": 20}),
  ]);
  assert.equal(hs[1].kind, "style");
  assert.equal(hs[1].genre, "Rap");
  assert.equal(hs[1].was, 0.05);
});

test("buildQuarters: années exposent highlight", () => {
  const scrobbles = [...plays(40, "Muse", "D", 2023, 2),
    ...plays(30, "Muse", "D", 2024, 2), ...plays(20, "TOP", "T", 2024, 3)];
  const libAll = [lib("Muse", "D", "Rock", "Alternative"),
    lib("TOP", "T", "Rock", "Alternative")];
  const {years} = buildQuarters(scrobbles, libAll, new Map());
  assert.equal(years[0].y, 2024);
  assert.deepEqual([years[0].highlight.kind, years[0].highlight.artist],
      ["surge", "TOP"]);
  assert.equal(years[1].highlight.kind, "dominant");
});
