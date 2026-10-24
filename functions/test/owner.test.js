"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {isOwnerToken, normEmail} = require("../src/lib/owner");

test("normEmail: casse et espaces", () => {
  assert.equal(normEmail("  Axel@Example.COM "), "axel@example.com");
  assert.equal(normEmail(null), "");
});

test("isOwnerToken: seul l'email vérifié du propriétaire passe", () => {
  const owner = "axel@example.com";
  assert.equal(isOwnerToken(
      {email: "Axel@example.com", email_verified: true}, owner), true);
  // Un autre compte Google.
  assert.equal(isOwnerToken(
      {email: "x@example.com", email_verified: true}, owner), false);
  // Email non vérifié.
  assert.equal(isOwnerToken(
      {email: owner, email_verified: false}, owner), false);
  // Compte anonyme (pas d'email).
  assert.equal(isOwnerToken({}, owner), false);
  // Propriétaire non désigné : échec fermé.
  assert.equal(isOwnerToken({email: owner, email_verified: true}, ""), false);
  assert.equal(isOwnerToken(null, owner), false);
});
