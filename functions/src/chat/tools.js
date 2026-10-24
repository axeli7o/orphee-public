/* eslint-disable max-len */
"use strict";

// Tools exposés à Orphée (ADR-009). Ils interrogent uniquement le cache
// d'agrégats Firestore (ADR-004 : pas de scrobbles bruts au runtime). Les
// lectures se font via l'admin SDK côté serveur, hors règles Firestore.

const {GRADE_LABELS} = require("../grades");
const {loadCurationMap, overlayList} = require("./curation-overlay");

const LIMIT_DEFAULT = 25;
const LIMIT_MAX = 50;
const TOP_DEFAULT = 25;

// Schémas Anthropic des 3 tools (déclarés via le paramètre `tools` de l'API).
const TOOL_DEFINITIONS = [
  {
    name: "query_albums",
    description:
      "Recherche et filtre des albums dans la bibliothèque (agrégats pré-calculés). " +
      "Retourne une liste d'albums avec leur note, écoutes, genre. Utilise-le pour " +
      "explorer : 'mes Adorés', 'les albums de rap non notés', 'ce que j'ai découvert en 2017', etc. " +
      "Les filtres texte (artist/genre/sousgenre) sont en correspondance partielle insensible à la casse.",
    input_schema: {
      type: "object",
      properties: {
        artist: {type: "string", description: "Filtre par artiste (partiel)."},
        genre: {type: "string", description: "Filtre par genre (partiel)."},
        sousgenre: {type: "string", description: "Filtre par sous-genre (partiel)."},
        grade_min: {type: "integer", description: "Note minimale 1-5."},
        grade_max: {type: "integer", description: "Note maximale 1-5."},
        is_oddity: {type: "boolean", description: "true = uniquement les Oddity actuels."},
        is_rated: {type: "boolean", description: "true = notés, false = non notés."},
        year_from: {type: "integer", description: "Année de première écoute minimale."},
        year_to: {type: "integer", description: "Année de première écoute maximale."},
        sort: {
          type: "string",
          enum: ["listen_count", "first_listen", "grade"],
          description: "Tri (défaut listen_count, desc).",
        },
        limit: {type: "integer", description: `Nombre de résultats (défaut ${LIMIT_DEFAULT}, max ${LIMIT_MAX}).`},
      },
    },
  },
  {
    name: "query_listens",
    description:
      "Agrégats d'écoutes pré-calculés. `aggregate` choisit la vue : " +
      "count (total, ou par artiste/genre/album), monthly_distribution (par album, mois par mois), " +
      "top_tracks (par album), top_artists, top_albums, by_genre. " +
      "Note : les agrégats sont figés au dernier refresh ; les découpes par année ne sont disponibles que " +
      "pour monthly_distribution.",
    input_schema: {
      type: "object",
      properties: {
        aggregate: {
          type: "string",
          enum: ["count", "monthly_distribution", "top_tracks", "top_artists", "top_albums", "by_genre"],
          description: "Type d'agrégat voulu.",
        },
        artist: {type: "string", description: "Pour count : total des écoutes d'un artiste (partiel)."},
        genre: {type: "string", description: "Pour count : total des écoutes d'un genre (partiel)."},
        album_sur: {type: "string", description: "Clé album, requise pour monthly_distribution et top_tracks."},
        year_from: {type: "integer", description: "Filtre année (monthly_distribution)."},
        year_to: {type: "integer", description: "Filtre année (monthly_distribution)."},
      },
      required: ["aggregate"],
    },
  },
  {
    name: "query_album_detail",
    description:
      "Détail complet d'un album : métadonnées, stats (écoutes, tracks joués, distribution mensuelle, " +
      "top tracks), note d'Axel, statut Oddity, et Écho (ce qu'Axel écoutait à la même période). " +
      "Fournis l'`album_sur` exact (identifiant [id:...] du contexte). Si introuvable, retourne found:false " +
      "— utilise alors query_albums pour retrouver la bonne clé.",
    input_schema: {
      type: "object",
      properties: {
        album_sur: {type: "string", description: "Clé exacte de l'album (artist-album)."},
      },
      required: ["album_sur"],
    },
  },
];

