"use strict";

const {Timestamp} = require("firebase-admin/firestore");
const {GRADE_LABELS, KEYS} = require("../grades");

const TOP_N = 20;

// Overrides manuels : album_sur → titre d'album forcé.
// Cas : scrobbles sans titre d'album (album_sur se termine par "-").
const ALBUM_SUR_OVERRIDES = {
  "Axel Mercier-": "Chronicle of the Chained",
};

// Échelle des notes : GRADE_LABELS (value → slug minuscule, = grade_label du
// cache et clés de grade_distribution) et KEYS viennent de la source unique
// functions/src/grades.js (ADR-026). La colonne album_grade_no de la Sheet est
// 0-4 ; au seed, note = album_grade_no + 1. Pas de niveau 0.

/**
 * Convert a Last.fm uts value (Unix seconds, ms auto-detected) to a
 * Firestore Timestamp. Returns null for invalid input.
 * @param {number|string} uts
 * @return {Timestamp|null}
 */
function utsToTimestamp(uts) {
  const n = typeof uts === "number" ? uts : parseInt(uts, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e11 ? n : n * 1000;
  return Timestamp.fromMillis(ms);
}

/**
 * Build cache/agg_global. `albums` = albums enrichis (curation fusionnée).
 * @param {Object} params
 * @return {Object}
 */
function buildGlobal({scrobbles, albums, lastRefresh}) {
  const gradeDistribution = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let gradedAlbums = 0;

  for (const a of albums) {
    if (a.grade === null) continue;
    gradedAlbums += 1;
    const label = GRADE_LABELS[a.grade];
    if (label && gradeDistribution[label] !== undefined) {
      gradeDistribution[label] += 1;
    }
  }

  return {
    total_listens: scrobbles.length,
    total_albums: albums.length,
    total_artists: new Set(scrobbles.map((s) => s.artist).filter(Boolean)).size,
    graded_albums: gradedAlbums,
    grade_distribution: gradeDistribution,
    last_refresh: lastRefresh,
  };
}

/**
 * Build cache/agg_top_artists_alltime document (top 20 by listen count).
 * @param {Array<Object>} scrobbles
 * @return {{items: Array<Object>}}
 */
function buildTopArtists(scrobbles) {
  const byArtist = new Map();

  for (const s of scrobbles) {
    const artist = s.artist;
    if (!artist) continue;
    let entry = byArtist.get(artist);
    if (!entry) {
      entry = {
        artist,
        count: 0,
        byAlbum: new Map(),
        lastUts: 0,
      };
      byArtist.set(artist, entry);
    }
    entry.count += 1;

    const albumSur = s.album_sur || "";
    if (albumSur) {
      entry.byAlbum.set(albumSur, (entry.byAlbum.get(albumSur) || 0) + 1);
    }

    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (Number.isFinite(uts) && uts > entry.lastUts) entry.lastUts = uts;
  }

  const items = Array.from(byArtist.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N)
      .map((e) => {
        let topAlbum = null;
        let topCount = -1;
        for (const [k, v] of e.byAlbum) {
          if (v > topCount) {
            topCount = v;
            topAlbum = k;
          }
        }
        return {
          artist: e.artist,
          count: e.count,
          top_album: topAlbum,
          last_played: utsToTimestamp(e.lastUts),
        };
      });

  return {items};
}

/**
 * Build cache/agg_top_albums_alltime (top 20 by listen count). `albums` =
 * albums enrichis ; on en tire le grade et l'artiste/album canoniques.
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} albums
 * @return {{items: Array<Object>}}
 */
function buildTopAlbums(scrobbles, albums) {
  const albumsByKey = new Map();
  for (const a of albums) {
    if (a.album_sur) albumsByKey.set(a.album_sur, a);
  }

  const byAlbumSur = new Map();
  for (const s of scrobbles) {
    const key = s.album_sur;
    // Une écoute sans album (« Artiste- ») n'est pas un album (IM-4).
    if (!key || !albumsByKey.has(key)) continue;
    let entry = byAlbumSur.get(key);
    if (!entry) {
      entry = {
        album_sur: key,
        artist: s.artist || "",
        album: s.album || "",
        count: 0,
      };
      byAlbumSur.set(key, entry);
    }
    entry.count += 1;
  }

  const items = Array.from(byAlbumSur.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N)
      .map((e) => {
        const ref = albumsByKey.get(e.album_sur);
        return {
          album_sur: e.album_sur,
          artist: ref && ref.artist ? ref.artist : e.artist,
          album: ref && ref.album ? ref.album : e.album,
          count: e.count,
          grade: ref && ref.grade !== undefined ? ref.grade : null,
          personal_fav: ref ? !!ref.personal_fav : false,
          cover_url: (ref && ref.cover_url) ? ref.cover_url : null,
        };
      });

  return {items};
}

/**
 * Build the library by deriving albums from scrobbles (ADR-014).
 * Each unique album_sur becomes an album entry; artist/album taken from the
 * first scrobble encountered. first_listen_y derived from min uts.
 * Curation (grades, genres) merged from Firestore map.
 * Albums sans titre sont exclus.
 * @param {Array<Object>} scrobbles
 * @param {Map<string, Object>} curationByKey - album_sur → curation (Firestore)
 * @return {{all: Array<Object>, curated: Array<Object>}}
 */
function buildLibrary(scrobbles, curationByKey) {
  const byAlbum = new Map();
  for (const s of scrobbles) {
    const key = s.album_sur;
    if (!key) continue;
    let e = byAlbum.get(key);
    if (!e) {
      e = {
        album_sur: key,
        artist: (s.artist || "").toString(),
        album: (s.album || "").toString(),
        count: 0,
        minUts: Infinity,
      };
      byAlbum.set(key, e);
    }
    e.count += 1;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (Number.isFinite(uts) && uts > 0 && uts < e.minUts) e.minUts = uts;
  }

  const all = [];
  for (const [albumSur, e] of byAlbum) {
    const override = ALBUM_SUR_OVERRIDES[albumSur];
    const albumName = override || e.album.trim();
    if (!albumSur || !albumName) continue;
    const c = (curationByKey && curationByKey.get(albumSur)) || {};
    const ts = e.minUts === Infinity ? null : utsToTimestamp(e.minUts);
    all.push(withCuration({
      album_sur: albumSur,
      artist: e.artist,
      album: albumName,
      listen_count: e.count,
      first_listen_y: ts ? ts.toDate().getUTCFullYear() : null,
    }, c));
  }

  all.sort((x, y) => y.listen_count - x.listen_count);

  const curated = all
      .filter((c) => c.grade !== null || c.personal_fav)
      .sort((x, y) => {
        if (x.personal_fav !== y.personal_fav) return x.personal_fav ? -1 : 1;
        const gx = x.grade === null ? -1 : x.grade;
        const gy = y.grade === null ? -1 : y.grade;
        if (gy !== gx) return gy - gx;
        return y.listen_count - x.listen_count;
      });

  return {all, curated};
}

/**
 * Carte d'album + sa curation (une seule façon de les réunir : buildLibrary,
 * et le recalcul de « Moi » sur une curation modifiée, refresh/moi.js).
 * @param {Object} card - {album_sur, artist, album, listen_count, ...}
 * @param {Object} c - curation de l'album (users/{uid}/grades), ou {}
 * @return {Object}
 */
function withCuration(card, c) {
  const grade = c.grade === undefined || c.grade === null ? null : c.grade;
  return {
    ...card,
    grade,
    grade_label: grade === null ? null : (GRADE_LABELS[grade] || null),
    personal_fav: !!c.personal_fav,
    commentaire: (c.commentaire || "").toString(),
    genre: (c.genre || "").toString(),
    sousgenre: (c.sousgenre || "").toString(),
  };
}

// Genres hors portrait (moi.js, IGNORED_GENRES).
const PORTRAIT_IGNORED = new Set(["Non classé", "Podcast"]);

/**
 * Portrait de « Moi » calculé d'avance (v2.37.0, ADR-048) : le même calcul
 * que moi.js (buildTerritories, sharpness), pour un premier affichage sans
 * attendre la bibliothèque. Le client le recalcule ensuite sur la curation
 * live (ADR-031) — ce dérivé n'est qu'un premier jet.
 * @param {Array<Object>} libAll - albums {artist, listen_count, grade,
 *   genre, sousgenre}
 * @param {Map<string, {genre: string, sousgenre: string}>} artistGenres
 * @return {{territories: Array<Object>, sharp: number}}
 */
function buildPortrait(libAll, artistGenres) {
  const eff = (a) => (a.genre ? {genre: a.genre, sousgenre: a.sousgenre || ""} :
    (artistGenres && artistGenres.get(a.artist)) || {genre: "", sousgenre: ""});
  const byGenre = new Map();
  let classified = 0;
  let total = 0;
  let sharp = 0;
  for (const a of libAll) {
    const n = a.listen_count || 0;
    const e = eff(a);
    total += n;
    if (a.grade != null && e.genre) sharp += n;
    if (!e.genre || PORTRAIT_IGNORED.has(e.genre) || !n) continue;
    classified += n;
    let g = byGenre.get(e.genre);
    if (!g) {
      g = {genre: e.genre, listens: 0, sous: new Map(), artists: new Map()};
      byGenre.set(e.genre, g);
    }
    g.listens += n;
    if (e.sousgenre && e.sousgenre !== e.genre) {
      g.sous.set(e.sousgenre, (g.sous.get(e.sousgenre) || 0) + n);
    }
    g.artists.set(a.artist, (g.artists.get(a.artist) || 0) + n);
  }
  const topOf = (m, k) => Array.from(m.entries())
      .sort((x, y) => y[1] - x[1]).slice(0, k).map(([name]) => name);
  return {
    territories: Array.from(byGenre.values())
        .sort((x, y) => y.listens - x.listens).slice(0, 3)
        .map((g) => ({genre: g.genre,
          share: Math.round(g.listens / classified * 100),
          sousgenre: topOf(g.sous, 1)[0] || "", artists: topOf(g.artists, 3)})),
    sharp: total ? Math.round(sharp / total * 100) : 0,
  };
}

/**
 * Carte d'album pour les chunks `agg_library_all_*` : faits + dérivé SANS
 * curation (ADR-031). La curation (note, coup de cœur, description, genre) est
 * lue LIVE à sa source `users/{uid}/grades` — jamais depuis le cache. Le front
 * (`library.applyCuration`) et Orphée (`curation-overlay`) la superposent. Les
 * vues Stats dérivées, elles, restent des snapshots refresh-gated et conservent
 * leur curation (IM-6 / ADR-005).
 * @param {Object} a item de buildLibrary().all
 * @return {Object}
 */
function libraryCard(a) {
  return {
    album_sur: a.album_sur,
    artist: a.artist,
    album: a.album,
    listen_count: a.listen_count,
    first_listen_y: a.first_listen_y,
    cover_url: a.cover_url || null,
    // Album canonique (v2.21.0, PM-29) : libellés bruts réunis ici, ou
    // libellé séparé à la demande d'Axel.
    ...(a.variants ? {variants: a.variants} : {}),
    ...(a.split ? {split: true} : {}),
    // Pas un album : single, remix, live, bo, hors (v2.36.0).
    ...(a.nature ? {nature: a.nature} : {}),
  };
}

/**
 * Build cache/agg_stats from scrobbles and the library output.
 * - grade_distribution : nombre d'albums par note 1-5 (notés seulement)
 * - genre_distribution : écoutes + albums par genre (bucket "Non classé")
 * - listens_per_year   : nombre d'écoutes par année (depuis uts)
 * - by_month           : écoutes par mois calendaire 1-12 (rythme de l'année)
 * - by_weekday         : écoutes par jour de semaine 0-6 (0 = dimanche)
 * Axe temporel en UTC, cohérent avec listens_per_year. (L'heure du jour vient
 * de Commuting `band`, en heure locale — une seule source horaire, ADR-028.)
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} libraryAll - sortie buildLibrary().all
 * @return {Object}
 */
function buildStats(scrobbles, libraryAll) {
  const gradeDistribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  const genreMap = new Map();
  for (const a of libraryAll) {
    if (a.grade !== null && gradeDistribution[a.grade] !== undefined) {
      gradeDistribution[a.grade] += 1;
    }
    const g = a.genre || "Non classé";
    let e = genreMap.get(g);
    if (!e) {
      e = {genre: g, listens: 0, albums: 0};
      genreMap.set(g, e);
    }
    e.listens += a.listen_count || 0;
    e.albums += 1;
  }
  const genreDistribution = Array.from(genreMap.values())
      .sort((x, y) => y.listens - x.listens);

  // Album typique de chaque année / mois / jour (v2.44.3) : même bucketing
  // UTC que les comptes ; score n²/total (comme « Ma journée ») pour que le
  // plus écouté n'habite pas tous les créneaux. Au moins TYPICAL_MIN écoutes.
  const albumByKey = new Map(libraryAll.map((a) => [a.album_sur, a]));
  const yearMap = new Map();
  const monthCounts = new Array(12).fill(0);
  const weekdayCounts = new Array(7).fill(0);
  const yearAlb = new Map();
  const monthAlb = Array.from({length: 12}, () => new Map());
  const weekdayAlb = Array.from({length: 7}, () => new Map());
  const bump = (map, k) => {
    if (k) map.set(k, (map.get(k) || 0) + 1);
  };
  for (const s of scrobbles) {
    const ts = utsToTimestamp(s.uts);
    if (!ts) continue;
    const d = ts.toDate();
    const year = d.getUTCFullYear();
    yearMap.set(year, (yearMap.get(year) || 0) + 1);
    monthCounts[d.getUTCMonth()] += 1;
    weekdayCounts[d.getUTCDay()] += 1;
    if (albumByKey.has(s.album_sur)) {
      if (!yearAlb.has(year)) yearAlb.set(year, new Map());
      bump(yearAlb.get(year), s.album_sur);
      bump(monthAlb[d.getUTCMonth()], s.album_sur);
      bump(weekdayAlb[d.getUTCDay()], s.album_sur);
    }
  }
  const typicalCard = (map) => {
    let best = null;
    let bestScore = -1;
    let topK = null;
    let topN = -1;
    for (const [k, n] of map) {
      if (n > topN) {
        topN = n;
        topK = k;
      }
      if (n < TYPICAL_MIN) continue;
      const tot = (albumByKey.get(k) || {}).listen_count || n;
      const score = n * n / tot;
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    const k = best || topK;
    if (!k) return null;
    const a = albumByKey.get(k) || {};
    return {album_sur: k, artist: a.artist || "", album: a.album || "",
      cover_url: a.cover_url || null, count: map.get(k)};
  };
  const listensPerYear = Array.from(yearMap.entries())
      .map(([year, count]) => ({year, count,
        top: typicalCard(yearAlb.get(year) || new Map())}))
      .sort((a, b) => a.year - b.year);
  const byMonth = monthCounts.map((count, i) =>
    ({month: i + 1, count, top: typicalCard(monthAlb[i])}));
  const byWeekday = weekdayCounts.map((count, i) =>
    ({weekday: i, count, top: typicalCard(weekdayAlb[i])}));

  return {
    grade_distribution: gradeDistribution,
    genre_distribution: genreDistribution,
    listens_per_year: listensPerYear,
    by_month: byMonth,
    by_weekday: byWeekday,
  };
}

const TOP_TRACKS_N = 10;

/**
 * Clé de mois "YYYY-MM" depuis un uts, ou null.
 * @param {number|string} uts
 * @return {string|null}
 */
function monthKey(uts) {
  const ts = utsToTimestamp(uts);
  if (!ts) return null;
  const d = ts.toDate();
  const m = d.getUTCMonth() + 1;
  return d.getUTCFullYear() + "-" + (m < 10 ? "0" + m : "" + m);
}

/**
 * Stats riches par album pour la fiche détail, calculées en un passage sur
 * les scrobbles, restreintes à `albumSet`. (Écho ajouté séparément en 8b.)
 * @param {Array<Object>} scrobbles
 * @param {Set<string>} albumSet - album_sur à calculer
 * @param {Map<string, Object>} identityByKey - album_sur → {artist, album}
 * @return {Map<string, Object>}
 */
function buildAlbumStats(scrobbles, albumSet, identityByKey) {
  const acc = new Map();
  for (const s of scrobbles) {
    const key = s.album_sur;
    if (!key || !albumSet.has(key)) continue;
    let e = acc.get(key);
    if (!e) {
      e = {count: 0, months: new Map(), tracks: new Map(),
        firstUts: Infinity, lastUts: 0};
      acc.set(key, e);
    }
    e.count += 1;
    const mk = monthKey(s.uts);
    if (mk) e.months.set(mk, (e.months.get(mk) || 0) + 1);
    const track = (s.track || "").toString();
    if (track) e.tracks.set(track, (e.tracks.get(track) || 0) + 1);
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (Number.isFinite(uts) && uts > 0) {
      if (uts < e.firstUts) e.firstUts = uts;
      if (uts > e.lastUts) e.lastUts = uts;
    }
  }

  const out = new Map();
  for (const [key, e] of acc) {
    const id = identityByKey.get(key) || {};
    const monthlyDistribution = Array.from(e.months.entries())
        .map(([month, count]) => ({month, count}))
        .sort((a, b) => (a.month < b.month ? -1 : 1));
    const topTracks = Array.from(e.tracks.entries())
        .map(([track, count]) => ({track, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_TRACKS_N);
    out.set(key, {
      album_sur: key,
      artist: id.artist || "",
      album: id.album || "",
      listen_count: e.count,
      unique_tracks_played: e.tracks.size,
      first_listen: utsToTimestamp(e.firstUts === Infinity ? 0 : e.firstUts),
      last_played: utsToTimestamp(e.lastUts),
      monthly_distribution: monthlyDistribution,
      top_tracks: topTracks,
    });
  }
  return out;
}

const ECHO_WINDOW_HALF = 3; // ±3 mois autour du pic
const ECHO_TOP_N = 8;

/**
 * "YYYY-MM" → index entier de mois.
 * @param {string} mk
 * @return {number}
 */
function monthIndex(mk) {
  const parts = mk.split("-");
  return Number(parts[0]) * 12 + (Number(parts[1]) - 1);
}

/**
 * Index entier de mois → "YYYY-MM".
 * @param {number} idx
 * @return {string}
 */
function indexToMonth(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return y + "-" + (m < 10 ? "0" + m : "" + m);
}

/**
 * Écho : pour chaque album du set, les albums les plus écoutés dans une
 * fenêtre ±N mois autour de son **pic d'écoute** (mois le plus joué). Score =
 * nombre d'écoutes du compagnon dans la fenêtre. Voir étape 8 du plan.
 * @param {Array<Object>} scrobbles
 * @param {Set<string>} albumSet
 * @param {Map<string, Object>} identityByKey - album_sur → {artist, album}
 * @param {Object} [opts] - {windowHalf, topN}
 * @return {Map<string, Array<Object>>} album_sur → liste de compagnons
 */
function buildEcho(scrobbles, albumSet, identityByKey, opts) {
  const half = (opts && opts.windowHalf) || ECHO_WINDOW_HALF;
  const topN = (opts && opts.topN) || ECHO_TOP_N;

  // Histogramme mensuel global : mois → (album_sur → écoutes).
  const monthly = new Map();
  for (const s of scrobbles) {
    const key = s.album_sur;
    if (!key) continue;
    const mk = monthKey(s.uts);
    if (!mk) continue;
    let mm = monthly.get(mk);
    if (!mm) {
      mm = new Map();
      monthly.set(mk, mm);
    }
    mm.set(key, (mm.get(key) || 0) + 1);
  }

  // Pic d'écoute (mois le plus joué) par album du set.
  const peak = new Map();
  for (const [mk, mm] of monthly) {
    for (const [key, cnt] of mm) {
      if (!albumSet.has(key)) continue;
      const cur = peak.get(key);
      if (!cur || cnt > cur.count) peak.set(key, {month: mk, count: cnt});
    }
  }

  const result = new Map();
  for (const key of albumSet) {
    const pk = peak.get(key);
    if (!pk) {
      result.set(key, {ref: 0, items: []});
      continue;
    }
    const center = monthIndex(pk.month);
    const scores = new Map();
    let ref = 0; // écoutes de X dans sa propre fenêtre (référence des barres)
    for (let i = center - half; i <= center + half; i++) {
      const mm = monthly.get(indexToMonth(i));
      if (!mm) continue;
      ref += mm.get(key) || 0;
      for (const [y, cnt] of mm) {
        if (y === key) continue;
        const id = identityByKey.get(y);
        if (!id || !id.album) continue; // ignore les entrées sans titre
        scores.set(y, (scores.get(y) || 0) + cnt);
      }
    }
    const items = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([y, score]) => {
          const id = identityByKey.get(y) || {};
          return {album_sur: y, artist: id.artist || "",
            album: id.album || "", score};
        });
    result.set(key, {ref, items});
  }
  return result;
}

const ODDITY_DEFAULT_PERCENTILE = 90;
const ODDITY_DEFAULT_ELIGIBLE = [1, 2];
const ODDITY_TOP_N = 20;
const UNRATED_TOP_N = 20;

/**
 * Build cache/agg_oddities. Albums dans les notes basses ET très écoutés
 * (percentile N de toute la bibliothèque). Paramètres issus des settings user.
 * @param {Array<Object>} libraryAll - sortie buildLibrary().all
 * @param {Object|null} settings - {percentile, eligible} ou null pour defaults
 * @return {{items: Array<Object>, threshold: number, percentile: number}}
 */
function buildOddities(libraryAll, settings) {
  const percentile = (settings && settings.percentile != null) ?
    settings.percentile : ODDITY_DEFAULT_PERCENTILE;
  const eligible = (settings && Array.isArray(settings.eligible)) ?
    settings.eligible : ODDITY_DEFAULT_ELIGIBLE;

  const counts = libraryAll
      .filter((a) => a.listen_count > 0)
      .map((a) => a.listen_count)
      .sort((a, b) => a - b);

  if (counts.length === 0) {
    return {items: [], threshold: 0, percentile,
      albums_above_threshold: 0, graded_above_threshold: 0};
  }

  const idx = Math.ceil((percentile / 100) * counts.length) - 1;
  const threshold = counts[Math.max(0, idx)];

  const albumsAboveThreshold = libraryAll
      .filter((a) => a.listen_count >= threshold).length;

  // Albums à la fois gradeable (≥ seuil) ET notés — numérateur correct du %
  // dans le header. Évite de dépasser 100 % quand des albums sous le seuil
  // ont quand même été notés.
  const gradedAboveThreshold = libraryAll
      .filter((a) => a.grade !== null && a.listen_count >= threshold).length;

  const items = libraryAll
      .filter((a) =>
        a.grade !== null &&
        eligible.includes(a.grade) &&
        a.listen_count >= threshold,
      )
      .sort((a, b) => b.listen_count - a.listen_count)
      .slice(0, ODDITY_TOP_N)
      .map((a) => ({
        album_sur: a.album_sur,
        artist: a.artist,
        album: a.album,
        listen_count: a.listen_count,
        grade: a.grade,
        grade_label: a.grade_label,
      }));

  return {items, threshold, percentile, eligible,
    albums_above_threshold: albumsAboveThreshold,
    graded_above_threshold: gradedAboveThreshold};
}

/**
 * Build cache/agg_unrated_top. Albums sans note, triés par listen_count desc.
 * @param {Array<Object>} libraryAll
 * @return {{items: Array<Object>}}
 */
function buildUnratedTop(libraryAll) {
  const items = libraryAll
      .filter((a) => a.grade === null)
      .slice(0, UNRATED_TOP_N)
      .map((a) => ({
        album_sur: a.album_sur,
        artist: a.artist,
        album: a.album,
        listen_count: a.listen_count,
      }));

  return {items};
}

const PARIS_OFFSET = 1; // UTC+1 CET (approximation)
const CMM_WIN = {
  matin: {start: 7, end: 9},
  soir: {start: 18, end: 20},
};
const CMM_TOP_N = 3;
const TYPICAL_MIN = 5;
// « Ma journée » (v2.28.0) : les moments de la journée, heures de Paris
// incluses. Trajet du matin et retour du soir = fenêtres de Commuting
// (CMM_WIN) ; le reste validé par Axel le 2026-10-11. Source unique : le
// client lit ces moments dans l'agrégat (libellés, heures, couleur).
const DAY_MOMENTS = [
  {key: "nuit", label: "Nuit", from: 0, to: 6, color: "#5a7fdc"},
  {key: "matin", label: "Trajet du matin", from: CMM_WIN.matin.start,
    to: CMM_WIN.matin.end, color: "#e0a23f"},
  {key: "journee", label: "Journée", from: 10, to: 17, color: "#3fc58e"},
  {key: "soir", label: "Retour du soir", from: CMM_WIN.soir.start,
    to: CMM_WIN.soir.end, color: "#ff6b4a"},
  {key: "soiree", label: "Soirée", from: 21, to: 23, color: "#b56ad8"},
];

/**
 * Commuting : histogramme heure/jour + top albums matin/soir,
 * toutes années et par année (byYear).
 * L'heure est approximée en Europe/Paris (UTC+1).
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} libAll
 * @param {Map<string, Object>} artistGenres - classification d'artiste (E8)
 * @return {{band,matin,soir,hour_top,moments,signatures,byYear}}
 */
function buildCommuting(scrobbles, libAll, artistGenres) {
  const albumByKey = new Map(libAll.map((a) => [a.album_sur, a]));

  const topAlbums = (map, n) =>
    Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([albumSur, count]) => {
          const a = albumByKey.get(albumSur) || {};
          return {
            album_sur: albumSur,
            artist: a.artist || "",
            album: a.album || albumSur,
            cover_url: a.cover_url || null,
            count,
          };
        });

  /**
   * @param {Array} subset
   * @return {{band,matin,soir}}
   */
  function computeSlice(subset) {
    const band = Array.from({length: 24}, (_, h) => ({hod: h, v: 0}));
    const matinMap = new Map();
    const soirMap = new Map();
    for (const s of subset) {
      const uts = typeof s.uts === "number" ?
        s.uts : parseInt(s.uts, 10);
      if (!Number.isFinite(uts) || uts <= 0) continue;
      const hod =
        (Math.floor(uts / 3600) % 24 + PARIS_OFFSET + 24) % 24;
      band[hod].v += 1;
      // Une écoute sans album compte dans le volume, pas comme album (IM-4).
      if (!albumByKey.has(s.album_sur)) continue;
      const k = s.album_sur;
      if (hod >= CMM_WIN.matin.start && hod <= CMM_WIN.matin.end) {
        matinMap.set(k, (matinMap.get(k) || 0) + 1);
      }
      if (hod >= CMM_WIN.soir.start && hod <= CMM_WIN.soir.end) {
        soirMap.set(k, (soirMap.get(k) || 0) + 1);
      }
    }
    return {
      band,
      matin: topAlbums(matinMap, CMM_TOP_N),
      soir: topAlbums(soirMap, CMM_TOP_N),
    };
  }

  const allTime = computeSlice(scrobbles);

  // « Ma journée » : l'album qui habite chaque heure et chaque moment — le
  // plus TYPIQUE, pas le plus écouté (sinon l'album le plus écouté de tous
  // habite toutes les heures) : score = n² / total de l'album, soit ses
  // écoutes à ce moment pondérées par la part de ses écoutes qui y tombent.
  // Au moins TYPICAL_MIN écoutes à ce moment, sinon le plus écouté.
  const albumTotal = new Map();
  for (const s of scrobbles) {
    if (albumByKey.has(s.album_sur)) {
      albumTotal.set(s.album_sur, (albumTotal.get(s.album_sur) || 0) + 1);
    }
  }
  const typical = (map) => {
    let best = null;
    let bestScore = -1;
    for (const [k, n] of map) {
      if (n < TYPICAL_MIN) continue;
      const score = n * n / (albumTotal.get(k) || n);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best === null) return topAlbums(map, 1)[0] || null;
    return topAlbums(new Map([[best, map.get(best)]]), 1)[0];
  };
  const byHour = Array.from({length: 24}, () => new Map());
  for (const s of scrobbles) {
    if (!albumByKey.has(s.album_sur)) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    const hod = (Math.floor(uts / 3600) % 24 + PARIS_OFFSET + 24) % 24;
    byHour[hod].set(s.album_sur, (byHour[hod].get(s.album_sur) || 0) + 1);
  }
  allTime.hour_top = byHour.map(typical);
  allTime.moments = DAY_MOMENTS.map((mo) => {
    const merged = new Map();
    let count = 0;
    for (let h = mo.from; h <= mo.to; h++) {
      count += allTime.band[h].v;
      for (const [k, n] of byHour[h]) merged.set(k, (merged.get(k) || 0) + n);
    }
    return {...mo, count, top: typical(merged)};
  });

  // Signatures de créneau (PM-18 refonte, ADR-050) : genres + artistes
  // SUR-REPRÉSENTÉS matin/soir/nuit par rapport à l'ensemble de la journée
  // (lift + plancher de volume relatif). Remplace l'« album du créneau ».
  allTime.signatures = buildSignatures(scrobbles, albumByKey, artistGenres);

  // Par année
  const byYearRaw = new Map();
  for (const s of scrobbles) {
    const uts = typeof s.uts === "number" ?
      s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    const yr = new Date(uts * 1000).getUTCFullYear();
    if (!byYearRaw.has(yr)) byYearRaw.set(yr, []);
    byYearRaw.get(yr).push(s);
  }
  const byYear = {};
  for (const [yr, sub] of byYearRaw) {
    byYear[String(yr)] = computeSlice(sub);
  }

  return {...allTime, byYear};
}

// Créneaux des signatures (heures de Paris) : matin, soir, nuit.
const SIG_WINDOWS = [
  {key: "matin", from: 7, to: 9},
  {key: "soir", from: 18, to: 20},
  {key: "nuit", from: 0, to: 5},
];

/**
 * Genres + artistes SUR-REPRÉSENTÉS par créneau (PM-18, ADR-050) : lift
 * (part du créneau / part globale) + plancher de volume relatif ; sinon les
 * plus écoutés du créneau. Pure, testée.
 * @param {Array<Object>} scrobbles
 * @param {Map<string, Object>} albumByKey
 * @param {Map<string, Object>} artistGenres - classification d'artiste (E8)
 * @return {Object} {matin, soir, nuit} → {genres:[{genre}], artists:[{artist}]}
 */
function buildSignatures(scrobbles, albumByKey, artistGenres) {
  const effGenre = (a) => a.genre ||
    ((artistGenres && artistGenres.get(a.artist)) || {}).genre || "";
  const hodOf = (uts) => (Math.floor(uts / 3600) % 24 + PARIS_OFFSET + 24) % 24;
  const bump = (m, k) => {
    if (k) m.set(k, (m.get(k) || 0) + 1);
  };
  const sum = (it) => {
    let s = 0; for (const v of it) s += v; return s;
  };

  const artAll = new Map();
  const genAll = new Map();
  const win = {};
  for (const w of SIG_WINDOWS) win[w.key] = {art: new Map(), gen: new Map()};
  for (const s of scrobbles) {
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    const a = albumByKey.get(s.album_sur);
    if (!a) continue;
    bump(artAll, a.artist);
    const g = effGenre(a);
    bump(genAll, g);
    const h = hodOf(uts);
    for (const w of SIG_WINDOWS) {
      if (h >= w.from && h <= w.to) {
        bump(win[w.key].art, a.artist);
        bump(win[w.key].gen, g);
      }
    }
  }
  const artAllTot = sum(artAll.values()) || 1;
  const genAllTot = sum(genAll.values()) || 1;

  const distinct = (winMap, allMap, allTot, minWinFrac, minAllFrac, take) => {
    const winTot = sum(winMap.values()) || 1;
    const minWin = Math.max(2, Math.ceil(minWinFrac * winTot));
    const minAll = Math.max(2, Math.ceil(minAllFrac * allTot));
    const over = [];
    for (const [k, n] of winMap) {
      if (n < minWin || (allMap.get(k) || 0) < minAll) continue;
      over.push([k, n, (n / winTot) / ((allMap.get(k) || 0) / allTot)]);
    }
    over.sort((a, b) => b[2] - a[2]);
    const pick = over.length ? over :
      Array.from(winMap.entries()).sort((a, b) => b[1] - a[1])
          .map(([k, n]) => [k, n, 1]);
    return pick.slice(0, take).map(([k]) => k);
  };

  const out = {};
  for (const w of SIG_WINDOWS) {
    out[w.key] = {
      genres: distinct(win[w.key].gen, genAll, genAllTot, 0.01, 0.005, 2)
          .map((genre) => ({genre})),
      artists: distinct(win[w.key].art, artAll, artAllTot, 0.005, 0.0025, 3)
          .map((artist) => ({artist})),
    };
  }
  return out;
}

// « Un seul titre » (v2.34.0) : l'album tenu par un titre — le titre le
// plus écouté pèse au moins 3 fois un titre moyen de l'album ET au moins
// 35 % de ses écoutes, avec assez d'écoutes pour que ce soit un vrai pic.
// Réglé sur la vraie bibliothèque (export du 2026-10-12 : EDEN « drugs »,
// 43 % sur 7 titres). La note (Culte, Adoré écartés) est appliquée côté
// client, sur la curation live.
const ONE_TRACK = {minListens: 20, minTracks: 4, minShare: 0.35, minRatio: 3};

/**
 * Albums tenus par un seul titre — pure, testée.
 * @param {Map<string, Object>} albumStats - sortie de buildAlbumStats
 * @param {Array<Object>} libAll - pour la pochette
 * @return {{items: Array<Object>}} {album_sur, artist, album, cover_url,
 *   track, n, total, distinct, share, ratio}, les plus écoutés d'abord
 */
function buildOneTrack(albumStats, libAll) {
  const cover = new Map((libAll || []).map((a) => [a.album_sur, a.cover_url]));
  const items = [];
  for (const [key, d] of albumStats) {
    const top = d.top_tracks && d.top_tracks[0];
    const album = (d.album || "").trim();
    if (!top || !album || album === "?") continue;
    const total = d.listen_count || 0;
    const distinct = d.unique_tracks_played || 0;
    if (!total || top.count < ONE_TRACK.minListens ||
      distinct < ONE_TRACK.minTracks) continue;
    const share = top.count / total;
    const ratio = share * distinct;
    if (share < ONE_TRACK.minShare || ratio < ONE_TRACK.minRatio) continue;
    items.push({album_sur: key, artist: d.artist || "", album,
      cover_url: cover.get(key) || null, track: top.track, n: top.count,
      total, distinct, share: Math.round(share * 100) / 100,
      ratio: Math.round(ratio * 10) / 10});
  }
  items.sort((a, b) => b.n - a.n);
  return {items};
}

// « Ces jours-ci » (PM-39, ADR-050) : les 30 derniers jours RELATIFS à la
// dernière écoute (pas à l'horloge — un import en retard reste parlant,
// comme selection.js). Dérivé — Segmentation (IM-6) ; snapshot daté de
// l'actualisation ; ne touche jamais la curation.
const DAYS_WINDOW = 30;

/**
 * cache/agg_days — accroche « Ces jours-ci » en tête de « Moi ».
 * @param {Array<Object>} scrobbles
 * @param {Array<Object>} libAll - sortie buildLibrary().all (cover_url inclus)
 * @param {Map<string, Object>} artistGenres - classification d'artiste (E8)
 * @return {Object} {total, daily[], phase[{artist,n,lift}], album, genre, days}
 */
function buildDays(scrobbles, libAll, artistGenres) {
  const num = (v) => {
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const r2 = (x) => Math.round(x * 100) / 100;
  const sum = (it) => {
    let s = 0; for (const v of it) s += v; return s;
  };
  const albumByKey = new Map((libAll || []).map((a) => [a.album_sur, a]));
  // Genre effectif : album sinon artiste (même règle que buildPortrait).
  const effGenre = (a) => a.genre ||
    ((artistGenres && artistGenres.get(a.artist)) || {}).genre || "";

  // Totaux tous temps (base du lift), sur les écoutes rattachées à un album.
  const artAll = new Map();
  const genAll = new Map();
  let ref = 0;
  for (const s of scrobbles) {
    const uts = num(s.uts);
    if (uts > ref) ref = uts;
    const a = albumByKey.get(s.album_sur);
    if (!a) continue;
    if (a.artist) artAll.set(a.artist, (artAll.get(a.artist) || 0) + 1);
    const g = effGenre(a);
    if (g) genAll.set(g, (genAll.get(g) || 0) + 1);
  }
  const empty = {total: 0, daily: [], phase: [], album: null,
    genre: null, days: DAYS_WINDOW};
  if (!ref) return empty;

  const DAY = 86400;
  const since = ref - DAYS_WINDOW * DAY;
  const daily = new Array(DAYS_WINDOW).fill(0);
  const artWin = new Map();
  const genWin = new Map();
  const albWin = new Map();
  let total = 0;
  for (const s of scrobbles) {
    const uts = num(s.uts);
    if (!uts || uts <= since) continue;
    total += 1;
    const idx = DAYS_WINDOW - 1 - Math.floor((ref - uts) / DAY);
    if (idx >= 0 && idx < DAYS_WINDOW) daily[idx] += 1;
    const a = albumByKey.get(s.album_sur);
    if (!a) continue;
    if (a.artist) artWin.set(a.artist, (artWin.get(a.artist) || 0) + 1);
    const g = effGenre(a);
    if (g) genWin.set(g, (genWin.get(g) || 0) + 1);
    albWin.set(s.album_sur, (albWin.get(s.album_sur) || 0) + 1);
  }

  const artWinTot = sum(artWin.values()) || 1;
  const artAllTot = sum(artAll.values()) || 1;
  const liftArt = (name, n) =>
    (n / artWinTot) / (((artAll.get(name) || 0) / artAllTot) || 1);
  // Artistes DU MOMENT : par volume (ce qui tourne), plancher relatif,
  // lift (« ×habitude ») en regard (ADR-050).
  const artFloor = Math.max(8, Math.round(0.03 * artWinTot));
  const phase = Array.from(artWin.entries())
      .filter(([, n]) => n >= artFloor)
      .map(([artist, n]) => ({artist, n, lift: r2(liftArt(artist, n))}))
      .sort((a, b) => b.n - a.n)
      .slice(0, 4);

  // Album qui tourne : le plus écouté de la fenêtre.
  let topAlb = null; let topN = -1;
  for (const [k, n] of albWin) {
    if (n > topN) {
      topN = n; topAlb = k;
    }
  }
  const al = topAlb ? albumByKey.get(topAlb) : null;
  const album = al ? {album_sur: topAlb, artist: al.artist || "",
    album: al.album || "", cover_url: al.cover_url || null, count: topN} : null;

  // Genre dominant : le plus ÉCOUTÉ de la fenêtre (ta phase du moment), pas le
  // plus sur-représenté — sinon un genre rare (Classical…) « gagne » par un
  // lift énorme alors que ce n'est pas ce que tu écoutes (ADR-050). Le lift
  // reste en info.
  const genWinTot = sum(genWin.values()) || 1;
  const genAllTot = sum(genAll.values()) || 1;
  const liftGen = (g, n) =>
    (n / genWinTot) / (((genAll.get(g) || 0) / genAllTot) || 1);
  let topG = null; let topGN = -1;
  for (const [g, n] of genWin) {
    if (n > topGN) {
      topGN = n; topG = g;
    }
  }
  const genre = topG ? {genre: topG, lift: r2(liftGen(topG, topGN))} : null;

  return {total, daily, phase, album, genre, days: DAYS_WINDOW};
}

exports.utsToTimestamp = utsToTimestamp;
exports.PARIS_OFFSET = PARIS_OFFSET;
exports.monthKey = monthKey;
exports.buildAlbumStats = buildAlbumStats;
exports.buildOneTrack = buildOneTrack;
exports.ONE_TRACK = ONE_TRACK;
exports.buildDays = buildDays;
exports.buildEcho = buildEcho;
exports.buildGlobal = buildGlobal;
exports.buildTopArtists = buildTopArtists;
exports.buildTopAlbums = buildTopAlbums;
exports.buildLibrary = buildLibrary;
exports.libraryCard = libraryCard;
exports.buildStats = buildStats;
exports.buildOddities = buildOddities;
exports.buildUnratedTop = buildUnratedTop;
exports.buildCommuting = buildCommuting;
exports.DAY_MOMENTS = DAY_MOMENTS;

exports.buildPortrait = buildPortrait;
exports.withCuration = withCuration;
