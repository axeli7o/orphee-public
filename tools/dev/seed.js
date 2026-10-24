/* Mode local — remplit les émulateurs (projet fictif demo-orphee).
   Lancé par `npm run dev` via `firebase emulators:exec`, qui pose
   FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST : l'admin SDK ne
   peut donc parler qu'aux émulateurs, jamais au vrai projet.

   1. Génère des écoutes fictives → émulateur Storage (scrobbles/{YYYY},
      comme la synchro Last.fm, ADR-034) + cache/scrobbles_meta.
   2. Crée le compte de test (axel@example.com / orphee-dev).
   3. Écrit la curation (notes, coups de cœur, genres d'albums et
      d'artistes), le nom Last.fm, les réglages Oddity et une conversation.
   4. Appelle le VRAI refreshCache (émulateur Functions) : le cache est
      calculé par le pipeline de prod, schéma exact par construction.
   --wait : reste ouvert (Ctrl-C pour tout arrêter). */
"use strict";

const path = require("path");
const {createRequire} = require("module");

const ROOT = path.join(__dirname, "..", "..");
const fnRequire = createRequire(path.join(ROOT, "functions", "package.json"));
const {initializeApp} = fnRequire("firebase-admin/app");
const {getAuth} = fnRequire("firebase-admin/auth");
const {getFirestore, Timestamp} = fnRequire("firebase-admin/firestore");

const CATALOG = require("./fixture-data");
const store = require(path.join(ROOT, "functions", "src", "scrobbles", "store"));
const model = require(path.join(ROOT, "functions", "src", "scrobbles", "model"));

const PROJECT = "demo-orphee";
const UID = "axel-dev";
const ACCOUNT = {email: "axel@example.com", password: "orphee-dev"};
const HOST = "127.0.0.1";
const PORTS = {auth: 9099, functions: 5001, hosting: 5050};
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
const START = Date.UTC(2014, 0, 1) / 1000;

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("seed.js doit tourner sous `firebase emulators:exec` " +
    "(npm run dev) — refus de toucher un vrai projet.");
  process.exit(1);
}

// PRNG déterministe : mêmes données à chaque lancement.
let seed = 42;
function rnd() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Heure d'écoute : pics trajets (≈8h, ≈18h30) + soirée, en heure de Paris.
function listenTime(day) {
  const r = rnd();
  let h;
  if (r < 0.25) h = 7.5 + rnd() * 1.5;
  else if (r < 0.5) h = 18 + rnd() * 2;
  else if (r < 0.85) h = 20 + rnd() * 4;
  else h = 10 + rnd() * 7;
  return day + Math.floor((h - 2) * 3600); // ≈ UTC
}

// ---- 1. Catalogue + écoutes -----------------------------------------------

const SYL = ["lu", "na", "mi", "so", "ra", "ve", "lo", "ka", "do", "ri",
  "an", "el", "or", "is", "ta", "ne"];
const WORDS = ["Nuits", "Bleues", "Silence", "Rivages", "Lumière", "Échos",
  "Dérive", "Saisons", "Horizon", "Vertige", "Poussière", "Marées",
  "Velours", "Néons", "Brume", "Comètes", "Orages", "Mirages"];
const name = () => {
  const w = () => SYL[between(0, SYL.length - 1)] + pick(SYL);
  const s = w() + w();
  return s[0].toUpperCase() + s.slice(1);
};

function buildCatalog() {
  const albums = [];
  for (const [artist, genre, sousgenre, titles] of CATALOG) {
    for (const album of titles) {
      albums.push({artist, album, genre, sousgenre, main: true});
    }
  }
  // Longue traîne : albums obscurs peu écoutés, souvent non classés.
  for (let i = 0; i < 420; i++) {
    albums.push({
      artist: name() + " " + name(),
      album: pick(WORDS) + " " + pick(WORDS).toLowerCase(),
      genre: "", sousgenre: "", main: false,
    });
  }
  // Rang de popularité mélangé (le catalogue n'est pas trié par goût).
  const main = albums.filter((a) => a.main).sort(() => rnd() - 0.5);
  main.forEach((a, i) => {
    a.listens = Math.round(2600 / Math.pow(i + 1, 0.78)) + between(5, 40);
  });
  for (const a of albums) if (!a.main) a.listens = between(1, 9);
  return albums;
}

