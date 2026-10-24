"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectSignals,
  touchesReferenceLayer,
  hasRemonteeAck,
} = require("../../.githooks/remontee.js");

// ---- detectSignals ----

test("detectSignals: firestore.rules déclenche", () => {
  assert.deepEqual(detectSignals("", ["firestore.rules"]), ["firestore.rules"]);
});

test("detectSignals: ligne ajoutée citant IM-7 déclenche", () => {
  const diff = "@@ -0,0 +1 @@\n+// respecte IM-7 (proxy d'Axel)\n";
  const s = detectSignals(diff, ["functions/src/chat/tools.js"]);
  assert.ok(s.includes("IM-x/PM-x"));
});

test("detectSignals: ligne retirée citant PM-12 déclenche", () => {
  const diff = "@@ -1 +0,0 @@\n-// flux PM-12\n";
  assert.ok(detectSignals(diff, ["x.js"]).includes("IM-x/PM-x"));
});

test("detectSignals: en-têtes de diff (+++/---) ignorés", () => {
  const diff = "--- a/IM-1.txt\n+++ b/IM-1.txt\n";
  assert.deepEqual(detectSignals(diff, ["IM-1.txt"]), []);
});

test("detectSignals: code sans IM/PM ne déclenche pas", () => {
  const diff = "@@ -1 +1 @@\n-const a = 1\n+const a = 2\n";
  assert.deepEqual(detectSignals(diff, ["functions/src/x.js"]), []);
});

test("detectSignals: les deux signaux cumulés", () => {
  const diff = "@@ -0,0 +1 @@\n+// IM-1\n";
  const s = detectSignals(diff, ["firestore.rules", "functions/src/x.js"]);
  assert.deepEqual(s.sort(), ["IM-x/PM-x", "firestore.rules"]);
});

// ---- touchesReferenceLayer ----

test("touchesReferenceLayer: PRODUIT/MODELE = cas descendant", () => {
  assert.equal(
      touchesReferenceLayer(["docs/MODELE.md", "functions/src/x.js"]), true);
  assert.equal(touchesReferenceLayer(["functions/src/x.js"]), false);
});

// ---- hasRemonteeAck ----

test("hasRemonteeAck: « Remontée: non — … » reconnu", () => {
  assert.equal(hasRemonteeAck("fix\n\nRemontée: non — simple renvoi"), true);
});

test("hasRemonteeAck: sans accent « Remontee: soumise » reconnu", () => {
  assert.equal(hasRemonteeAck("x\n\nRemontee: soumise"), true);
});

test("hasRemonteeAck: absent → false", () => {
  assert.equal(hasRemonteeAck("juste un message"), false);
});

test("hasRemonteeAck: « Remontée: » sans valeur → false", () => {
  assert.equal(hasRemonteeAck("x\nRemontée:   "), false);
});
