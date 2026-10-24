"use strict";

// Lecture LIVE de la curation pour Orphée (IM-1/IM-5/IM-6, ADR-031). La
// Curation (note, coup de cœur, description, genre) est possédée par
// l'Utilisateur et vit dans `users/{uid}/grades` — ce n'est PAS un dérivé. Le
// cache en porte une projection figée au dernier refresh : ne JAMAIS s'y fier
// pour la valeur COURANTE. Ce module superpose la source live sur tout item
// rapporté par Orphée (contexte, query_albums) — miroir serveur de
// `library.applyCuration` (front).

const {GRADE_LABELS} = require("../grades");

/**
 * Charge la curation live de l'utilisateur : album_sur → doc grades.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @return {Promise<Map<string, Object>>}
 */
async function loadCurationMap(db, uid) {
  const map = new Map();
  if (!uid) return map;
  const snap = await db.collection(`users/${uid}/grades`).get();
  snap.forEach((d) => map.set(d.id, d.data()));
  return map;
}

/**
 * Superpose la curation live sur un item (mutation en place + retour). La note,
 * le coup de cœur et la description viennent de la source ; absente = non noté.
 * grade_label est dérivé de la note (jamais lu d'une projection).
 * @param {Object} item objet portant un album_sur
 * @param {Map<string, Object>} map sortie de loadCurationMap
 * @return {Object} le même item, curation à jour
 */
function overlay(item, map) {
  if (!item) return item;
  const c = map.get(item.album_sur);
  const grade = c && c.grade !== undefined && c.grade !== null ? c.grade : null;
  item.grade = grade;
  item.grade_label = grade === null ? null : (GRADE_LABELS[grade] || null);
  item.personal_fav = c ? !!c.personal_fav : false;
  if (c && c.commentaire != null) item.commentaire = c.commentaire;
  if (c && c.genre) item.genre = c.genre;
  if (c && c.sousgenre) item.sousgenre = c.sousgenre;
  return item;
}

/**
 * Superpose la curation live sur une liste (en place).
 * @param {Object[]} items
 * @param {Map<string, Object>} map
 * @return {Object[]} la même liste
 */
function overlayList(items, map) {
  for (const it of items || []) overlay(it, map);
  return items;
}

module.exports = {loadCurationMap, overlay, overlayList};
