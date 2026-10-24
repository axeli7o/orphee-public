"use strict";

/**
 * Vue « Artistes » (v2.40.0, PM-37) — fonction pure, testée. À partir des
 * écoutes seules (des faits, IM-1), range les artistes en récits vérifiables
 * — piliers, découvertes, retrouvailles, fulgurances, perdus de vue — et
 * calcule, pour la fiche artiste, ceux qu'Axel enchaîne dans une même séance.
 * Les genres (curation) n'y entrent pas : le client classe par genre sur la
 * curation live (ADR-031).
 *
 * « Ta musique » (v2.42.0) : l'artiste qu'Axel déclare être (Réglages ›
 * Compte, `settings/profile.artist_name`) sort des récits et reçoit son bloc,
 * avec ses titres les plus écoutés.
 */

const {blankYears} = require("./quarters");

// Une séance : des écoutes à moins de 30 min d'écart.
const SESSION_GAP_S = 30 * 60;
// Fiche artiste « Souvent avec » : au moins 10 séances partagées, 4 au plus.
const WITH_MIN = 10;
const WITH_TOP = 4;
// Courbes envoyées au client : les artistes les plus écoutés (rangées par
// genre, fiches) plus tous ceux des récits.
const SERIES_TOP = 300;
// 9 par récit : une grille 3 × 3 une fois dépliée (v2.42.0).
const ROW_MAX = 9;
// « Ta musique » : les titres les plus écoutés.
const MINE_TRACKS = 5;

/**
 * @param {Array<{uts: (number|string), artist: string, track: string}>}
 *   scrobbles
 * @param {string=} artistName - le nom d'artiste d'Axel (casse ignorée)
 * @return {{years: Array<number>, rows: Object<string, Array<string>>,
 *   series: Object<string, {y: Array<number>, n: number, first: number}>,
 *   with: Object<string, Array<{a: string, n: number}>>, count: number,
 *   mine: ?{artist: string, tracks: Array<{t: string, n: number}>}}}
 *   (pas de tableaux imbriqués : Firestore les refuse)
 */
