"use strict";

/**
 * Trimestres & humeurs (vision v3 — PM-19, MODELE : Période, Humeur, Bascule).
 *
 * Une Période = un trimestre calendaire (UTC, comme listens_per_year). Pour
 * chacune on calcule des indicateurs à partir des FAITS (écoutes) et de la
 * classification (genre de l'album, sinon de l'artiste — MODELE E8), puis on
 * assigne une Humeur par règles vérifiables.
 *
 * Comparaison à soi (v2.14.0, PM-19) : dès qu'il y a assez de trimestres
 * complets, l'humeur est l'indicateur qui s'écarte le plus de SA PROPRE
 * moyenne (en écarts-types) — « plus de nouveautés que d'habitude », pas
 * « beaucoup de nouveautés » : un gros découvreur n'est plus « Exploration »
 * à chaque trimestre. Sous ce nombre, repli sur les seuils absolus (score =
 * indicateur / seuil). Si rien ne s'écarte nettement : pas d'humeur (« dans
 * tes habitudes ») — on ne plaque pas une étiquette fausse (« Pas
 * d'invention », PRODUIT § 2). Une humeur décrit la musique, jamais la vie.
 *
 * Dérivé pur (IM-5) : recalculé à chaque refresh, jamais une source.
 */

const {utsToTimestamp, PARIS_OFFSET} = require("./aggregates");

// Sous ce volume, un trimestre n'a pas d'humeur (trop peu pour conclure).
const MIN_LISTENS = 30;
// Un album est « ancien » s'il a été découvert ≥ 3 ans avant le trimestre.
const ANCHOR_YEARS = 3;
// Nuit = 22 h → 5 h, heure de Paris approximée (comme Commuting).
const NIGHT_FROM = 22;
const NIGHT_TO = 5;
const TOP_ALBUMS_N = 4;
const TOP_GENRES_N = 3;

// Familles de genres utilisées par les règles (couples de R2, refdata.js).
const INTENSE = {Rock: ["Metal", "Hard", "Punk"]};
const CALM = {
  Classical: null, // tous les sous-genres
  Jazz: null,
  Electro: ["Ambiant", "Downtempo", "Instrumental"],
};

/**
 * Seuils des humeurs : l'humeur est « franche » quand son indicateur atteint
 * le seuil (score ≥ 1). Ordre = priorité en cas d'égalité de score.
 */
const MOOD_RULES = [
  {mood: "obsession", label: "Obsession", metric: "top_share", threshold: 0.30},
  {mood: "intensite", label: "Intensité", metric: "intense_share",
    threshold: 0.35},
  {mood: "energie", label: "Énergie", metric: "rap_share", threshold: 0.40},
  {mood: "introspection", label: "Introspection", metric: "calm_share",
    threshold: 0.35},
  {mood: "exploration", label: "Exploration", metric: "new_share",
    threshold: 0.40},
  {mood: "ancrage", label: "Ancrage", metric: "old_share", threshold: 0.50},
];
// Nom affiché d'une humeur : source unique (front et récits d'Orphée).
const MOOD_LABELS =
  Object.fromEntries(MOOD_RULES.map((r) => [r.mood, r.label]));

// Comparaison à soi : trimestres complets nécessaires, écart minimal (en
// écarts-types), plancher d'écart-type (une habitude très stable ne doit pas
// rendre « net » un écart de 2 points) et poids minimal de l'indicateur
// (moitié de son seuil absolu : 8 % de rap au lieu de 3 % n'est pas
// « Énergie »).
const BASELINE_MIN = 6;
// Années (« Mes années », v2.15.0) : mêmes règles, habitudes sur au moins
// 3 années complètes.
const BASELINE_MIN_YEARS = 3;
// Année « blanche » (presque sans scrobbles, ex. 2019 chez Axel) : jamais
// affichée, ni ses trimestres, ni dans les habitudes.
const BLANK_YEAR_MIN = 100;

/**
 * Années blanches (pure, testée) : sous BLANK_YEAR_MIN écoutes ET sous 5 %
 * de l'année médiane — une petite bibliothèque n'a pas d'année « blanche ».
 * @param {Array<{y: number, listens: number}>} years
 * @return {Set<number>}
 */
