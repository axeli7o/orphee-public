"use strict";

// Génère les tables de tags machine-readable dans la doc depuis la source
// unique functions/src/chat/tags-spec.js (ADR-025). Injecte le markdown entre
// les marqueurs <!-- tags:table:start --> / <!-- tags:table:end --> de chaque
// cible. Ne jamais éditer ces tables à la main : régénérées par `npm run gen`.
//
//   node gen-tags-doc.js          écrit les tables
//   node gen-tags-doc.js --check  ne touche à rien, sort en erreur si une
//                                 table a dérivé du spec (garde-fou pre-commit)

const fs = require("fs");
const path = require("path");

const {TAGS} = require("./src/chat/tags-spec");

const ROOT = path.join(__dirname, "..");
const START = "<!-- tags:table:start -->";
const END = "<!-- tags:table:end -->";

// Cibles et forme de table attendue. "effect" = Tag | Effet (prompt + dev) ;
// "spec" = Tag | Traitement | Effet (spécification technique).
const TARGETS = [
  {path: path.join(ROOT, "docs", "SKILL.md"), shape: "effect"},
  {path: path.join(ROOT, "CLAUDE.md"), shape: "effect"},
  {path: path.join(ROOT, "docs", "SPEC.md"), shape: "spec"},
];

/** Échappe les pipes pour une cellule de table markdown.
 * @param {string} s
 * @return {string}
 */
function cell(s) {
  return String(s).replace(/\|/g, "\\|");
}

/**
 * Rend la table markdown des tags pour une forme donnée.
 * @param {"effect"|"spec"} shape
 * @return {string} table sans saut de ligne final
 */
function renderTable(shape) {
  const rows = [];
  if (shape === "spec") {
    rows.push("| Tag | Traitement | Effet |");
    rows.push("|---|---|---|");
    for (const t of TAGS) {
      rows.push(`| \`${cell(t.syntax)}\` | ${cell(t.treatment)} | ` +
        `${cell(t.specEffect)} |`);
    }
  } else {
    rows.push("| Tag | Effet |");
    rows.push("|-----|-------|");
    for (const t of TAGS) {
      rows.push(`| \`${cell(t.syntax)}\` | ${cell(t.effect)} |`);
    }
  }
  return rows.join("\n");
}

/**
 * Calcule le contenu attendu d'un fichier avec sa table régénérée, en
 * préservant les fins de ligne et tout ce qui entoure les marqueurs.
 * @param {string} text contenu actuel du fichier
 * @param {"effect"|"spec"} shape
 * @param {string} label nom de fichier pour les messages d'erreur
 * @return {string} contenu attendu
 */
function applyTable(text, shape, label) {
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    throw new Error(
        `${label} : marqueurs ${START} / ${END} absents ou inversés.`);
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const table = renderTable(shape).split("\n").join(eol);
  const head = text.slice(0, s + START.length);
  const tail = text.slice(e);
  return `${head}${eol}${table}${eol}${tail}`;
}

/**
 * Génère (ou vérifie) toutes les cibles.
 * @param {{check: boolean}} opts {check:true} = vérifier sans écrire
 * @return {string[]} liste des fichiers désynchronisés (mode check) ou écrits
 */
function run(opts = {}) {
  const touched = [];
  for (const {path: p, shape} of TARGETS) {
    const label = path.relative(ROOT, p);
    const text = fs.readFileSync(p, "utf8");
    const next = applyTable(text, shape, label);
    if (next === text) continue;
    if (opts.check) {
      touched.push(label);
    } else {
      fs.writeFileSync(p, next, "utf8");
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
      console.error(
          "\n✖ Tables de tags désynchronisées de tags-spec.js :");
      touched.forEach((f) => console.error(`  - ${f}`));
      console.error("\nRégénère avec : npm run gen (dans functions/)\n");
      process.exit(1);
    }
    console.log("gen-tags-doc --check OK : tables synchronisées.");
  } else {
    console.log(touched.length ?
      `gen-tags-doc OK : ${touched.length} fichier(s) mis à jour.` :
      "gen-tags-doc OK : déjà à jour.");
  }
}

module.exports = {run, renderTable, applyTable, TARGETS, START, END};
