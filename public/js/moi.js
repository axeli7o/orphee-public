/* Orphée · Moi — écran d'accueil v3 (PM-18, étape 2 du plan).
   « Qui je suis » d'abord, puis ce qui se cache derrière. Coquille construite
   sur l'EXISTANT, toujours sur données réelles (ADR-028) :
   - identité : genres dominants (agg_stats.genre_distribution) ;
   - « Ceux qui me définissent » : top artistes ;
   - « Mes moments » : commuting matin / soir ;
   - « Mes écoutes par… » : le graphe des Stats, réutilisé tel quel ;
   - « Ce que j'adore » : albums notés 5 (et coups de cœur, legacy jusqu'à
     la fusion → 5), curation lue LIVE via la bibliothèque (ADR-031).
   - « Mes trimestres » : timeline des humeurs (agg_quarters, PM-19) — humeur
     calculée côté serveur par règles testées (quarters.js) ; ce module ne
     fait que la présenter.
   - « À qualifier » (PM-22) + netteté du portrait (PM-23) : matière récente
     servie par le serveur (agg_recent, selection.js) ; la sélection se fait
     ICI sur la curation LIVE, la note s'écrit via le builder partagé
     (curation.js, ADR-027). Axel seul note (IM-7) ; chaque retour d'impact
     est calculé, jamais inventé.
   Chapitres : étape suivante. Rien n'est simulé ici. */