function blankYears(years) {
  const ns = years.map((e) => e.listens).sort((a, b) => a - b);
  const median = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
  const min = Math.min(BLANK_YEAR_MIN, median * 0.05);
  return new Set(years.filter((e) => e.listens < min).map((e) => e.y));
}

/**
 * Style dominant (genre · sous-genre le plus écouté) d'une agrégation.
 * @param {Map<string, number>} styles - "genre|sousgenre" → écoutes
 * @param {number} listens
 * @return {?{genre: string, sousgenre: string, share: number}}
 */
function dominantStyle(styles, listens) {
  let best = null;
  for (const [k, n] of styles) if (!best || n > best[1]) best = [k, n];
  if (!best || !listens) return null;
  const [genre, sousgenre] = best[0].split("|");
  return {genre, sousgenre: sousgenre || "",
    share: Math.round(best[1] / listens * 100) / 100};
}
const SURGE_MIN = 0.03;
const SURGE_RATIO = 4;
const STYLE_UP_MIN = 0.05;
const STYLE_UP_RATIO = 1.5;
const STYLE_UP_DIFF = 0.03;

/**
 * Ce qui distingue chaque année (v2.19.0), comparée aux années d'avant :
 * 1. « surge » — un artiste qui explose (≥ 3 % des écoutes de l'année et
 *    ≥ 4× sa meilleure part des années précédentes, ou absent avant :
 *    un vrai pic, pas la 2e année d'un artiste déjà adopté) ;
 * 2. « style » — sinon, un sous-genre nettement au-dessus de l'habitude ;
 * 3. « usual » — sinon, le style dominant, « comme d'hab ».
 * La première année (sans passé) et les années maigres : style dominant.
 * Pure, testée.
 * @param {Array<{listens: number, artists: Map, styles: Map}>} years -
 *   plus ancienne d'abord ; artists : clé → {name, n}, styles : "g|sg" → n
 * @return {Array<?Object>} une qualification par année, même ordre
 */
function yearHighlights(years) {
  const pastArtist = new Map(); // clé → meilleure part des années passées
  const pastStyle = new Map(); // clé → somme des parts des années passées
  return years.map((e, i) => {
    const share = (n) => (e.listens ? n / e.listens : 0);
    const prior = (m, k) => (i ? (m.get(k) || 0) / i : 0);
    const round = (x) => Math.round(x * 100) / 100;
    let out = null;
    if (i > 0 && e.listens >= MIN_LISTENS) {
      let best = null;
      for (const [k, a] of e.artists) {
        const sh = share(a.n);
        const was = pastArtist.get(k) || 0;
        if (sh < SURGE_MIN || (was && sh < was * SURGE_RATIO)) continue;
        if (!best || sh - was > best.score) {
          best = {score: sh - was, name: a.name, sh, was};
        }
      }
      if (best) {
        out = {kind: "surge", artist: best.name,
          share: round(best.sh), was: round(best.was)};
      } else {
        let up = null;
        for (const [k, n] of e.styles) {
          const sh = share(n);
          const was = prior(pastStyle, k);
          if (sh < STYLE_UP_MIN || sh - was < STYLE_UP_DIFF ||
            sh < was * STYLE_UP_RATIO) continue;
          if (!up || sh - was > up.score) up = {score: sh - was, k, sh, was};
        }
        if (up) {
          const [genre, sousgenre] = up.k.split("|");
          out = {kind: "style", genre, sousgenre: sousgenre || "",
            share: round(up.sh), was: round(up.was)};
        }
      }
    }
    if (!out) {
      const dom = dominantStyle(e.styles, e.listens);
      const usual = i > 0 && e.listens >= MIN_LISTENS;
      if (dom) out = {kind: usual ? "usual" : "dominant", ...dom};
    }
    for (const [k, a] of e.artists) {
      pastArtist.set(k, Math.max(pastArtist.get(k) || 0, share(a.n)));
    }
    for (const [k, n] of e.styles) {
      pastStyle.set(k, (pastStyle.get(k) || 0) + share(n));
    }
    return out;
  });
}

