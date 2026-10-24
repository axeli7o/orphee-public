/* Aperçu Orphée — navigation entre écrans réels (tap, flèches, points, swipe). */
(function () {
  "use strict";

  var SCREENS = [
    {img: "01-moi", title: "Moi — ton portrait d'écoute",
      sub: "Phases du moment, genres dominants, années : ce que tes écoutes racontent."},
    {img: "02-bibliotheque", title: "Bibliothèque",
      sub: "Tes albums rangés en bacs, comme chez un disquaire : Adorés, par genre, paradoxes."},
    {img: "03-fiche-album", title: "Fiche album",
      sub: "Noter de 1 à 5, genre, écoutes dans le temps, ouvrir sur YT Music."},
    {img: "04-tes-mondes", title: "Tes mondes",
      sub: "Ce que tu écoutes ensemble, regroupé en archipels d'artistes."},
    {img: "06-salon", title: "Le Salon",
      sub: "Orphée, l'agent qui lit ta curation et agit en ton nom — jamais de lui-même."},
    {img: "05-qualite", title: "Qualité",
      sub: "Corriger les rattachements d'albums, par lots, toujours annulables."},
    {img: "07-reglages", title: "Réglages",
      sub: "Compte Last.fm, partage invité d'une heure, réglage des paradoxes."}
  ];

  var img = document.getElementById("pv-img");
  var screen = document.getElementById("pv-screen");
  var titleEl = document.getElementById("pv-title");
  var subEl = document.getElementById("pv-sub");
  var dotsEl = document.getElementById("pv-dots");
  var prevBtn = document.getElementById("pv-prev");
  var nextBtn = document.getElementById("pv-next");
  var i = 0;

  SCREENS.forEach(function (s, k) {
    var d = document.createElement("button");
    d.className = "pv-dot";
    d.type = "button";
    d.setAttribute("aria-label", s.title);
    d.addEventListener("click", function () { go(k); });
    dotsEl.appendChild(d);
  });
  var dots = dotsEl.querySelectorAll(".pv-dot");

  function render() {
    var s = SCREENS[i];
    img.src = "/preview/shots/" + s.img + ".webp";
    img.alt = s.title;
    titleEl.textContent = s.title;
    subEl.textContent = s.sub;
    screen.scrollTop = 0;
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle("on", k === i);
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === SCREENS.length - 1;
  }
  function go(k) {
    i = Math.max(0, Math.min(SCREENS.length - 1, k));
    render();
  }

  prevBtn.addEventListener("click", function () { go(i - 1); });
  nextBtn.addEventListener("click", function () { go(i + 1); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") go(i - 1);
    if (e.key === "ArrowRight") go(i + 1);
  });

  // Swipe horizontal sur l'écran (sans gêner le défilement vertical).
  var x0 = null, y0 = null;
  screen.addEventListener("touchstart", function (e) {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, {passive: true});
  screen.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i - (dx > 0 ? 1 : -1));
    x0 = y0 = null;
  }, {passive: true});

  render();
})();
