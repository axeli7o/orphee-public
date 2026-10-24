"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {cachedSystem, SYSTEM_BLOCKS, SYSTEM_PROMPT} =
  require("../src/chat/system-prompt");

// ---- cachedSystem (fonction pure) ----

test("cachedSystem: un seul bloc text avec cache_control ephemeral", () => {
  const blocks = cachedSystem("prompt stable");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
  assert.equal(blocks[0].text, "prompt stable");
  assert.deepEqual(blocks[0].cache_control, {type: "ephemeral"});
});

test("cachedSystem: le dernier bloc porte le point de cache", () => {
  // Le breakpoint doit être sur le DERNIER bloc system (il cache tools+system).
  const blocks = cachedSystem("x");
  const last = blocks[blocks.length - 1];
  assert.deepEqual(last.cache_control, {type: "ephemeral"});
});

// ---- SYSTEM_BLOCKS (câblage réel envoyé à l'API) ----

test("SYSTEM_BLOCKS: garde-fou — caching branché sur le prompt réel", () => {
  assert.ok(Array.isArray(SYSTEM_BLOCKS));
  const last = SYSTEM_BLOCKS[SYSTEM_BLOCKS.length - 1];
  assert.deepEqual(last.cache_control, {type: "ephemeral"},
      "le system envoyé à Anthropic doit porter cache_control ephemeral");
  assert.equal(last.text, SYSTEM_PROMPT);
  assert.ok(SYSTEM_PROMPT.length > 0, "system prompt non vide");
});