const Z_MIN = 1;
const SD_FLOOR = 0.04;
const FLOOR_RATIO = 0.5;

/**
 * Moyenne et écart-type de chaque indicateur d'humeur (pure, testée).
 * @param {Array<Object>} list - indicateurs de trimestres complets
 * @return {Object<string, {mean: number, sd: number}>}
 */
function baselineOf(list) {
  const out = {};
  for (const r of MOOD_RULES) {
    const xs = list.map((m) => m[r.metric] || 0);
    const mean = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
    const v = xs.length ?
      xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length : 0;
    out[r.metric] = {mean, sd: Math.sqrt(v)};
  }
  return out;
}

/**
 * Humeur relative à soi (pure, testée).
 * @param {Object} m - indicateurs du trimestre
 * @param {Object<string, {mean: number, sd: number}>} base - baselineOf()
 * @return {{mood: ?string, score: number, reason: ?string}} reason :
 *   « volume » ou « habitudes » (rien ne s'écarte nettement)
 */
function assignMoodRelative(m, base) {
  if (!m || (m.listens || 0) < MIN_LISTENS) {
    return {mood: null, score: 0, reason: "volume"};
  }
  let best = null;
  for (const r of MOOD_RULES) {
    const v = m[r.metric] || 0;
    if (v < r.threshold * FLOOR_RATIO) continue;
    const b = base[r.metric] || {mean: 0, sd: 0};
    const z = (v - b.mean) / Math.max(b.sd, SD_FLOOR);
    if (!best || z > best.z) best = {mood: r.mood, z};
  }
  const score = best ? Math.round(best.z * 100) / 100 : 0;
  if (!best || best.z < Z_MIN) return {mood: null, score, reason: "habitudes"};
  return {mood: best.mood, score, reason: null};
}

/**
 * @param {number} uts
 * @return {{y: number, q: number, key: string, start: number}|null}
 */
function quarterOf(uts) {
  const ts = utsToTimestamp(uts);
  if (!ts) return null;
  const d = ts.toDate();
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return {y, q, key: `${y}-T${q}`, start: Date.UTC(y, (q - 1) * 3, 1) / 1000};
}

/**
 * @param {string} genre
 * @param {string} sousgenre
 * @param {Object<string, Array<string>|null>} family
 * @return {boolean}
 */
function inFamily(genre, sousgenre, family) {
  if (!Object.prototype.hasOwnProperty.call(family, genre)) return false;
  const subs = family[genre];
  return subs === null || subs.includes(sousgenre);
}

/**
 * Humeur d'un trimestre à partir de ses indicateurs (pure, testée).
 * @param {Object} m - indicateurs (top_share, intense_share, rap_share,
 *   calm_share, new_share, old_share, listens)
 * @return {{mood: ?string, score: number, reason: ?string}} reason :
 *   « volume » (trop peu d'écoutes) ou « mixte » (aucun seuil atteint)
 */
function assignMood(m) {
  if (!m || (m.listens || 0) < MIN_LISTENS) {
    return {mood: null, score: 0, reason: "volume"};
  }
  let best = null;
  for (const r of MOOD_RULES) {
    const score = (m[r.metric] || 0) / r.threshold;
    if (!best || score > best.score) best = {mood: r.mood, score};
  }
  const score = Math.round(best.score * 100) / 100;
  if (best.score < 1) return {mood: null, score, reason: "mixte"};
  return {mood: best.mood, score, reason: null};
}

/**
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} libAll - sortie buildLibrary().all (curation incluse,
 *   cover_url enrichie)
 * @param {Map<string, Object>} artistGenres - artiste → {genre, sousgenre}
 *   (classification d'artiste, MODELE E8)
 * @return {{items: Array<Object>}}
 */