const LIVE = {raw: "Live at Rome Olympic Stadium", track: "Piste 2"};

function buildScrobbles(albums) {
  const scrobbles = [];
  for (const a of albums) {
    const nTracks = between(7, 13);
    a.tracks = Array.from({length: nTracks}, (_, i) => `Piste ${i + 1}`);
    // Ère d'écoute : démarrage aléatoire, intense ~18 mois puis traîne.
    const start = START + Math.floor(rnd() * (NOW - START - 30 * DAY));
    for (let k = 0; k < a.listens; k++) {
      const span = rnd() < 0.75 ? 540 * DAY : NOW - start;
      const day = Math.min(NOW - DAY, start + Math.floor(rnd() * span));
      const dayStart = day - (day % DAY);
      const track = a.tracks[Math.min(nTracks - 1,
          Math.floor(Math.pow(rnd(), 1.6) * nTracks))];
      scrobbles.push({
        uts: listenTime(dayStart),
        artist: a.artist,
        album: a.album,
        track,
        album_sur: `${a.artist}-${a.album}`,
        track_sur: `${a.artist}-${a.album}-${track}`,
      });
    }
  }
  // Éditions reçues sous un autre libellé (v2.32.0) : rangées d'office sous
  // leur album par le rattachement (PM-29) — de quoi revoir « Rattachés ».
  const edition = [["Muse", "Absolution (Deluxe Edition)", "Piste 2", 6],
    // Un album live : « À part » sur la fiche artiste (v2.36.0).
    ["Muse", "HAARP (Live From Wembley Stadium)", "Piste 1", 3],
    ["Muse", "Absolution (Deluxe Edition)", "Piste 3", 3],
    ["Radiohead", "In Rainbows (Deluxe)", "Piste 1", 4]];
  for (const [artist, album, track, n] of edition) {
    for (let k = 0; k < n; k++) {
      scrobbles.push({uts: NOW - (k + 2) * 3 * DAY + 20 * 3600, artist, album,
        track, album_sur: `${artist}-${album}`,
        track_sur: `${artist}-${album}-${track}`});
    }
  }
  // Un live rangé par erreur sur l'album studio (v2.35.0, « À revoir ») :
  // reçu sur « Live at Rome Olympic Stadium », corrigé vers Absolution
  // (correction appliquée, écrite plus bas).
  for (let k = 0; k < 5; k++) {
    scrobbles.push({uts: NOW - (k + 3) * 5 * DAY + 21 * 3600, artist: "Muse",
      album: LIVE.raw, track: LIVE.track, album_sur: `Muse-${LIVE.raw}`,
      track_sur: `Muse-${LIVE.raw}-${LIVE.track}`});
  }
  // Un album tenu par un seul titre (v2.34.0, « Un seul titre ») : Creep,
  // 33 écoutes sur 40, sur 4 titres joués.
  const one = [["Creep", 33], ["You", 3], ["Anyone Can Play Guitar", 2],
    ["Stop Whispering", 2]];
  let u = 0;
  for (const [track, n] of one) {
    for (let k = 0; k < n; k++) {
      u += 1;
      scrobbles.push({uts: NOW - u * 2 * DAY + 8 * 3600, artist: "Radiohead",
        album: "Pablo Honey", track, album_sur: "Radiohead-Pablo Honey",
        track_sur: `Radiohead-Pablo Honey-${track}`});
    }
  }
  return scrobbles.sort((x, y) => y.uts - x.uts); // plus récent d'abord
}

// ---- 3. Curation ------------------------------------------------------------

const COMMENTS = [
  "L'album de mes trajets d'hiver.",
  "Découvert en concert, jamais lâché depuis.",
  "Parfait pour coder tard.",
  "Le premier morceau suffit à justifier tout l'album.",
  "Trop long, mais la deuxième moitié est sublime.",
];

