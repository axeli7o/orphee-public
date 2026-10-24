"use strict";

/**
 * Album canonique (v2.21.0, PM-29) — fonctions pures, testées.
 * L'écoute brute (fait, IM-1) garde le libellé d'album envoyé par le
 * lecteur ; l'album canonique en est un DÉRIVÉ, appliqué avant tout calcul :
 * 1. titre joué comme album, album vide ou « - Single » : l'album de
 *    référence du titre (Last.fm track.getInfo, résolu à part et mis en
 *    cache) ;
 * 2. éditions d'un même album (Deluxe, Remastered, Anniversary…) : réunies
 *    sous une seule — remix, live, acoustique restent des disques à part.
 * Une Curation « séparer » (album_splits) soustrait un libellé brut aux deux
 * règles. Une **correction appliquée** par Axel (E10, v2.30.0) fixe l'album
 * d'un titre reçu sous un libellé : elle passe avant la résolution Last.fm,
 * puis l'album rejoint son groupe d'éditions comme les autres. Ici, les
 * notes ne migrent pas : celle d'une édition notée la désigne comme
 * canonique ; le report de la note d'un album qui se vide est un geste
 * d'Axel, fait à l'application (Qualité, v2.30.0).
 */

// Mots d'édition : un groupe entre parenthèses qui n'a que ça disparaît.
const EDITION = new Set(["deluxe", "edition", "remaster", "remastered",
  "anniversary", "expanded", "bonus", "track", "tracks", "explicit",
  "version", "special", "super", "xx", "edit", "collector", "collectors",
  "limited", "complete", "reissue", "the", "of", "with", "avec", "video",
  "videos", "and", "et", "de", "du", "la", "le", "l", "d", "release",
  "international", "standard"]);
// Mentions d'édition reconnues seulement quand elles sont marquées comme
// telles — entre parenthèses, ou après « : » / « - » en fin de titre
// (v2.23.4, décision d'Axel) : « Les étoiles vagabondes : expansion »,
// « Orion (Réédition) ». Jamais retirées d'un titre ordinaire (« The Great
// Expansion »).
const MARKED = new Set(["expansion", "reedition", "reed", "augmentee",
  "augmented"]);
// Mots qui font un autre disque : jamais retirés.
const KEEP = new RegExp("remix|reinterpretation|live|acoustic|acoustique|" +
  "instrumental|demo|unplugged|orchestral|symphon|reimagined|rework");
const SUFFIX = /\s+-\s+(single|ep)\s*$/i;

/**
 * Texte normalisé : minuscules, sans accents ni ponctuation.
 * @param {string} t
 * @return {string}
 */
