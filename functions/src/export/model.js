"use strict";

/**
 * Export allégé pour analyse (v2.20.0) — fonction pure, testée.
 * Dictionnaire d'albums (chacun une fois) + écoutes [instant, n° d'album].
 * Ni commentaires, ni conversation, ni récits : seulement ce qu'il faut
 * pour analyser années, heures et humeurs. Des morceaux, une ligne par
 * album (v2.33.1, « titre phare ») : son titre le plus écouté, ses
 * écoutes, le nombre de titres différents joués.
 */

const EXPORT_VERSION = 1;
const TOP_MIN = 5;

/**
 * @param {Array<Object>} scrobbles - {uts, artist, album, album_sur}
 * @param {Array<Object>} libAll - albums (buildLibrary) : genre, grade
 * @param {Map<string, {genre: string, sousgenre: string}>} artistGenres
 * @param {string} exportedAt - date ISO
 * @return {{version: number, exported_at: string, columns: Object,
 *   albums: Array<Array>, listens: Array<Array<number>>}}
 */
function buildExport(scrobbles, libAll, artistGenres, exportedAt) {
  const lib = new Map(libAll.map((a) => [a.album_sur, a]));
  const index = new Map();
  const albums = [];
  const listens = [];
  const tracks = []; // par album : titre → écoutes
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    let i = index.get(s.album_sur);
    if (i === undefined) {
      const a = lib.get(s.album_sur) || {};
      const artist = (a.artist || s.artist || "").toString();
      const byArtist = artistGenres.get(artist) || {};
      const genre = a.genre || byArtist.genre || "";
      const sousgenre = a.genre ? (a.sousgenre || "") :
        (byArtist.sousgenre || "");
      const grade = a.grade === undefined || a.grade === null ?
        null : a.grade;
      i = albums.length;
      index.set(s.album_sur, i);
      albums.push([artist, (a.album || s.album || "").toString(),
        genre, sousgenre, grade]);
    }
    listens.push([uts, i]);
    if (!tracks[i]) tracks[i] = new Map();
    if (s.track) tracks[i].set(s.track, (tracks[i].get(s.track) || 0) + 1);
  }
  // Titre le plus écouté de chaque album d'au moins TOP_MIN écoutes.
  const tops = [];
  albums.forEach((_, i) => {
    const m = tracks[i];
    if (!m || !m.size) return;
    let n = 0;
    let best = null;
    for (const [t, c] of m) {
      n += c;
      if (!best || c > best[1]) best = [t, c];
    }
    if (n >= TOP_MIN) tops.push([i, best[0], best[1], m.size]);
  });
  listens.sort((x, y) => x[0] - y[0]);
  return {
    version: EXPORT_VERSION,
    exported_at: exportedAt,
    columns: {
      albums: ["artist", "album", "genre", "sousgenre", "grade"],
      listens: ["uts", "album"],
      tops: ["album", "track", "listens", "distinct_tracks"],
    },
    albums,
    listens,
    tops,
  };
}

const DIAG_MAX_LISTENS = 4;

/**
 * Diagnostic du rattachement (v2.21.2) : pour chaque petit album canonique
 * (≤ 4 écoutes) et chaque libellé suspect, ses morceaux distincts, avec le
 * libellé brut, si le libellé est jugé suspect, la réponse de Last.fm en
 * cache (titre d'album, null = inconnu, "" = jamais cherché) et, depuis
 * v2.22.0, la proposition MusicBrainz (mode à blanc, ADR-046). Pure, testée.
 * @param {Array<Object>} scrobbles - écoutes canoniques (raw_album_sur
 *   éventuel)
 * @param {Object<string, Array>} trackCache - track_sur → [album|null, uts]
 * @param {function(string, string): boolean} isSuspect
 * @param {{cache: Object<string, Array>, key: function(string, string):
 *   string, propose: function(?Array, string, Object): Object,
 *   library: Map<string, Set<string>>, fold: function(string): string}}
 *   [mb] - library : albums réels par artiste (libraryIndex)
 * @return {{columns: Array<string>, rows: Array<Array>}}
 */
