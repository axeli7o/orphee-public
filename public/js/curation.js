/* Orphée — Builder de curation PUR et PARTAGÉ (ADR-027).
   Source unique de la logique « action|saisie → mutation users/{uid}/grades » :
   consommée par detail.js (saisie fiche) ET chat.js (proxy d'Orphée). Wrapper
   UMD : global navigateur (window.OrpheeCuration) ET require() côté tests Node
   (functions/test/curation.test.js). Aucune dépendance, aucun I/O Firestore
   (la coquille appelante applique la mutation et injecte les serverTimestamp).
   NE STOCKE JAMAIS grade_label (dérivé de grade — D-2). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // node (tests)
  } else {
    root.OrpheeCuration = api; // navigateur
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var GRADE_MIN = 1;
  var GRADE_MAX = 5;

  function isValidAlbumSur(id) {
    return typeof id === "string" && id.length > 0 && id.indexOf("/") === -1;
  }

  function isGradeInRange(grade) {
    return typeof grade === "number" && isFinite(grade) &&
      Math.floor(grade) === grade && grade >= GRADE_MIN && grade <= GRADE_MAX;
  }

  function toStr(v) {
    return (v === undefined || v === null) ? "" : String(v);
  }

  // Libellé d'affichage dérivé de la note (jamais stocké). gradesMap =
  // window.ORPHEE_GRADES (capitales). Pour les events / mirrors UI uniquement.
  function gradeLabel(grade, gradesMap) {
    if (grade === undefined || grade === null) return null;
    return (gradesMap && gradesMap[grade]) || null;
  }

  function fail(reason, albumSur) {
    return {valid: false, reason: reason, album_sur: albumSur,
      op: null, merge: false, fields: null, timestamps: []};
  }

  // input : {type, album_sur, grade, personal_fav, commentaire, genre,
  //          sousgenre, isFirst}. type ∈ grade|flag|comment|ungrade.
  // retour : {valid, reason, album_sur, op:"set"|"delete"|null, merge,
  //           fields, timestamps:[champs à passer en serverTimestamp]}.
  function buildCurationMutation(input) {
    input = input || {};
    var albumSur = input.album_sur;
    if (!isValidAlbumSur(albumSur)) return fail("album_sur invalide", albumSur);

    if (input.type === "ungrade") {
      return {valid: true, reason: null, album_sur: albumSur,
        op: "delete", merge: false, fields: null, timestamps: []};
    }

    if (input.type === "flag") {
      return {valid: true, reason: null, album_sur: albumSur, op: "set",
        merge: true, fields: {personal_fav: !!input.personal_fav},
        timestamps: ["updated_at"]};
    }

    if (input.type === "comment") {
      return {valid: true, reason: null, album_sur: albumSur, op: "set",
        merge: true, fields: {commentaire: toStr(input.commentaire)},
        timestamps: ["updated_at"]};
    }

    if (input.type === "grade") {
      // null autorisé (déclasser en gardant le reste) ; sinon entier 1..5.
      var raw = input.grade;
      var grade = (raw === undefined || raw === null || raw === "") ?
        null : Number(raw);
      if (grade !== null && !isGradeInRange(grade)) {
        return fail("note hors barème (1-5)", albumSur);
      }
      var fields = {
        grade: grade,
        personal_fav: !!input.personal_fav,
        commentaire: toStr(input.commentaire),
      };
      // Classification : incluse seulement si fournie (fiche detail), jamais
      // pour le chat (préserve genre/sousgenre via le merge).
      if (input.genre !== undefined) fields.genre = toStr(input.genre);
      if (input.sousgenre !== undefined) fields.sousgenre = toStr(input.sousgenre);
      var timestamps = ["updated_at"];
      if (input.isFirst) timestamps.push("graded_at");
      return {valid: true, reason: null, album_sur: albumSur, op: "set",
        merge: true, fields: fields, timestamps: timestamps};
    }

    return fail("type d'action inconnu", albumSur);
  }

  return {
    buildCurationMutation: buildCurationMutation,
    gradeLabel: gradeLabel,
    isGradeInRange: isGradeInRange,
    isValidAlbumSur: isValidAlbumSur,
  };
});
