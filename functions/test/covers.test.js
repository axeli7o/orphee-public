"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {enrichCovers} = require("../src/covers");

// ---- Fake Firestore minimal ----
// Reproduit juste ce qu'utilise enrichCovers : collection().get()/doc() et
// batch().set()/commit().
/**
 * Crée un faux Firestore minimal pour enrichCovers.
 * @param {Object} initialCovers - map docId → data du cache de départ
 * @return {Object} faux db avec _store et _writes inspectables
 */
function fakeDb(initialCovers) {
  const store = new Map(Object.entries(initialCovers || {}));
  const writes = [];
  return {
    _store: store,
    _writes: writes,
    collection() {
      return {
        async get() {
          const docs = [];
          for (const [id, data] of store) {
            docs.push({id, data: () => data});
          }
          return {forEach: (cb) => docs.forEach(cb)};
        },
        doc: (id) => ({id}),
      };
    },
    batch() {
      const ops = [];
      return {
        set: (ref, data) => ops.push([ref.id, data]),
        async commit() {
          for (const [id, data] of ops) {
            store.set(id, data);
            writes.push(id);
          }
        },
      };
    },
  };
}

/**
 * Stub global.fetch renvoyant une réponse Deezer.
 * @param {boolean} found - true = un résultat avec cover_xl, false = aucun
 * @return {void}
 */
function stubFetch(found) {
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      const data = found ? [{cover_xl: "https://deezer/cover.jpg"}] : [];
      return {data};
    },
  });
}

const lib = [
  {album_sur: "a1", artist: "Artist A", album: "Album 1"},
  {album_sur: "a2", artist: "Artist B", album: "Album 2"},
];

test("enrichCovers: résout via Deezer et cache le résultat", async () => {
  stubFetch(true);
  const db = fakeDb({});
  const urls = await enrichCovers(db, lib, new Set(["a1", "a2"]));
  assert.equal(urls.get("a1"), "https://deezer/cover.jpg");
  assert.equal(urls.get("a2"), "https://deezer/cover.jpg");
  // deux docs covers écrits
  assert.equal(db._writes.length, 2);
  assert.equal(db._store.get("a1").source, "deezer");
  assert.equal(db._store.get("a1").not_found, false);
});

test("enrichCovers: album déjà caché n'est pas re-cherché", async () => {
  stubFetch(true);
  const db = fakeDb({
    a1: {url: "https://existing.jpg", source: "deezer", not_found: false},
  });
  const urls = await enrichCovers(db, lib, new Set(["a1"]));
  assert.equal(urls.get("a1"), "https://existing.jpg");
  assert.equal(db._writes.length, 0); // aucun nouvel appel/écriture
});

test("enrichCovers: not_found caché → pas de re-recherche", async () => {
  stubFetch(true);
  const db = fakeDb({
    a2: {url: null, source: "deezer", not_found: true},
  });
  const urls = await enrichCovers(db, lib, new Set(["a2"]));
  assert.equal(urls.has("a2"), false); // url null absente de la map
  assert.equal(db._writes.length, 0);
});

test("enrichCovers: override manuel exposé et préservé", async () => {
  stubFetch(true);
  const db = fakeDb({
    a1: {url: "https://manual.jpg", source: "manual", not_found: false},
  });
  const urls = await enrichCovers(db, lib, new Set(["a1"]));
  assert.equal(urls.get("a1"), "https://manual.jpg");
  assert.equal(db._writes.length, 0); // manuel jamais réécrit
});

test("enrichCovers: rien trouvé → cache not_found, url absente", async () => {
  stubFetch(false);
  const db = fakeDb({});
  const urls = await enrichCovers(db, lib, new Set(["a1"]));
  assert.equal(urls.has("a1"), false);
  assert.equal(db._store.get("a1").not_found, true);
  assert.equal(db._store.get("a1").url, null);
});

test("enrichCovers: override manuel codé appliqué si album présent",
    async () => {
      stubFetch(false); // Deezer ne renvoie rien
      const db = fakeDb({});
      // "Axel Mercier-" est l'override codé (MANUAL_OVERRIDES).
      const withOverride = [
        {album_sur: "Axel Mercier-", artist: "Axel Mercier", album: "X"},
      ];
      const urls = await enrichCovers(
          db, withOverride, new Set(["Axel Mercier-"]),
      );
      const url = urls.get("Axel Mercier-");
      assert.ok(url && url.includes("chronicle-of-the-chained"));
      assert.equal(db._store.get("Axel Mercier-").source, "manual");
      // pas re-cherché sur Deezer (override en priorité)
    });

test("enrichCovers: override manuel codé ignoré si album absent",
    async () => {
      stubFetch(true);
      const db = fakeDb({});
      // lib ne contient pas la clé override → aucun doc parasite
      const urls = await enrichCovers(db, lib, new Set(["a1"]));
      assert.equal(urls.has("Axel Mercier-"), false);
      assert.equal(db._store.has("Axel Mercier-"), false);
    });

test("enrichCovers: ignore album_sur invalide (slash)", async () => {
  stubFetch(true);
  const db = fakeDb({});
  const bad = [{album_sur: "a/b", artist: "X", album: "Y"}];
  const urls = await enrichCovers(db, bad, new Set(["a/b"]));
  assert.equal(urls.size, 0);
  assert.equal(db._writes.length, 0);
});

// ---- v2.18.0 : titres nettoyés, Last.fm en secours ----
const {cleanTitle} = require("../src/covers/deezer");
const {pickImage} = require("../src/covers/lastfm");

test("cleanTitle: retire les mentions d'édition", () => {
  assert.equal(cleanTitle("Sanctuary (Deluxe Edition)"), "Sanctuary");
  assert.equal(cleanTitle("Mind of Mine (Deluxe Edition)"), "Mind of Mine");
  assert.equal(cleanTitle("Hollow - EP"), "Hollow");
  assert.equal(cleanTitle("Abbey Road [Remastered 2019]"), "Abbey Road");
  assert.equal(cleanTitle("Feu"), "Feu");
});

test("pickImage: plus grande image, sans l'étoile par défaut", () => {
  const img = (size, u) => ({"size": size, "#text": u});
  assert.equal(pickImage({album: {image: [img("large", "https://l/a.jpg"),
    img("extralarge", "https://l/b.jpg")]}}), "https://l/b.jpg");
  assert.equal(pickImage({album: {image: [img("extralarge",
      "https://l/2a96cbd8b46e442fc41c2b86b821562f.png")]}}), null);
  assert.equal(pickImage({album: {image: [img("mega", "")]}}), null);
  assert.equal(pickImage(null), null);
});
