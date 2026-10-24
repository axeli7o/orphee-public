"use strict";

// Génère le system prompt d'Orphée depuis docs/SKILL.md (source unique,
// écrite à la main). Produit la copie chargée au runtime par la Function :
// functions/src/chat/orphee.skill.md, régénérée à chaque déploiement.
// Ne jamais éditer cette copie à la main.

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "docs", "SKILL.md");
const OUT = path.join(__dirname, "src", "chat", "orphee.skill.md");

/**
 * Extrait le system prompt du markdown de SKILL.md : tout depuis la première
 * section « ## » jusqu'à la fin (on retire le frontmatter et le préambule du
 * document, qui ne s'adressent pas au modèle).
 * @param {string} markdown contenu brut de SKILL.md
 * @return {string} le prompt prêt à être envoyé au modèle
 */
function buildPrompt(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s/.test(l));
  if (start === -1) throw new Error("SKILL.md : aucune section « ## »");
  return lines.slice(start).join("\n").trim() + "\n";
}

/**
 * Lit SKILL.md, construit le prompt et l'écrit dans orphee.skill.md.
 * @return {string} le prompt généré
 */
function generate() {
  const prompt = buildPrompt(fs.readFileSync(SRC, "utf8"));
  fs.writeFileSync(OUT, prompt, "utf8");
  return prompt;
}

if (require.main === module) {
  const out = generate();
  console.log(`gen-prompt OK : ${out.length} caractères -> ${OUT}`);
}

module.exports = {buildPrompt, generate, SRC, OUT};