function buildArtists(scrobbles, artistName) {
  const mineKey = String(artistName || "").trim().toLowerCase();
  let mineArtist = null;
  const mineTracks = new Map();
  const byYear = new Map();
  const listens = [];
  for (const s of scrobbles) {
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0 || !s.artist) continue;
    const y = new Date(uts * 1000).getUTCFullYear();
    byYear.set(y, (byYear.get(y) || 0) + 1);
    listens.push([uts, s.artist, y]);
    if (mineKey && s.artist.toLowerCase() === mineKey) {
      mineArtist = mineArtist || s.artist;
      if (s.track) mineTracks.set(s.track, (mineTracks.get(s.track) || 0) + 1);
    }
  }
  // Années actives : celles qui ont des écoutes, sans les années blanches.
  const blank = blankYears(Array.from(byYear, ([y, n]) => ({y, listens: n})));
  const years = Array.from(byYear.keys()).filter((y) => !blank.has(y))
      .sort((a, b) => a - b);
  const idx = new Map(years.map((y, i) => [y, i]));
  const per = new Map();
  for (const [, a, y] of listens) {
    if (!idx.has(y)) continue;
    let ys = per.get(a);
    if (!ys) per.set(a, ys = new Array(years.length).fill(0));
    ys[idx.get(y)] += 1;
  }
  const N = years.length;
  const tot = (a) => per.get(a).reduce((s, v) => s + v, 0);
  const sum = (a, from, to) => per.get(a).slice(from, to)
      .reduce((s, v) => s + v, 0);
  const firstOf = (a) => years[per.get(a).findIndex((v) => v > 0)];
  const byTotal = Array.from(per.keys()).sort((x, y) => tot(y) - tot(x));

  // Récits, dans l'ordre de priorité : un artiste n'apparaît qu'une fois.
  const used = new Set(mineArtist ? [mineArtist] : []);
  const take = (list) => {
    const out = list.filter((a) => !used.has(a)).slice(0, ROW_MAX);
    for (const a of out) used.add(a);
    return out;
  };
  const rows = {};
  // Piliers : ≥ 10 écoutes dans au moins les 2/3 des années actives.
  const needYears = Math.max(3, Math.ceil(N * 2 / 3));
  rows.piliers = take(byTotal.filter((a) =>
    per.get(a).filter((v) => v >= 10).length >= needYears));
  // Découvertes : arrivés dans les 2 dernières années actives, ≥ 60 écoutes.
  rows.decouvertes = take(byTotal.filter((a) =>
    N >= 3 && years.indexOf(firstOf(a)) >= N - 2 && tot(a) >= 60));
  // Retrouvailles : ≥ 50 écoutes avant, un creux sur les 3 années d'avant
  // les 2 dernières (≤ 30 % d'avant, et moins que maintenant), ≥ 20 depuis.
  const now = (a) => sum(a, N - 2, N);
  const mid = (a) => sum(a, Math.max(0, N - 5), N - 2);
  const before = (a) => sum(a, 0, Math.max(0, N - 5));
  rows.retrouvailles = take(byTotal.filter((a) => N >= 6 &&
    before(a) >= 50 && now(a) >= 20 && mid(a) <= 0.3 * before(a) &&
    mid(a) < now(a)).sort((x, y) => now(y) - now(x)));
  // Fulgurances : une année ≥ 60 % du total (≥ 150), pas l'année en cours,
  // puis l'année active suivante sous 15 % de ce pic.
  const peakOf = (a) => {
    const ys = per.get(a);
    return ys.indexOf(Math.max(...ys));
  };
  rows.fulgurances = take(byTotal.filter((a) => {
    const t = tot(a);
    const i = peakOf(a);
    const p = per.get(a)[i];
    return t >= 150 && p >= 0.6 * t && i < N - 1 &&
      per.get(a)[i + 1] < 0.15 * p;
  }).sort((x, y) => per.get(y)[peakOf(y)] - per.get(x)[peakOf(x)]));
  // Perdus de vue : ≥ 200 écoutes, moins de 3 % sur les 2 dernières années.
  rows.perdus = take(byTotal.filter((a) =>
    N >= 3 && tot(a) >= 200 && now(a) < 0.03 * tot(a)));

  // Courbes : les plus écoutés + tous ceux des récits.
  const named = new Set(byTotal.slice(0, SERIES_TOP));
  for (const a of used) if (per.has(a)) named.add(a);

  // Souvent avec : séances partagées entre artistes nommés.
  listens.sort((x, y) => x[0] - y[0]);
  const pair = new Map();
  let session = new Set();
  let last = 0;
  const flush = () => {
    const xs = Array.from(session).filter((a) => named.has(a)).sort();
    for (let i = 0; i < xs.length; i++) {
      for (let j = i + 1; j < xs.length; j++) {
        const k = `${xs[i]}\u0000${xs[j]}`;
        pair.set(k, (pair.get(k) || 0) + 1);
      }
    }
    session = new Set();
  };
  for (const [uts, a] of listens) {
    if (last && uts - last > SESSION_GAP_S) flush();
    session.add(a);
    last = uts;
  }
  flush();
  const withs = new Map();
  for (const [k, n] of pair) {
    if (n < WITH_MIN) continue;
    const [a, b] = k.split("\u0000");
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!withs.has(x)) withs.set(x, []);
      withs.get(x).push({a: y, n});
    }
  }
  const series = {};
  const withOut = {};
  for (const a of named) {
    series[a] = {y: per.get(a), n: tot(a), first: firstOf(a)};
    const w = withs.get(a);
    if (w) withOut[a] = w.sort((x, y) => y.n - x.n).slice(0, WITH_TOP);
  }
  const mine = mineArtist ? {
    artist: mineArtist,
    tracks: Array.from(mineTracks, ([t, n]) => ({t, n}))
        .sort((x, y) => y.n - x.n).slice(0, MINE_TRACKS),
  } : null;
  return {years, rows, series, with: withOut, count: per.size, mine};
}

// « Tes mondes » (PM-40, ADR-052) — archipel des groupes d'artistes qu'Axel
// enchaîne ensemble, trouvés par détection de communautés (Louvain) sur le
// graphe de co-écoute. Dérivé pur (IM-1), recalculé au refresh (ADR-005),
// jamais une source (IM-5), lu aussi par l'invité (IM-8, cache/*). Le genre
// n'entre pas : le client colore et nomme la dominante live (ADR-031).
// Clustering DÉTERMINISTE (ordre fixe, départage par plus petit id) pour que
// l'agrégat stocké soit reproductible. Paramètres figés (validés en maquette).
const CLUST_TOP_N = 100; // artistes considérés (les plus écoutés)
const CLUST_MIN_EDGE = 20; // séances partagées pour relier deux artistes
const CLUST_RES = 1.5; // résolution Louvain (granularité des mondes)

/**
 * Louvain local-moving pondéré, déterministe, à une couche.
 * @param {number} n
 * @param {Array<Map<number, number>>} adj - voisins pondérés (sans self-loop)
 * @param {Array<number>} k - degrés pondérés
 * @param {number} m2 - somme des degrés (2m)
 * @param {number} gamma - résolution
 * @return {Array<number>} communauté de chaque nœud
 */
