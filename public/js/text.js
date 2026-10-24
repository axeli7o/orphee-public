/* Orphée — rendu sûr du texte d'Orphée (Salon, récits).
   Le texte est TOUJOURS échappé d'abord ; seuls deux marquages Markdown sont
   ensuite rendus : **gras** et *italique* (titres d'album, SKILL.md). Aucun
   autre HTML ne peut passer. */
(function () {
  "use strict";

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function rich(text) {
    return String(text == null ? "" : text)
        .replace(/[&<>"']/g, (c) => ESC[c])
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  }

  window.OrpheeText = { rich };
})();