function buildCuration(albums) {
  const grades = [];
  const ranked = albums.slice().sort((x, y) => y.listens - x.listens);
  ranked.forEach((a, i) => {
    const key = `${a.artist}-${a.album}`;
    if (!a.main) return;
    // Les plus écoutés sont presque tous notés ; quelques-uns restent « à noter ».
    if (rnd() < (i < 40 ? 0.12 : 0.45)) {
      if (rnd() < 0.5) grades.push({key, genre: a.genre, sousgenre: a.sousgenre});
      return;
    }
    const grade = i < 8 ? pick([4, 5, 5]) :
      i < 30 ? pick([2, 3, 3, 4, 4, 5]) : pick([1, 2, 2, 3, 3, 4]);
    grades.push({
      key, grade, genre: a.genre, sousgenre: a.sousgenre,
      personal_fav: grade >= 4 && rnd() < 0.35,
      commentaire: rnd() < 0.18 ? pick(COMMENTS) : "",
    });
  });
  return grades;
}

// CD de démonstration (clé album_sur → note imposée). Couvre les 5 notes.
const DEMO_CDS = [
  ["Daft Punk-Discovery", 5],
  ["Kendrick Lamar-To Pimp a Butterfly", 5],
  ["Radiohead-OK Computer", 4],
  ["Tame Impala-Currents", 4],
  ["Miles Davis-Kind of Blue", 4],
  ["Bon Iver-For Emma, Forever Ago", 3],
  ["Arctic Monkeys-AM", 3],
  ["Stromae-Racine carrée", 2],
  ["Justice-Cross", 2],
  ["Linkin Park-Meteora", 1],
];

const CHAT = [
  ["user", "Qu'est-ce que j'ai le plus écouté cette année ?"],
  ["assistant", "Ton année tient en deux pôles : beaucoup de trajets " +
    "accompagnés d'électro, et des soirées plus introspectives. " +
    "Veux-tu que je détaille album par album ?\n\n" +
    "*(Conversation fictive — mode local.)*"],
  ["user", "Note Discovery 5, c'est un classique absolu pour moi."],
  ["assistant", "C'est fait : **Discovery** est noté Adored."],
];

// ---- 4. Appels émulateurs (REST) -------------------------------------------

async function idToken() {
  const res = await fetch(`http://${HOST}:${PORTS.auth}/identitytoolkit.` +
    "googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({...ACCOUNT, returnSecureToken: true}),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error("signIn émulateur : " + JSON.stringify(body));
  return body.idToken;
}

async function callRefresh() {
  const token = await idToken();
  const res = await fetch(`http://${HOST}:${PORTS.functions}/${PROJECT}/` +
    "europe-west1/refreshCache", {
    method: "POST",
    headers: {"Content-Type": "application/json",
      "Authorization": `Bearer ${token}`},
    body: JSON.stringify({data: {}}),
  });
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error("refreshCache : " + JSON.stringify(body.error || body));
  }
  return body.result;
}

