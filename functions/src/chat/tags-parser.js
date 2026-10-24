"use strict";

const {TAGS, BY_TAG} = require("./tags-spec");

// Tous les types de tags connus. Le contenu peut s'étendre sur plusieurs
// lignes (ex : commentaire avec sauts de ligne).
const TAG_RE = /\[([A-Z]+):\s*([\s\S]+?)\](?=[\s\n]|$)/g;

/**
 * Parse le contenu d'un tag [SUGGEST: ...] en tableau de commandes.
 * Supporte les guillemets pour les suggestions multi-mots.
 * Ex: '/oddity /album "Mac Miller"' → ['/oddity', '/album', 'Mac Miller']
 * @param {string} content
 * @return {string[]}
 */
function parseSuggestContent(content) {
  const parts = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(content.trim())) !== null) {
    parts.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return parts.filter(Boolean);
}

/**
 * Parse des paires key=value ou key="valeur entre guillemets".
 * @param {string} str
 * @return {Object}
 */
function parseKv(str) {
  const result = {};
  const re = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    result[m[1]] = m[2] !== undefined ? m[2].replace(/\\"/g, "\"") : m[3];
  }
  return result;
}

/**
 * Normalise un album_sur extrait d'un tag. Le contexte injecte les clés sous la
 * forme `[id:album_sur]` ; Orphée recopie parfois le jeton AVEC son préfixe
 * `id:` (et/ou les crochets). On retire ce préfixe de façon déterministe — ce
 * n'est pas de l'interprétation, juste le nettoyage d'un artefact de notre
 * propre format de contexte. Un vrai album_sur (`{artiste}-{album}`) ne
 * commence jamais par `id:`.
 * @param {string} s
 * @return {string}
 */
function normalizeAlbumSur(s) {
  return String(s == null ? "" : s)
      .trim()
      .replace(/^\[?\s*id:\s*/i, "")
      .replace(/\]$/, "")
      .trim();
}

/**
 * Parse [GRADE: album_sur grade=X commentaire="..."]. Un ancien
 * personal_fav=… est ignoré (coup de cœur fusionné dans la note 5, v3).
 * album_sur = tout ce qui précède le premier " mot=".
 * @param {string} content
 * @return {Object}
 */
function parseGrade(content) {
  const firstKv = content.search(/\s+\w+\s*=/);
  if (firstKv < 0) return {album_sur: normalizeAlbumSur(content)};
  const albumSur = normalizeAlbumSur(content.slice(0, firstKv));
  const kv = parseKv(content.slice(firstKv));
  return {
    album_sur: albumSur,
    grade: kv.grade !== undefined ? parseInt(kv.grade, 10) : undefined,
    commentaire: kv.commentaire,
  };
}

/**
 * Parse [COMMENT: album_sur "texte de la description"]. album_sur précède le
 * texte, attendu entre guillemets doubles. Repli sans guillemets : premier
 * token = album_sur, reste = texte.
 * @param {string} content
 * @return {Object}
 */
function parseComment(content) {
  const quoted = content.match(/^([\s\S]*?)\s+"([\s\S]*)"\s*$/);
  if (quoted) {
    return {album_sur: normalizeAlbumSur(quoted[1]), commentaire: quoted[2]};
  }
  const idx = content.search(/\s/);
  if (idx < 0) return {album_sur: normalizeAlbumSur(content), commentaire: ""};
  return {
    album_sur: normalizeAlbumSur(content.slice(0, idx)),
    commentaire: content.slice(idx + 1).trim(),
  };
}

// Parseurs de contenu par tag d'action. C'est la part « logique » du tag
// (extraction des champs depuis le contenu brut) : elle vit dans le code, pas
// dans le spec de données. `valid` reproduit les gardes d'origine — seules les
// actions valides sont émises vers le client.
const ACTION_HANDLERS = {
  GRADE: {parse: parseGrade, valid: (p) => Boolean(p.album_sur)},
  UNGRADE: {
    parse: (c) => ({album_sur: normalizeAlbumSur(c)}),
    valid: () => true,
  },
  COMMENT: {
    parse: parseComment,
    valid: (p) => Boolean(p.album_sur && p.commentaire),
  },
};

// Garde-fou (Éliminer > Bloquer > Rappeler) : tout tag déclaré kind:action
// dans le spec DOIT avoir un handler ici, sinon le module refuse de charger.
for (const t of TAGS) {
  if (t.kind === "action" && !ACTION_HANDLERS[t.tag]) {
    throw new Error(
        `tags-parser : ${t.tag} est kind:action dans tags-spec mais n'a ` +
        "aucun handler de contenu.");
  }
}

/**
 * Extrait tous les tags de la réponse Orphée :
 * - retire les tags du texte affiché
 * - retourne les suggestions [SUGGEST] et les actions Firestore (GRADE…)
 *
 * Le dispatch est piloté par tags-spec.js (source unique) : aucun tag n'est
 * codé en dur ici. Un tag inconnu est simplement retiré du texte.
 * @param {string} text - réponse brute d'Anthropic
 * @return {{cleanText: string, suggestions: string[], actions: Object[]}}
 */
function parseTags(text) {
  const suggestions = [];
  const actions = [];

  const cleanText = text
      .replace(new RegExp(TAG_RE.source, "g"), (match, type, content) => {
        const spec = BY_TAG[type];
        if (spec && spec.kind === "suggestion") {
          suggestions.push(...parseSuggestContent(content));
        } else if (spec && spec.kind === "action") {
          const handler = ACTION_HANDLERS[spec.tag];
          const payload = handler.parse(content);
          if (handler.valid(payload)) {
            actions.push({type: spec.action, ...payload});
          }
        }
        // kind:strip, ou tag inconnu : retiré du texte, aucune action.
        return "";
      })
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  return {cleanText, suggestions, actions};
}

// Alias pour compatibilité ascendante
exports.parseSuggest = parseTags;
exports.parseTags = parseTags;
exports.parseSuggestContent = parseSuggestContent;