function buildQuarters(scrobbles, libAll, artistGenres) {
  const albumByKey = new Map(libAll.map((a) => [a.album_sur, a]));
  const artistGenre = artistGenres instanceof Map ? artistGenres : new Map();
  // Genre effectif : celui de l'album s'il est classé, sinon celui de
  // l'artiste (MODELE E8).
  const genreOf = (a, artist) => {
    if (a && a.genre) return {genre: a.genre, sousgenre: a.sousgenre || ""};
    return artistGenre.get(artist) || {genre: "", sousgenre: ""};
  };

  // 1. Première écoute de chaque album (pour « découvert » / « ancien »),
  // et dernière écoute connue (trimestre en cours ou données qui s'arrêtent).
  const firstUts = new Map();
  let lastUts = 0;
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    if (uts > lastUts) lastUts = uts;
    const cur = firstUts.get(s.album_sur);
    if (cur === undefined || uts < cur) firstUts.set(s.album_sur, uts);
  }

  // 2. Agrégation par trimestre, et par année (« Mes années »).
  const byQ = new Map();
  const byY = new Map();
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    const qt = quarterOf(uts);
    if (!qt) continue;
    let e = byQ.get(qt.key);
    if (!e) {
      e = {...qt, listens: 0, albums: new Map(), genres: new Map(),
        styles: new Map(),
        intense: 0, calm: 0, rap: 0, night: 0, fresh: 0, old: 0,
        newAlbums: new Set()};
      byQ.set(qt.key, e);
    }
    let ye = byY.get(qt.y);
    if (!ye) {
      ye = {y: qt.y, key: String(qt.y), start: Date.UTC(qt.y, 0, 1) / 1000,
        listens: 0, albums: new Map(), genres: new Map(), styles: new Map(),
        artists: new Map(),
        intense: 0, calm: 0, rap: 0, night: 0, fresh: 0, old: 0,
        newAlbums: new Set()};
      byY.set(qt.y, ye);
    }
    const a = albumByKey.get(s.album_sur);
    // Écoute sans album (titre seul, vidéo YouTube : « Artiste- ») : elle
    // compte comme écoute (volume, genre, nuit) mais n'est pas un album
    // (IM-4) — ni dans les albums du trimestre, ni dans ses découvertes.
    const isAlbum = !!a;
    const {genre, sousgenre} = genreOf(a, (s.artist || "").toString());
    const hour = (new Date(uts * 1000).getUTCHours() + PARIS_OFFSET) % 24;
    const first = firstUts.get(s.album_sur);
    const artistName = ((a && a.artist) || s.artist || "").toString().trim();
    if (artistName) {
      const ak = artistName.toLowerCase();
      const cur = ye.artists.get(ak);
      if (cur) cur.n += 1;
      else ye.artists.set(ak, {name: artistName, n: 1});
    }
    for (const x of [e, ye]) {
      x.listens += 1;
      if (isAlbum) {
        x.albums.set(s.album_sur, (x.albums.get(s.album_sur) || 0) + 1);
      }
      if (genre) {
        x.genres.set(genre, (x.genres.get(genre) || 0) + 1);
        const st = `${genre}|${sousgenre || ""}`;
        x.styles.set(st, (x.styles.get(st) || 0) + 1);
      }
      if (inFamily(genre, sousgenre, INTENSE)) x.intense += 1;
      if (inFamily(genre, sousgenre, CALM)) x.calm += 1;
      if (genre === "Rap") x.rap += 1;
      if (hour >= NIGHT_FROM || hour < NIGHT_TO) x.night += 1;
      if (!isAlbum) continue;
      if (first >= x.start) {
        x.fresh += 1;
        x.newAlbums.add(s.album_sur);
      } else if (first < x.start - ANCHOR_YEARS * 365.25 * 86400) {
        x.old += 1;
      }
    }
  }

  // 3. Indicateurs, humeur, bascule — dans l'ordre chronologique.
  const keys = Array.from(byQ.keys()).sort((x, y) => {
    const [ya, qa] = x.split("-T").map(Number);
    const [yb, qb] = y.split("-T").map(Number);
    return ya - yb || qa - qb;
  });
  // Trimestre de la dernière écoute : incomplet s'il n'est pas fini (en
  // cours, ou données qui s'arrêtent avant sa fin).
  const lastQ = lastUts ? quarterOf(lastUts) : null;
  const nextStart = (qt) => Date.UTC(qt.q === 4 ? qt.y + 1 : qt.y,
      qt.q === 4 ? 0 : qt.q * 3, 1) / 1000;
  const partialKey = lastQ && lastUts < nextStart(lastQ) - 86400 ?
    lastQ.key : null;

  // 3a. Indicateurs de chaque trimestre.
  const rows = keys.map((k) => {
    const e = byQ.get(k);
    const share = (n) =>
      (e.listens ? Math.round(n / e.listens * 100) / 100 : 0);
    const ranked = Array.from(e.albums.entries()).sort((x, y) => y[1] - x[1]);
    const metrics = {
      listens: e.listens,
      top_share: share(ranked.length ? ranked[0][1] : 0),
      intense_share: share(e.intense),
      rap_share: share(e.rap),
      calm_share: Math.max(share(e.calm), share(e.night)),
      new_share: share(e.fresh),
      old_share: share(e.old),
    };
    return {k, e, share, ranked, metrics, partial: k === partialKey};
  });

  // 3b. Habitudes : moyenne des trimestres complets et assez fournis.
  const complete = rows.filter((r) => !r.partial &&
    r.metrics.listens >= MIN_LISTENS).map((r) => r.metrics);
  const base = complete.length >= BASELINE_MIN ? baselineOf(complete) : null;
  const baseline = base ? Object.fromEntries(Object.entries(base)
      .map(([k, v]) => [k, Math.round(v.mean * 100) / 100])) : null;

  // 3c. Humeur et bascule, dans l'ordre chronologique.
  const items = [];
  let prevMood = null;
  for (const {k, e, share, ranked, metrics, partial} of rows) {
    const {mood, score, reason} = base ?
      assignMoodRelative(metrics, base) : assignMood(metrics);
    const bascule = !!(mood && prevMood && mood !== prevMood);
    items.push({
      key: k,
      y: e.y,
      q: e.q,
      listens: e.listens,
      mood,
      mood_label: mood ? MOOD_LABELS[mood] : null,
      mood_reason: reason,
      mood_rule: base ? "relative" : "absolute",
      score,
      bascule,
      prev_mood: bascule ? prevMood : null,
      partial,
      data_until: partial ? lastUts : null,
      baseline,
      metrics: {
        ...metrics,
        night_share: share(e.night),
        new_albums: e.newAlbums.size,
        distinct_albums: e.albums.size,
      },
      style: dominantStyle(e.styles, e.listens),
      // Écoutes classées par « genre|sous-genre » (v2.33.0) : de quoi tracer
      // les genres dans le temps (« Mes années ») ; le reste des écoutes
      // (listens − somme) est sans genre.
      styles: Object.fromEntries(e.styles),
      genres: Array.from(e.genres.entries())
          .sort((x, y) => y[1] - x[1])
          .slice(0, TOP_GENRES_N)
          .map(([genre, n]) => ({genre, share: share(n)})),
      albums: ranked.slice(0, TOP_ALBUMS_N).map(([key, count]) => {
        const a = albumByKey.get(key) || {};
        return {
          album_sur: key,
          artist: a.artist || "",
          album: a.album || key,
          cover_url: a.cover_url || null,
          count,
        };
      }),
    });
    if (mood) prevMood = mood;
  }
  // Années blanches : ni l'année, ni ses trimestres (voir BLANK_YEAR_MIN).
  const blank = blankYears(Array.from(byY.values()));
  return {
    items: items.filter((q) => !blank.has(q.y)),
    years: buildYears(byY, lastUts, albumByKey, blank,
        (a) => genreOf(a, (a && a.artist) || "")),
  };
}