/**
 * Normalise une chaîne pour comparaison insensible casse/accents légers.
 * @param {*} s
 * @return {string}
 */
function norm(s) {
  return (s === null || s === undefined ? "" : s).toString().toLowerCase().trim();
}

/**
 * Filtre une liste d'albums selon les params de query_albums. Fonction pure.
 * @param {Array<Object>} items - albums (chunks agg_library_all_*)
 * @param {Object} p - params du tool
 * @param {Set<string>} oddSet - album_sur des Oddity actuels
 * @return {Array<Object>}
 */
function filterAlbums(items, p, oddSet) {
  let out = items;
  if (p.artist) {
    const q = norm(p.artist);
    out = out.filter((a) => norm(a.artist).includes(q));
  }
  if (p.genre) {
    const q = norm(p.genre);
    out = out.filter((a) => norm(a.genre).includes(q));
  }
  if (p.sousgenre) {
    const q = norm(p.sousgenre);
    out = out.filter((a) => norm(a.sousgenre).includes(q));
  }
  if (typeof p.grade_min === "number") {
    out = out.filter((a) => a.grade !== null && a.grade >= p.grade_min);
  }
  if (typeof p.grade_max === "number") {
    out = out.filter((a) => a.grade !== null && a.grade <= p.grade_max);
  }
  if (typeof p.is_rated === "boolean") {
    out = out.filter((a) => (a.grade !== null) === p.is_rated);
  }
  if (typeof p.is_oddity === "boolean") {
    out = out.filter((a) => oddSet.has(a.album_sur) === p.is_oddity);
  }
  if (typeof p.year_from === "number") {
    out = out.filter((a) => a.first_listen_y && a.first_listen_y >= p.year_from);
  }
  if (typeof p.year_to === "number") {
    out = out.filter((a) => a.first_listen_y && a.first_listen_y <= p.year_to);
  }
  return out;
}

/**
 * Trie une liste d'albums. Fonction pure (ne mute pas l'entrée).
 * @param {Array<Object>} items
 * @param {string} sort - listen_count | first_listen | grade
 * @return {Array<Object>}
 */
function sortAlbums(items, sort) {
  const arr = items.slice();
  if (sort === "grade") {
    arr.sort((a, b) =>
      (b.grade || 0) - (a.grade || 0) ||
      (b.listen_count || 0) - (a.listen_count || 0));
  } else if (sort === "first_listen") {
    arr.sort((a, b) => (b.first_listen_y || 0) - (a.first_listen_y || 0));
  } else {
    arr.sort((a, b) => (b.listen_count || 0) - (a.listen_count || 0));
  }
  return arr;
}

/**
 * Réduit un album aux champs utiles pour la réponse du tool.
 * @param {Object} a
 * @return {Object}
 */
function slimAlbum(a) {
  return {
    album_sur: a.album_sur,
    artist: a.artist,
    album: a.album,
    grade: a.grade === undefined ? null : a.grade,
    grade_label: a.grade_label || null,
    commentaire: a.commentaire || null,
    listen_count: a.listen_count || 0,
    genre: a.genre || "",
    sousgenre: a.sousgenre || "",
    first_listen_y: a.first_listen_y || null,
  };
}

/**
 * Borne une limite utilisateur entre 1 et LIMIT_MAX.
 * @param {*} limit
 * @return {number}
 */
function clampLimit(limit) {
  const n = typeof limit === "number" ? limit : LIMIT_DEFAULT;
  if (!Number.isFinite(n) || n <= 0) return LIMIT_DEFAULT;
  return Math.min(n, LIMIT_MAX);
}

/**
 * Filtre une distribution mensuelle ([{month:"YYYY-MM"}]) par plage d'années.
 * Fonction pure.
 * @param {Array<Object>} md
 * @param {number} [from]
 * @param {number} [to]
 * @return {Array<Object>}
 */
function filterMonthsByYear(md, from, to) {
  if (typeof from !== "number" && typeof to !== "number") return md;
  return md.filter((m) => {
    const y = parseInt((m.month || "").slice(0, 4), 10);
    if (!Number.isFinite(y)) return false;
    if (typeof from === "number" && y < from) return false;
    if (typeof to === "number" && y > to) return false;
    return true;
  });
}

