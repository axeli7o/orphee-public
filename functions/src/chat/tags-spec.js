"use strict";

// Source de vérité UNIQUE des tags machine-readable d'Orphée (ADR-025).
// Données pures, sans logique : le parser (tags-parser.js) en dérive son
// dispatch, et les tables de doc (SKILL.md, CLAUDE.md, SPEC.md) en sont
// générées par gen-tags-doc.js. Ne jamais redéfinir un tag ailleurs.
//
// Champs :
//   tag        nom en capitales, sans crochets
//   kind       "action" | "suggestion" | "strip"
//   action     (kind:action) type d'action émise vers le client
//   syntax     forme complète, pipes « | » bruts (échappés au rendu markdown)
//   effect     effet comportemental — colonne « Effet » de SKILL.md / CLAUDE.md
//   treatment  (colonne « Traitement » de SPEC.md) chaîne de traitement serveur
//   specEffect (colonne « Effet » de SPEC.md) effet technique
//
// kind:strip = retiré du texte affiché, aucune action en v0.1.

const TAGS = [
  {
    tag: "GRADE",
    kind: "action",
    action: "grade",
    syntax: "[GRADE: album_sur grade=X commentaire=\"...\"]",
    effect: "Note un album",
    treatment: "action serveur → écriture client",
    specEffect: "upsert curation",
  },
  {
    tag: "UNGRADE",
    kind: "action",
    action: "ungrade",
    syntax: "[UNGRADE: album_sur]",
    effect: "Retire la note",
    treatment: "action serveur → écriture client",
    specEffect: "suppression curation",
  },
  {
    // Obsolète (v3) : le coup de cœur est fusionné dans la note 5 (Adoré).
    // Gardé en kind:strip pour qu'un ancien réflexe d'Orphée ne s'affiche pas.
    tag: "FLAG",
    kind: "strip",
    syntax: "[FLAG: album_sur]",
    effect: "Obsolète — coup de cœur fusionné dans la note 5 (Adoré)",
    treatment: "retiré du texte (v3)",
    specEffect: "aucun effet (v3)",
  },
  {
    tag: "COMMENT",
    kind: "action",
    action: "comment",
    syntax: "[COMMENT: album_sur \"texte\"]",
    effect: "Ajoute/maj la description d'un album, **sans toucher la note**",
    treatment: "action serveur → écriture client",
    specEffect: "maj description (sans toucher la note)",
  },
  {
    tag: "NOTE",
    kind: "strip",
    syntax: "[NOTE: priority=N tags=[...] texte]",
    effect: "Note libre en mémoire musicale",
    treatment: "retiré du texte (v0.1)",
    specEffect: "aucun effet en v0.1",
  },
  {
    tag: "PREF",
    kind: "strip",
    syntax: "[PREF: key=value]",
    effect: "Préférence déclarée",
    treatment: "retiré du texte (v0.1)",
    specEffect: "aucun effet en v0.1",
  },
  {
    tag: "FOCUS",
    kind: "strip",
    syntax: "[FOCUS: album_sur]",
    effect: "L'app affiche l'album en détail",
    treatment: "retiré du texte (v0.1)",
    specEffect: "aucun effet en v0.1",
  },
  {
    tag: "FILTER",
    kind: "strip",
    syntax: "[FILTER: type=X value=Y]",
    effect: "L'app applique un filtre",
    treatment: "retiré du texte (v0.1)",
    specEffect: "aucun effet en v0.1",
  },
  {
    tag: "SUGGEST",
    kind: "suggestion",
    syntax: "[SUGGEST: cmd1 cmd2 \"mot un\" \"mot deux\"]",
    effect: "Chips de commandes — les tokens multi-mots doivent être entre " +
      "guillemets doubles",
    treatment: "suggestion serveur → chips client",
    specEffect: "chips de commandes",
  },
];

const BY_TAG = Object.fromEntries(TAGS.map((t) => [t.tag, t]));

module.exports = {TAGS, BY_TAG};
