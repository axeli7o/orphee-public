/* eslint-disable max-len */
"use strict";

// Génère, depuis la source unique functions/src/grades.js (ADR-026) :
//   - le bloc ORPHEE_GRADES / ORPHEE_GRADE_COLORS de public/js/refdata.js
//   - la table d'échelle de docs/SPEC.md (§ 6) et docs/SKILL.md
// entre marqueurs. Ne jamais éditer ces blocs à la main : `npm run gen`.
//
//   node gen-grades.js          écrit les blocs
//   node gen-grades.js --check  ne touche à rien, sort en erreur si un bloc a
//                               dérivé de la source (garde-fou pre-commit)

const fs = require("fs");
const path = require("path");

const {GRADES} = require("./src/grades");

const ROOT = path.join(__dirname, "..");

/** Corps JS du bloc refdata (sans les lignes de marqueurs).
 * @return {string}
 */
function renderRefdata() {
  const lines = [];
  lines.push("window.ORPHEE_GRADES = {");
  lines.push("  " + GRADES.map((g) => `${g.value}: ${JSON.stringify(g.label)}`).join(", ") + ",");
  lines.push("};");
  lines.push("");
  lines.push("// Code couleur des notes (badges biblio, stats, modale). bg = fond, fg = texte.");
  lines.push("window.ORPHEE_GRADE_COLORS = {");
  for (const g of GRADES) {
    lines.push(`  ${g.value}: {bg: ${JSON.stringify(g.color.bg)}, fg: ${JSON.stringify(g.color.fg)}},  // ${g.label}`);
  }
  lines.push("};");
  return lines.join("\n");
}

/** Table markdown de l'échelle (notes 5 → 1, comme l'existant).
 * @param {string} headLabel en-tête de la colonne libellé ("Libellé"|"Label")
 * @return {string}
 */
function renderTable(headLabel) {
  const rows = [];
  rows.push(`| Note | ${headLabel} | Sens |`);
  rows.push("|---|---|---|");
  for (const g of [...GRADES].reverse()) {
    rows.push(`| ${g.value} | ${g.label} | ${g.sens} |`);
  }
  return rows.join("\n");
}

const TARGETS = [
  {
    path: path.join(ROOT, "public", "js", "refdata.js"),
    start: "// grades:gen:start",
    end: "// grades:gen:end",
    body: () => renderRefdata(),
  },
  {
    path: path.join(ROOT, "docs", "SPEC.md"),
    start: "<!-- grades:table:start -->",
    end: "<!-- grades:table:end -->",
    body: () => renderTable("Libellé"),
  },
  {
    path: path.join(ROOT, "docs", "SKILL.md"),
    start: "<!-- grades:table:start -->",
    end: "<!-- grades:table:end -->",
    body: () => renderTable("Label"),
  },
];

/** Contenu attendu d'un fichier, bloc régénéré entre ses marqueurs.
 * @param {string} text contenu actuel
 * @param {string} start marqueur d'ouverture
 * @param {string} end marqueur de fermeture
 * @param {string} body corps à injecter
 * @param {string} label nom de fichier (messages d'erreur)
 * @return {string}
 */
function apply(text, start, end, body, label) {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s === -1 || e === -1 || e < s) {
    throw new Error(`${label} : marqueurs ${start} / ${end} absents ou inversés.`);
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const block = body.split("\n").join(eol);
  return text.slice(0, s + start.length) + eol + block + eol + text.slice(e);
}

/** Génère (ou vérifie) toutes les cibles.
 * @param {{check: boolean}} opts {check:true} = vérifier sans écrire
 * @return {string[]} fichiers désynchronisés (check) ou écrits
 */
function run(opts = {}) {
  const touched = [];
  for (const t of TARGETS) {
    const label = path.relative(ROOT, t.path);
    const text = fs.readFileSync(t.path, "utf8");
    const next = apply(text, t.start, t.end, t.body(), label);
    if (next === text) continue;
    if (opts.check) {
      touched.push(label);
    } else {
      fs.writeFileSync(t.path, next, "utf8");
      touched.push(label);
    }
  }
  return touched;
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  const touched = run({check});
  if (check) {
    if (touched.length) {
      console.error("\n✖ Référentiel des notes désynchronisé de functions/src/grades.js :");
      touched.forEach((f) => console.error(`  - ${f}`));
      console.error("\nRégénère avec : npm --prefix functions run gen\n");
      process.exit(1);
    }
    console.log("gen-grades --check OK : référentiel des notes synchronisé.");
  } else {
    console.log(touched.length ?
      `gen-grades OK : ${touched.length} fichier(s) mis à jour.` :
      "gen-grades OK : déjà à jour.");
  }
}

module.exports = {run, renderRefdata, renderTable, TARGETS};
