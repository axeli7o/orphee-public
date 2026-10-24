"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {parseTags} = require("../src/chat/tags-parser");

// ---- [COMMENT] ----

test("parseTags: [COMMENT] → action comment, tag retiré du texte", () => {
  const raw = "Voilà, c'est noté dans la fiche.\n" +
    "[COMMENT: Burial-Untrue \"L'album des trajets sous la pluie.\"]";
  const {cleanText, actions} = parseTags(raw);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    type: "comment",
    album_sur: "Burial-Untrue",
    commentaire: "L'album des trajets sous la pluie.",
  });
  assert.equal(cleanText, "Voilà, c'est noté dans la fiche.");
});

test("parseTags: [COMMENT] gère un album_sur avec espaces et tirets", () => {
  const {actions} = parseTags(
      "[COMMENT: Daft Punk-Discovery \"Découvert tard, adoré vite.\"]");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].album_sur, "Daft Punk-Discovery");
  assert.equal(actions[0].commentaire, "Découvert tard, adoré vite.");
});

test("parseTags: [COMMENT] sans texte → aucune action", () => {
  const {actions} = parseTags("[COMMENT: Burial-Untrue \"\"]");
  assert.equal(actions.length, 0);
});

test("parseTags: [COMMENT] ne porte pas de note (distinct de grade)", () => {
  const {actions} = parseTags(
      "[COMMENT: Moderat-II \"Je le relance tout le temps.\"]");
  assert.equal(actions[0].type, "comment");
  assert.equal(actions[0].grade, undefined);
});

// ---- coexistence avec les autres tags ----

test("parseTags: GRADE et COMMENT extraits ensemble", () => {
  const raw = "C'est fait.\n" +
    "[GRADE: Radiohead-In Rainbows grade=5 personal_fav=true]\n" +
    "[COMMENT: Radiohead-In Rainbows \"Le pilier.\"]";
  const {actions} = parseTags(raw);
  const types = actions.map((a) => a.type).sort();
  assert.deepEqual(types, ["comment", "grade"]);
  const grade = actions.find((a) => a.type === "grade");
  assert.equal(grade.grade, 5);
  // Coup de cœur fusionné dans la note 5 (v3) : un ancien personal_fav est
  // ignoré.
  assert.equal(grade.personal_fav, undefined);
});

test("parseTags: GRADE avec commentaire inline reste inchangé", () => {
  const {actions} = parseTags(
      "[GRADE: A-B grade=4 commentaire=\"sympa\"]");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "grade");
  assert.equal(actions[0].commentaire, "sympa");
});

// ---- dispatch piloté par tags-spec ----

test("parseTags: tag strip (FOCUS) → retiré du texte, aucune action", () => {
  const {cleanText, actions, suggestions} = parseTags(
      "Voici l'album.\n[FOCUS: Burial-Untrue]");
  assert.equal(actions.length, 0);
  assert.equal(suggestions.length, 0);
  assert.equal(cleanText, "Voici l'album.");
});

test("parseTags: tag inconnu → retiré du texte, aucune action", () => {
  const {cleanText, actions} = parseTags("Salut.\n[BIDON: nimporte quoi]");
  assert.equal(actions.length, 0);
  assert.equal(cleanText, "Salut.");
});

// ---- normalisation du préfixe "id:" recopié du contexte ----

test("parseTags: GRADE avec préfixe id: → album_sur nettoyé", () => {
  const {actions} = parseTags("[GRADE: id:Novelists-Coda grade=4]");
  assert.equal(actions[0].album_sur, "Novelists-Coda");
  assert.equal(actions[0].grade, 4);
});

test("parseTags: COMMENT avec préfixe id: → album_sur nettoyé", () => {
  const {actions} = parseTags("[COMMENT: id:Burial-Untrue \"Sous la pluie.\"]");
  assert.equal(actions[0].album_sur, "Burial-Untrue");
  assert.equal(actions[0].commentaire, "Sous la pluie.");
});

test("parseTags: FLAG obsolète (v3) → retiré du texte, aucune action", () => {
  const {cleanText, actions} = parseTags(
      "C'est noté.\n[FLAG: id:Daft Punk-Discovery personal_fav=true]");
  assert.equal(cleanText, "C'est noté.");
  assert.deepEqual(actions, []);
});

test("parseTags: UNGRADE avec préfixe id: → album_sur nettoyé", () => {
  const {actions} = parseTags("[UNGRADE: id:A-B]");
  assert.equal(actions[0].album_sur, "A-B");
});

test("parseTags: crochets [id:...] recopiés → album_sur nettoyé", () => {
  const {actions} = parseTags("[GRADE: [id:A-B grade=5]");
  assert.equal(actions[0].album_sur, "A-B");
});

test("parseTags: album_sur normal (sans id:) inchangé", () => {
  const {actions} = parseTags("[GRADE: Novelists-Coda grade=4]");
  assert.equal(actions[0].album_sur, "Novelists-Coda");
});
