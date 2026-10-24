/* eslint-disable max-len */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Partie pure de la pile (UMD servi au navigateur, require-able ici).
const {signal, compare, question, DAY_MS} =
  require("../../public/js/aside.js");

const NOW = Date.UTC(2026, 9, 11, 12);
const ago = (d) => NOW - d * DAY_MS;
const uts = (ms) => Math.floor(ms / 1000);

test("signal : 3 jours distincts après la mise de côté → prêt", () => {
  const e = {at: ago(20)};
  const days = [uts(ago(25)), uts(ago(10)), uts(ago(5)), uts(ago(1))];
  assert.deepEqual(signal(e, days, NOW), {kind: "ready", days: 3});
});

test("signal : « Garder » remet la date au jour → les jours d'avant ne comptent plus", () => {
  const days = [uts(ago(10)), uts(ago(5)), uts(ago(1))];
  assert.equal(signal({at: ago(2)}, days, NOW).kind, "new");
});

test("signal : plus de 3 mois sans 3 jours d'écoute → oublié", () => {
  assert.equal(signal({at: ago(92)}, [uts(ago(50))], NOW).kind, "old");
  assert.equal(signal({at: ago(80)}, [], NOW).kind, "new");
  assert.equal(signal({at: ago(92)}, undefined, NOW).kind, "old");
});

const item = (k, kind, at, star, snooze) =>
  ({a: {album_sur: k}, entry: {at, star, snooze_until: snooze}, sig: {kind}});

test("compare : envie forte, puis prêt, à découvrir, oublié ; puis le plus ancien", () => {
  const l = [
    item("old", "old", ago(200)),
    item("new2", "new", ago(5)),
    item("new1", "new", ago(9)),
    item("ready", "ready", ago(3)),
    item("star", "old", ago(100), true),
  ].sort(compare);
  assert.deepEqual(l.map((x) => x.a.album_sur),
      ["star", "ready", "new1", "new2", "old"]);
});

test("question : prêt ou oublié, pas une question reportée", () => {
  const l = [
    item("snoozed", "ready", ago(30), false, NOW + DAY_MS),
    item("new", "new", ago(5)),
    item("old", "old", ago(120)),
  ];
  assert.equal(question(l, NOW).a.album_sur, "old");
  assert.equal(question([item("new", "new", ago(5))], NOW), null);
  const expired = item("s", "ready", ago(30), false, NOW - 1);
  assert.equal(question([expired], NOW).a.album_sur, "s");
});
