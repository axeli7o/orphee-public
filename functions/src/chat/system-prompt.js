"use strict";

// Le system prompt d'Orphée n'est PAS écrit ici. Il est chargé depuis
// orphee.skill.md, généré à partir de docs/SKILL.md (source de vérité unique)
// au déploiement (npm run gen-prompt). Repli dev : génération à la volée si
// l'artefact est absent (clone frais, emulator lancé sans gen préalable).
const fs = require("fs");
const path = require("path");

const GENERATED = path.join(__dirname, "orphee.skill.md");

let prompt;
try {
  prompt = fs.readFileSync(GENERATED, "utf8");
} catch (e) {
  prompt = require("../../gen-prompt").generate();
}

/**
 * Emballe le system prompt en un bloc `text` portant un point de cache
 * Anthropic (`cache_control: ephemeral`). Le prompt étant stable d'un message à
 * l'autre, ce breakpoint cache à la fois les `tools` et le `system` (ordre de
 * rendu : tools → system → messages) : seul le contexte dynamique, injecté plus
 * loin dans le message utilisateur, reste hors cache. TTL ~5 min ; seuil mini
 * de préfixe cachable sur claude-sonnet-4-6 = 2048 tokens (le prompt dépasse).
 * @param {string} text le system prompt
 * @return {Array<Object>} blocs `system` prêts pour l'API Anthropic
 */
function cachedSystem(text) {
  return [{type: "text", text, cache_control: {type: "ephemeral"}}];
}

exports.SYSTEM_PROMPT = prompt;
exports.SYSTEM_BLOCKS = cachedSystem(prompt);
exports.cachedSystem = cachedSystem;
