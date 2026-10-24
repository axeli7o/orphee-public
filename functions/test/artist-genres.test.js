"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {artistDocId} = require("../src/refresh/curation");

test("artistDocId: un « / » dans le nom donne un id Firestore valide", () => {
  const id = artistDocId("AC/DC");
  assert.ok(!id.includes("/"));
  assert.equal(decodeURIComponent(id), "AC/DC");
});
