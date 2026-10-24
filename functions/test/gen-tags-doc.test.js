"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {renderTable, applyTable, START, END} =
  require("../gen-tags-doc");
const {TAGS} = require("../src/chat/tags-spec");

// ---- renderTable ----

test("renderTable(effect): en-tête Tag|Effet, pipes échappés", () => {
  const md = renderTable("effect");
  assert.ok(md.startsWith("| Tag | Effet |\n|-----|-------|\n"));
  // Chaque ligne = exactement 2 colonnes : aucun pipe de syntaxe non échappé.
  for (const line of md.trim().split("\n")) {
    assert.equal(line.replace(/\\\|/g, "").split("|").length - 1, 3, line);
  }
  assert.ok(md.includes("[GRADE: album_sur grade=X commentaire=\"...\"]"));
  assert.ok(md.includes("| Note un album |"));
});

test("renderTable(spec): en-tête Tag|Traitement|Effet, strip détaillé", () => {
  const md = renderTable("spec");
  assert.ok(md.startsWith("| Tag | Traitement | Effet |\n|---|---|---|\n"));
  // chaque tag strip a sa propre ligne (plus de groupage)
  assert.ok(md.includes("`[FOCUS: album_sur]` | retiré du texte (v0.1)"));
  assert.ok(md.includes("`[FILTER: type=X value=Y]` | retiré du texte (v0.1)"));
});

test("renderTable: une ligne par tag du spec + l'en-tête", () => {
  const lines = renderTable("effect").split("\n");
  assert.equal(lines.length, TAGS.length + 2); // header + séparateur
});

// ---- applyTable ----

const wrap = (inner) => `avant\n\n${START}\n${inner}\n${END}\n\naprès\n`;

test("applyTable: injecte entre les marqueurs, préserve l'entourage", () => {
  const out = applyTable(wrap("VIEUX CONTENU"), "effect", "x");
  assert.ok(out.startsWith("avant\n"));
  assert.ok(out.endsWith("après\n"));
  assert.ok(!out.includes("VIEUX CONTENU"));
  assert.ok(out.includes("| Tag | Effet |"));
});

test("applyTable: idempotent (régénérer ne change plus rien)", () => {
  const once = applyTable(wrap("x"), "spec", "x");
  const twice = applyTable(once, "spec", "x");
  assert.equal(twice, once);
});

test("applyTable: préserve les fins de ligne CRLF", () => {
  const crlf = `avant\r\n${START}\r\nx\r\n${END}\r\naprès\r\n`;
  const out = applyTable(crlf, "effect", "x");
  assert.ok(out.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(out)); // aucun LF non précédé d'un CR
});

test("applyTable: marqueurs absents → erreur", () => {
  assert.throws(() => applyTable("aucun marqueur ici", "effect", "x"),
      /marqueurs/);
});