/**
 * « Mes années » (v2.15.0) : par année, mêmes indicateurs et même humeur
 * comparée à soi que les trimestres ; album de l'année et découverte de
 * l'année (album découvert cette année-là le plus écouté). Plus récente
 * d'abord.
 * @param {Map<number, Object>} byY - agrégats annuels
 * @param {number} lastUts - dernière écoute connue
 * @param {Map<string, Object>} albumByKey
 * @param {Set<number>} [blank] - années blanches, écartées
 * @param {Function} [genreOf] - album → {genre, sousgenre} effectif
 * @return {Array<Object>}
 */
function buildYears(byY, lastUts, albumByKey, blank = new Set(),
    genreOf = (a) => ({genre: a.genre || "", sousgenre: a.sousgenre || ""})) {
  const lastYear = lastUts ? utsToTimestamp(lastUts).toDate().getUTCFullYear() :
    null;
  const card = (key, count) => {
    const a = albumByKey.get(key) || {};
    return {album_sur: key, artist: a.artist || "", album: a.album || key,
      cover_url: a.cover_url || null, count};
  };
  const illustrate = (ranked, h) => {
    if (!h) return null;
    return ranked.find(([k]) => {
      const a = albumByKey.get(k);
      if (!a) return false;
      if (h.kind === "surge") {
        return (a.artist || "").trim().toLowerCase() ===
          (h.artist || "").trim().toLowerCase();
      }
      const g = genreOf(a);
      return g.genre === h.genre && (g.sousgenre || "") === (h.sousgenre || "");
    }) || null;
  };
  const kept = Array.from(byY.values()).filter((e) => !blank.has(e.y))
      .sort((x, y) => x.y - y.y);
  const highlights = yearHighlights(kept);
  const rows = kept.map((e, i) => {
    const share = (n) =>
      (e.listens ? Math.round(n / e.listens * 100) / 100 : 0);
    const ranked = Array.from(e.albums.entries()).sort((x, y) => y[1] - x[1]);
    const metrics = {
      listens: e.listens,
      top_share: share(ranked.length ? ranked[0][1] : 0),
      intense_share: share(e.intense),
      rap_share: share(e.rap),
      calm_share: Math.max(share(e.calm), share(e.night)),
      new_share: share(e.fresh),
      old_share: share(e.old),
    };
    const partial = e.y === lastYear &&
      lastUts < Date.UTC(e.y + 1, 0, 1) / 1000 - 86400;
    // L'album affiché illustre le titre de la ligne (v2.31.6) : celui de
    // l'artiste qui explose, du sous-genre qui monte ou du style dominant
    // — le plus écouté de l'année en repli.
    const face = illustrate(ranked, highlights[i]) || ranked[0] || null;
    const faceKey = face ? face[0] : null;
    const disc = ranked.find(([k]) => e.newAlbums.has(k) && k !== faceKey) ||
      ranked.find(([k]) => e.newAlbums.has(k));
    return {e, metrics, partial, ranked, face, disc,
      highlight: highlights[i]};
  });
  const complete = rows.filter((r) => !r.partial &&
    r.metrics.listens >= MIN_LISTENS).map((r) => r.metrics);
  const base = complete.length >= BASELINE_MIN_YEARS ?
    baselineOf(complete) : null;
  const baseline = base ? Object.fromEntries(Object.entries(base)
      .map(([k, v]) => [k, Math.round(v.mean * 100) / 100])) : null;
  return rows.map(({e, metrics, partial, ranked, face, disc, highlight}) => {
    const {mood, score, reason} = base ?
      assignMoodRelative(metrics, base) : assignMood(metrics);
    return {
      key: e.key,
      y: e.y,
      listens: e.listens,
      mood,
      mood_label: mood ? MOOD_LABELS[mood] : null,
      mood_reason: reason,
      score,
      partial,
      data_until: partial ? lastUts : null,
      baseline,
      metrics: {...metrics, new_albums: e.newAlbums.size},
      style: dominantStyle(e.styles, e.listens),
      highlight,
      top: face ? card(face[0], face[1]) : null,
      discovery: disc ? card(disc[0], disc[1]) : null,
    };
  }).reverse();
}

exports.MIN_LISTENS = MIN_LISTENS;
exports.MOOD_RULES = MOOD_RULES;
exports.MOOD_LABELS = MOOD_LABELS;
exports.quarterOf = quarterOf;
exports.assignMood = assignMood;
exports.assignMoodRelative = assignMoodRelative;
exports.baselineOf = baselineOf;
exports.BASELINE_MIN = BASELINE_MIN;
exports.BASELINE_MIN_YEARS = BASELINE_MIN_YEARS;
exports.BLANK_YEAR_MIN = BLANK_YEAR_MIN;
exports.blankYears = blankYears;
exports.yearHighlights = yearHighlights;
exports.buildQuarters = buildQuarters;