function louvain(n, adj, k, m2, gamma) {
  const comm = Array.from({length: n}, (_, i) => i);
  const stot = k.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;
    for (let i = 0; i < n; i++) {
      const ci = comm[i];
      const nb = new Map();
      for (const [j, w] of adj[i]) {
        if (j !== i) nb.set(comm[j], (nb.get(comm[j]) || 0) + w);
      }
      stot[ci] -= k[i];
      let bestC = ci;
      let bestGain = (nb.get(ci) || 0) - gamma * stot[ci] * k[i] / m2;
      for (const [c, wi] of nb) {
        const g = wi - gamma * stot[c] * k[i] / m2;
        // Départage déterministe : gain strictement meilleur, ou égal et id <.
        if (g > bestGain + 1e-9 || (g > bestGain - 1e-9 && c < bestC)) {
          bestGain = g;
          bestC = c;
        }
      }
      stot[bestC] += k[i];
      if (bestC !== ci) {
        comm[i] = bestC;
        improved = true;
      }
    }
  }
  return comm;
}

/**
 * @param {Array<{uts: (number|string), artist: string}>} scrobbles
 * @return {{top_n: number, min_edge: number, resolution: number,
 *   clusters: Array<{top: string, plays: number,
 *     members: Array<{a: string, n: number}>}>,
 *   bridges: Object<string, number>}}
 *   clusters triés par écoutes ; bridges "i-j" = séances entre deux mondes.
 */
function buildClusters(scrobbles) {
  const plays = new Map();
  const listens = [];
  for (const s of scrobbles) {
    const uts = typeof s.uts === "number" ? s.uts : parseInt(s.uts, 10);
    if (!Number.isFinite(uts) || uts <= 0 || !s.artist) continue;
    plays.set(s.artist, (plays.get(s.artist) || 0) + 1);
    listens.push([uts, s.artist]);
  }
  // Set borné : les CLUST_TOP_N plus écoutés (départage par nom, déterministe).
  const top = Array.from(plays.keys())
      .sort((a, b) => plays.get(b) - plays.get(a) || (a < b ? -1 : 1))
      .slice(0, CLUST_TOP_N);
  const idx = new Map(top.map((a, i) => [a, i]));
  const n = top.length;

  // Séances → paires pondérées au sein du set.
  listens.sort((x, y) => x[0] - y[0]);
  const pair = new Map();
  let session = new Set();
  let last = 0;
  const flush = () => {
    const xs = Array.from(session).filter((a) => idx.has(a))
        .map((a) => idx.get(a)).sort((p, q) => p - q);
    for (let i = 0; i < xs.length; i++) {
      for (let j = i + 1; j < xs.length; j++) {
        const kk = `${xs[i]}_${xs[j]}`;
        pair.set(kk, (pair.get(kk) || 0) + 1);
      }
    }
    session = new Set();
  };
  for (const [uts, a] of listens) {
    if (last && uts - last > SESSION_GAP_S) flush();
    session.add(a);
    last = uts;
  }
  flush();

  // Graphe élagué (liens ≥ CLUST_MIN_EDGE).
  const adj = Array.from({length: n}, () => new Map());
  const k = new Array(n).fill(0);
  let m2 = 0;
  for (const [kk, w] of pair) {
    if (w < CLUST_MIN_EDGE) continue;
    const [a, b] = kk.split("_").map(Number);
    adj[a].set(b, w);
    adj[b].set(a, w);
    k[a] += w;
    k[b] += w;
    m2 += 2 * w;
  }
  if (m2 === 0) m2 = 1;

  const comm = louvain(n, adj, k, m2, CLUST_RES);
  const by = new Map();
  for (let i = 0; i < n; i++) {
    if (k[i] === 0) continue; // artiste isolé : hors archipel
    if (!by.has(comm[i])) by.set(comm[i], []);
    by.get(comm[i]).push(i);
  }
  const clusters = Array.from(by.values()).filter((c) => c.length >= 2);
  // Rang par écoutes totales (déterministe).
  const cl = clusters.map((nodes) => {
    const members = nodes.map((i) => ({a: top[i], n: plays.get(top[i])}))
        .sort((x, y) => y.n - x.n || (x.a < y.a ? -1 : 1));
    return {top: members[0].a, plays: members.reduce((s, m) => s + m.n, 0),
      members, nodes};
  }).sort((a, b) => b.plays - a.plays || (a.top < b.top ? -1 : 1));

  // Ponts entre mondes (par rang de cluster).
  const rank = new Map();
  cl.forEach((c, r) => c.nodes.forEach((i) => rank.set(i, r)));
  const bridges = {};
  for (const [kk, w] of pair) {
    if (w < CLUST_MIN_EDGE) continue;
    const [a, b] = kk.split("_").map(Number);
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra == null || rb == null || ra === rb) continue;
    const key = ra < rb ? `${ra}-${rb}` : `${rb}-${ra}`;
    bridges[key] = (bridges[key] || 0) + w;
  }
  return {
    top_n: CLUST_TOP_N,
    min_edge: CLUST_MIN_EDGE,
    resolution: CLUST_RES,
    clusters: cl.map(({top, plays, members}) => ({top, plays, members})),
    bridges,
  };
}

exports.SESSION_GAP_S = SESSION_GAP_S;
exports.WITH_MIN = WITH_MIN;
exports.buildArtists = buildArtists;
exports.buildClusters = buildClusters;
