"use strict";

/**
 * Qualité des données (v2.23.0, PM-31/PM-32, ADR-046) — fonction pure,
 * testée. Prépare pour l'onglet Qualité les propositions de rattachement
 * (une par titre reçu sous un libellé) et de quoi calculer le taux de santé.
 * Les arbitrages d'Axel (curation) ne sont PAS lus ici : l'écran les
 * superpose en direct, à leur source (IM-5, IM-9).
 */

const crypto = require("node:crypto");
const {fold, isSuspect} = require("../albums/canon");
const {albumKey, doubtOf, isLiveLabel} = require("./mb");

/**
 * Identité d'une proposition et de son arbitrage : (artiste, titre,
 * libellé reçu). Courte et sûre comme id de document Firestore.
 * @param {string} artist
 * @param {string} track
 * @param {string} rawAlbumSur
 * @return {string}
 */
function itemId(artist, track, rawAlbumSur) {
  return crypto.createHash("sha1")
      .update(`${artist}\u0000${track}\u0000${rawAlbumSur}`)
      .digest("hex").slice(0, 20);
}

/**
 * @param {Array<Object>} scrobbles - écoutes canoniques
 * @param {Object<string, Array>} mbCache - clé → [sorties|null, uts]
 * @param {{key: function(string, string): string,
 *   propose: function(?Array, string, Object): Object,
 *   library: Map<string, Set<string>>,
 *   targets: function(Array, Object): Set<string>}} deps
 *   targets : clés MusicBrainz visées (mbTargets, cache vide)
 * @return {{summary: Object, items: Array<Object>}}
 *   items : {id, a, t, f (album actuel), r (libellé reçu), s (album_sur
 *   brut), n (écoutes), k (sure|check|keep|unknown), to, y, p, c, x, w
 *   (raison), rel (sortie MusicBrainz), ts (album_sur de l'album proposé
 *   s'il est dans la bibliothèque), rv (doute sur un titre déjà rangé
 *   ailleurs que son libellé : pile « À revoir », v2.35.0)} — les titres
 *   « ok » ne sont que comptés, sauf s'ils portent un doute ; k =
 *   « linked » : rattaché d'office (libellé reçu ≠ album), hors santé.
 */
