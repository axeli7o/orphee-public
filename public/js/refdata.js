// Référentiel partagé (notes + genres), possédé par l'app. Chargé avant
// library.js / stats.js / detail.js / settings.js. Voir ADR-013.
// Le bloc des NOTES (échelle + couleurs) est GÉNÉRÉ depuis
// functions/src/grades.js (source unique, ADR-026) — ne pas l'éditer à la main :
// `npm --prefix functions run gen`. Les GENRES restent écrits à la main.
// grades:gen:start
window.ORPHEE_GRADES = {
  1: "Zappé", 2: "Sympa", 3: "Génial", 4: "Culte", 5: "Adoré",
};

// Code couleur des notes (badges biblio, stats, modale). bg = fond, fg = texte.
window.ORPHEE_GRADE_COLORS = {
  1: {bg: "#6b6b73", fg: "#e8eae9"},  // Zappé
  2: {bg: "#5a9cdc", fg: "#08121c"},  // Sympa
  3: {bg: "#3fc58e", fg: "#062012"},  // Génial
  4: {bg: "#ff5fa2", fg: "#2a0716"},  // Culte
  5: {bg: "#e0a23f", fg: "#241804"},  // Adoré
};
// grades:gen:end

// Couleur de chaque genre (statistiques, fiche album) — une seule fois ici.
window.ORPHEE_GENRE_COLORS = {
  Rap: "#e0a23f", Electro: "#45d4ad", Rock: "#ff5fa2",
  Pop: "#c084fc", Classical: "#5a9cdc", Jazz: "#f0a35e",
  Reggae: "#6fbf73", Blues: "#7aa0c4", Podcast: "#9aa39e",
};

window.ORPHEE_GENRES = [
  {genre: "Jazz", sousgenres: ["Jazz"]},
  {genre: "Blues", sousgenres: ["Blues"]},
  {genre: "Electro", sousgenres: [
    "Ambiant", "House", "Techno", "Dubstep", "Drum'n'bass", "Dance",
    "Dancehall", "Downtempo", "Instrumental", "Funk", "Disco", "Pop",
  ]},
  {genre: "Classical", sousgenres: [
    "Movies", "Ambiance", "Baroque", "Classical", "Romantic", "20th", "Modern",
  ]},
  {genre: "Pop", sousgenres: ["Pop", "RnB", "Soul", "Folk"]},
  {genre: "Rap", sousgenres: ["Old School", "Modern", "Trap", "Cloud", "Fusion"]},
  {genre: "Reggae", sousgenres: ["Reggae", "Dub"]},
  {genre: "Podcast", sousgenres: ["Podcast"]},
  {genre: "Rock", sousgenres: [
    "Oldies", "Hard", "Metal", "Alternative", "Contemporary", "Punk",
  ]},
];
