"use strict";

/**
 * MusicBrainz, référence du rattachement (v2.22.0, ADR-046, PM-29/PM-33).
 * Pour un titre (artiste + titre), on cherche ses enregistrements et les
 * sorties qui les contiennent ; la règle est « le premier album studio de
 * l'artiste qui contient le titre ». Une proposition n'est « sûre » que si
 * l'album est déjà dans la bibliothèque d'Axel (v2.22.1, décision du PM).
 * Fonctions pures testées, plus la recherche réseau (1 requête par seconde,
 * exigence de MusicBrainz). Seuls l'artiste et le titre sont envoyés ;
 * l'app s'identifie par son URL.
 */

const {fold, editionKey, KEEP} = require("../albums/canon");

const API = "https://musicbrainz.org/ws/2/recording";
const USER_AGENT = "Orphee/2.22 ( https://orphee-e7377.web.app )";
const TIMEOUT_MS = 10000;
const STEP_MS = 1100;
// Types secondaires qui n'empêchent pas d'être un « album studio ».
const ALLOWED_SECONDARY = new Set(["Mixtape/Street"]);
// Un groupe entre parenthèses qui n'est qu'un crédit d'invité.
const FEAT_GROUP =
    /\s*[([]\s*(feat\.?|ft\.?|featuring|avec|with)\s[^)\]]*[)\]]/gi;
const FEAT_TAIL = /\s+(feat\.?|ft\.?|featuring)\s.*$/i;
// Séparateurs d'artistes dans un nom composé (« Doja Cat et The Weeknd »).
const ARTIST_SEP = /\s+(?:et|&|feat\.?|ft\.?|featuring|x|vs\.?)\s+|,\s+/i;

/**
 * Titre sans crédit d'invité (« I Feel It Coming (avec Daft Punk) » →
 * « I Feel It Coming ») : ce n'est pas une autre version.
 * @param {string} title
 * @return {string}
 */
function stripFeat(title) {
  return String(title || "").replace(FEAT_GROUP, "").replace(FEAT_TAIL, "")
      .trim();
}

const NUM = {one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", un: "1", deux: "2",
  trois: "3", quatre: "4", cinq: "5", i: "1", ii: "2", iii: "3", iv: "4",
  v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10"};
const PART = {pt: "part", part: "part", partie: "part", vol: "vol",
  volume: "vol", chapter: "chapter", chapitre: "chapter", ch: "chapter"};

/**
 * Clé d'album pour comparer deux titres du même album écrits autrement
 * (pure, testée) : clé d'édition, accolades comme des parenthèses, et
 * « Pt. 2 » = « {Part Two} » = « Part II », « Vol. 1 » = « Volume One ».
 * @param {string} title
 * @return {string}
 */
function albumKey(title) {
  const t = String(title || "").replace(/\{/g, "(").replace(/\}/g, ")");
  const w = editionKey(t).split(" ");
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const p = PART[w[i]];
    if (p && i + 1 < w.length && (NUM[w[i + 1]] || /^\d+$/.test(w[i + 1]))) {
      out.push(p, NUM[w[i + 1]] || w[i + 1]);
      i += 1;
    } else {
      out.push(w[i]);
    }
  }
  return out.join(" ");
}

/**
 * Mention de version du titre joué (entre parenthèses, crochets ou après
 * « - ») : remix, live, acoustique… — jamais le titre lui-même (« Live
 * Forever » n'est pas un live).
 * @param {string} title
 * @return {boolean}
 */
function isOtherCut(title) {
  const t = String(title || "");
  const parts = [];
  t.replace(/[([]([^)\]]*)[)\]]/g, (m, inner) => parts.push(inner));
  const dash = t.match(/\s+-\s+(.*)$/);
  if (dash) parts.push(dash[1]);
  return parts.some((p) => KEEP.test(fold(p)) || /\bstripped\b/.test(fold(p)));
}

// Libellé d'album live ou acoustique (« Live at River Plate », « With
// Orchestra Live », « MTV Unplugged », « Acoustic Sessions »…) — jamais un
// titre qui commence par le mot (« Live Through This », « Live Forever »).
const LIVE_LABEL = [
  /^live(?:$|\s*[([:\-–]|\s+(?:at|in|from|on|au|a)\b)/,
  // « … Live », mais pas « Dying to Live », « I Can Live in Silence ».
  /(?<!\b(?:to|can|i|we|you) )\blive$/,
  /(?<!\b(?:to|can|i|we|you) )\blive\s+(?:at|in|from|on|au|a)\b/,
  /[([][^)\]]*\blive\b[^)\]]*[)\]]/,
  /\b(?:unplugged|en concert|in concert)\b/,
  // Acoustique, sauf en tête (« Acoustic Soul » est un album studio).
  /\S.*\bacousti(?:c|que)\b/,
  /\b(?:live|bbc|peel|studio|juneteenth) sessions?\b/,
];