function buildQuality(scrobbles, mbCache, deps) {
  const targets = deps.targets(scrobbles, {});
  // Album de la bibliothèque correspondant à une proposition (le plus
  // écouté de ses libellés) : pochette et fiche dans l'écran.
  const surCount = new Map();
  for (const s of scrobbles) {
    if (!s.album_sur || !s.album) continue;
    const k = `${fold(s.artist)}\u0000${albumKey(s.album)}`;
    let m = surCount.get(k);
    if (!m) surCount.set(k, m = new Map());
    m.set(s.album_sur, (m.get(s.album_sur) || 0) + 1);
  }
  const surOf = (artist, title) => {
    const m = surCount.get(`${fold(artist)}\u0000${albumKey(title)}`);
    if (!m) return "";
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0][0];
  };
  const groups = new Map();
  let total = 0;
  let base = 0;
  let unverified = 0;
  let ok = 0;
  for (const s of scrobbles) {
    if (!s.album_sur) continue;
    total += 1;
    const key = s.track && s.artist ? deps.key(s.artist, s.track) : "";
    if (!key || !targets.has(key)) {
      base += 1;
      continue;
    }
    const m = mbCache[key];
    if (m === undefined) {
      unverified += 1;
      continue;
    }
    const raw = s.raw_album_sur || s.album_sur;
    const id = itemId(s.artist, s.track, raw);
    let g = groups.get(id);
    if (!g) {
      const rawLabel = raw.slice(String(s.artist).length + 1);
      const p = deps.propose(m[0], s.album || "", {played: s.track,
        library: deps.library.get(fold(s.artist)),
        single: isSuspect(rawLabel, s.track), label: rawLabel});
      g = {id, a: s.artist, t: s.track, f: s.album || "",
        r: raw.slice(String(s.artist).length + 1), s: raw, n: 0,
        k: p.kind, to: p.album, y: p.year, p: p.pos, c: p.total,
        x: p.exact, w: p.reason, rel: p.release,
        ts: p.album ? surOf(s.artist, p.album) : ""};
      // Album de la bibliothèque : affiché sous le libellé qu'Axel connaît.
      if (g.ts) g.to = g.ts.slice(String(s.artist).length + 1);
      const rv = raw !== s.album_sur ? doubtOf(rawLabel, s.album || "", p) : "";
      if (rv) g.rv = rv;
      groups.set(id, g);
    }
    g.n += 1;
  }
  // Rattachés d'office (v2.32.0, PM-29/PM-32) : titres que le rattachement
  // automatique a rangés sous un autre album que leur libellé reçu (single,
  // titre seul, édition). Silencieux — ni « à trancher » ni compté dans la
  // santé (ils sont déjà dans base_listens) — mais revus depuis la fiche
  // album : « Garder ici », ou « Remettre à part » sur leur libellé.
  const linked = new Map();
  for (const s of scrobbles) {
    const raw = s.raw_album_sur;
    if (!raw || raw === s.album_sur || !s.track || !s.artist) continue;
    const id = itemId(s.artist, s.track, raw);
    if (groups.has(id)) continue;
    let g = linked.get(id);
    if (!g) {
      const label = raw.slice(String(s.artist).length + 1);
      g = {id, a: s.artist, t: s.track, f: s.album || "", r: label, s: raw,
        n: 0, k: "linked", to: label, ts: raw,
        w: "Rangé ici d'office (single, titre seul ou édition)"};
      const m = mbCache[deps.key(s.artist, s.track)];
      const p = m && m[0] ? deps.propose(m[0], s.album || "", {played: s.track,
        library: deps.library.get(fold(s.artist))}) : null;
      const rv = doubtOf(label, s.album || "", p);
      if (rv) g.rv = rv;
      linked.set(id, g);
    }
    g.n += 1;
  }
  const items = Array.from(linked.values());
  const byKind = {sure: 0, check: 0, keep: 0, unknown: 0, ok: 0,
    linked: linked.size};
  const listensBy = {sure: 0, check: 0, keep: 0, unknown: 0, ok: 0};
  for (const g of groups.values()) {
    byKind[g.k] += 1;
    listensBy[g.k] += g.n;
    if (g.k === "ok") {
      ok += g.n;
      // Déjà rangé, mais douteux : montré pour « À revoir ».
      if (g.rv) items.push(g);
      continue;
    }
    items.push(g);
  }
  items.sort((a, b) => b.n - a.n || a.a.localeCompare(b.a));
  return {
    summary: {
      total_listens: total,
      // Écoutes hors titres douteux, ou déjà sur le bon album.
      base_listens: base + ok,
      unverified_listens: unverified,
      titles: byKind,
      listens: listensBy,
    },
    items,
  };
}

// Raison « à part » de MusicBrainz (propose) → nature affichée.
const NATURE = [
  [/^Album live/, "live"],
  [/remix ou live/, "remix"],
  [/single ou un EP/, "single"],
  [/Bande originale/, "bo"],
  [/aucun album studio/, "hors"],
];

/**
 * Nature d'un « album » qui n'en est pas un (v2.36.0, pure, testée) :
 * libellé live, ou libellé dont TOUTES les écoutes sont des titres que
 * MusicBrainz laisse à part (face B de single, remix, BO…). Les autres
 * restent des albums. Dérivé (IM-5) : recalculé à chaque « Actualiser ».
 * @param {Array<Object>} libAll - albums canoniques {album_sur, album,
 *   listen_count}
 * @param {Array<Object>} items - buildQuality().items
 * @return {Map<string, string>} album_sur → single|remix|live|bo|hors
 */
function albumNature(libAll, items) {
  const by = new Map();
  for (const it of items) {
    if (it.k !== "keep") continue;
    const rule = NATURE.find(([re]) => re.test(it.w || ""));
    if (!rule) continue;
    const nat = rule[1] === "remix" && /\blive\b/i.test(it.t) ? "live" :
      rule[1];
    const sur = `${it.a}-${it.f}`;
    const m = by.get(sur) || new Map();
    m.set(nat, (m.get(nat) || 0) + it.n);
    by.set(sur, m);
  }
  const out = new Map();
  for (const a of libAll) {
    if (isLiveLabel(a.album)) {
      out.set(a.album_sur, "live");
      continue;
    }
    const m = by.get(a.album_sur);
    if (!m) continue;
    const all = Array.from(m.values()).reduce((x, y) => x + y, 0);
    if (all < a.listen_count) continue; // un vrai titre d'album s'y trouve
    out.set(a.album_sur, Array.from(m.entries())
        .sort((x, y) => y[1] - x[1])[0][0]);
  }
  return out;
}

exports.albumNature = albumNature;
exports.itemId = itemId;
exports.buildQuality = buildQuality;