(function () {
  "use strict";

  const viewEl = document.getElementById("view-moi");
  if (!viewEl) return;

  // Données à lire : les siennes, ou celles d'Axel pour un invité (PM-28).
  const dataUid = () => (window.OrpheeSession ? window.OrpheeSession.dataUid() : null);
  const guestMode = () => !!(window.OrpheeSession && window.OrpheeSession.isGuest());

  // Adorés et paradoxes : quelques exemples, « Voir les N » mène au bac.
  const EXAMPLES = 3;
  const IGNORED_GENRES = ["Non classé", "Podcast"];

  // Présentation des humeurs : couleur et description. Règles ET noms vivent
  // côté serveur (quarters.js : MOOD_RULES, mood_label).
  const MOODS = {
    exploration: { color: "#4fb8c9",
      desc: "Beaucoup d’albums nouveaux : l’humeur est à la découverte." },
    obsession: { color: "#e0a23f",
      desc: "Un album tourne en boucle et occupe une grande part de l’espace." },
    energie: { color: "#ff6b4a",
      desc: "Le rap domine : un trimestre qui cogne." },
    intensite: { color: "#b56ad8",
      desc: "Metal et rock dur dominent : on cherche la densité." },
    introspection: { color: "#5a7fdc",
      desc: "Classique, jazz, ambiant ou écoutes de nuit : un trimestre tourné vers l’intérieur." },
    ancrage: { color: "#3fc58e",
      desc: "Retour aux albums découverts il y a des années : on revient à ce qui tient." },
  };
  const QUARTER_MONTHS = ["janv.–mars", "avr.–juin", "juil.–sept.", "oct.–déc."];
  const pct = (x) => Math.round((x || 0) * 100) + " %";

  // « À qualifier » : file du jour + réponse en cours (survit aux rebuilds).
  const QZ_SIZE = 3;
  const QZ_MIN_HOT = 3; // écoutes récentes minimum pour proposer un album
  const SKIP_KEY = "orphee.qualifier.skipped";
  const SKIP_DAYS = 30;
  let qz = { queue: null, i: 0, answer: null, error: null };

  let active = false;
  let chapters = [];          // users/{uid}/chapters (curation d'Axel)
  let chapterError = null;
  const stories = {};         // récits d'Orphée par trimestre (session)
  let selectedQuarter = null; // clé « AAAA-Tn » ; défaut : le plus récent
  let built = false;
  let chapterEdit = null;     // trimestre dont le champ « chapitre » est ouvert

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmt(n) { return new Intl.NumberFormat("fr-FR").format(n || 0); }

  function initials(name) {
    const words = String(name || "").replace(/[^\p{L}\p{N} ]/gu, " ")
        .split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function joinFr(list) {
    if (list.length <= 1) return list.join("");
    return list.slice(0, -1).join(", ") + " et " + list[list.length - 1];
  }

  // En-tête commun à tous les blocs de « Moi » : un titre, puis une ligne qui
  // dit ce que montre le bloc. Même forme partout (lot « harmonisation »).
  // En-tête de bloc : titre, ligne d'explication, et à droite un lien
  // discret (« Tout voir › ») plutôt qu'un gros bouton en bas.
  // `kicker` (v2.34.1) : le bloc porte une phrase-titre (« Rock, rap et
  // électro. ») ; son nom passe en surtitre au-dessus, pour que l'œil lise
  // la phrase comme le titre au lieu d'une étiquette plus grosse que lui.
  function secHead(title, lede, action, kicker) {
    const h = el("header", kicker ? "moi-sec-head kicker" : "moi-sec-head");
    const top = el("div", "moi-sec-top");
    top.appendChild(el("h2", "moi-h", title));
    // Action du bloc (voir tout, déplier) : un bouton SOUS le bloc depuis
    // v2.28.0 (moreButton, posé par build()) — en haut à droite, il ne se
    // voyait pas. Gardé ici seulement pour un appel explicite `top: true`.
    if (action && !action.top) h._more = action;
    if (action && action.top) {
      // Le nombre + une flèche dessinée : compact, jamais tronqué, zone de
      // toucher de 44 px ; le libellé complet va au lecteur d'écran.
      const a = el("button", "moi-link");
      a.type = "button";
      a.setAttribute("aria-label", action.aria || action.label);
      if (action.label) a.appendChild(el("span", "moi-link-n", action.label));
      else a.classList.add("icon");
      a.insertAdjacentHTML("beforeend", action.down ?
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>' :
        action.up ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>' :
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>');
      a.addEventListener("click", action.onClick);
      top.appendChild(a);
    }
    h.appendChild(top);
    if (lede) h.appendChild(el("p", "moi-lede", lede));
    return h;
  }

  // Style dominant d'une période : « Rock · alternative ».
  function styleLabel(st) {
    if (!st || !st.genre) return "";
    return st.sousgenre && st.sousgenre !== st.genre ?
      `${st.genre} · ${st.sousgenre.toLowerCase()}` : st.genre;
  }

  // Ce qui distingue une année (v2.19.0, calculé côté serveur) : un artiste
  // qui explose, un sous-genre au-dessus de l'habitude, ou « comme d'hab ».
  function highlightLabel(Y) {
    const h = Y.highlight;
    if (!h) return styleLabel(Y.style);
    if (h.kind === "surge") return `Fulgurance : ${h.artist}`;
    const st = styleLabel(h);
    if (h.kind === "style" && st) {
      const low = st.charAt(0).toLowerCase() + st.slice(1);
      return (/^[aeiouyhéèêàâîïôû]/i.test(low) ? "Plus d’" : "Plus de ") + low;
    }
    if (h.kind === "usual" && st) return `${st}, comme d’hab`;
    return st;
  }

  // ── Qui je suis ────────────────────────────────────────────────────────────
  // ── Briques communes (grammaire v2.12.0) ────────────────────────────────
  // Une seule façon de montrer un album, un artiste : partout la même.
  function libItem(albumSur, fallback) {
    const items = libItems();
    return items.find((x) => x.album_sur === albumSur) || fallback;
  }

  function cover(cls, a) {
    const c = el("div", cls);
    if (typeof window.renderCover === "function") window.renderCover(c, a);
    return c;
  }

  // Ligne d'album : pochette, (surtitre), titre, artiste, chiffre à droite.
  function albumRow(a, opts) {
    const o = opts || {};
    const row = el("button", "moi-row");
    row.type = "button";
    row.setAttribute("aria-label", `${o.kicker ? o.kicker + " : " : ""}${a.album} — ${a.artist}`);
    row.addEventListener("click", () => openAlbum(a.album_sur));
    row.appendChild(cover("moi-row-cover", libItem(a.album_sur, a)));
    const txt = el("span", "moi-row-txt");
    if (o.kicker) txt.appendChild(el("span", "moi-row-kicker", o.kicker));
    txt.appendChild(el("span", "moi-row-title", a.album));
    txt.appendChild(el("span", "moi-row-sub", a.artist));
    row.appendChild(txt);
    if (o.metric) row.appendChild(el("span", "moi-row-metric", o.metric));
    return row;
  }

  // Exemples : 3 pochettes titrées ; « Tout voir › » (en-tête) mène au bac
  // de la Bibliothèque. Pas de défilement de côté.
  function examples(list, metaOf) {
    const frag = document.createDocumentFragment();
    const grid = el("div", "moi-ex");
    for (const a of list.slice(0, EXAMPLES)) {
      const tile = el("button", "moi-ex-tile");
      tile.type = "button";
      tile.setAttribute("aria-label", `${a.album} — ${a.artist}`);
      tile.addEventListener("click", () => openAlbum(a.album_sur));
      tile.appendChild(cover("moi-ex-cover", a));
      tile.appendChild(el("span", "moi-ex-title", a.album));
      const meta = el("span", "moi-ex-meta");
      metaOf(a, meta);
      tile.appendChild(meta);
      grid.appendChild(tile);
    }
    frag.appendChild(grid);
    return frag;
  }

  // Lien « Tout voir › » vers un bac de la Bibliothèque.
  // Bouton pleine largeur sous un bloc : « Voir les 17 adorés › »,
  // « Voir les 13 années ⌄ » / « Replier ⌃ ».
  function moreButton(action) {
    const b = el("button", "moi-more o-btn soft block" + (action.up ? " open" : ""));
    b.type = "button";
    b.setAttribute("aria-label", action.aria || action.text || "");
    const t = action.text || action.aria || "";
    const n = action.label && t.includes(action.label) ? action.label : null;
    if (n) {
      const [pre, post] = t.split(n);
      b.appendChild(document.createTextNode(pre));
      b.appendChild(el("b", null, n));
      b.appendChild(document.createTextNode(post));
    } else {
      b.appendChild(document.createTextNode(t));
    }
    b.insertAdjacentHTML("beforeend", action.down || action.up ?
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>' :
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>');
    b.addEventListener("click", () => {
      if (window.OrpheeJuice) window.OrpheeJuice.buzz(8);
      action.onClick();
    });
    return b;
  }

  function crateLink(list, crateKey, noun) {
    if (list.length <= EXAMPLES) return null;
    return {
      text: `Voir les ${fmt(list.length)} ${noun}`,
      label: fmt(list.length),
      aria: `Voir les ${fmt(list.length)} dans la Bibliothèque`,
      onClick: () => {
        if (window.OrpheeLibrary && window.OrpheeLibrary.openCrate) {
          window.OrpheeLibrary.openCrate(crateKey);
        }
      },
    };
  }

  // Visage d'artiste : sa photo (Deezer), sinon ses initiales, fond neutre.
  function face(artist) {
    const S = window.OrpheeStats;
    const imgs = (S && S.data() && S.data().artistImages) || {};
    const av = el("span", "moi-face", initials(artist));
    const photo = imgs[artist];
    if (photo) {
      const img = el("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = photo;
      img.addEventListener("error", () => img.remove());
      av.appendChild(img);
    }
    return av;
  }

  function openArtist(artist) {
    if (window.OrpheeArtistSheet) window.OrpheeArtistSheet.open(artist);
  }

  function buildIdentity() {
    const sec = el("section", "moi-sec moi-id");
    // Avant la bibliothèque : le portrait calculé à l'actualisation
    // (agg_portrait, ADR-048) ; ensuite, le calcul live sur la curation.
    const S0 = window.OrpheeStats;
    const pre = !ready && S0 && S0.data() ? S0.data().portrait : null;
    const territories = pre ? pre.territories || [] : buildTerritories();
    sec.appendChild(secHead("Qui tu es", null, null, true));
    if (!territories.length) {
      sec.appendChild(el("h1", "moi-title", "Ton portrait se dessine."));
      sec.appendChild(el("p", "moi-sub",
          "Classe quelques albums par genre : tes territoires apparaîtront ici."));
      return sec;
    }
    const S = window.OrpheeStats;
    const recent = S && S.data() ? S.data().recent : null;
    const items = libItems();
    const sharp = pre ? pre.sharp || 0 : sharpness(items);
    const h1 = el("h1", "moi-title", joinFr(territories.map((t) => t.genre)) + ".");
    sec.appendChild(h1);
    sec.appendChild(el("p", "moi-lede", "Tes genres, et les artistes qui les portent."));
    const sh = el("div", "moi-sharp");
    const shHead = el("div", "moi-sharp-head");
    shHead.appendChild(el("span", "moi-sharp-label", `Portrait net à ${sharp} %`));
    shHead.appendChild(el("span", "moi-sharp-hint", "écoutes d’albums notés et classés"));
    const shBar = el("div", "moi-terr-bar");
    const shFill = el("div", "moi-sharp-fill");
    shFill.style.width = sharp + "%";
    shBar.appendChild(shFill);
    sh.appendChild(shHead);
    sh.appendChild(shBar);
    sec.appendChild(sh);

    // Une seule barre, pleine (v2.36.1) : les 3 genres et « Autres », aux
    // couleurs du graphe des genres — 27 + 20 + 16 % ne laissent plus une
    // impression d'inachevé. Dessous, chaque genre et ses artistes phares.
    const colorOf = (g) => (window.ORPHEE_GENRE_COLORS || {})[g] || "#88938d";
    const others = Math.max(0, 100 - territories.reduce((n, t) => n + t.share, 0));
    const parts = territories.map((t) => ({ name: t.genre, share: t.share, color: colorOf(t.genre) }));
    if (others) parts.push({ name: "Autres", share: others, color: "#3a443e" });
    const mix = el("div", "moi-mix");
    mix.setAttribute("role", "img");
    mix.setAttribute("aria-label", parts.map((x) => `${x.name} ${x.share} %`).join(", "));
    for (const x of parts) {
      const seg = el("span");
      seg.style.width = x.share + "%";
      seg.style.background = x.color;
      mix.appendChild(seg);
    }
    sec.appendChild(mix);
    const legend = el("div", "gf-legend moi-mix-legend");
    for (const x of parts) {
      const li = el("span", "gf-li");
      const sw = el("i");
      sw.style.background = x.color;
      li.appendChild(sw);
      li.appendChild(document.createTextNode(x.name + " "));
      li.appendChild(el("em", null, `${x.share} %`));
      legend.appendChild(li);
    }
    sec.appendChild(legend);

    // Une carte par genre dominant, teintée de sa couleur (v2.44.1) : nom +
    // sous-genre, les 3 visages de ses artistes phares (photo Deezer) et
    // leurs noms. Le % n'y est pas répété — il vit dans la barre ci-dessus.
    const cards = el("div", "moi-gcards");
    for (const t of territories) {
      const c = el("div", "moi-gcard");
      c.style.setProperty("--g", colorOf(t.genre));
      const title = el("div", "moi-gcard-name");
      title.appendChild(el("i"));
      title.appendChild(document.createTextNode(t.genre));
      if (t.sousgenre) title.appendChild(el("span", "moi-gcard-sg", "· " + t.sousgenre.toLowerCase()));
      c.appendChild(title);
      if (t.artists.length) {
        const body = el("div", "moi-gcard-body");
        const stack = el("span", "moi-faces-stack");
        stack.setAttribute("aria-hidden", "true");
        for (const name of t.artists) {
          const f = face(name);
          f.addEventListener("click", () => openArtist(name));
          stack.appendChild(f);
        }
        body.appendChild(stack);
        const names = el("span", "moi-gcard-names");
        t.artists.forEach((name, k) => {
          if (k) names.appendChild(document.createTextNode(k === t.artists.length - 1 ? " et " : ", "));
          const b = el("button", "moi-gcard-name-btn", name);
          b.type = "button";
          b.setAttribute("aria-label", `${name} — ouvrir sa fiche`);
          b.addEventListener("click", () => openArtist(name));
          names.appendChild(b);
        });
        body.appendChild(names);
        c.appendChild(body);
      }
      cards.appendChild(c);
    }
    sec.appendChild(cards);
    return sec;
  }

  // Territoires = genres dominants (écoutes des albums classés), avec leur
  // sous-genre dominant et leurs 3 artistes phares. Calculés sur la
  // bibliothèque (curation LIVE, ADR-031) ; rien d'inventé : un genre sans
  // sous-genre distinct n'en affiche pas.
  function buildTerritories() {
    const items = libItems();
    const byGenre = new Map();
    let classified = 0;
    for (const a of items) {
      // Genre effectif : album, sinon artiste (MODELE E8).
      const eff = genreOf(a);
      if (!eff.genre || IGNORED_GENRES.includes(eff.genre)) continue;
      const n = a.listen_count || 0;
      if (!n) continue;
      classified += n;
      let g = byGenre.get(eff.genre);
      if (!g) {
        g = { genre: eff.genre, listens: 0, sous: new Map(), artists: new Map() };
        byGenre.set(eff.genre, g);
      }
      g.listens += n;
      if (eff.sousgenre && eff.sousgenre !== eff.genre) {
        g.sous.set(eff.sousgenre, (g.sous.get(eff.sousgenre) || 0) + n);
      }
      g.artists.set(a.artist, (g.artists.get(a.artist) || 0) + n);
    }
    const topOf = (m, k) => Array.from(m.entries())
        .sort((x, y) => y[1] - x[1]).slice(0, k).map(([name]) => name);
    return Array.from(byGenre.values())
        .sort((x, y) => y.listens - x.listens)
        .slice(0, 3)
        .map((g) => ({
          genre: g.genre,
          share: Math.round(g.listens / classified * 100),
          sousgenre: topOf(g.sous, 1)[0] || "",
          artists: topOf(g.artists, 3),
        }));
  }

  // ── Mes moments ────────────────────────────────────────────────────────────
  // ── Netteté du portrait (PM-23) ─────────────────────────────────────────────
  // Part des écoutes portée par des albums NOTÉS et CLASSÉS (genre de
  // l'album, sinon de l'artiste — MODELE E8).
  // Genre effectif d'un album (album, sinon artiste — artists.js, E8).
  function genreOf(a) {
    if (!ready && moiSlice()) {
      return a.genre ? { genre: a.genre, sousgenre: a.sousgenre || "" } :
        moiSlice().artists[a.artist] || { genre: "", sousgenre: "" };
    }
    return window.OrpheeArtists ? window.OrpheeArtists.effective(a) :
      { genre: a.genre || "", sousgenre: a.sousgenre || "" };
  }

  function sharpness(items) {
    let total = 0;
    let sharp = 0;
    for (const a of items) {
      const n = a.listen_count || 0;
      total += n;
      if (a.grade != null && isClassified(a)) sharp += n;
    }
    return total ? Math.round(sharp / total * 100) : 0;
  }

  function isClassified(a) {
    return !!genreOf(a).genre;
  }

  // ── À qualifier (PM-22) ────────────────────────────────────────────────────
  function loadSkipped() {
    try {
      const raw = JSON.parse(localStorage.getItem(SKIP_KEY) || "{}");
      const fresh = {};
      const limit = Date.now() - SKIP_DAYS * 86400000;
      for (const [k, t] of Object.entries(raw)) if (t > limit) fresh[k] = t;
      return fresh;
    } catch (e) { return {}; }
  }

  function skip(key) {
    try {
      const s = loadSkipped();
      s[key] = Date.now();
      localStorage.setItem(SKIP_KEY, JSON.stringify(s));
    } catch (e) { /* stockage indisponible : on passe juste pour la session */ }
  }

  // File du jour : jusqu'à 2 albums « chauds » non notés + 1 adoré endormi.
  function buildQueue(recent, items) {
    if (!recent) return [];
    const byKey = new Map(items.map((a) => [a.album_sur, a]));
    const skipped = loadSkipped();
    const A = window.OrpheeAside;
    // Déjà mis de côté (PM-34) : la pile s'en charge, plus « À faire ».
    const aside = (key) => !!(A && A.has(key));
    const hot = (recent.hot || [])
        .filter((h) => h.count >= QZ_MIN_HOT && !skipped[h.album_sur] && !aside(h.album_sur))
        .map((h) => ({ a: byKey.get(h.album_sur), count: h.count }))
        .filter((x) => x.a && x.a.grade == null)
        .map((x) => ({ key: x.a.album_sur, kind: "hot", count: x.count }));
    const dormant = (recent.dormant || [])
        .filter((d) => !skipped[d.album_sur] && !aside(d.album_sur))
        .map((d) => ({ a: byKey.get(d.album_sur), last: d.last_uts }))
        .filter((x) => x.a && x.a.grade === 5)
        .map((x) => ({ key: x.a.album_sur, kind: "dormant", last: x.last }));
    const queue = hot.slice(0, 2).concat(dormant.slice(0, 1));
    for (const h of hot.slice(2)) if (queue.length < QZ_SIZE) queue.push(h);
    return queue.slice(0, QZ_SIZE);
  }

  function reasonOf(entry, recent) {
    if (entry.kind === "hot") {
      return `${entry.count} écoutes ces ${recent.hot_days || 30} derniers jours · pas encore noté`;
    }
    const y = entry.last ? new Date(entry.last * 1000).getUTCFullYear() : null;
    return `Adoré, ${y ? "plus écouté depuis " + y : "plus écouté depuis longtemps"} · toujours ?`;
  }

  async function grade(a, g, recent) {
    const user = firebase.auth().currentUser;
    if (!user || !window.OrpheeCuration) return;
    const items = libItems();
    const before = sharpness(items);
    const wasAdored = a.grade === 5 || !!a.personal_fav;
    const had = a.grade != null || !!a.genre || !!a.sousgenre ||
      !!a.personal_fav || !!a.commentaire;

    // Même builder que la fiche et Orphée (ADR-027) ; genre/sous-genre non
    // fournis → préservés par le merge ; description réécrite à l'identique.
    const m = window.OrpheeCuration.buildCurationMutation({
      type: "grade", album_sur: a.album_sur, grade: g,
      personal_fav: !!a.personal_fav, commentaire: a.commentaire || "",
      isFirst: !had,
    });
    if (!m.valid) { qz.error = "Note invalide."; build(); return; }
    const data = Object.assign({}, m.fields);
    for (const f of m.timestamps) data[f] = firebase.firestore.FieldValue.serverTimestamp();
    try {
      await firebase.firestore().doc(`users/${user.uid}/grades/${a.album_sur}`)
          .set(data, { merge: true });
    } catch (err) {
      console.error("[moi] note non enregistrée :", err.message);
      qz.error = "Impossible d’enregistrer la note. Réessaie.";
      build();
      return;
    }
    const label = window.OrpheeCuration.gradeLabel(g, window.ORPHEE_GRADES);
    // La bibliothèque applique la note (et garde genre / description).
    document.dispatchEvent(new CustomEvent("orphee:album-graded", {
      detail: { album_sur: a.album_sur, gradeSet: true, curation: { grade: g, grade_label: label } },
    }));
    const after = sharpness(window.OrpheeLibrary.items());

    const lines = [];
    if (g === 5 && !wasAdored) lines.push("Rejoint tes albums adorés.");
    if (g === 5 && wasAdored) lines.push("Confirmé : il reste dans tes adorés.");
    if (g < 5 && wasAdored && !a.personal_fav) lines.push("Quitte tes albums adorés.");
    if (after > before) {
      lines.push(`Ton portrait passe à ${after} % de netteté (+${after - before}).`);
    }
    if (!lines.length) lines.push(`Noté ${label}.`);
    qz.answer = { grade: g, lines, needsGenre: !isClassified(a) };
    qz.error = null;
    build();
  }

  function buildQualify(recent) {
    const items = libItems();
    // Bibliothèque pas encore chargée (Moi redessiné plus tôt, par exemple
    // quand la pile « Mis de côté » arrive) : ne pas figer une file vide.
    if (qz.queue === null && items.length) qz.queue = buildQueue(recent, items);
    if (!qz.queue || !qz.queue.length || qz.i >= qz.queue.length) return null;
    const entry = qz.queue[qz.i];
    const a = items.find((x) => x.album_sur === entry.key);
    if (!a) return null;

    const sec = el("section", "moi-qz o-card");
    const head = el("div", "moi-qz-head");
    head.appendChild(el("span", "moi-qz-title", "Noter un album"));
    head.appendChild(el("span", "moi-qz-count", `${qz.i + 1} / ${qz.queue.length}`));
    sec.appendChild(head);

    const album = el("button", "moi-qz-album");
    album.type = "button";
    album.setAttribute("aria-label", `${a.album} — ouvrir la fiche`);
    album.addEventListener("click", () => openAlbum(a.album_sur));
    const cov = el("div", "moi-qz-cover");
    if (typeof window.renderCover === "function") window.renderCover(cov, a);
    const txt = el("div", "moi-qz-txt");
    txt.appendChild(el("span", "moi-qz-name", a.album));
    txt.appendChild(el("span", "moi-qz-artist", a.artist));
    txt.appendChild(el("span", "moi-qz-reason", reasonOf(entry, recent)));
    album.appendChild(cov);
    album.appendChild(txt);
    sec.appendChild(album);

    if (!qz.answer) {
      const grid = el("div", "moi-qz-grades");
      const colors = window.ORPHEE_GRADE_COLORS || {};
      for (let g = 1; g <= 5; g++) {
        const label = (window.ORPHEE_GRADES || {})[g] || String(g);
        const b = el("button", "moi-qz-grade");
        b.type = "button";
        b.setAttribute("aria-label", `Noter ${g} — ${label}`);
        if (colors[g]) { b.style.background = colors[g].bg; b.style.color = colors[g].fg; }
        b.appendChild(el("span", "moi-qz-grade-n", String(g)));
        b.appendChild(el("span", "moi-qz-grade-l", label));
        b.addEventListener("click", () => {
          for (const btn of grid.children) btn.disabled = true;
          // Même fête que la fiche album (v2.24.0) : confettis gradués.
          if (window.OrpheeJuice) {
            window.OrpheeJuice.buzz();
            window.OrpheeJuice.gradeParty(g, b.getBoundingClientRect(), (colors[g] || {}).bg || "#e8eae9");
          }
          grade(a, g, recent);
        });
        grid.appendChild(b);
      }
      sec.appendChild(grid);
      if (qz.error) sec.appendChild(el("p", "moi-qz-error", qz.error));
      const foot = el("div", "moi-qz-foot");
      const pass = el("button", "moi-qz-skip o-link", "Passer");
      pass.type = "button";
      pass.addEventListener("click", () => {
        skip(a.album_sur);
        qz.i += 1;
        qz.error = null;
        build();
      });
      foot.appendChild(pass);
      // « Plus tard » (PM-34) : pas prêt à noter, l'album part dans la pile.
      const A = window.OrpheeAside;
      if (A) {
        const later = el("button", "moi-qz-skip moi-qz-later o-link gold");
        later.type = "button";
        later.innerHTML = BOOKMARK + "<span>Plus tard</span>";
        later.addEventListener("click", async () => {
          later.disabled = true;
          if (window.OrpheeJuice) window.OrpheeJuice.buzz();
          const ok = await A.put(a.album_sur, "Mis de côté · tu le retrouves dans la Bibliothèque");
          if (!ok) { later.disabled = false; return; }
          qz.i += 1;
          qz.error = null;
          build();
        });
        foot.appendChild(later);
      }
      sec.appendChild(foot);
    } else {
      const box = el("div", "moi-qz-impact");
      for (const line of qz.answer.lines) box.appendChild(el("p", "moi-qz-line", "✓ " + line));
      if (qz.answer.needsGenre) {
        const p = el("p", "moi-qz-hint",
            "Sans genre, il ne compte pas encore dans tes territoires.");
        const go = el("button", "moi-qz-link", "Le classer dans sa fiche");
        go.type = "button";
        go.addEventListener("click", () => openAlbum(a.album_sur));
        p.appendChild(document.createTextNode(" "));
        p.appendChild(go);
        box.appendChild(p);
      }
      const next = el("button", "moi-qz-next o-btn main block",
          qz.i + 1 < qz.queue.length ? "Suivant" : "C’est tout pour aujourd’hui");
      next.type = "button";
      next.addEventListener("click", () => {
        qz.i += 1;
        qz.answer = null;
        build();
      });
      box.appendChild(next);
      sec.appendChild(box);
    }
    return sec;
  }

  // ── Une question sur la pile « Mis de côté » (PM-36) ──────────────────────
  // Moi reste un récap : une seule question à la fois, jamais une liste, et
  // on n'y note pas — « Ouvrir » mène à la fiche. Le choix de la question
  // est dérivé (aside.js, IM-6) ; les réponses sont la curation d'Axel (E11).
  const BOOKMARK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';
  // Un album n'est « oublié » qu'après 3 mois : on parle toujours en mois.
  const MONTHS_FR = (ms) => `${Math.max(3, Math.floor((Date.now() - ms) / (30.44 * 86400000)))} mois`;

  function buildAsk() {
    const A = window.OrpheeAside;
    if (!A || !A.loaded()) return null;
    const items = libItems();
    const q = A.question(items);
    if (!q) return null;
    const { a, entry, sig } = q;
    const sec = el("section", "moi-sec moi-ask-sec");
    const n = A.count();
    sec.appendChild(secHead("Une question", null, {
      label: fmt(n), aria: "Voir la pile « Mis de côté »",
      text: n > 1 ? `Voir les ${fmt(n)} albums mis de côté` : "Voir l’album mis de côté",
      onClick: () => window.OrpheeLibrary && window.OrpheeLibrary.openCrate("aside"),
    }));
    const card = el("div", "moi-ask o-card");
    const cov = el("button", "moi-ask-cover");
    cov.type = "button";
    cov.setAttribute("aria-label", `${a.album} — ouvrir la fiche`);
    cov.addEventListener("click", () => openAlbum(a.album_sur));
    if (typeof window.renderCover === "function") window.renderCover(cov, a);
    card.appendChild(cov);
    const body = el("div", "moi-ask-body");
    const p = el("p", "moi-ask-q");
    const title = el("b", null, a.album);
    if (sig.kind === "ready") {
      p.append("Tu as réécouté ", title,
          ` ${sig.days} jours depuis que tu l’as mis de côté. Tu le notes ?`);
    } else {
      p.append(title, ` dort depuis ${MONTHS_FR(entry.at)}. Toujours envie ?`);
    }
    body.appendChild(p);
    body.appendChild(el("span", "moi-ask-artist", a.artist));
    const act = el("div", "moi-ask-act");
    // Principal / secondaire / discret : les composants communs (v2.31.0).
    const btn = (label, kind, fn) => {
      const b = el("button", "moi-ask-btn " + (kind === "main" ? "o-btn main" : kind === "soft" ? "o-btn soft" : "o-link"), label);
      b.type = "button";
      b.addEventListener("click", () => {
        if (window.OrpheeJuice) window.OrpheeJuice.buzz();
        card.classList.add("out");
        setTimeout(fn, 200);
      });
      act.appendChild(b);
    };
    if (sig.kind === "ready") {
      btn("Ouvrir", "main", () => { card.classList.remove("out"); openAlbum(a.album_sur); });
      btn("Pas maintenant", "link", () => A.snooze(a.album_sur, "Je te le redemanderai dans un mois"));
    } else {
      btn("Garder", "main", () => A.keep(a.album_sur, "Gardé : le compteur repart"));
      btn("Sortir", "soft", () => A.remove(a.album_sur, "Sorti de « Mis de côté »"));
    }
    body.appendChild(act);
    card.appendChild(body);
    sec.appendChild(card);
    return sec;
  }

  // ── À faire (lot 2 de la revue UX) ────────────────────────────────────────
  // Une seule carte pour les deux gestes de curation (PM-22 noter, PM-21
  // classer) : un sélecteur quand les deux ont du travail, sinon le seul
  // disponible. Noter passe d'abord (écoutes récentes, ça périme).
  let todoMode = "noter";

  function buildTodo(recent) {
    const q = buildQualify(recent);
    const c = buildClassify();
    if (!q && !c) return null;
    let mode = todoMode;
    if (mode === "noter" && !q) mode = "classer";
    if (mode === "classer" && !c) mode = "noter";
    const sec = mode === "noter" ? q : c;
    sec.classList.add("moi-todo");
    const head = sec.querySelector(".moi-qz-head");
    const step = head.querySelector(".moi-qz-title").textContent;
    const count = head.querySelector(".moi-qz-count").textContent;
    head.innerHTML = "";
    head.appendChild(el("span", "moi-qz-title", "À faire"));
    if (q && c) {
      const sw = el("div", "moi-todo-switch o-seg");
      sw.setAttribute("role", "tablist");
      const left = qz.queue.length - qz.i;
      for (const [m, label] of [["noter", `Noter · ${left}`], ["classer", `Classer · ${czCount}`]]) {
        const b = el("button", "moi-todo-tab" + (m === mode ? " on" : ""), label);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", m === mode ? "true" : "false");
        b.addEventListener("click", () => { todoMode = m; build(); });
        sw.appendChild(b);
      }
      head.appendChild(sw);
    } else {
      head.appendChild(el("span", "moi-qz-count", step + (count ? " · " + count : "")));
    }
    return sec;
  }

  // ── Classer un artiste (PM-21, MODELE E8) ─────────────────────────────────
  // Passe guidée : les artistes les plus écoutés sans genre, un par un. Le
  // genre d'artiste sert de défaut à tous ses albums non classés.
  const CZ_TOP_ARTISTS = 150;
  const CZ_SKIP_KEY = "orphee.classer.skipped";
  let cz = { artist: null, genre: "", answer: null, error: null, busy: false };
  let czCount = 0;

  function artistCandidates(items) {
    let skipped = {};
    try { skipped = JSON.parse(localStorage.getItem(CZ_SKIP_KEY) || "{}"); } catch (e) { /* ignoré */ }
    const limit = Date.now() - SKIP_DAYS * 86400000;
    // Avant la bibliothèque : la liste préparée sur la bibliothèque entière
    // (agg_moi.classify) — même règle, sans les petits albums qui manquent ici.
    if (!ready && moiSlice() && moiSlice().classify) {
      return moiSlice().classify.filter((c) => !(skipped[c.artist] > limit));
    }
    const totals = new Map();
    for (const a of items) {
      if (!a.artist) continue;
      totals.set(a.artist, (totals.get(a.artist) || 0) + (a.listen_count || 0));
    }
    const top = Array.from(totals.entries())
        .sort((x, y) => y[1] - x[1]).slice(0, CZ_TOP_ARTISTS);
    const A = window.OrpheeArtists;
    return top
        .filter(([artist]) => !(A && A.get(artist)))
        // inutile si tous ses albums sont déjà classés au niveau album
        .filter(([artist]) => items.some((a) => a.artist === artist && !a.genre))
        .filter(([artist]) => !(skipped[artist] > limit))
        .map(([artist, listens]) => ({ artist, listens }));
  }

  function skipArtist(artist) {
    try {
      const s = JSON.parse(localStorage.getItem(CZ_SKIP_KEY) || "{}");
      s[artist] = Date.now();
      localStorage.setItem(CZ_SKIP_KEY, JSON.stringify(s));
    } catch (e) { /* stockage indisponible : passé pour la session */ }
  }

  async function classify(artist, genre, sousgenre) {
    const items = window.OrpheeLibrary.items();
    const before = sharpness(items);
    const albums = items.filter((a) => a.artist === artist && !a.genre).length;
    cz.busy = true;
    build();
    try {
      await window.OrpheeArtists.set(artist, genre, sousgenre);
    } catch (err) {
      console.error("[moi] artiste non classé :", err.message);
      cz.busy = false;
      cz.error = "Impossible d’enregistrer. Réessaie.";
      build();
      return;
    }
    const after = sharpness(window.OrpheeLibrary.items());
    const lines = [`${artist} : ${genre}${sousgenre && sousgenre !== genre ? " · " + sousgenre.toLowerCase() : ""}.`];
    if (albums) lines.push(`${albums} album${albums > 1 ? "s" : ""} compte${albums > 1 ? "nt" : ""} maintenant dans tes territoires.`);
    if (after > before) lines.push(`Ton portrait passe à ${after} % de netteté (+${after - before}).`);
    cz = { artist, genre: "", answer: { lines }, error: null, busy: false };
    build();
  }

  function buildClassify() {
    const items = libItems();
    if ((!window.OrpheeArtists && ready) || !items.length) return null;
    const cands = artistCandidates(items);
    czCount = cands.length;
    if (!cz.answer && (!cz.artist || !cands.some((c) => c.artist === cz.artist))) {
      cz.artist = cands.length ? cands[0].artist : null;
      cz.genre = "";
    }
    if (!cz.artist) return null;
    const artist = cz.artist;
    const cand = cands.find((c) => c.artist === artist);
    const listens = cand && cand.tops ? cand.listens : items.filter((a) => a.artist === artist)
        .reduce((s, a) => s + (a.listen_count || 0), 0);
    const tops = cand && cand.tops ? cand.tops : items.filter((a) => a.artist === artist)
        .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0)).slice(0, 2)
        .map((a) => a.album);

    const sec = el("section", "moi-qz moi-cz o-card");
    const head = el("div", "moi-qz-head");
    head.appendChild(el("span", "moi-qz-title", "Classer un artiste"));
    head.appendChild(el("span", "moi-qz-count",
        cz.answer ? "" : `${cands.length} à classer`));
    sec.appendChild(head);
    const nameBtn = el("button", "moi-cz-name", artist);
    nameBtn.type = "button";
    nameBtn.setAttribute("aria-label", `${artist} — ouvrir sa fiche`);
    nameBtn.addEventListener("click", () => {
      if (window.OrpheeArtistSheet) window.OrpheeArtistSheet.open(artist);
    });
    sec.appendChild(nameBtn);
    sec.appendChild(el("p", "moi-qz-reason",
        `${fmt(listens)} écoutes · ${joinFr(tops)}`));

    if (cz.answer) {
      const box = el("div", "moi-qz-impact");
      for (const line of cz.answer.lines) box.appendChild(el("p", "moi-qz-line", "✓ " + line));
      const next = el("button", "moi-qz-next o-btn main block", cands.length ? "Artiste suivant" : "Terminé");
      next.type = "button";
      next.addEventListener("click", () => {
        cz = { artist: null, genre: "", answer: null, error: null, busy: false };
        build();
      });
      box.appendChild(next);
      sec.appendChild(box);
      return sec;
    }

    // Même sélecteur que les fiches album et artiste (v2.31.1) : tuiles de
    // genre, puis pastilles de sous-genre ; classé au dernier geste.
    const GENRES = window.ORPHEE_GENRES || [];
    const COLORS = window.ORPHEE_GENRE_COLORS || {};
    const J = window.OrpheeJuice || { buzz() {}, burst() {} };
    const color = (g) => COLORS[g] || "#3fc58e";
    const tiles = el("div", "dt-gts moi-cz-tiles");
    tiles.setAttribute("role", "group");
    tiles.setAttribute("aria-label", "Genre");
    const subs = el("div", "dt-sgs");
    subs.setAttribute("role", "group");
    subs.setAttribute("aria-label", "Sous-genre");
    function pop(btn, n) {
      btn.classList.remove("boom");
      void btn.offsetWidth;
      btn.classList.add("boom");
      const r = btn.getBoundingClientRect();
      if (J.burst) J.burst(r.left + r.width / 2, r.top + r.height / 2, n, [color(cz.genre), "#e8eae9"]);
    }
    function paintSubs() {
      subs.innerHTML = "";
      const def = GENRES.find((x) => x.genre === cz.genre);
      const list = (def && def.sousgenres) || [];
      subs.hidden = list.length < 2;
      list.forEach((sg, k) => {
        const b = el("button", "dt-sg o-chip in", sg);
        b.type = "button";
        b.disabled = cz.busy;
        b.style.setProperty("--c", color(cz.genre));
        b.style.animationDelay = (k * 25) + "ms";
        b.addEventListener("click", () => { J.buzz(); pop(b, 22); classify(artist, cz.genre, sg); });
        subs.appendChild(b);
      });
    }
    GENRES.forEach((g, k) => {
      const b = el("button", "dt-gt in" + (cz.genre === g.genre ? " on" : ""), g.genre);
      b.type = "button";
      b.disabled = cz.busy;
      b.style.setProperty("--c", color(g.genre));
      b.style.animationDelay = (k * 25) + "ms";
      b.addEventListener("click", () => {
        J.buzz();
        for (const x of tiles.children) x.classList.toggle("on", x === b);
        cz.genre = g.genre;
        pop(b, 12);
        // Genre à sous-genre unique : classé d'un seul geste.
        if (g.sousgenres.length === 1) { classify(artist, g.genre, g.sousgenres[0]); return; }
        paintSubs();
      });
      tiles.appendChild(b);
    });
    sec.appendChild(tiles);
    paintSubs();
    sec.appendChild(subs);
    if (cz.error) sec.appendChild(el("p", "moi-qz-error", cz.error));
    const pass = el("button", "moi-qz-skip o-link", "Passer");
    pass.type = "button";
    pass.addEventListener("click", () => {
      skipArtist(artist);
      cz = { artist: null, genre: "", answer: null, error: null, busy: false };
      build();
    });
    sec.appendChild(pass);
    return sec;
  }

  // ── Mes trimestres ─────────────────────────────────────────────────────────
  function quarterFacts(q) {
    const m = q.metrics || {};
    const facts = [`${fmt(q.listens)} écoutes`];
    const top = q.albums && q.albums[0];
    switch (q.mood) {
      case "obsession":
        if (top) facts.push(`${top.album} = ${pct(m.top_share)} des écoutes`);
        break;
      case "exploration":
        facts.push(`${m.new_albums} albums découverts`);
        break;
      case "introspection":
        facts.push(m.night_share >= 0.25 ? `${pct(m.night_share)} la nuit` :
          `${pct(m.calm_share)} classique, jazz ou ambiant`);
        break;
      case "ancrage":
        facts.push(`${pct(m.old_share)} d’albums de plus de 3 ans`);
        break;
      case "intensite":
        facts.push(`${pct(m.intense_share)} metal & rock dur`);
        break;
      case "energie":
        facts.push(`${pct(m.rap_share)} rap`);
        break;
    }
    const g = q.genres && q.genres[0];
    if (g && !["energie", "intensite", "introspection"].includes(q.mood)) {
      facts.push(`${pct(g.share)} ${g.genre.toLowerCase()}`);
    }
    if (q.mood !== "exploration" && m.new_albums) {
      facts.push(`${m.new_albums} découverte${m.new_albums > 1 ? "s" : ""}`);
    }
    return facts.slice(0, 3);
  }

  // Description d'un trimestre (v2.14.0) : ses vrais chiffres face à tes
  // habitudes (moyenne de tes trimestres, quarters.js), plus une phrase fixe.
  function quarterDesc(q, mood) {
    const m = q.metrics || {};
    const b = q.baseline;
    if (!mood) {
      if (q.mood_reason === "volume") return "Trop peu d’écoutes ce trimestre pour lui donner une humeur.";
      if (q.mood_reason === "habitudes") {
        const st = styleLabel(q.style);
        return st ? `Surtout ${st.toLowerCase()} (${pct(q.style.share)}) : rien ne s’écarte nettement de tes habitudes.` :
          "Rien ne s’écarte nettement de ce que tu écoutes d’ordinaire.";
      }
      return "Aucune humeur franche : rien ne domine, un trimestre en mosaïque.";
    }
    if (!b) return mood.desc;
    const vs = (key) => ` contre ${pct(b[key])} d’habitude`;
    const top = q.albums && q.albums[0];
    switch (q.mood) {
      case "obsession":
        return `${top ? `« ${top.album} »` : "Un album"} fait ${pct(m.top_share)} du trimestre ; d’habitude ton album n°1 en fait ${pct(b.top_share)}.`;
      case "exploration":
        return `${pct(m.new_share)} de tes écoutes sont des albums découverts ce trimestre,${vs("new_share")}.`;
      case "energie":
        return `${pct(m.rap_share)} de rap,${vs("rap_share")}.`;
      case "intensite":
        return `${pct(m.intense_share)} de metal et de rock dur,${vs("intense_share")}.`;
      case "introspection":
        return `${pct(m.calm_share)} d’écoutes calmes ou de nuit,${vs("calm_share")}.`;
      case "ancrage":
        return `${pct(m.old_share)} d’albums découverts il y a plus de 3 ans,${vs("old_share")}.`;
      default:
        return mood.desc;
    }
  }

  // ── Chapitres (PM-20, MODELE E7 — curation d'Axel) ───────────────────────
  // Un chapitre couvre des trimestres CONSÉCUTIFS de la frise (from → to) ;
  // un trimestre appartient à au plus un chapitre. Depuis v2.29.0, c'est
  // « Raconte-moi » (demande d'Axel, IM-7) qui le crée : Orphée le nomme
  // (musique seulement) et y pose son récit ; Axel modifie ensuite titre et
  // description. La description vit dans users/{uid}/chapter_texts/{id},
  // lisible par Axel seul (l'invité lit les titres, jamais les récits, IM-8).
  const CHAPTER_MAX = 60;
  const DESC_MAX = 1200;
  let chapterTexts = {};      // id → {text, by}

  function textsCol() {
    const u = firebase.auth().currentUser;
    return u && !u.isAnonymous ? firebase.firestore().collection(`users/${u.uid}/chapter_texts`) : null;
  }
  // Clés AAAA-Tn : l'ordre alphabétique est l'ordre du temps.
  const chapterFor = (k) => chapters.find((c) => c.from <= k && k <= c.to) || null;

  function chaptersCol() {
    const uid = dataUid();
    return uid ? firebase.firestore().collection(`users/${uid}/chapters`) : null;
  }

  async function loadChapters() {
    const col = chaptersCol();
    if (!col) { chapters = []; return; }
    try {
      const snap = await col.get();
      chapters = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } catch (err) {
      console.error("[moi] chapitres non chargés :", err.message);
      chapters = [];
    }
    chapterTexts = {};
    const tc = guestMode() ? null : textsCol();
    if (!tc) return;
    try {
      const snap = await tc.get();
      snap.forEach((d) => { chapterTexts[d.id] = d.data(); });
    } catch (err) {
      console.error("[moi] récits des chapitres non chargés :", err.message);
    }
  }

  // text (facultatif) : {text, by} → la description, à part (Axel seul).
  async function saveChapter(id, fields, text) {
    const col = chaptersCol();
    if (!col) return;
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    try {
      if (id) {
        await col.doc(id).set(Object.assign({}, fields, { updated_at: ts }), { merge: true });
      } else {
        id = (await col.add(Object.assign({}, fields, { created_at: ts, updated_at: ts }))).id;
      }
      const tc = textsCol();
      if (text && tc) {
        await tc.doc(id).set({ text: text.text.slice(0, DESC_MAX), by: text.by, updated_at: ts });
      }
      await loadChapters();
    } catch (err) {
      console.error("[moi] chapitre non enregistré :", err.message);
      chapterError = "Impossible d’enregistrer le chapitre. Réessaie.";
    }
    build();
  }

  async function deleteChapter(id) {
    const col = chaptersCol();
    if (!col) return;
    try {
      await col.doc(id).delete();
      const tc = textsCol();
      if (tc) await tc.doc(id).delete().catch(() => {});
      await loadChapters();
    } catch (err) {
      console.error("[moi] chapitre non supprimé :", err.message);
      chapterError = "Impossible de supprimer le chapitre. Réessaie.";
    }
    build();
  }

  // ── Récit d'Orphée (PM-25) ──────────────────────────────────────────────────
  // Texte d'Orphée : rendu sûr partagé (text.js).
  function storyHtml(text) {
    return window.OrpheeText ? window.OrpheeText.rich(text) : "";
  }

  async function narrate(key) {
    stories[key] = { loading: true };
    build();
    try {
      const fn = firebase.app().functions("europe-west1").httpsCallable("narrateQuarter");
      const res = await fn({ key });
      stories[key] = { text: res.data.text };
      // Le chapitre du trimestre : nommé par Orphée, son récit en
      // description — à la demande d'Axel, qui pourra tout modifier.
      const ch = chapterFor(key);
      const title = (res.data.title || "").slice(0, CHAPTER_MAX) || (ch && ch.label) || key.replace("-T", " · T");
      const text = { text: res.data.text, by: "orphee" };
      if (ch) await saveChapter(ch.id, { label: title }, text);
      else await saveChapter(null, { label: title, from: key, to: key, by: "orphee" }, text);
      return;
    } catch (err) {
      console.error("[moi] récit indisponible :", err.message);
      stories[key] = { error: err.message || "Orphée ne peut pas raconter pour l’instant." };
    }
    build();
  }

  // ── Mes années (v2.15.0) ─────────────────────────────────────────────────
  // Une ligne par année : la pochette de l'album de l'année porte l'année et
  // un liseré de la couleur de l'humeur ; puis l'humeur et son écart à tes
  // habitudes, l'album, les détails. Les 3 dernières années ; le reste se
  // déplie. Toucher une année ouvre ses trimestres (récit, chapitre).
  const YEARS_SHOWN = 5;
  let yearsOpen = false;
  let openYear = null;

  // Écart court, pour la ligne d'une année.
  function deltaShort(item) {
    const m = item.metrics || {};
    const b = item.baseline;
    const pts = (k) => {
      const d = Math.round(((m[k] || 0) - ((b && b[k]) || 0)) * 100);
      return b ? `${d >= 0 ? "+" : ""}${d} pts` : pct(m[k]);
    };
    switch (item.mood) {
      case "obsession": return `${pct(m.top_share)} sur un album`; // l'album est juste dessous
      case "exploration": return `${pts("new_share")} de nouveautés`;
      case "energie": return `${pts("rap_share")} de rap`;
      case "intensite": return `${pts("intense_share")} de rock dur`;
      case "introspection": return `${pts("calm_share")} de calme`;
      case "ancrage": return `${pts("old_share")} d’anciens albums`;
      default: return "";
    }
  }

  function buildQuarters(quarters, years) {
    if (!quarters || !quarters.length) return null;
    if (!years || !years.length) { // données d'avant v2.15.0 : un refresh suffit
      const sec = el("section", "moi-sec moi-years");
      sec.appendChild(secHead("Tes années", "Appuie sur « Actualiser » pour voir ce qui a marqué chaque année."));
      return sec;
    }
    const byKey = new Map(quarters.map((q) => [q.key, q]));
    const order = quarters.map((q) => q.key);
    const idx = (k) => order.indexOf(k);
    if (!selectedQuarter || !byKey.has(selectedQuarter)) {
      selectedQuarter = quarters[quarters.length - 1].key;
    }
    // Noms d'humeur : source unique côté serveur (quarters.js, mood_label).
    const labels = {};
    for (const q of quarters) if (q.mood && q.mood_label) labels[q.mood] = q.mood_label;
    const chapterOf = (k) => chapters.find((c) =>
      idx(c.from) !== -1 && idx(c.to) !== -1 && idx(c.from) <= idx(k) && idx(k) <= idx(c.to));

    const sec = el("section", "moi-sec moi-years");
    // Les genres dans le temps (v2.33.0) : l'histoire d'abord, les années
    // ensuite (moi-genres.js). Sa phrase (« Du rap au rock. ») fait titre.
    const flow = window.OrpheeGenreFlow ? window.OrpheeGenreFlow.build(quarters) : null;
    sec.appendChild(secHead("Tes années", null,
        years.length > YEARS_SHOWN ? {
          label: yearsOpen ? "" : fmt(years.length),
          aria: yearsOpen ? "Replier" : `Voir les ${years.length} années`,
          text: yearsOpen ? "Replier" : `Voir les ${fmt(years.length)} années`,
          down: !yearsOpen, up: yearsOpen,
          onClick: () => { yearsOpen = !yearsOpen; if (!yearsOpen) openYear = null; build(); },
        } : null, !!(flow && flow.querySelector(".gf-title"))));
    if (flow) sec.appendChild(flow);
    const card = el("div", "moi-q-detail");
    const chips = el("div", "moi-q-chips");

    function chaptersOfYear(y) {
      const names = [];
      for (const c of chapters) {
        const fy = parseInt(String(c.from), 10);
        const ty = parseInt(String(c.to), 10);
        if (fy <= y && y <= ty && !names.includes(c.label)) names.push(c.label);
      }
      return names;
    }

    // Les trimestres de l'année ouverte : 4 pastilles, puis la carte.
    function renderChips(y) {
      chips.innerHTML = "";
      for (let n = 1; n <= 4; n++) {
        const q = byKey.get(`${y}-T${n}`);
        const b = el("button", "moi-q-chip o-chip" + (q && q.key === selectedQuarter ? " on" : ""), "T" + n);
        b.type = "button";
        const mood = q && MOODS[q.mood];
        const dot = el("span", "moi-q-chip-dot");
        dot.style.background = mood ? mood.color : "var(--surface-3)";
        b.prepend(dot);
        if (!q) { b.disabled = true; } else {
          b.setAttribute("aria-label", `${y} · T${n}, ${q.mood_label || "dans tes habitudes"}`);
          b.addEventListener("click", () => {
            selectedQuarter = q.key;
            chapterError = null;
            chapterEdit = null;
            renderChips(y);
            renderCard();
          });
        }
        chips.appendChild(b);
      }
    }

    const list = el("div", "moi-yrs");
    years.forEach((Y, i) => {
      const row = el("button", "moi-yr");
      row.type = "button";
      row.setAttribute("aria-expanded", openYear === Y.y ? "true" : "false");
      if (i >= YEARS_SHOWN && !yearsOpen) row.hidden = true;
      row.appendChild(el("span", "moi-yr-y", String(Y.y)));
      const cov = el("span", "moi-yr-cov");
      if (Y.top && typeof window.renderCover === "function") window.renderCover(cov, libItem(Y.top.album_sur, Y.top));
      const mood = MOODS[Y.mood];
      if (mood) {
        const bar = el("span", "moi-yr-bar");
        bar.style.background = mood.color;
        cov.appendChild(bar);
      }
      row.appendChild(cov);

      const txt = el("span", "moi-yr-txt");
      const surge = !!(Y.highlight && Y.highlight.kind === "surge");
      const l1 = el("span", "moi-yr-l1" + (mood || surge ? "" : " habit"));
      if (mood) {
        const name = el("span", null, Y.mood_label);
        name.style.color = mood.color;
        l1.appendChild(name);
        const d = deltaShort(Y);
        if (d) l1.appendChild(el("span", "moi-yr-delta", " · " + d));
      } else {
        // Pas d'écart d'humeur : on dit ce qui distingue l'année, pas « rien ».
        // Une fulgurance se voit : en or, comme Adoré (v2.28.1).
        if (surge) l1.appendChild(el("span", "moi-fulg", highlightLabel(Y)));
        else l1.textContent = highlightLabel(Y) || "Peu d’écoutes";
      }
      txt.appendChild(l1);
      if (Y.top) {
        const l2 = el("span", "moi-yr-l2", Y.top.album);
        const x = [Y.top.artist, `${fmt(Y.top.count)}×`].filter(Boolean).join(" · ");
        l2.appendChild(el("span", "moi-yr-x", ` · ${x}`));
        txt.appendChild(l2);
      }
      const l3 = el("span", "moi-yr-l3");
      const bits = [];
      if (Y.partial) {
        const until = Y.data_until ? new Date(Y.data_until * 1000)
            .toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
        const w = el("span", "moi-yr-wip", until ? `en cours, jusqu’au ${until}` : "en cours");
        bits.push(w);
      }
      for (const c of chaptersOfYear(Y.y)) bits.push(el("span", "moi-yr-ch", `« ${c} »`));
      const hl = mood ? highlightLabel(Y) : "";
      if (hl) bits.push(surge ? el("span", "moi-fulg", hl) : document.createTextNode(hl));
      bits.push(document.createTextNode(`${fmt(Y.listens)} écoutes`));
      if (Y.discovery) bits.push(document.createTextNode(`découverte : ${Y.discovery.album}`));
      bits.forEach((node, k) => { if (k) l3.appendChild(document.createTextNode(" · ")); l3.appendChild(node); });
      txt.appendChild(l3);
      row.appendChild(txt);

      row.addEventListener("click", () => {
        openYear = openYear === Y.y ? null : Y.y;
        chapterEdit = null;
        chapterError = null;
        if (openYear) {
          const qs = quarters.filter((q) => q.y === Y.y);
          if (!qs.some((q) => q.key === selectedQuarter)) selectedQuarter = qs.length ? qs[qs.length - 1].key : null;
        }
        placeDetail();
      });
      row._year = Y.y;
      list.appendChild(row);
    });
    sec.appendChild(list);


    // Le détail se place sous la ligne de l'année ouverte.
    const detail = el("div", "moi-yr-detail");
    detail.appendChild(chips);
    detail.appendChild(card);
    function placeDetail() {
      for (const r of list.children) r.setAttribute("aria-expanded", r._year === openYear ? "true" : "false");
      const row = Array.from(list.children).find((r) => r._year === openYear);
      if (!row || !selectedQuarter || !byKey.has(selectedQuarter)) { detail.remove(); return; }
      row.after(detail);
      renderChips(openYear);
      renderCard();
    }

    // Champ du chapitre : ouvert au toucher de « Nommer ce chapitre ».
    function buildChapterBox(q) {
      const box = el("div", "moi-ch");
      const ch = chapterOf(q.key);
      const label = el("label", "moi-ch-label", "Titre du chapitre");
      label.htmlFor = "moi-ch-input";
      box.appendChild(label);
      const input = el("input", "moi-ch-input");
      input.id = "moi-ch-input";
      input.maxLength = CHAPTER_MAX;
      input.placeholder = "Nomme ce chapitre…";
      input.value = ch ? ch.label : "";
      box.appendChild(input);
      // La description : le récit d'Orphée, que tu peux réécrire.
      const prev = ch ? chapterTexts[ch.id] : null;
      const dl = el("label", "moi-ch-label", "Description");
      dl.htmlFor = "moi-ch-desc";
      box.appendChild(dl);
      const desc = el("textarea", "moi-ch-desc");
      desc.id = "moi-ch-desc";
      desc.maxLength = DESC_MAX;
      desc.rows = 4;
      desc.placeholder = "Ce que ce trimestre a été, en musique…";
      desc.value = prev ? prev.text : "";
      box.appendChild(desc);
      const ok = el("button", "moi-ch-ok o-btn main block", "Enregistrer");
      ok.type = "button";
      ok.addEventListener("click", () => {
        const v = input.value.trim().slice(0, CHAPTER_MAX);
        if (!v) { chapterError = "Donne-lui un nom."; renderCard(); return; }
        const d = desc.value.trim();
        const changed = d !== (prev ? prev.text : "");
        chapterEdit = null;
        saveChapter(ch.id, { label: v }, changed ? { text: d, by: "axel" } : null);
      });
      box.appendChild(ok);
      if (chapterError) box.appendChild(el("p", "moi-qz-error", chapterError));

      if (ch) {
        const actions = el("div", "moi-ch-actions");
        const next = order[idx(ch.to) + 1];
        if (next && !chapterOf(next)) {
          const ext = el("button", "moi-ch-btn o-btn soft", "Prolonger au trimestre suivant →");
          ext.type = "button";
          ext.addEventListener("click", () => {
            selectedQuarter = next;
            chapterEdit = null;
            saveChapter(ch.id, { to: next });
          });
          actions.appendChild(ext);
        }
        const del = el("button", "moi-ch-btn moi-ch-del o-link danger", "Supprimer le chapitre");
        del.type = "button";
        del.addEventListener("click", () => {
          if (window.confirm(`Supprimer le chapitre « ${ch.label} » ?`)) {
            chapterEdit = null;
            deleteChapter(ch.id);
          }
        });
        actions.appendChild(del);
        box.appendChild(actions);
      }
      requestAnimationFrame(() => input.focus());
      return box;
    }

    // Description du chapitre (le récit d'Orphée, ou ce qu'Axel en a fait) :
    // gardée, elle s'affiche à chaque visite du trimestre (v2.29.0).
    function storyText(q) {
      const ch = chapterOf(q.key);
      const t = ch ? chapterTexts[ch.id] : null;
      if (t && t.text) return t;
      const st = stories[q.key] || {};
      return st.text ? { text: st.text, by: "orphee" } : null;
    }
    function storyBox(q) {
      const t = storyText(q);
      if (!t) return null;
      const box = el("div", "moi-story-box");
      const p = el("p", "moi-story-text");
      p.innerHTML = storyHtml(t.text);
      box.appendChild(p);
      return box;
    }

    // Raconter (crée le chapitre), puis le modifier. Pas de chapitre
    // créé à la main (v2.29.0) : c'est Orphée qui le nomme, à ta demande.
    function buildActions(q) {
      if (guestMode()) return null; // l'invité lit, n'écrit ni ne fait parler Orphée
      const st = stories[q.key] || {};
      const ch = chapterOf(q.key);
      const wrap = el("div", "moi-q-actions");
      if (q.mood_reason !== "volume" && !storyText(q)) {
        const btn = el("button", "moi-ghost o-btn soft",
            st.loading ? "Orphée écoute…" : "Raconte-moi");
        btn.type = "button";
        btn.disabled = !!st.loading;
        btn.addEventListener("click", () => narrate(q.key));
        wrap.appendChild(btn);
      }
      if (!ch) return wrap.children.length ? wrap : null;
      const nb = el("button", "moi-ghost o-btn soft" + (chapterEdit === q.key ? " on" : ""), "Modifier le chapitre");
      nb.type = "button";
      nb.setAttribute("aria-expanded", chapterEdit === q.key ? "true" : "false");
      nb.addEventListener("click", () => {
        chapterEdit = chapterEdit === q.key ? null : q.key;
        chapterError = null;
        renderCard();
      });
      wrap.appendChild(nb);
      return wrap;
    }

    function renderCard() {
      const q = byKey.get(selectedQuarter);
      const mood = MOODS[q.mood];
      const ch = chapterOf(q.key);
      card.innerHTML = "";
      // Lecture de haut en bas (v2.31.1) : de quoi on parle (titre du
      // chapitre ou période, humeur), ce qu'en dit Orphée — ou, sans récit,
      // pourquoi cette humeur —, les chiffres, les albums, puis les gestes.
      const top = el("div", "moi-q-card-head");
      const months = `${QUARTER_MONTHS[q.q - 1]} ${q.y}`;
      top.appendChild(ch ? el("p", "moi-ch-title", ch.label) : el("p", "moi-ch-title", months));
      if (mood && q.mood_label) {
        const badge = el("span", "moi-q-badge", q.mood_label);
        badge.style.background = mood.color;
        top.appendChild(badge);
      }
      card.appendChild(top);
      const meta = [];
      if (ch) {
        meta.push(ch.from === ch.to ? months :
          `${ch.from.replace("-T", " · T")} → ${ch.to.replace("-T", " · T")}`);
      }
      if (q.bascule && labels[q.prev_mood] && q.mood_label) meta.push(`après « ${labels[q.prev_mood]} »`);
      if (q.partial) {
        const until = q.data_until ? new Date(q.data_until * 1000)
            .toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
        meta.push(until ? `en cours · jusqu’au ${until}` : "en cours");
      }
      if (meta.length) card.appendChild(el("p", "moi-q-meta", meta.join(" · ")));

      const story = storyBox(q);
      if (story) card.appendChild(story);
      else card.appendChild(el("p", "moi-q-desc", quarterDesc(q, mood)));

      const facts = el("div", "moi-q-facts");
      for (const f of quarterFacts(q)) facts.appendChild(el("span", "moi-q-fact", f));
      card.appendChild(facts);

      // Ses albums : la ligne d'album, comme partout (3 au plus).
      const rows = el("div", "moi-rows moi-q-rows");
      for (const a of (q.albums || []).slice(0, 3)) {
        rows.appendChild(albumRow(a, { metric: `${fmt(a.count)}×` }));
      }
      card.appendChild(rows);

      const actions = buildActions(q);
      if (actions) card.appendChild(actions);
      const st = stories[q.key] || {};
      if (st.error) card.appendChild(el("p", "moi-qz-error", st.error));
      if (chapterEdit === q.key && chapterOf(q.key)) card.appendChild(buildChapterBox(q));
    }

    placeDetail();
    return sec;
  }

  // ── Ce que j'adore ─────────────────────────────────────────────────────────
  function adoredItems() {
    const items = libItems();
    return items
        .filter((a) => a.grade === 5 || a.personal_fav)
        .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0));
  }

  function openAlbum(albumSur) {
    if (!albumSur) return;
    document.dispatchEvent(new CustomEvent("orphee:open-album", {
      detail: { album_sur: albumSur },
    }));
  }

  // Chapitre « Ce que tes notes racontent » (v2.44.2) : adorés, paradoxes et
  // « un seul titre » regroupés. L'accent de note vit dans le mot-titre
  // (« adores » en or, « paradoxes » en bleu), pas sur chaque album.
  function subHead(titleHTML, lede) {
    const h = el("div", "moi-subh");
    const t = el("h3", "moi-sub-title");
    t.innerHTML = titleHTML;
    h.appendChild(t);
    if (lede) h.appendChild(el("p", "moi-sub-lede", lede));
    return h;
  }

  function adoredSub() {
    const adored = adoredItems();
    if (!adored.length) return null;
    const sub = el("div", "moi-sub");
    sub.appendChild(subHead(
        "Ce que tu <span class=\"moi-tw-gold\">adores</span>",
        "Tes albums notés Adoré, les plus écoutés d’abord."));
    sub.appendChild(examples(adored, (a, meta) => { meta.textContent = a.artist; }));
    const act = crateLink(adored, "adores", "adorés");
    if (act) sub.appendChild(moreButton(act));
    return sub;
  }

  function buildNotesChapter(oneItems) {
    const subs = [adoredSub(), paradoxSub(), oneTrackSub(oneItems)]
        .filter(Boolean);
    if (!subs.length) return null;
    const sec = el("section", "moi-sec moi-notes");
    sec.appendChild(secHead("Ce que tes notes racontent",
        "Ce que tu adores, les albums que tu écoutes sans les aimer, " +
        "et ceux tenus par un seul titre."));
    const ch = el("div", "moi-chapter");
    for (const x of subs) ch.appendChild(x);
    sec.appendChild(ch);
    return sec;
  }

  // ── Mes paradoxes (Oddity, IM-6) ──────────────────────────────────────────
  // Segmentation dérivée : albums très écoutés (percentile) mais notés bas.
  // Lue sur la bibliothèque (curation LIVE, réglages d'Oddity) ; ne décide
  // rien et ne touche jamais la note.

  function paradoxSub() {
    const api = window.orpheeOddity && window.orpheeOddity.ready() ?
      window.orpheeOddity : sliceOddity();
    if (!api) return null;
    const list = api.list();
    if (!list.length) return null;
    const G = window.ORPHEE_GRADES || {};
    const cur = api.current();
    const grades = cur.eligible.slice().sort((a, b) => a - b)
        .map((g) => G[g] || g);
    const pv = api.preview ? api.preview(cur.percentile, cur.eligible) : null;
    const top = pv && pv.gradeableCount ?
      `parmi tes ${fmt(pv.gradeableCount)} albums les plus écoutés` :
      `dans tes ${100 - cur.percentile}\u00a0% d’albums les plus écoutés`;
    const sub = el("div", "moi-sub");
    sub.appendChild(subHead(
        "Tes <span class=\"moi-tw-blue\">paradoxes</span>",
        `Écoutés sans compter, jamais adorés : ${top}, notés ` +
        `${joinFr(grades).replace(" et ", " ou ")}.`));
    // Sans note par album (v2.44.2) : juste les écoutes.
    sub.appendChild(examples(list, (a, meta) => {
      meta.textContent = `${fmt(a.listen_count)} écoutes`;
    }));
    const act = crateLink(list, "paradoxes", "paradoxes");
    if (act) sub.appendChild(moreButton(act));
    return sub;
  }

  // ── Un seul titre (v2.34.0) ───────────────────────────────────────────────
  // L'album bof, le titre énorme : le titre qui tient son album (calculé au
  // refresh, agg_one_track). La note est lue en direct : un album Culte ou
  // Adoré n'est pas « bof » — écarté. Focus sur la chanson ; ce qui la rend
  // exceptionnelle : combien de fois un titre moyen de l'album, et sa part.
  const ONE_SHOWN = 3;
  let oneOpen = false;
  function oneTrackList(items) {
    return (items || []).filter((x) => {
      const a = libItem(x.album_sur, x);
      return !(a.grade === 4 || a.grade === 5 || a.personal_fav);
    });
  }
  function oneTrackSub(items) {
    const list = oneTrackList(items);
    if (!list.length) return null;
    const sub = el("div", "moi-sub moi-one");
    sub.appendChild(subHead("Un seul titre",
        "Des titres que tu écoutes pour eux seuls, toi qui écoutes " +
        "d’habitude les albums en entier."));
    const rows = el("div", "moi-one-rows");
    for (const x of oneOpen ? list : list.slice(0, ONE_SHOWN)) {
      const a = libItem(x.album_sur, x);
      const row = el("button", "moi-one-row");
      row.type = "button";
      row.setAttribute("aria-label", `${x.track} — ${x.artist}, ${Math.round(x.share * 100)} % de ${x.album}`);
      row.addEventListener("click", () => openAlbum(x.album_sur));
      row.appendChild(cover("moi-one-cover", a));
      const txt = el("span", "moi-one-txt");
      txt.appendChild(el("span", "moi-one-track", x.track));
      txt.appendChild(el("span", "moi-one-sub", `${x.artist} · ${x.album}`));
      // La part du titre dans l'album : or, le reste de l'album en gris.
      const line = el("span", "moi-one-line");
      const bar = el("span", "moi-one-bar");
      const fill = el("i");
      fill.style.width = Math.round(x.share * 100) + "%";
      bar.appendChild(fill);
      line.appendChild(bar);
      line.appendChild(el("span", "moi-one-pc", `${Math.round(x.share * 100)} % de l’album`));
      txt.appendChild(line);
      row.appendChild(txt);
      // Combien de fois un titre moyen de l'album : ce qui le distingue.
      const m = el("span", "moi-one-m");
      m.appendChild(el("b", null, String(Math.round(x.ratio * 10) / 10).replace(".", ",") + "×"));
      m.appendChild(el("span", null, "la moyenne"));
      row.appendChild(m);
      rows.appendChild(row);
    }
    sub.appendChild(rows);
    if (list.length > ONE_SHOWN) {
      sub.appendChild(moreButton({
        text: oneOpen ? "Replier" : `Voir les ${fmt(list.length)} titres`,
        label: oneOpen ? "" : fmt(list.length),
        aria: oneOpen ? "Replier" : `Voir les ${fmt(list.length)} titres`,
        down: !oneOpen, up: oneOpen,
        onClick: () => { oneOpen = !oneOpen; build(); },
      }));
    }
    return sub;
  }

  // ── Assemblage ─────────────────────────────────────────────────────────────
  // ── En-tête : moi ──────────────────────────────────────────────────────────
  // Ta photo (Google, en attendant celle de Last.fm avec la clé API), ton nom
  // Last.fm (Réglages › Compte) et tes chiffres.
  let profileName = "";
  async function loadProfile() {
    const uid = dataUid();
    if (!uid) return;
    try {
      const snap = await firebase.firestore().doc(`users/${uid}/settings/profile`).get();
      profileName = (snap.exists && snap.data().lastfm_user) || "";
    } catch (err) {
      console.error("[moi] profil non chargé :", err.message);
    }
  }
  function buildProfile() {
    const user = firebase.auth().currentUser;
    const sec = el("section", "moi-me");
    const av = el("div", "moi-me-av");
    const fallback = guestMode() ? "Axel" : ((user && user.displayName) || "?").trim();
    av.textContent = initials(profileName || fallback);
    if (user && user.photoURL && /^https:\/\//.test(user.photoURL)) {
      const img = el("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = user.photoURL;
      img.addEventListener("error", () => img.remove());
      av.appendChild(img);
    }
    sec.appendChild(av);
    const txt = el("div", "moi-me-txt");
    if (profileName) {
      txt.appendChild(el("span", "moi-me-name", profileName));
    } else if (guestMode()) {
      txt.appendChild(el("span", "moi-me-name", "Axel"));
    } else {
      txt.appendChild(el("span", "moi-me-name", fallback.split(" ")[0]));
      const add = el("button", "moi-me-add", "Ajouter mon nom Last.fm");
      add.type = "button";
      add.dataset.goto = "settings";
      txt.appendChild(add);
    }
    const S = window.OrpheeStats;
    const pr = S && S.profile ? S.profile() : null;
    if (pr && pr.listens) {
      const parts = [`${fmt(pr.listens)} écoutes`, `${fmt(pr.albums)} albums`];
      if (pr.since) parts.push(`depuis ${pr.since}`);
      txt.appendChild(el("span", "moi-me-stats", parts.join(" · ")));
    }
    sec.appendChild(txt);
    return sec;
  }

  // ── Assemblage ─────────────────────────────────────────────────────────────
  // Moi d'abord (qui je suis, avec ses visages), puis le geste (À faire),
  // puis ce qui raconte (moments, trimestres, adorés, paradoxes, écoutes).
  let ready = false; // bibliothèque et classification chargées (activate)

  // « Moi » préparé d'avance (agg_moi, ADR-049) : albums notés, très écoutés
  // ou cités, AVEC leur curation, recalculés à chaque geste de curation.
  // Tant que la bibliothèque n'est pas là, « Moi » se construit dessus.
  const moiSlice = () => {
    const d = window.OrpheeStats && window.OrpheeStats.data();
    return d && d.moi && Array.isArray(d.moi.items) ? d.moi : null;
  };
  function libItems() {
    if (!ready && moiSlice()) return moiSlice().items;
    return window.OrpheeLibrary ? window.OrpheeLibrary.items() : [];
  }
  // Paradoxes sur la tranche : même règle que library.js (isOddity), seuil
  // et réglages calculés par le serveur.
  function sliceOddity() {
    const m = moiSlice();
    if (ready || !m || !m.oddity) return null;
    const o = m.oddity;
    return {
      current: () => ({ percentile: o.percentile, eligible: o.eligible.slice() }),
      list: () => m.items.filter((a) => a.grade !== null && o.threshold > 0 &&
            o.eligible.includes(a.grade) && a.listen_count >= o.threshold)
          .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0)),
      preview: () => ({ gradeableCount: o.gradeable }),
    };
  }

  // Forme grise d'un bloc en attente : sa hauteur est réservée, rien ne
  // saute quand il arrive.
  function skeleton(h) {
    const sk = el("div", "moi-skel");
    sk.style.height = h + "px";
    sk.setAttribute("aria-hidden", "true");
    return sk;
  }

  // ── Ces jours-ci (PM-39, ADR-050) ───────────────────────────────────────
  // Accroche en tête de « Moi » : les 30 derniers jours (agrégat agg_days) —
  // la phase (genre + artiste en boucle), le volume, les artistes du moment
  // avec leur « ×habitude », l'album qui tourne.
  // Les 30 jours en sparkline, GROUPÉS par semaine (un petit espace entre
  // chaque) pour se repérer d'un coup d'œil ; la semaine en cours (les 7
  // jours de droite) un cran plus claire, avec son seul repère.
  function daysSpark(daily) {
    const wrap = el("div", "moi-days-spark");
    const n = daily.length || 1;
    const max = Math.max(1, ...daily);
    // viewBox en unités « abstraites » : `preserveAspectRatio: none` étire le
    // SVG sur toute la largeur du contenu (barres franches = silhouette de
    // ville). Hauteur fixée en CSS. Le repère « cette semaine » est du HTML
    // (le texte SVG se déformerait avec l'étirement).
    const W = 100; const H = 36; const gap = 1.1;
    const nGaps = Math.ceil(n / 7) - 1;
    const slot = (W - gap * nGaps) / n; const bw = slot * 0.8;
    let m = ""; let x = 0;
    daily.forEach((v, i) => {
      if (i > 0 && (n - i) % 7 === 0) x += gap;   // espace en début de semaine
      const bh = Math.max(0.5, (v / max) * (H - 1));
      const now = (n - 1 - i) < 7 ? " now" : "";
      m += `<rect class="d${now}" x="${x.toFixed(2)}" y="${(H - bh)
          .toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}"/>`;
      x += slot;
    });
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" ` +
      `height="100%" preserveAspectRatio="none">${m}</svg>` +
      `<span class="moi-days-wk">cette semaine</span>`;
    return wrap;
  }

  function buildDaysBlock(d) {
    if (!d || !d.total) return null;
    const colorOf = (g) => (window.ORPHEE_GENRE_COLORS || {})[g] || "";
    const sec = el("section", "moi-sec moi-days");
    sec.appendChild(el("div", "moi-days-kick", "Ces jours-ci"));

    const g = d.genre && d.genre.genre;
    const top = d.phase && d.phase[0] && d.phase[0].artist;
    const h = el("h2", "moi-days-title");
    // Le genre à SA couleur (cohérent avec « Qui tu es » / « Mes années ») ;
    // l'artiste en blanc. Le reste du bloc en neutre (pas de vert).
    const gWord = (t) => {
      const s = el("span", "moi-days-genre", t);
      const c = colorOf(t); if (c) s.style.color = c;
      return s;
    };
    const who = (t) => el("b", "moi-days-who", t);
    if (g && top) h.append("Une phase ", gWord(g), " — ", who(top), " en boucle.");
    else if (top) h.append(who(top), " en boucle.");
    else if (g) h.append("Une phase ", gWord(g), ".");
    else h.textContent = "Ce que tu écoutes en ce moment.";
    sec.appendChild(h);
    sec.appendChild(el("p", "moi-days-meta",
        `${fmt(d.total)} écoutes sur ${d.days || 30} jours`));
    sec.appendChild(daysSpark(d.daily || []));

    const list = el("div", "moi-days-list");
    (d.phase || []).forEach((p) => {
      const row = el("button", "moi-days-row");
      row.type = "button";
      row.setAttribute("aria-label", `${p.artist} — ouvrir la fiche`);
      row.addEventListener("click", () => openArtist(p.artist));
      row.appendChild(face(p.artist));             // photo Deezer ou initiales
      row.appendChild(el("span", "moi-days-art", p.artist));
      row.appendChild(el("span", "moi-days-n", `${fmt(p.n)} écoutes`));
      const lift = Math.round(p.lift || 0);
      if (lift >= 2) {
        row.appendChild(el("span", "moi-days-badge", `×${lift} habitude`));
      }
      list.appendChild(row);
    });
    if (list.childNodes.length) sec.appendChild(list);

    if (d.album && d.album.album) {
      const alb = el("button", "moi-days-album");
      alb.type = "button";
      alb.setAttribute("aria-label", `${d.album.album} — ouvrir la fiche`);
      alb.addEventListener("click", () => openAlbum(d.album.album_sur));
      const atxt = el("span", "moi-days-albtxt");
      const l1 = el("span", "moi-days-albl1");
      l1.append("L’album qui tourne : ", el("b", null, d.album.album));
      atxt.appendChild(l1);
      // Les écoutes passent SOUS la phrase : la 1ʳᵉ ligne respire, la pochette
      // à droite a plus de place.
      atxt.appendChild(el("span", "moi-days-albn",
          `${fmt(d.album.count)} écoutes`));
      alb.appendChild(atxt);
      alb.appendChild(cover("moi-days-albcov",
          libItem(d.album.album_sur, d.album)));
      sec.appendChild(alb);
    }
    return sec;
  }

  function build() {
    const S = window.OrpheeStats;
    const data = S && S.data();
    viewEl.innerHTML = "";
    const root = el("div", "moi");
    const add = (node) => {
      if (!node) return;
      const head = node.querySelector(".moi-sec-head");
      if (head && head._more) node.appendChild(moreButton(head._more));
      root.appendChild(node);
    };

    // Rendu en deux temps (v2.37.0, ADR-048) : d'abord les agrégats (~120 Ko),
    // puis, la bibliothèque chargée (~2 Mo), les blocs qui en dépendent —
    // une forme grise à leur place en attendant.
    const lib = ready || !!moiSlice();
    add(buildProfile());
    // « Ces jours-ci » (PM-39) : accroche en tête, dès les agrégats serveur.
    add(buildDaysBlock(data && data.days));
    // Sans portrait préparé (avant la 1re actualisation) : sa place, pas un
    // « portrait se dessine » qui se remplit ensuite.
    add(!ready && !(data && data.portrait) ? skeleton(560) : buildIdentity());
    if (!guestMode() && lib) add(buildAsk()); // la pile d'Axel (PM-36), pas pour l'invité
    if (!guestMode()) add(lib ? buildTodo(data && data.recent) : skeleton(480)); // le geste d'Axel seul
    // « Mes moments » vit désormais dans « Ma journée » (onglet Journée du
    // graphe de fin, v2.28.0).
    add(buildQuarters(data && data.quarters, data && data.years));
    if (lib) {
      add(buildNotesChapter(data && data.oneTrack));
    } else {
      add(skeleton(260));
    }

    // « Mes écoutes par… » : le graphique, en fin de page (effet waouh voulu).
    if (S && window.OrpheeStatsCharts) {
      const { sec, init } = window.OrpheeStatsCharts.buildEcoutes(S.buildEcoutesData());
      sec.classList.add("moi-sec", "moi-ecoutes");
      const head = sec.querySelector(".st-head");
      if (head) head.replaceWith(secHead("Tes écoutes par…", "Quand tu écoutes : par année, par mois, par semaine, et dans ta journée."));
      root.appendChild(sec);
      requestAnimationFrame(() => init());
    }

    viewEl.appendChild(root);
    built = true;
  }

  async function activate() {
    if (!firebase.auth().currentUser) return;
    if (!built) viewEl.innerHTML = '<p class="lib-status">Chargement…</p>';
    const S = window.OrpheeStats;
    const L = window.OrpheeLibrary;
    // 1. Les agrégats suffisent à l'essentiel (portrait compris).
    await Promise.all([S ? S.ensureLoaded(false) : null, loadChapters(), loadProfile()]);
    if (active && !ready) build();
    // 2. Ensuite seulement la bibliothèque (même connexion : elle passerait
    // devant) — curation live, adorés, paradoxes, « À faire ».
    await Promise.all([
      L ? L.ensure() : null,
      window.OrpheeArtists ? window.OrpheeArtists.ensure() : null,
    ]);
    ready = true;
    if (active) build();
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;

    document.addEventListener("orphee:tab", (e) => {
      active = e.detail.tab === "moi";
      if (active) activate();
    });
    // nav.js peut avoir activé « Moi » avant le chargement de ce module.
    active = viewEl.classList.contains("is-active");

    // Une note posée (fiche ou Orphée) peut changer le mur ; un refresh, tout.
    document.addEventListener("orphee:album-graded", () => {
      built = false;
      if (active && ready) setTimeout(build, 0); // après la mise à jour de la bibliothèque
    });
    // La pile « Mis de côté » a bougé : la question suit.
    // Aussi émis au démarrage (la pile se charge) : pas de rendu avant que
    // la bibliothèque le soit — sinon le portrait s'affiche vide puis saute.
    document.addEventListener("orphee:aside-changed", () => {
      built = false;
      if (active && ready) setTimeout(build, 0);
    });
    // Nom Last.fm enregistré dans Réglages : l'en-tête suit.
    document.addEventListener("orphee:profile-saved", (e) => {
      profileName = (e.detail && e.detail.lastfm_user) || "";
      built = false;
    });
    // Réglages des paradoxes modifiés : la section suit.
    document.addEventListener("orphee:settings-saved", () => {
      built = false;
      if (active && ready) setTimeout(build, 0); // après la bibliothèque
    });
    // Bibliothèque rechargée après un refresh : adorés et paradoxes suivent.
    document.addEventListener("orphee:library-reloaded", () => {
      built = false;
      if (active) build();
    });
    // Après un refresh, stats.js recharge les agrégats puis prévient.
    document.addEventListener("orphee:stats-reloaded", () => {
      built = false;
      // Nouvelles écoutes : nouvelle file (sauf réponse affichée en cours).
      if (!qz.answer) qz = { queue: null, i: 0, answer: null, error: null };
      if (active) build();
    });

    firebase.auth().onAuthStateChanged((user) => {
      built = false;
      ready = false;
      chapterEdit = null;
      qz = { queue: null, i: 0, answer: null, error: null };
      chapters = [];
      cz = { artist: null, genre: "", answer: null, error: null, busy: false };
      todoMode = "noter";
      for (const k of Object.keys(stories)) delete stories[k];
      if (!user) { viewEl.innerHTML = ""; return; }
      if (window.OrpheeSession && !window.OrpheeSession.ready(user)) return;
      if (active) activate();
    });
  }

  init();
})();
