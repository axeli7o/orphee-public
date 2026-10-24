"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {newToken, hashToken, isValidToken, DURATION_MS} =
  require("../src/share");

test("newToken: 43 caractères base64url, jamais deux fois le même", () => {
  const a = newToken();
  const b = newToken();
  assert.equal(isValidToken(a), true);
  assert.notEqual(a, b);
});

test("isValidToken: refuse tout ce qui n'a pas la forme d'un jeton", () => {
  assert.equal(isValidToken("court"), false);
  assert.equal(isValidToken("a".repeat(43) + "/"), false);
  assert.equal(isValidToken("../" + "a".repeat(40)), false);
  assert.equal(isValidToken(null), false);
  assert.equal(isValidToken(42), false);
});

test("hashToken: empreinte stable, ne révèle pas le jeton", () => {
  const t = newToken();
  assert.equal(hashToken(t), hashToken(t));
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(t).includes(t), false);
});

test("durée de l'accès : 1 h", () => {
  assert.equal(DURATION_MS, 3600 * 1000);
});