/**
 * Convertit un Timestamp Firestore (ou Date) en ISO, ou null.
 * @param {*} ts
 * @return {string|null}
 */
function tsToISO(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * Lit un document du cache et retourne ses données (ou {} si absent).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} docId
 * @return {Promise<Object>}
 */
async function getCache(db, docId) {
  const snap = await db.collection("cache").doc(docId).get();
  return snap.exists ? snap.data() : {};
}

/**
 * Charge toute la bibliothèque depuis les chunks agg_library_all_*.
 * @param {FirebaseFirestore.Firestore} db
 * @return {Promise<Array<Object>>}
 */
async function loadLibrary(db) {
  const meta = await getCache(db, "agg_library_all_meta");
  const n = meta.chunk_count || 0;
  if (!n) return [];
  const snaps = await Promise.all(
      Array.from({length: n}, (_, i) =>
        db.collection("cache").doc(`agg_library_all_${i}`).get()),
  );
  const items = [];
  for (const s of snaps) {
    if (s.exists) {
      const data = s.data();
      if (data.items) items.push(...data.items);
    }
  }
  return items;
}

/**
 * Charge le set d'album_sur des Oddity actuels.
 * @param {FirebaseFirestore.Firestore} db
 * @return {Promise<Set<string>>}
 */
async function loadOddSet(db) {
  const data = await getCache(db, "agg_oddities");
  const items = data.items || [];
  return new Set(items.map((o) => o.album_sur));
}

/**
 * Lit un doc album_stats/{album_sur}, ou null. Ignore les clés avec "/".
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} key
 * @return {Promise<Object|null>}
 */
async function getAlbumStats(db, key) {
  if (!key || key.includes("/")) return null;
  const snap = await db.collection("album_stats").doc(key).get();
  return snap.exists ? snap.data() : null;
}

/**
 * query_albums : filtre/tri sur la bibliothèque complète.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {Object} input
 * @return {Promise<Object>}
 */
async function runQueryAlbums(db, uid, input) {
  const needOdd = typeof input.is_oddity === "boolean";
  const [items, oddSet, curation] = await Promise.all([
    loadLibrary(db),
    needOdd ? loadOddSet(db) : Promise.resolve(new Set()),
    loadCurationMap(db, uid),
  ]);
  // Curation LIVE (ADR-031) avant filtre/tri : la note du cache est une
  // projection figée ; on superpose la source pour que grade_min/max, is_rated,
  // etc. opèrent sur la curation courante.
  overlayList(items, curation);
  const filtered = filterAlbums(items, input, oddSet);
  const sorted = sortAlbums(filtered, input.sort);
  const limit = clampLimit(input.limit);
  return {
    count: filtered.length,
    returned: Math.min(filtered.length, limit),
    items: sorted.slice(0, limit).map(slimAlbum),
  };
}

/**
 * query_listens : mappe vers les agrégats pré-calculés.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid utilisateur (curation live sur top_albums)
 * @param {Object} input
 * @return {Promise<Object>}
 */