/**
 * Album live ou acoustique, d'après son libellé (pure, testée) : une
 * version à part, qui reste où elle est (PM-29, confirmé le 2026-10-13).
 * @param {string} label
 * @return {boolean}
 */
function isLiveLabel(label) {
  // Ponctuation gardée : « Live (Collector's Edition) ».
  const f = String(label || "").toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  return !!f && LIVE_LABEL.some((re) => re.test(f));
}

// Au-delà de la piste BONUS_POS d'une sortie de plus de BOX_TRACKS titres,
// le titre est sur un coffret ou une réédition qui porte le nom de l'album
// (« Imagine », piste 32 sur 59 ; « Inferno », 30 sur 39), pas sur l'album
// d'origine — une Deluxe de 22 titres reste un album (2026-10-13, relevé
// sur les décisions d'Axel).
const BONUS_POS = 20;
const BOX_TRACKS = 30;
const inBox = (h) => h.pos > BONUS_POS && h.total > BOX_TRACKS;

/**
 * Doute sur un titre déjà rangé ailleurs que son libellé reçu (pure,
 * testée) : une version live rangée sur un album studio, ou un album
 * d'arrivée qui ne le contient qu'au-delà de sa longueur d'origine. Sert à
 * la pile « À revoir » de Qualité — le rangement ne change pas sans Axel
 * (IM-9).
 * @param {string} rawLabel - libellé reçu
 * @param {string} album - album où le titre est rangé
 * @param {?Object} p - propose() pour cet album, s'il est connu
 * @return {string} raison, ou "" sans doute
 */
function doubtOf(rawLabel, album, p) {
  if (fold(rawLabel) === fold(album)) return "";
  if (isLiveLabel(rawLabel) && !isLiveLabel(album)) {
    return "Version live rangée sur un album studio";
  }
  if (p && p.kind === "ok" && inBox(p)) {
    return `Seulement piste ${p.pos}${p.total ? " sur " + p.total : ""} : ` +
      "un coffret ou une réédition, pas l’album d’origine";
  }
  return "";
}

/**
 * Titre de base : sans groupes entre parenthèses/crochets, sans « - … »
 * final ni « feat. » (pour chercher « Muscle Museum (US mix) » comme
 * « Muscle Museum »).
 * @param {string} title
 * @return {string}
 */
function baseTitle(title) {
  return String(title || "")
      .replace(/\s*[([][^)\]]*[)\]]/g, " ")
      .replace(/\s+-\s+.*$/, "")
      .replace(FEAT_TAIL, "")
      .replace(/\s+/g, " ").trim();
}

/**
 * Artiste principal d'un nom composé (« PLK & Niska » → « PLK »).
 * @param {string} artist
 * @return {string}
 */
function mainArtist(artist) {
  const a = String(artist || "").trim();
  return a.split(ARTIST_SEP)[0].trim() || a;
}

/**
 * Valeur entre guillemets pour une requête Lucene.
 * @param {string} v
 * @return {string}
 */