async function main() {
  const albums = buildCatalog();
  const scrobbles = buildScrobbles(albums);
  const artists = [...new Set(albums.map((a) => a.artist))].map((artist) => {
    const a = albums.find((x) => x.artist === artist);
    return {artist, genre: a.genre, sousgenre: a.sousgenre};
  });

  initializeApp({projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com`});
  const db = getFirestore();

  // Écoutes : comme après la synchro Last.fm (Storage + meta).
  const parts = model.byYear(scrobbles);
  const years = {};
  for (const [y, list] of parts) {
    list.sort((a, b) => b.uts - a.uts);
    await store.writeYear(y, list);
    years[String(y)] = list.length;
  }
  await store.writeMeta(db, {source: "storage", years,
    last_uts: scrobbles.reduce((m, s) => Math.max(m, s.uts), 0),
    total: scrobbles.length, migrated_at: Timestamp.now()});
  console.log(`[seed] ${scrobbles.length} écoutes fictives, ` +
    `${albums.length} albums, ${artists.length} artistes`);

  await getAuth().createUser({uid: UID, ...ACCOUNT,
    displayName: "Axel (local)"}).catch((e) => {
    if (e.code !== "auth/uid-already-exists") throw e;
  });
  // Propriétaire (ADR-041) : email vérifié + config/owner.
  await getAuth().updateUser(UID, {emailVerified: true});
  await db.doc("config/owner").set({email: ACCOUNT.email});

  const now = Timestamp.now();
  const batch = db.batch();
  const user = db.collection("users").doc(UID);
  for (const g of buildCuration(albums)) {
    batch.set(user.collection("grades").doc(g.key), {
      grade: g.grade === undefined ? null : g.grade,
      personal_fav: !!g.personal_fav,
      commentaire: g.commentaire || "",
      genre: g.genre, sousgenre: g.sousgenre,
      graded_at: now, updated_at: now,
    });
  }
  for (const a of artists) {
    batch.set(user.collection("artist_genres")
        .doc(encodeURIComponent(a.artist)), {artist: a.artist, genre: a.genre,
      sousgenre: a.sousgenre, source: "seed", updated_at: now});
  }
  // Vitrine /preview : une dizaine de CD aux notes imposées (couvrent 1→5),
  // pour que le bac « Mes CD » montre des exemples variés plutôt qu'un vide.
  const albIndex = new Map(albums.map((a) => [`${a.artist}-${a.album}`, a]));
  for (const [key, grade] of DEMO_CDS) {
    const a = albIndex.get(key);
    if (!a) { console.warn("[seed] CD démo introuvable au catalogue :", key); continue; }
    batch.set(user.collection("grades").doc(key), {
      grade, personal_fav: grade === 5, commentaire: "",
      genre: a.genre, sousgenre: a.sousgenre, graded_at: now, updated_at: now,
    });
    batch.set(user.collection("cds").doc(encodeURIComponent(key)),
        {album_sur: key, at: Date.now()});
  }
  batch.set(user.collection("settings").doc("profile"),
      {lastfm_user: "mélomane", updated_at: now});
  batch.set(user.collection("settings").doc("oddity"),
      {percentile: 90, eligible: [1, 2], updated_at: now});
  CHAT.forEach(([role, content], i) => {
    batch.set(user.collection("chats").doc("main").collection("messages")
        .doc(`m${i}`), {role, content,
      timestamp: Timestamp.fromMillis(Date.now() - (CHAT.length - i) * 60000)});
  });
  // La correction appliquée du live (« Déplacer ici » touché trop vite).
  const {itemId} = require(path.join(ROOT, "functions", "src", "quality",
      "model"));
  batch.set(user.collection("applied_corrections")
      .doc(itemId("Muse", LIVE.track, `Muse-${LIVE.raw}`)), {
    artist: "Muse", track: LIVE.track, raw_album_sur: `Muse-${LIVE.raw}`,
    to_album: "Absolution", to_album_sur: "Muse-Absolution", source: "axel",
    batch: "seed-live", at: now});
  batch.set(user.collection("correction_batches").doc("seed-live"),
      {at: now, count: 1, carried: []});
  await batch.commit();
  console.log("[seed] curation, réglages et conversation écrits");

  const t0 = Date.now();
  const r = await callRefresh();
  console.log(`[seed] refreshCache (pipeline réel) en ${Date.now() - t0} ms :`,
      JSON.stringify(r));

  if (process.argv.includes("--wait")) {
    console.log(`\n  Orphée local → http://${HOST}:${PORTS.hosting}\n` +
      `  Compte de test : ${ACCOUNT.email} (bouton de connexion)\n` +
      "  Ctrl-C pour arrêter.\n");
    // Un timer garde le processus (donc les émulateurs) en vie.
    const alive = setInterval(() => {}, 1 << 30);
    await new Promise((resolve) => {
      process.on("SIGINT", resolve);
      process.on("SIGTERM", resolve);
    });
    clearInterval(alive);
  }
}

main().catch((e) => {
  console.error("[seed] échec :", e.message);
  process.exit(1);
});