async function runQueryListens(db, uid, input) {
  const aggregate = input.aggregate;
  if (aggregate === "top_artists") {
    const data = await getCache(db, "agg_top_artists_alltime");
    return {aggregate, items: (data.items || []).slice(0, TOP_DEFAULT)};
  }
  if (aggregate === "top_albums") {
    // agg_top_albums est une vue Stats refresh-gated ; pour Orphée on superpose
    // la curation live (ADR-031) afin qu'elle ne rapporte jamais une note figée.
    const [data, curation] = await Promise.all([
      getCache(db, "agg_top_albums_alltime"),
      loadCurationMap(db, uid),
    ]);
    return {aggregate,
      items: overlayList((data.items || []).slice(0, TOP_DEFAULT), curation)};
  }
  if (aggregate === "by_genre") {
    const data = await getCache(db, "agg_stats");
    return {aggregate, genres: data.genre_distribution || []};
  }
  if (aggregate === "monthly_distribution") {
    const key = (input.album_sur || "").toString();
    if (!key) return {error: "album_sur requis pour monthly_distribution"};
    const st = await getAlbumStats(db, key);
    if (!st) return {found: false, album_sur: key};
    return {
      aggregate, album_sur: key,
      monthly_distribution: filterMonthsByYear(
          st.monthly_distribution || [], input.year_from, input.year_to),
    };
  }
  if (aggregate === "top_tracks") {
    const key = (input.album_sur || "").toString();
    if (!key) return {error: "album_sur requis pour top_tracks"};
    const st = await getAlbumStats(db, key);
    if (!st) return {found: false, album_sur: key};
    return {aggregate, album_sur: key, top_tracks: st.top_tracks || []};
  }
  // count (défaut)
  if (input.album_sur) {
    const st = await getAlbumStats(db, input.album_sur);
    if (st) return {aggregate: "count", album_sur: input.album_sur, count: st.listen_count || 0};
  }
  if (input.artist || input.genre) {
    const lib = await loadLibrary(db);
    if (input.artist) {
      const q = norm(input.artist);
      const c = lib.filter((a) => norm(a.artist).includes(q))
          .reduce((s, a) => s + (a.listen_count || 0), 0);
      return {aggregate: "count", artist: input.artist, count: c};
    }
    const q = norm(input.genre);
    const c = lib.filter((a) => norm(a.genre).includes(q))
        .reduce((s, a) => s + (a.listen_count || 0), 0);
    return {aggregate: "count", genre: input.genre, count: c};
  }
  const g = await getCache(db, "agg_global");
  return {aggregate: "count", total_listens: g.total_listens || 0};
}

/**
 * query_album_detail : album_stats + curation + écho + flag oddity.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {Object} input
 * @return {Promise<Object>}
 */
async function runQueryAlbumDetail(db, uid, input) {
  const key = (input.album_sur || "").toString();
  if (!key) return {error: "album_sur requis"};

  const gradeReadable = !key.includes("/");
  const [st, oddSet, gradeSnap] = await Promise.all([
    getAlbumStats(db, key),
    loadOddSet(db),
    gradeReadable ?
      db.doc(`users/${uid}/grades/${key}`).get() :
      Promise.resolve(null),
  ]);

  if (!st) return {found: false, album_sur: key};
  const g = gradeSnap && gradeSnap.exists ? gradeSnap.data() : null;

  return {
    found: true,
    album_sur: key,
    artist: st.artist || "",
    album: st.album || "",
    metadata: {
      genre: g && g.genre ? g.genre : "",
      sousgenre: g && g.sousgenre ? g.sousgenre : "",
    },
    stats: {
      listen_count: st.listen_count || 0,
      unique_tracks_played: st.unique_tracks_played || 0,
      first_listen: tsToISO(st.first_listen),
      last_played: tsToISO(st.last_played),
      monthly_distribution: st.monthly_distribution || [],
      top_tracks: st.top_tracks || [],
    },
    grade: g ? {
      grade: g.grade,
      // grade_label n'est plus stocké dans l'overlay (D-2) : dérivé de la note
      // via la source unique (ADR-026/027), comme le slug du cache.
      label: g.grade != null ? (GRADE_LABELS[g.grade] || null) : null,
      commentaire: g.commentaire || null,
    } : null,
    is_oddity: oddSet.has(key),
    echo: st.echo || [],
  };
}

/**
 * Dispatch d'un appel de tool. Retourne un objet JSON-sérialisable.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @param {string} name
 * @param {Object} input
 * @return {Promise<Object>}
 */
async function executeTool(db, uid, name, input) {
  const p = input || {};
  if (name === "query_albums") return runQueryAlbums(db, uid, p);
  if (name === "query_listens") return runQueryListens(db, uid, p);
  if (name === "query_album_detail") return runQueryAlbumDetail(db, uid, p);
  return {error: `tool inconnu: ${name}`};
}

exports.TOOL_DEFINITIONS = TOOL_DEFINITIONS;
exports.executeTool = executeTool;
// Exports pour tests unitaires (fonctions pures)
exports.filterAlbums = filterAlbums;
exports.sortAlbums = sortAlbums;
exports.slimAlbum = slimAlbum;
exports.clampLimit = clampLimit;
exports.filterMonthsByYear = filterMonthsByYear;