function buildDiag(scrobbles, trackCache, isSuspect, mb) {
  const count = new Map();
  for (const s of scrobbles) {
    if (s.album_sur) count.set(s.album_sur, (count.get(s.album_sur) || 0) + 1);
  }
  const seen = new Set();
  const rows = [];
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    const raw = s.raw_album_sur ?
      s.raw_album_sur.slice(String(s.artist).length + 1) : s.album;
    const suspect = isSuspect(raw, s.track);
    if (count.get(s.album_sur) > DIAG_MAX_LISTENS && !suspect) continue;
    const id = `${s.album_sur}\u0000${s.track_sur}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = s.track_sur ? trackCache[s.track_sur] : undefined;
    const row = [s.artist || "", s.album || "", raw || "", s.track || "",
      suspect ? 1 : 0, hit === undefined ? "" : hit[0]];
    if (mb) {
      const m = mb.cache[mb.key(s.artist, s.track)];
      if (m === undefined) {
        row.push("", "", "", "", 0, "");
      } else {
        const p = mb.propose(m[0], s.album || "", {played: s.track,
          library: mb.library.get(mb.fold(s.artist)), single: suspect,
          label: raw});
        row.push(p.kind, p.album, p.year,
            p.pos ? `${p.pos}/${p.total || "?"}` : "", p.exact, p.reason);
      }
    }
    rows.push(row);
  }
  const columns = ["artist", "album", "raw_album", "track", "suspect",
    "lastfm"];
  if (mb) {
    columns.push("mb_kind", "mb_album", "mb_year", "mb_pos", "mb_exact",
        "mb_reason");
  }
  return {columns, rows};
}

/**
 * Revue Qualité pour l'analyse (PM-30, PM-32) : les décisions d'Axel et
 * les titres qu'il a passés (« je ne sais pas »), pour les regarder
 * ensemble. Horodatages en ISO ; triés par écoutes puis artiste.
 * @param {Array<Object>} arbs - docs album_arbitrations ({id, ...})
 * @param {Array<Object>} later - docs quality_later ({id, ...})
 * @param {Array<Object>} [applied] - docs applied_corrections ({id, ...})
 * @return {Object} {decisions[], later[], applied[]}
 */
function buildQualityReview(arbs, later, applied) {
  const iso = (t) => (t && typeof t.toDate === "function" ?
    t.toDate().toISOString() : (typeof t === "string" ? t : ""));
  const decided = new Set(arbs.map((a) => a.id));
  // Ce qui était proposé au moment de trancher (v2.35.0) : de quoi
  // mesurer l'accord avec le moteur, catégorie par catégorie.
  const decisions = arbs.map((a) => ({
    artist: a.artist || "", track: a.track || "",
    raw_album_sur: a.raw_album_sur || "", decision: a.decision || "",
    to_album: a.to_album || "", at: iso(a.at),
    proposed_album: a.proposed_album || "",
    proposed_kind: a.proposed_kind || "",
    proposed_reason: a.proposed_reason || "", reviewed: a.reviewed ? 1 : 0,
  })).sort((x, y) => x.artist.localeCompare(y.artist));
  const passed = later.filter((l) => !decided.has(l.id)).map((l) => ({
    artist: l.artist || "", track: l.track || "",
    raw_album: l.raw_album || "", proposed_album: l.proposed_album || "",
    reason: l.reason || "", listens: l.listens || 0, at: iso(l.at),
  })).sort((x, y) => (y.listens - x.listens) ||
      x.artist.localeCompare(y.artist));
  // Corrections appliquées (sûres ou décidées), lot par lot.
  const corrections = (applied || []).map((c) => ({
    artist: c.artist || "", track: c.track || "",
    raw_album_sur: c.raw_album_sur || "", to_album: c.to_album || "",
    source: c.source || "", batch: c.batch || "", at: iso(c.at),
  })).sort((x, y) => x.artist.localeCompare(y.artist));
  return {decisions, later: passed, applied: corrections};
}

exports.buildQualityReview = buildQualityReview;
exports.buildDiag = buildDiag;
exports.EXPORT_VERSION = EXPORT_VERSION;
exports.buildExport = buildExport;