function quote(v) {
  return `"${String(v).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/**
 * @param {string} artist
 * @param {string} title
 * @param {boolean} albumsOnly - seulement les enregistrements parus sur un
 *   album (évite que des dizaines de lives noient la version studio)
 * @return {string}
 */
function buildQuery(artist, title, albumsOnly) {
  const main = mainArtist(artist);
  const who = main === String(artist || "").trim() ?
    `artist:${quote(main)}` :
    `(artist:${quote(artist)} OR artist:${quote(main)})`;
  return `recording:${quote(baseTitle(title) || title)} AND ${who}` +
    (albumsOnly ? " AND primarytype:album AND status:official" : "");
}

/**
 * L'artiste du crédit est-il le nôtre (ou notre artiste principal) ?
 * @param {Array<Object>} credit - artist-credit MusicBrainz
 * @param {string} artist
 * @return {boolean}
 */
function creditMatches(credit, artist) {
  if (!Array.isArray(credit) || !credit.length) return false;
  const wants = new Set([fold(artist), fold(mainArtist(artist))]);
  const full = fold(credit.map((c) => (c.name || "") +
    (c.joinphrase || "")).join(""));
  return wants.has(full) || credit.some((c) =>
    wants.has(fold(c.name)) || wants.has(fold(c.artist && c.artist.name)));
}

/**
 * Réponse de recherche → sorties compactes qui contiennent le titre (pure).
 * Une entrée par sortie : groupe, titre, type, types secondaires, date,
 * disque et place du titre, et si l'enregistrement porte le titre joué
 * (crédits d'invités ignorés).
 * @param {Object} json - réponse /ws/2/recording?query=…
 * @param {string} artist
 * @param {string} title - titre joué
 * @return {Array<Object>}
 */
function parseSearch(json, artist, title) {
  const recs = (json && Array.isArray(json.recordings)) ? json.recordings : [];
  const wantBase = fold(baseTitle(title) || title);
  const wantFull = fold(stripFeat(title));
  const out = [];
  const seen = new Set();
  for (const r of recs) {
    if (fold(baseTitle(r.title) || r.title) !== wantBase) continue;
    if (!creditMatches(r["artist-credit"], artist)) continue;
    const exact = fold(stripFeat(r.title)) === wantFull ? 1 : 0;
    for (const rel of r.releases || []) {
      const rg = rel["release-group"] || {};
      if (!rg.id || seen.has(`${rel.id}|${exact}`)) continue;
      if (rel.status && rel.status !== "Official") continue;
      // Une sortie d'un autre artiste (« Various Artists ») n'est pas à lui.
      if (rel["artist-credit"] &&
        !creditMatches(rel["artist-credit"], artist)) continue;
      seen.add(`${rel.id}|${exact}`);
      const m = (rel.media || [])[0] || {};
      const t = (m.track || [])[0];
      const pos = t && Number.isFinite(m["track-offset"]) ?
        m["track-offset"] + 1 : (t && parseInt(t.number, 10)) || 0;
      out.push({
        rg: rg.id,
        title: rel.title || rg.title || "",
        type: rg["primary-type"] || "",
        sec: rg["secondary-types"] || [],
        date: rel.date || "",
        disc: m.position || 1,
        pos,
        total: m["track-count"] || 0,
        release: rel.id,
        exact,
      });
    }
  }
  return out;
}

const isStudio = (h) => h.type === "Album" &&
  h.sec.every((x) => ALLOWED_SECONDARY.has(x));
const older = (a, b) => (a.date || "9999") < (b.date || "9999");

/**
 * Réduit les sorties à ce que la règle utilise (pure, testée) : pour chaque
 * album studio, sa sortie la plus ancienne (par version exacte ou non) ;
 * pour le reste, un exemplaire par type. Garde le cache léger (un titre
 * peut figurer sur des dizaines de compilations).
 * @param {Array<Object>} hits
 * @return {Array<Object>}
 */
function compact(hits) {
  // Titres de toutes les sorties d'un même album (« High Visceral, Pt. 2 »
  // sur une plateforme, « {Part Two} » sur une autre) : gardés comme clés.
  const alts = new Map();
  for (const h of hits) {
    if (!isStudio(h)) continue;
    if (!alts.has(h.rg)) alts.set(h.rg, new Set());
    alts.get(h.rg).add(albumKey(h.title));
  }
  const keep = new Map();
  for (const h of hits) {
    const k = isStudio(h) ? `${h.rg}|${h.exact}` :
      `${h.type}|${h.sec.join(",")}`;
    const cur = keep.get(k);
    if (!cur || older(h, cur)) keep.set(k, h);
  }
  return Array.from(keep.values()).map((h) => (isStudio(h) ?
    {...h, alt: Array.from(alts.get(h.rg))} :
    {rg: h.rg, title: "", type: h.type, sec: h.sec, date: "", disc: 1,
      pos: 0, total: 0, release: "", exact: h.exact}));
}

/**
 * Albums « réels » de la bibliothèque, par artiste (pure, testée) : albums
 * canoniques de plus de `minListens` écoutes, en clés d'édition.
 * @param {Array<Object>} scrobbles - écoutes canoniques
 * @param {number} minListens
 * @return {Map<string, Set<string>>} fold(artiste) → clés d'édition
 */
function libraryIndex(scrobbles, minListens) {
  const n = new Map();
  for (const s of scrobbles) {
    if (!s.album_sur || !s.album) continue;
    const k = `${fold(s.artist)}\u0000${albumKey(s.album)}`;
    n.set(k, (n.get(k) || 0) + 1);
  }
  const out = new Map();
  for (const [k, c] of n) {
    if (c <= minListens) continue;
    const [a, e] = k.split("\u0000");
    let set = out.get(a);
    if (!set) out.set(a, set = new Set());
    set.add(e);
  }
  return out;
}

/**
 * Proposition pour un titre (pure, testée) — règle ADR-046 : le premier
 * album studio de l'artiste qui contient le titre, de préférence un album
 * de la bibliothèque. Sûre seulement si : même version, album de la
 * bibliothèque, disque principal, pas d'autre album la même année. Un titre
 * reçu comme single ou sans album (ctx.single) est sûr même si l'album
 * n'est pas dans la bibliothèque (élargi le 2026-10-11, ADR-046).
 * @param {?Array<Object>} hits - compact(parseSearch), null si jamais trouvé
 * @param {string} current - titre de l'album où le titre est rangé
 * @param {{played: string, library: ?Set<string>, single: ?boolean,
 *   label: ?string}} ctx - titre joué ; clés d'édition des albums de
 *   l'artiste dans la bibliothèque ; libellé reçu suspect (single, vide,
 *   nom du titre) ; libellé reçu (un album live reste à part)
 * @return {{kind: string, album: string, year: string, pos: number,
 *   total: number, exact: number, release: string, reason: string}}
 *   kind : ok (déjà au bon endroit), sure, check, keep (reste tel quel),
 *   unknown (MusicBrainz ne connaît pas le titre)
 */
function propose(hits, current, ctx = {}) {
  const none = {album: "", year: "", pos: 0, total: 0, exact: 0,
    release: ""};
  // Remix, live, acoustique… : un autre disque, qui reste à part (ADR-045).
  if (isOtherCut(ctx.played)) {
    return {...none, kind: "keep", reason: "Version remix ou live : à part"};
  }
  // Reçu sur un album live : une version à part, elle aussi (v2.35.0).
  if (isLiveLabel(ctx.label)) {
    return {...none, kind: "keep", reason: "Album live : à part"};
  }
  if (!hits || !hits.length) {
    return {...none, kind: "unknown", reason: "Inconnu de MusicBrainz"};
  }
  const studio = hits.filter(isStudio);
  if (!studio.length) {
    const sec = new Set(hits.flatMap((h) => h.sec));
    const reason = sec.has("Soundtrack") ? "Bande originale" :
      hits.some((h) => h.type === "Single" || h.type === "EP") ?
        "Seulement sur un single ou un EP" : "Sur aucun album studio";
    return {...none, kind: "keep", reason};
  }
  const lib = ctx.library || new Set();
  const keys = (h) => [albumKey(h.title)].concat(h.alt || []);
  const inLib = (h) => keys(h).some((k) => lib.has(k));
  const cur = albumKey(current);
  const same = studio.find((h) => keys(h).includes(cur));
  if (same) {
    const h = same;
    return {...none, album: h.title, year: (h.date || "").slice(0, 4),
      pos: h.pos, total: h.total, exact: h.exact, release: h.release,
      kind: "ok", reason: "Déjà sur le bon album"};
  }
  // Le plus ancien d'abord ; à date égale, la version exacte, puis la
  // sortie qui dit où est le titre. Un album de la bibliothèque passe
  // devant.
  const pool = studio.some(inLib) ? studio.filter(inLib) : studio;
  const sorted = pool.slice().sort((a, b) =>
    (a.date || "9999").localeCompare(b.date || "9999") ||
    b.exact - a.exact || (b.pos ? 1 : 0) - (a.pos ? 1 : 0));
  const best = sorted[0];
  const year = (best.date || "").slice(0, 4);
  const found = {album: best.title, year, pos: best.pos, total: best.total,
    exact: best.exact, release: best.release};
  const sameYear = new Set(pool.filter((h) =>
    year && (h.date || "").slice(0, 4) === year).map((h) => h.rg));
  if (!pool.some((h) => h.rg === best.rg && h.exact)) {
    return {...found, kind: "check", reason: "Autre version sur l’album"};
  }
  if (sameYear.size > 1) {
    return {...found, kind: "check",
      reason: "Plusieurs albums possibles la même année"};
  }
  if ((best.disc || 1) > 1 || inBox(best)) {
    return {...found, kind: "check",
      reason: "Sur un disque bonus d’une réédition"};
  }
  if (!inLib(best) && !ctx.single) {
    return {...found, kind: "check",
      reason: "Album absent de ta bibliothèque"};
  }
  const where = best.pos ? `, piste ${best.pos}` : "";
  return {...found, kind: "sure",
    reason: `Sur ${best.title}${year ? ` (${year})` : ""}${where}`};
}

/**
 * Titres à interroger (pure, testée) : ceux des petits albums canoniques
 * (≤ maxListens écoutes) et ceux au libellé suspect, pas encore en cache
 * (ou « inconnus » depuis plus de retryS), les plus écoutés d'abord.
 * @param {Array<Object>} scrobbles - écoutes canoniques
 * @param {Object<string, Array>} cache - clé → [hits|null, uts]
 * @param {number} now - secondes
 * @param {{maxListens: number, retryS: number,
 *   isSuspect: function(string, string): boolean}} opts
 * @return {{todo: Array<{key: string, artist: string, track: string}>,
 *   total: number}} total : titres visés, en cache ou non
 */
function mbTargets(scrobbles, cache, now, opts) {
  const perAlbum = new Map();
  for (const s of scrobbles) {
    if (s.album_sur) {
      perAlbum.set(s.album_sur, (perAlbum.get(s.album_sur) || 0) + 1);
    }
  }
  const counts = new Map();
  for (const s of scrobbles) {
    if (!s.track || !s.artist) continue;
    const raw = s.raw_album_sur ?
      s.raw_album_sur.slice(String(s.artist).length + 1) : s.album;
    const small = (perAlbum.get(s.album_sur) || 0) <= opts.maxListens;
    if (!small && !opts.isSuspect(raw, s.track)) continue;
    const key = mbKey(s.artist, s.track);
    const c = counts.get(key);
    if (c) {
      c.n += 1;
    } else {
      counts.set(key, {key, artist: s.artist, track: s.track, n: 1});
    }
  }
  const todo = [];
  for (const c of counts.values()) {
    const hit = cache[c.key];
    if (hit && (hit[0] || now - hit[1] < opts.retryS)) continue;
    todo.push(c);
  }
  todo.sort((a, b) => b.n - a.n);
  return {todo: todo.map(({key, artist, track}) => ({key, artist, track})),
    total: counts.size};
}

/**
 * @param {string} artist
 * @param {string} track
 * @return {string}
 */
function mbKey(artist, track) {
  return `${fold(artist)}|${fold(track)}`;
}

/**
 * Une requête de recherche.
 * @param {string} query
 * @return {Promise<?Object>} JSON, null si le réseau a échoué
 */
async function fetchSearch(query) {
  const url = new URL(API);
  url.search = new URLSearchParams({query, fmt: "json", limit: "50"})
      .toString();
  try {
    const res = await fetch(url.toString(), {
      headers: {"User-Agent": USER_AGENT, "Accept": "application/json"},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    return null;
  }
}

/**
 * Cherche un titre sur MusicBrainz : d'abord parmi les enregistrements
 * parus sur un album, puis, faute de résultat, partout (singles, BO…).
 * @param {string} artist
 * @param {string} track
 * @return {Promise<?Array<Object>|undefined>} sorties trouvées, null si
 *   aucune, undefined si le réseau a échoué (rien n'est mis en cache)
 */
async function searchRecording(artist, track) {
  const first = await fetchSearch(buildQuery(artist, track, true));
  if (!first) return undefined;
  let hits = parseSearch(first, artist, track);
  if (!hits.some(isStudio)) {
    await new Promise((r) => setTimeout(r, STEP_MS));
    const all = await fetchSearch(buildQuery(artist, track, false));
    if (!all) return undefined;
    hits = hits.concat(parseSearch(all, artist, track));
  }
  hits = compact(hits);
  return hits.length ? hits : null;
}

exports.albumKey = albumKey;
exports.stripFeat = stripFeat;
exports.isOtherCut = isOtherCut;
exports.isLiveLabel = isLiveLabel;
exports.doubtOf = doubtOf;
exports.BONUS_POS = BONUS_POS;
exports.BOX_TRACKS = BOX_TRACKS;
exports.baseTitle = baseTitle;
exports.mainArtist = mainArtist;
exports.buildQuery = buildQuery;
exports.parseSearch = parseSearch;
exports.compact = compact;
exports.libraryIndex = libraryIndex;
exports.propose = propose;
exports.mbTargets = mbTargets;
exports.mbKey = mbKey;
exports.searchRecording = searchRecording;