function fold(t) {
  return String(t || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Le groupe (entre parenthèses ou en fin de titre) n'est-il qu'une mention
 * d'édition ?
 * @param {string} inner
 * @return {boolean}
 */
function isEditionNote(inner) {
  const f = fold(inner);
  if (!f || KEEP.test(f)) return false;
  return f.split(" ").every((w) =>
    EDITION.has(w) || MARKED.has(w) || /^\d+(st|nd|rd|th|e|eme)?$/.test(w) ||
    /^(19|20)\d\d$/.test(w));
}

/**
 * Clé d'édition : deux titres de même clé (même artiste) sont le même album.
 * @param {string} title
 * @return {string}
 */
function editionKey(title) {
  let t = String(title || "").replace(SUFFIX, "");
  // Mention d'édition après « : » ou « - » en fin de titre.
  t = t.replace(/\s*(?::|\s[-–]\s)\s*([^:()[\]]+)$/, (m, tail) =>
    (isEditionNote(tail) && fold(t.slice(0, t.length - m.length)) ? "" : m));
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (m, inner) =>
    (isEditionNote(inner) ? "" : ` ${inner} `));
  // Mention d'édition en fin de titre, sans parenthèses
  // (« Absolution XX Anniversary », « Peace Is The Mission: Extended »).
  const words = fold(t).split(" ").filter(Boolean);
  // Un nombre nu n'est pas retiré (« Chambre 140 (Part.2) » ≠ Part.1).
  while (words.length > 1 && (EDITION.has(words[words.length - 1]) ||
    /^(xx|\d+(st|nd|rd|th))$/.test(words[words.length - 1]) ||
    words[words.length - 1] === "extended")) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * Libellé d'album suspect : vide, « - Single/EP », ou égal au titre joué.
 * @param {string} album
 * @param {string} track
 * @return {boolean}
 */
function isSuspect(album, track) {
  if (!String(album || "").trim()) return true;
  if (SUFFIX.test(album)) return true;
  return editionKey(album) === editionKey(track);
}

/**
 * Applique l'album canonique aux écoutes.
 * @param {Array<Object>} scrobbles - {uts, artist, album, track, album_sur,
 *   track_sur}
 * @param {Object} opts
 * @param {Map<string, ?string>} [opts.resolved] - track_sur → album de
 *   référence (Last.fm), null si inconnu
 * @param {Set<string>} [opts.splits] - album_sur bruts à laisser tels quels
 * @param {Map<string, string>} [opts.applied] - corrections appliquées :
 *   correctionKey(artiste, titre, album_sur brut) → titre de l'album
 * @param {Map<string, number>} [opts.graded] - album_sur noté → date de la
 *   note (ms) : l'édition notée le plus récemment devient la canonique du
 *   groupe (sa note est la plus actuelle ; les autres sont abandonnées)
 * @return {{scrobbles: Array<Object>,
 *   variants: Map<string, Array<{album_sur: string, album: string,
 *   count: number}>>}} écoutes réécrites (raw_album_sur gardé si changé) ;
 *   variants : album canonique → libellés bruts réunis (s'il y en a ≥ 1
 *   autre que lui-même)
 */
function canonicalize(scrobbles, opts = {}) {
  const resolved = opts.resolved || new Map();
  const splits = opts.splits || new Set();
  const graded = opts.graded || new Map();
  const applied = opts.applied || new Map();

  // 1. Titre d'album effectif de chaque écoute.
  const titled = scrobbles.map((s) => {
    const raw = s.album_sur || `${s.artist}-${s.album || ""}`;
    // Correction appliquée par Axel : elle prime (IM-9).
    const fixed = applied.size ? applied.get(correctionKey(s.artist,
        s.track, raw)) : undefined;
    // « Remettre à part » (v2.32.0) : la correction vise le libellé reçu
    // lui-même — il reste tel quel, hors des groupes d'édition.
    if (fixed && `${s.artist}-${fixed}` === raw) {
      return {s, raw, title: fixed, keep: true};
    }
    if (fixed) return {s, raw, title: fixed, keep: false};
    if (splits.has(raw)) return {s, raw, title: s.album || "", keep: true};
    let title = s.album || "";
    if (isSuspect(title, s.track)) {
      const r = resolved.get(s.track_sur);
      if (r) title = r;
    }
    return {s, raw, title, keep: false};
  });

  // 2. Groupes d'édition par (artiste, clé) ; candidat = titre effectif.
  const groups = new Map();
  for (const x of titled) {
    if (x.keep || !x.title) continue;
    const gk = `${x.s.artist}\u0000${editionKey(x.title)}`;
    let g = groups.get(gk);
    if (!g) groups.set(gk, g = new Map());
    const cur = g.get(x.title) || {n: 0, own: false};
    cur.n += 1;
    // Libellé venu de la bibliothèque (pas de la résolution) : préféré.
    if (x.title === x.s.album) cur.own = true;
    g.set(x.title, cur);
  }
  const canonOf = new Map();
  for (const [gk, g] of groups) {
    const artist = gk.split("\u0000")[0];
    const ranked = Array.from(g.entries()).sort((a, b) => {
      const ga = graded.has(`${artist}-${a[0]}`) ?
        1 + (graded.get(`${artist}-${a[0]}`) || 0) : 0;
      const gb = graded.has(`${artist}-${b[0]}`) ?
        1 + (graded.get(`${artist}-${b[0]}`) || 0) : 0;
      if (ga !== gb) return gb - ga;
      const sa = SUFFIX.test(a[0]) ? 1 : 0;
      const sb = SUFFIX.test(b[0]) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (a[1].own !== b[1].own) return a[1].own ? -1 : 1;
      return b[1].n - a[1].n || a[0].length - b[0].length;
    });
    // « - Single » retiré, sauf si ce libellé exact porte la note.
    const top = ranked[0][0];
    canonOf.set(gk, graded.has(`${artist}-${top}`) ? top :
      top.replace(SUFFIX, ""));
  }

  // 3. Réécriture.
  const variants = new Map();
  const out = titled.map(({s, raw, title, keep}) => {
    let album = title;
    if (!keep && title) {
      album = canonOf.get(`${s.artist}\u0000${editionKey(title)}`) || title;
    }
    const sur = keep ? raw : `${s.artist}-${album}`;
    if (sur === raw) return s;
    let v = variants.get(sur);
    if (!v) variants.set(sur, v = new Map());
    const cur = v.get(raw) || {album_sur: raw, album: s.album || "", count: 0};
    cur.count += 1;
    v.set(raw, cur);
    return {...s, album, album_sur: sur, raw_album_sur: raw};
  });
  const vOut = new Map();
  for (const [sur, v] of variants) {
    vOut.set(sur, Array.from(v.values()).sort((a, b) => b.count - a.count));
  }
  return {scrobbles: out, variants: vOut};
}

/**
 * Clé d'une correction appliquée : (artiste, titre, album_sur brut).
 * @param {string} artist
 * @param {string} track
 * @param {string} rawAlbumSur
 * @return {string}
 */
function correctionKey(artist, track, rawAlbumSur) {
  return `${artist}\u0000${track}\u0000${rawAlbumSur}`;
}

exports.correctionKey = correctionKey;
exports.fold = fold;
exports.editionKey = editionKey;
exports.isSuspect = isSuspect;
exports.canonicalize = canonicalize;
exports.SUFFIX = SUFFIX;
exports.KEEP = KEEP;
