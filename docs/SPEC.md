# Orphée — Spécification technique

**Version livrée :** v2.21.0 · **Dernière mise à jour :** 2026-10-10

> **Historique — chantier v2.0 (livré).** Fiabilisation menée dans l'ordre
> **Socle → Curation → Stats → Desktop** :
> 1. **Socle — référentiel des notes à source unique** (résorbe D-1/D-2, [ADR-026](./ADR.md#adr-026)) ;
> 2. **Curation via Orphée durcie** — builder partagé testable, validation serveur, auto-correction ([ADR-027](./ADR.md#adr-027)) ;
> 3. **Stats fiabilisées** — aucun visuel sans donnée réelle ([ADR-028](./ADR.md#adr-028), § Stats fiabilisées) ;
> 4. **Mise en page desktop** — feed Stats élargi/aéré ([ADR-029](./ADR.md#adr-029), § Mise en page desktop).
>
> L'état réel reste tracé au [Journal des divergences](#journal-des-divergences).

Cette spec décrit **comment** Orphée est implémenté. Elle **s'inscrit dans** les
couches métier :

1. [`PRODUIT.md`](./PRODUIT.md) — intention & processus métier,
2. [`MODELE.md`](./MODELE.md) — modèle conceptuel (chaque concept une fois),
3. **`SPEC.md`** (ce document) — matérialisation technique,
4. [`ADR.md`](./ADR.md) — décisions.

Quand la technique s'écarte du modèle, c'est consigné en
[§ Journal des divergences](#journal-des-divergences).

---

## 1. Stack

| Couche | Techno |
|--------|--------|
| Frontend | HTML / CSS / JS vanilla ([ADR-002](./ADR.md#adr-002)), rendus graphiques maison (SVG) |
| Auth | Firebase Auth — Google (propriétaire, [ADR-041](./ADR.md#adr-041)) + Anonyme (invités, PM-28, [ADR-042](./ADR.md#adr-042)) |
| Source d'ingestion | Last.fm (`user.getRecentTracks`, lecture seule) → Cloud Storage ([ADR-034](./ADR.md#adr-034)) ; la Sheet n'est plus lue ([ADR-044](./ADR.md#adr-044)) |
| Cache d'agrégats | Firestore |
| Hébergement | Firebase Hosting |
| Backend | Firebase Functions (Node 24, région `europe-west1`) |
| IA | Claude (Anthropic SDK) via la Function `chatOrphee` |

Neuf Functions exposées (`functions/src/index.js`) :

| Function | Type | Auth | Rôle |
|---|---|---|---|
| `refreshCache` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Recalcule tout le cache d'agrégats (PM-02) |
| `chatOrphee` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Dialogue avec l'agent (PM-12 à PM-15) |
| `narrateQuarter` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Récit d'un trimestre par Orphée, mis en cache (PM-25, [ADR-037](./ADR.md#adr-037)) |
| `ytmusicLink` | `onRequest` (public) | **aucune** | Redirection 302 vers YouTube Music (PM-06, [ADR-016](./ADR.md#adr-016)) |
| `createShare` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Crée l'accès invité d'1 h (PM-28, § 21) |
| `joinShare` | `onCall` | compte anonyme (PM-28) | Rejoint un accès avec son jeton (PM-28, § 21) |
| `revokeShare` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Coupe l'accès invité (PM-28, § 21) |
| `syncLastfm` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Copie les nouvelles écoutes Last.fm dans Storage (PM-01, § 14) |
| `exportListens` | `onCall` | propriétaire (`requireOwner`, ADR-041) | Export JSON compact pour analyse (PM-30, § 14) |

Service account commun : `orphee-e7377@appspot.gserviceaccount.com`.
Secrets : `ANTHROPIC_API_KEY` (chat), `LASTFM_API_KEY` (synchro). (`SHEETS_ID` n'est plus utilisé depuis v2.17.0.)

**Mode local** ([`tools/dev`](../tools/dev/README.md)) : émulateurs Firebase sur le
projet fictif `demo-orphee`, données fictives générées puis passées dans le vrai
`refreshCache`. Activé côté app par `public/js/dev-emulators.js` (localhost **et**
projet `demo-*` uniquement) ; les écoutes fictives sont écrites dans
l'émulateur Storage, `syncLastfm` y fabrique 12 écoutes (ni clé ni réseau).

---

## 2. Mapping concept → implémentation

| Concept (MODELE.md) | Matérialisation technique |
|---|---|
| **Écoute** (fait) | Cloud Storage `scrobbles/{YYYY}.ndjson.gz`, alimenté par la synchro Last.fm (§ 14) |
| **Artiste** (fait) | Dérivé des écoutes ; sa classification (genre) = curation `users/{uid}/artist_genres` |
| **Album** (identité `album_sur`) | Dérivé des `album_sur` uniques des scrobbles ([ADR-014](./ADR.md#adr-014)) |
| **Indicateurs de l'Album** | `cache/agg_*` + `album_stats/{album_sur}` |
| **Écho** (relation) | `album_stats/{album_sur}.echo` + `.echo_ref` (graphe `agg_constellation` retiré en v2.12.0) |
| **Oddity** (segmentation) | `cache/agg_oddities` (backend) + aperçu client (`library.js`) |
| **Curation** (la Note) | `users/{uid}/grades/{album_sur}` |
| **Réglages** | `users/{uid}/settings/oddity` |
| **Réf. Notes** | **Source unique `functions/src/grades.js` ([ADR-026](./ADR.md#adr-026))** : `refdata.js` (front) **généré** + tables SPEC/SKILL générées ; back **consomme** (`aggregates.js`, `prompt-builder.js`). `grade_label` du cache = slug régénéré ; retiré de l'overlay de curation. *(D-1 et D-2 fermés.)* |
| **Réf. Genres** | `public/js/refdata.js` (`ORPHEE_GENRES`) |
| **Instructions de service** (Agent) | `docs/SKILL.md` (source unique) → généré en `orphee.skill.md`, chargé par `system-prompt.js` ([ADR-023](./ADR.md#adr-023)) |
| **Capacités** (Agent) | 3 outils read-only + tags d'action (définis dans `functions/src/chat/tags-spec.js`, [ADR-025](./ADR.md#adr-025)) |
| **Conversation** (Agent) | `users/{uid}/chats/main/messages/{id}` |
| **Mémoire** (Agent) | ⛔ non persistée (cible : `users/{uid}/music_notes`, `…/preferences`) |
| **Album canonique** (PM-29) | Curation `users/{uid}/album_splits` ; cache Storage `derived/track_albums.json.gz` ; `variants` / `split` sur les cartes de bibliothèque (§ 14, Album canonique) |
| **Accès invité** (PM-28, IM-8) | `shares/{sha256(token)}` + `guests/{uid}`, écrits par les Functions seules (§ 21) |
| **Années** | `cache/agg_quarters.years` (§ 15) |
| **Vues** | UI front (`moi.js`, `library.js`, `detail.js`, `artist-sheet.js`, `chat.js`) ; `stats.js` = chargeur des agrégats, `stats-charts.js` = « Mes écoutes par… » |

---

## 3. Source d'ingestion — Last.fm

Depuis v2.16.0, les écoutes viennent de Last.fm via la synchro intégrée
(§ 14, [ADR-034](./ADR.md#adr-034)) et sont copiées dans Cloud Storage. Depuis
v2.17.0, **la Google Sheet « Music Library DB » n'est plus lue du tout**
([ADR-044](./ADR.md#adr-044)) : ses écoutes ont été migrées une fois (clés
réparées), ses notes l'avaient été en `import_v0` ([ADR-013](./ADR.md#adr-013)),
ses genres d'artistes en v2.7.0 (`artist_genres`). Elle reste une sauvegarde
hors de l'app, jamais modifiée.

---

## 4. Modèle Firestore

Firestore n'est **pas** une base relationnelle vivante : uniquement du cache
d'agrégats pré-calculés + de la donnée utilisateur clé-valeur
([ADR-004](./ADR.md#adr-004)).

### 4.1 Dérivé — écrit par `refreshCache`, lu par l'app (référence read-only)

```
cache/
  agg_global              total_listens, total_albums, total_artists,
                          graded_albums, grade_distribution {skip,nice,great,classic,adored},
                          albums_above_threshold, graded_above_threshold, last_refresh
  agg_top_artists_alltime items: [{artist, count, top_album, last_played}]
  agg_top_albums_alltime  items: [{album_sur, artist, album, count, grade,
                                   personal_fav, cover_url}]
  agg_stats               grade_distribution {1..5}, genre_distribution[], listens_per_year[],
                          by_month[ {month,count} ], by_weekday[ {weekday,count} ]
  agg_library_curated     items: [albums notés ou coup de cœur, triés] (dérivé interne)
  agg_library_all_meta    count, chunk_count, chunk_size
  agg_library_all_{i}     items: [album_sur, artist, album, listen_count,
                          first_listen_y, cover_url, variants[] (≤ 12), split]
                          — chunks de 1000 (ADR-012).
                          AUCUNE curation (ADR-031) : note/fav/description/genre
                          lus LIVE à la source, superposés par le front
                          (library.applyCuration) et Orphée (curation-overlay).
  agg_oddities            items: [{album_sur, artist, album, listen_count, grade, grade_label}],
                          threshold, percentile, albums_above_threshold, graded_above_threshold
  agg_unrated_top         items: [{album_sur, artist, album, listen_count}]
  agg_commuting           band[], matin[], soir[], hour_top[], moments[],
                          signatures{matin,soir,nuit:{genres[{genre}],
                          artists[{artist}]}} (PM-18, ADR-050), byYear{}
  agg_quarters            items: [{key "AAAA-Tn", y, q, listens, mood|null,
                          mood_reason ("volume"|"mixte"|null), score, bascule,
                          prev_mood, metrics{…}, genres[top 3], albums[top 4]}]
                          — trimestres & humeurs (§ 15, quarters.js)
  agg_artist_images       images {artiste: url|null} — photos des 150 artistes
                          les plus écoutés (§ 19)
  agg_recent              ref_uts, hot_days, hot[{album_sur, count}],
                          dormant[{album_sur, last_uts}], classified_artists[]
                          — matière de « À qualifier » + netteté (§ 16)
  agg_days                total, daily[30], phase[{artist, n, lift}],
                          album{album_sur, artist, album, cover_url, count},
                          genre{genre, lift}, days — « Ces jours-ci » (PM-39,
                          ADR-050) : 30 derniers jours relatifs à la dernière
                          écoute ; artistes du moment par volume + « ×habitude »
                          (lift), genre dominant et album par VOLUME (phase) ;
                          plancher de volume relatif ; refresh seul, snapshot
  agg_clusters            top_n, min_edge, resolution, clusters[{top, plays,
                          members[{a, n}]}], bridges{"i-j": n} — « Tes mondes »
                          (PM-40, ADR-052) : communautés de co-écoute (Louvain
                          déterministe) des 100 plus écoutés, liens ≥ 20 séances,
                          résolution 1,5 ; clusters triés par écoutes, ponts
                          entre mondes ; sans genre (coloré/nommé live, ADR-031) ;
                          refresh seul (buildClusters)
  scrobbles_meta          source, last_uts, years, total, synced_at,
                          last_added — état de la copie Storage (§ 14)

album_stats/{album_sur}   artist, album, listen_count, unique_tracks_played,
                          first_listen, last_played, monthly_distribution[],
                          top_tracks[], echo[], echo_ref

covers/{album_sur}        url, source ("deezer"|"lastfm"|"manual"), not_found, resolved_at
```

Toutes ces collections sont **`write:false`** côté clients (cf. § Sécurité) :
seul `refreshCache` y écrit, via l'admin SDK (hors règles).

> Le doc détail par album est dans la collection **`album_stats`** (top-niveau),
> pas sous `cache/`.

### 4.2 Espace utilisateur — écrit par le client (overlay mutable)

```
users/{uid}/
  grades/{album_sur}      grade (1-5|null), grade_label, personal_fav,
                          commentaire, genre, sousgenre, graded_at, updated_at
  cds/{enc(album_sur)}    album_sur, at (ms) — CD d'Axel (E12, PM-38, v2.43.0) ;
                          lu en direct (`public/js/cds.js`), lisible par l'invité
  settings/oddity         percentile (def. 90), eligible (def. [1,2]), updated_at
  settings/profile        lastfm_user — nom Last.fm (Réglages › Compte, § 14) ;
                          artist_name — nom d'artiste d'Axel (v2.42.0, PM-37)
  chats/main/messages/{id}  role ("user"|"assistant"), content, timestamp
  artist_genres/{enc(artist)}  artist, genre, sousgenre, source ("sheet"|"axel"),
                          updated_at — classification d'artiste (E8, § 18) ;
                          `source: "sheet"` = donnée héritée de l'import unique
  settings/artist_import  (historique) done_at, count — marqueur de l'import
                          unique (ADR-038), plus écrit depuis v2.17.0
  album_splits/{encodeURIComponent(album_sur)}  album_sur, created_at —
                          libellés séparés de l'album canonique (PM-29, § 14)
  chapters/{id}           label (≤ 60), from "AAAA-Tn", to "AAAA-Tn",
                          created_at, updated_at — chapitres (E7, § 17)
  narrations/{AAAA-Tn}    text, hash (empreinte des faits), model, version,
                          created_at — récits d'Orphée (A5, écrits par
                          narrateQuarter)
  music_notes/{id}        (cible — ⛔ non écrit en v0.1)
  preferences/declared    (cible — ⛔ non écrit en v0.1)
```

---

## 5. Refresh à la demande (PM-02)

`refreshCache` (`onCall`, 300 s, 512 MiB) :

1. Lit les écoutes dans Cloud Storage (`cache/scrobbles_meta` + une partition
   par année) ; échoue proprement si aucune synchro n'a encore eu lieu.
2. Charge la curation depuis `users/{uid}/grades/`.
3. Album canonique (`applyCanon`, PM-29, § 14) : réécrit le libellé d'album des
   écoutes (lit `album_splits`, résout les titres suspects via Last.fm) ; les
   écoutes Storage ne changent pas.
4. `buildLibrary(scrobbles, curation)` : dérive les albums des `album_sur`
   uniques, fusionne la curation, exclut les albums sans titre ; ajoute
   `variants` / `split` aux cartes.
5. Calcule les agrégats (global, top artistes/albums, stats, oddities en
   lisant `settings/oddity`, unrated, album_stats + écho, commuting,
   trimestres & années en lisant `artist_genres`, `agg_recent`).
6. Résout les pochettes manquantes (Deezer d'abord, Last.fm en secours,
   [ADR-015](./ADR.md#adr-015), § 9), cap de 200 résolutions par run ; puis
   les photos d'artistes (`agg_artist_images`, § 19).
7. Écrit `cache/*` (overwrite, 1 batch) et `album_stats/*` (batchs de 450).

**Pas de cron, pas de polling** ([ADR-005](./ADR.md#adr-005)). Bouton
« Actualiser » dans la topbar. L'UI simule une barre de progression calée sur
les phases réelles du backend.

---

## 6. Système de notation & segmentation

### Échelle (donnée de référence — IM-3)

<!-- grades:table:start -->
| Note | Libellé | Sens |
|---|---|---|
| 5 | Adoré | Top du top |
| 4 | Culte | Intemporel |
| 3 | Génial | Vraiment bien |
| 2 | Sympa | Agréable, sans plus |
| 1 | Zappé | Pas pour moi / à éviter |
<!-- grades:table:end -->

> Table générée depuis `functions/src/grades.js` (ADR-026) — ne pas éditer à la main.

**Source unique ([ADR-026](./ADR.md#adr-026), implémenté).** L'échelle (valeur,
slug `key`, libellé, sens, couleur) vit dans **un seul fichier source**,
`functions/src/grades.js`. En **dérivent**, sans recopie :
- `public/js/refdata.js` (`ORPHEE_GRADES` + `ORPHEE_GRADE_COLORS`) est **généré**
  (entre marqueurs `// grades:gen:*`) ;
- les tables d'échelle de **SPEC.md** (ci-dessus) et **SKILL.md** sont **générées** ;
- le back **consomme** la source : `aggregates.js` (`GRADE_LABELS`, `KEYS`),
  `prompt-builder.js` (clés de `grade_distribution`) ;
- un **canari** (hook pre-commit **et** `grades.test.js`) bloque toute dérive
  (même dispositif qu'[ADR-025](./ADR.md#adr-025)). Génération via
  `npm --prefix functions run gen`.

`grade_label` est un **dérivé** de `grade` (✅ D-2 fermé, [ADR-027](./ADR.md#adr-027)).
Le cache en conserve le **slug minuscule** (régénéré depuis la source) ; il
**n'est plus écrit** dans `users/{uid}/grades`. L'affichage le dérive de `grade`
(`library.applyCuration`), les outils agent aussi (`query_album_detail`).

### Coup de cœur (`personal_fav`) — fusionné dans la note 5 (v2.6.0, PM-08)
Plus exposé : ni étoile dans la fiche, ni filtre/marqueur pour Orphée, `[FLAG]`
obsolète (retiré du texte). Les données existantes sont migrées par Axel lui-même
depuis Réglages (« Coups de cœur → Adoré » : liste exacte, puis confirmation) :
note → 5, `personal_fav` → `false`. Une note posée par Orphée écrit
`personal_fav: false`. Tant qu'un ancien drapeau subsiste, mur et étagère
« Adorés » l'incluent encore (lecture legacy).

### Oddity (segmentation, IM-6)

```
oddity(album) = (note ∈ eligible) ET (listen_count ≥ percentile_N de la bibliothèque)
```

Paramètres dans `users/{uid}/settings/oddity` (`percentile` def. 90,
`eligible` def. `[1,2]`). Calculé **deux fois** : aperçu live côté client (pour
le réglage interactif sans refresh) et `cache/agg_oddities` au refresh (pour
l'agent et la persistance).

### L'app fait foi
Pas d'écriture retour vers la Sheet ([ADR-006](./ADR.md#adr-006)). Les notes de
la Sheet ont été importées une fois (`import_v0`), ensuite Firestore fait foi.

---

## 7. Architecture du chat — Orphée et ses outils

### 7.1 Flux d'un message (PM-12)

```
1. Le client écrit le message dans users/{uid}/chats/main/messages
2. Le client appelle chatOrphee({message})
3. chatOrphee :
   - charge le system prompt (SKILL.md figé) une fois au module, envoyé en
     bloc `system` avec un point de cache (`cache_control: ephemeral`) : le
     prompt stable + les outils sont servis depuis le cache Anthropic d'un
     message et d'un tour à l'autre
   - buildContext() lit 5 docs cache (agg_global, top artistes, top albums,
     oddities, non notés) + la curation LIVE users/{uid}/grades superposée
     (ADR-031) → bloc [CONTEXTE] injecté DANS le message courant (hors du
     system, après le point de cache, pour ne pas l'invalider)
   - charge les 20 derniers messages d'historique
   - boucle multi-turn avec les outils (max 5 appels, ADR-009)
   - parseTags() côté SERVEUR : retire les tags du texte, produit
     {cleanText, suggestions, actions}
   - VALIDE les actions de curation (ADR-027/030) : note ∈ [1..5] + existence
     album (get album_stats/{album_sur}). Action invalide → JAMAIS appliquée ni
     auto-corrigée ; mise dans `rejections`. La réponse n'est pas altérée.
   - retourne {response, suggestions, actions (valides), rejections}
4. Le client :
   - affiche la réponse + les chips de suggestions
   - executeActions() écrit l'overlay users/{uid}/grades (proxy d'Axel), via le
     builder de curation partagé (ADR-027 ; cf. § 11 Curation : builder partagé)
   - rejections → bulles dismissibles (#curation-errors) ; rien n'est écrit
   - persiste la réponse de l'assistant
```

Modèle : `claude-sonnet-4-6`, `max_tokens` 2048, historique 20 messages,
garde-fou 5 appels d'outils.

### 7.2 Outils (lecture seule — IM-7, ADR-009)

Trois outils, déclarés via le paramètre `tools` de l'API. Ils lisent le cache
d'agrégats et, pour tout résultat qui renvoie des albums (`query_albums`,
`query_listens` `top_albums`, `query_album_detail`), superposent la curation
LIVE lue dans `users/{uid}/grades` ([ADR-031](./ADR.md#adr-031)) — jamais une
note figée au dernier refresh :

- **`query_albums`** — recherche/filtre sur la bibliothèque (artist, genre,
  sousgenre, grade_min/max, is_oddity, is_rated, year_from/to,
  sort, limit).
- **`query_listens`** — agrégats d'écoutes (`aggregate` : count,
  monthly_distribution, top_tracks, top_artists, top_albums, by_genre).
- **`query_album_detail`** — détail complet d'un album (métadonnées, stats,
  note, statut Oddity, Écho).

> **`web_research_album` (PM-13, [ADR-011](./ADR.md#adr-011)) n'est pas
> implémenté.** Le system prompt l'indique explicitement (« recherche web : pas
> encore active »). Il y a **3** outils, pas 4. Pour le contexte d'album, Orphée
> s'appuie sur sa connaissance interne, sans inventer.

### 7.3 Tags machine-readable

Émis par Orphée en fin de réponse. **Parsés côté serveur** (`tags-parser.js`),
puis : les suggestions et actions sont renvoyées au client ; les **actions
d'écriture sont appliquées côté client** (`chat.js#executeActions`) sur
`users/{uid}/grades`, sous les règles owner.

<!-- tags:table:start -->
| Tag | Traitement | Effet |
|---|---|---|
| `[GRADE: album_sur grade=X commentaire="..."]` | action serveur → écriture client | upsert curation |
| `[UNGRADE: album_sur]` | action serveur → écriture client | suppression curation |
| `[FLAG: album_sur]` | retiré du texte (v3) | aucun effet (v3) |
| `[COMMENT: album_sur "texte"]` | action serveur → écriture client | maj description (sans toucher la note) |
| `[NOTE: priority=N tags=[...] texte]` | retiré du texte (v0.1) | aucun effet en v0.1 |
| `[PREF: key=value]` | retiré du texte (v0.1) | aucun effet en v0.1 |
| `[FOCUS: album_sur]` | retiré du texte (v0.1) | aucun effet en v0.1 |
| `[FILTER: type=X value=Y]` | retiré du texte (v0.1) | aucun effet en v0.1 |
| `[SUGGEST: cmd1 cmd2 "mot un" "mot deux"]` | suggestion serveur → chips client | chips de commandes |
<!-- tags:table:end -->

> Table générée depuis `functions/src/chat/tags-spec.js` (ADR-025) — ne pas éditer à la main.

Garde-fou de sécurité : un `album_sur` contenant `/` est rejeté (traversal),
côté serveur (outils) **et** côté client (executeActions).

Normalisation : le parser retire un préfixe `id:` (et les crochets) recopié par
erreur depuis le jeton de contexte `[id:album_sur]` — déterministe, pas une
interprétation (un vrai `album_sur` ne commence jamais par `id:`).

### 7.4 Validation de la curation — une erreur reste une erreur ([ADR-027](./ADR.md#adr-027) révisé par [ADR-030](./ADR.md#adr-030))

Orphée agit en **proxy** d'Axel sur la curation (IM-7). **Principe** : une action
de proxy invalide n'est **jamais appliquée** sur la donnée, **jamais
« auto-corrigée »** par le modèle (pas d'interprétation qui se transforme en
écriture) — elle est **renvoyée comme erreur** et **affichée à l'écran**.

**Validation serveur** (dans `chatOrphee`, après `parseTags`, avant de renvoyer
les actions) :
- **note ∈ [1..5]** pour les actions `grade` ;
- **existence de l'album** via un `get` `album_stats/{album_sur}` pour `grade` /
  `flag` / `comment` (un `album_sur` orphelin → rejet). `ungrade` est un no-op
  toléré (suppression idempotente) ; `album_sur` avec `/` → rejet.

`chatOrphee` renvoie `{response, suggestions, actions, rejections}` : seules les
actions **valides** sont dans `actions` (appliquées côté client) ; les invalides
sont dans **`rejections`** (`{type, album_sur, reason}`). La **réponse d'Orphée
n'est pas altérée**.

**Affichage des rejets (client).** `chat.js` montre chaque rejet en **bulle
dismissible** (`.cbubble`, pile `#curation-errors`) — ex. « Note non appliquée —
album introuvable : « Coda » » — que l'utilisateur ferme (✕) une fois comprise
(auto-disparition de sécurité à 12 s). Rien n'est écrit pour un rejet.

> Réduction à la source : le system prompt impose `album_sur = [id:...]` du
> contexte dans les tags d'action (jamais reconstitué), pour minimiser les
> rejets. (Avant v2.0 : aucune validation, aucune remontée d'erreur.)

---

## 8. Sécurité

- Clés API Anthropic et Last.fm : secrets de Function (`ANTHROPIC_API_KEY`,
  `LASTFM_API_KEY`). Plus d'accès à Google Sheets (ADR-044).
- **Propriétaire unique** ([ADR-041](./ADR.md#adr-041)) : `config/owner {email}`
  (en minuscules), créé et modifié **depuis la console Firebase seulement**.
  Est propriétaire le compte dont l'email Google, **vérifié**, est celui-là.
  Sans ce document, personne n'entre (échec fermé).
- `refreshCache`, `chatOrphee`, `narrateQuarter`, `syncLastfm`,
  `exportListens`, `createShare` et `revokeShare` : réservés au propriétaire
  (`requireOwner`, `functions/src/lib/owner.js`, email relu au plus toutes les
  60 s). `joinShare` exige un compte anonyme (PM-28, § 21). `ytmusicLink` est
  public mais ne lit ni n'écrit aucune donnée ([ADR-016](./ADR.md#adr-016)).
- Côté app (`auth.js`), un autre compte est déconnecté avec « Cet espace est
  privé » — simple message : ce sont les règles qui protègent.
- **En-têtes HTTP de durcissement** (`firebase.json`, v2.43.4) : `X-Frame-Options:
  DENY` et `Content-Security-Policy: frame-ancestors 'none'` (anti-clickjacking),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/géo
  coupés — aucun n'est utilisé). Une **CSP complète en `Report-Only`** (script
  et style same-origin, `style-src 'unsafe-inline'` pour les attributs `style=`
  des SVG, images en `https:`, connexions limitées à `*.googleapis.com`,
  `*.cloudfunctions.net`, MusicBrainz et Cover Art Archive) : à observer sur le
  site réel avant de la passer en bloquante. Le jeton d'invitation reste dans le
  fragment `#invite=` (jamais envoyé au serveur ni en `Referer`).
- Règles Firestore (`firestore.rules`) :

```
function isOwner()  { email vérifié == get(config/owner).data.email }
function isGuest()  { compte anonyme && guests/{uid} existe && until > request.time
                      && shares/{share} existe }   // § 21
function isGuestOf(userId) { isGuest() && guests/{uid}.owner == userId }
function canRead()  { isGuest() || isOwner() }
match /config/{document=**}         { allow read, write: if false; }
match /shares/{id}                  { allow read: if isOwner(); allow write: if false; }
match /guests/{id}                  { allow read, write: if false; }
match /users/{userId}/{document=**} { allow read, write: if isOwner() && request.auth.uid == userId; }
match /users/{userId}/grades/{id}        { allow read: if isGuestOf(userId); }
match /users/{userId}/chapters/{id}      { allow read: if isGuestOf(userId); }
match /users/{userId}/artist_genres/{id} { allow read: if isGuestOf(userId); }
match /users/{userId}/{album_arbitrations,applied_corrections,correction_batches,quality_later}/{id}
                                         { allow read: if isGuestOf(userId); }   // démo Qualité, v2.32.1
match /quality/{document=**}        { allow read: if canRead(); allow write: if false; }
match /users/{userId}/settings/{id}      { allow read: if id in ['oddity','profile'] && isGuestOf(userId); }
match /cache/{document=**}          { allow read: if canRead(); allow write: if false; }
match /album_stats/{document=**}    { allow read: if canRead(); allow write: if false; }
match /covers/{document=**}         { allow read: if canRead(); allow write: if false; }
```

Cette séparation **référence read-only / overlay mutable** est l'expression
technique d'IM-1/IM-5 ([ADR-018](./ADR.md#adr-018)).

---

## 9. Pochettes (Écho visuel des albums)

Résolues côté serveur via l'API publique Deezer d'abord, **Last.fm en secours**
(`album.getInfo`, `source: "lastfm"`), cachées dans `covers/`
([ADR-015](./ADR.md#adr-015), § 13 bis). Un introuvable (`not_found`) est
retenté au bout de 30 jours. On stocke l'**URL**, jamais le binaire. Overrides
manuels (`source:"manual"`) pour les albums absents de Deezer (ex. *Chronicle of
the Chained*), jamais écrasés. Le front (`covers.js`) affiche l'image si
présente, sinon un rendu génératif.

---

## 10. UI

PWA dark, mobile-first, police unique Bricolage Grotesque ([ADR-035](./ADR.md#adr-035)).
Barre : **Moi · Bibliothèque · Le Salon** ([ADR-036](./ADR.md#adr-036)) ; ouverture sur **Moi**.

- **Moi** (PM-18, `moi.js`) — dans l'ordre : **en-tête** (photo Google — celle
  de Last.fm : pas encore branchée —, nom Last.fm de
  `users/{uid}/settings/profile.lastfm_user` saisi dans Réglages › Compte, sinon
  le prénom Google et un lien « Ajouter mon nom Last.fm » ; écoutes · albums ·
  depuis, `OrpheeStats.profile()`) · « Moi » préparé (v2.38.0, ADR-049) : tant que la bibliothèque
  n'est pas chargée, `libItems()`, `genreOf`, les candidats « Classer » et
  les paradoxes (`sliceOddity`, même règle que `isOddity`) lisent
  `cache/agg_moi` (`buildMoiSlice`, `refresh/moi.js` : albums notés/coups de
  cœur, ≥ `MOI_MIN_LISTENS` 20 écoutes ou cités par `agg_recent`,
  `agg_quarters`, `agg_one_track`, la pile ; curation sans description ;
  `artists` ; `classify` : candidats « Classer un artiste » calculés sur la
  bibliothèque entière, même règle que `artistCandidates` — top 150 par
  écoutes, non classé, un album sans genre — avec écoutes et 2 albums ;
  `oddity` {threshold, percentile, eligible, gradeable}),
  recalculé par `refreshCache` et par le trigger `onCurationWritten`
  (`users/{uid}/{grades|artist_genres|aside}/*`, `settings/oddity` →
  `recomputeMoi` : paquets `agg_library_all_*` + curation via
  `withCuration` → `agg_portrait`, `agg_oddities`, `agg_moi`) ; formes grises
  seulement sans `agg_moi`. **« Ces jours-ci »** (accroche en tête,
  `buildDaysBlock`, lit `cache/agg_days` — PM-39, ADR-050 : phase genre+artiste,
  volume 30 j, artistes du moment avec leur **portrait** (`face()`, → fiche) et
  « ×habitude », album qui tourne ; v2.46.2 : **sans carte** (coule comme les
  autres sections), le **genre à sa couleur** (`ORPHEE_GENRE_COLORS`) et le
  reste neutre, frise `daysSpark` **groupée par semaine** (semaine en cours
  plus claire) ; s'affiche dès les agrégats, visible aussi par l'invité) ·
  « Qui je suis »
  (premier jet `cache/agg_portrait`
  tant que la bibliothèque n'est pas chargée — ADR-048, v2.37.0 : `activate`
  rend d'abord sur agrégats + chapitres + profil, les blocs dépendant de la
  bibliothèque en `.moi-skel`, puis rend tout ; `library.js` attend
  `OrpheeStats.ensureLoaded` avant de charger ses paquets ; netteté, puis une barre
  pleine `.moi-mix` : 3 genres + « Autres », couleurs `ORPHEE_GENRE_COLORS`,
  légende `.gf-legend` — v2.36.1 ; sous chaque genre, les **visages** de ses 3 artistes phares — photo Deezer,
  sinon initiales ; toucher → fiche, § 19) · « À faire » (carte, § 17) ·
  « Tes années » · chapitre « Ce que tes notes racontent » (groupe
  « Ce que tu adores » — mot « adores » en or —, « Tes paradoxes » — mot
  « paradoxes » en bleu, sans note par album — et « Un seul titre »,
  v2.44.0) · « Tes écoutes par… » (graphique ; en année/mois/semaine, toucher
  une barre révèle l'**album du créneau** — album typique (score n²/total) dans
  `agg_stats` (v2.44.3) ; tappable → fiche. Onglet **Journée** (refonte
  v2.46.0, PM-18/ADR-050) : pas de total — une phrase « deux pics », les
  heures de pic (≥ 80 % du max) surlignées, et les **signatures de créneau**
  (`agg_commuting.signatures` : genres + artistes sur-représentés matin/soir/
  nuit) ; plus de chips de moments ni d'« album du créneau »). « Mes années » : une ligne par année,
  les 5 dernières affichées, un bouton sous le bloc déplie le reste ;
  depuis v2.28.0, l'action d'un bloc (voir tout, déplier) est un bouton
  pleine largeur **sous** le bloc (`moreButton`, « Voir les 17 adorés › »,
  « Voir les 13 années ⌄ » / « Replier »), plus une pastille en haut à droite ; toucher
  une année ouvre ses pastilles T1→T4 et la carte du trimestre choisi (§ 15).
  **Grammaire commune, cinq briques** :
  *Bloc* (`.moi-sec`, `secHead(titre, ligne)`, trait fin et même espace) ;
  *Ligne d'album* (`albumRow` : pochette 52 px, surtitre, titre, artiste,
  chiffre à droite — moments, 3 albums d'un trimestre) ; *Exemples*
  (`examples` : 3 pochettes titrées + « Voir les N » →
  `OrpheeLibrary.openCrate("adores" | "paradoxes")`, pas de défilement de
  côté) ; *Visage* (`face`) ; *Carte d'action* (« À faire », seul cadre).
  Quatre tailles de texte (24 · 19 · 15 · 13) ; un bloc qui porte une
  phrase-titre (« Qui je suis », « Mes années ») met son nom en *surtitre*
  (`secHead(…, kicker)`, 12 px capitales) et la phrase en titre (24 px,
  32 px sur PC) — v2.34.1 ; la couleur ne dit qu'une note
  ou une humeur. Détail d'un trimestre sans cadre ; « Raconte-moi » et
  « Nommer ce chapitre » en deux boutons identiques, le champ du chapitre ne
  s'ouvre qu'au toucher. Les photos d'artiste ignorent la silhouette par
  défaut de Deezer (`/images/artist//…`), côté serveur et client.
- **Bibliothèque** (PM-03) : bacs (Adorés + genres + Paradoxes), § 20.
- **Le Salon** (PM-12) : chat avec chips de suggestions.
- **En-tête commun** (`nav.js`, lot 2) : sur tous les écrans — mobile, fine
  barre en haut (marque, pastille de fraîcheur, roue des réglages) ; desktop,
  à droite de la barre d'onglets. La pastille affiche l'âge des données
  (`agg_global.last_refresh`, « il y a 3 j ») et lance un refresh au toucher
  (`refresh.js`, à la demande — ADR-005).
- **« À faire »** (`moi.js`) : une seule carte pour noter (PM-22) et classer un
  artiste (PM-21) ; sélecteur « Noter · n / Classer · n » quand les deux ont du
  travail, noter d'abord.
- **« Mes paradoxes »** (PM-27, `moi.js`) : Oddity (IM-6) lue via
  `orpheeOddity.list()` (bibliothèque, curation LIVE, réglages E6) ; 3 exemples
  (brique *Exemples*), la pastille d'en-tête ouvre le bac « Paradoxes » de la
  Bibliothèque.
- **Bouton retour (historique, `nav.js`)** : chaque écran et chaque couche
  (mode feuillette, panneau de recherche) pousse une entrée d'historique ; la
  fiche album aussi (`detail.js`). « Retour » remonte d'un cran et ne quitte
  l'app que depuis l'écran d'arrivée (« Moi », profondeur 0). Les fermetures
  d'interface (✕, clic extérieur, Échap, « ← Retour ») passent par
  l'historique (`OrpheeNav.closeLayer` / `back`).
- **Retour visuel** : toast commun (`window.OrpheeToast`) — enregistrement de
  la fiche album réussi (« Enregistré · Génial ») ou échoué (message d'erreur),
  au-dessus de la fiche et de la barre.
- **Texte d'Orphée** (Salon, récits) : rendu sûr partagé (`text.js`) — échappé,
  puis seuls `*italique*` et `**gras**` sont rendus.
- **Hors barre**, « ← Retour » (`data-back`) : **Réglages** (roue de l'en-tête :
  synchronisation, compte — dont le nom Last.fm —, puis « Avancé » replié —
  seuil « très écouté » et notes des paradoxes, PM-16). L'écran Stats n'existe
  plus (ADR-040).
- **Fiche album** (PM-04, PM-07 à PM-11) : hero, curation éditable (note, coup
  de cœur, genre/sous-genre, description), écoutes dans le temps, top titres,
  Écho. **Écoutes par année** (v2.49.0) : `renderChart` agrège le
  `monthly_distribution` (serveur) en années, comble les trous (année sans
  écoute = barre vide) et dessine les mêmes **barres** que la fiche artiste
  (`.ar-curve`) — aucun agrégat serveur ajouté. Depuis v2.24.0, la note se pose par **5 boutons** colorés (ceux de
  « Moi » ; retoucher la note la retire) et le genre puis le sous-genre par
  **pastilles** (retoucher retire), à la place du menu et des listes
  déroulantes. Depuis v2.26.0, le genre se choisit en **tuiles** 3 × 3 à la
  couleur du genre (`ORPHEE_GENRE_COLORS`, `refdata.js` — référence unique,
  aussi lue par `stats-util.js`), le sous-genre en grosses pastilles ; onde,
  gerbe `juice.burst` (12 à 22 pièces), phrase d'impact avec la part de
  territoire (même calcul que « Moi » : genre effectif, Podcast et non
  classés exclus) ; un genre à un seul sous-genre pose les deux ; le genre
  hérité de l'artiste (E8) est affiché et sa tuile cerclée de pointillés.
  Le tout est **replié** à l'ouverture de la fiche : un bouton résumé
  (`.dt-gsum` : genre de l'album, sinon celui de l'artiste en retrait, sinon
  « Choisir un genre ») déplie les tuiles en cascade ; elles se replient
  0,9 s après un choix complet (sous-genre posé, ou genre à sous-genre
  unique) ; la note posée donne une onde, un halo à sa couleur autour de
  la fiche (`.dt-overlay.glow`, `--dt-glow`), une phrase d'impact et des
  confettis gradués (`juice.js`). Invité (v2.24.1) : boutons et pastilles
  restent actifs pour essayer (une ligne l'y invite), `save()` n'écrit
  jamais et le dit une fois (« Pour essayer : rien n'est enregistré ») ;
  la fiche rouverte montre de nouveau la curation d'Axel.
- **Effets « délice »** (`public/js/juice.js`, v2.24.0) : `buzz` (vibration
  10 ms, Android), `countTo`, `burst`, `gradeParty(note, rect, couleur)` —
  4 / 8 / 14 confettis pour Zappé / Sympa / Génial, gerbe et trois salves
  pour Culte, et pour Adoré éclair doré, trois salves, pluie d'or entrant par
  le haut de l'écran et scintillements. Utilisés par la fiche album, « À
  faire » de « Moi » et Qualité ; coupés si `prefers-reduced-motion`.

---

## 11. Curation : builder partagé et tests ([ADR-027](./ADR.md#adr-027), implémenté)

La construction du **payload de curation** (action d'Orphée **ou** saisie fiche →
mutation `users/{uid}/grades/{album_sur}`) était **dupliquée** entre `detail.js`
(saisie manuelle) et `chat.js#executeActions` (proxy d'Orphée), chacune portant
la ligne `grade_label` fautive (D-2). Elle vit désormais dans une **fonction pure
unique**, `public/js/curation.js`, exposée via un **wrapper UMD** : à la fois
**global navigateur** (`window.OrpheeCuration`) et **`require()`-able par les
tests** `node --test`, sans étape de build ([ADR-002](./ADR.md#adr-002)) :

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api; // node (tests)
  else root.OrpheeCuration = api;                                            // navigateur
})(typeof self !== "undefined" ? self : this, function () {
  // buildCurationMutation(input) → {valid, reason, op:"set"|"delete", merge,
  //   fields, timestamps:[champs serverTimestamp]}
  return { buildCurationMutation, gradeLabel, isGradeInRange, isValidAlbumSur };
});
```

`detail.js` et `chat.js` **consomment** ce builder (fin de la duplication ;
`grade_label` dérivé en un seul endroit, cf. [ADR-026](./ADR.md#adr-026)). C'est
la **première brique d'infra de test front** du repo.

**Responsabilités du builder (pur, testé) :** normaliser une saisie / une action
en mutation, **valider** (note ∈ [1..5] ; `album_sur` sans `/`), signaler les
champs `timestamps` à poser en `serverTimestamp` (dont `graded_at` au premier
grade), **ne jamais** écrire `grade_label`. L'**I/O Firestore** (`.set(merge)` /
`.delete`, injection des `serverTimestamp`) reste une coquille mince, testée
manuellement.

**Tests** (`functions/test/`, `node --test`) : note 1-5 et hors-barème, note
nulle, dérivation/absence de `grade_label`, coercition `personal_fav`, comment
sans note (ne touche pas la note), garde slash, `graded_at` au premier grade.

> La **validation côté serveur** (existence album, feedback à Orphée) est au
> [§ 7.4](#74-validation-de-la-curation--une-erreur-reste-une-erreur-adr-027-révisé-par-adr-030).

---

## 12. Stats fiabilisées ([ADR-028](./ADR.md#adr-028), implémenté)

**Règle :** aucun visuel sans **donnée réelle** calculée au refresh. Donnée
**calculable** depuis les scrobbles → on l'agrège (avec **tests par agrégat**) ;
**non dérivable** → on retire le visuel. Pas de placeholder ni de légende qui
ressemble à du réel. **Random = layout uniquement**, **jamais** de la donnée
(c'était le cas des positions force-directed de la Constellation, retirée).
`available:false` = **vide honnête conditionnel**, légitime (cas de la Capsule
et des Personnalités, retirées en v2.12.0).

**Écran Stats retiré en v2.12.0** ([ADR-040](./ADR.md#adr-040)). Restent, dans
« Moi » : chiffres clés (`agg_global`), top artistes (`agg_top_artists_alltime`),
« Mes écoutes par… » (Ans / Mois / Semaine / **Journée** : `agg_stats` +
`agg_commuting`). **Journée** (refonte v2.46.0, PM-18/ADR-050 ; ex-« Ma
journée » v2.28.0) : barres horaires au vert de l'app, les **heures de pic**
(≥ 80 % du max) surlignées au vert clair — une phrase nomme les créneaux qui
portent un pic (« Ta journée a deux pics : le matin et le soir ») ; pas de
total. Sous le graphe, les **signatures de créneau** (`agg_commuting.signatures`,
`buildSignatures` : par matin 7-9 h · soir 18-20 h · nuit 0-5 h, les genres
et artistes **sur-représentés** vs toute la journée — `lift` + plancher de
volume relatif, sinon les plus écoutés ; heure de Paris approximée). Les
pastilles de moments et l'« album du créneau » (`moments[].top`, `hour_top`,
score n²/total) ne sont plus affichés ; `moments`/`hour_top` restent dans
l'agrégat. `agg_top_albums_alltime` reste calculé
(contexte d'Orphée). Supprimés, y compris leurs calculs : distribution des notes
(vue), top albums (vue), constellation, personnalités, capsule, découvertes.

`by_month` / `by_weekday` sont calculés dans `buildStats` (fonction pure,
testée). L'axe **Journée** ne crée pas d'agrégat à part : il lit `band`,
`moments` et `hour_top` de Commuting (ADR-028, une seule source horaire). Tout nouvel agrégat vient avec
ses cas de test (gate predeploy).

---

## 13. Mise en page desktop ([ADR-029](./ADR.md#adr-029), implémenté)

> **Historique (v2.0).** L'écran Stats décrit ci-dessous a été retiré en
> v2.12.0 ([ADR-040](./ADR.md#adr-040)) ; les mentions de `#view-stats` et du
> feed Stats ne valent plus. **Aujourd'hui** (CSS) : `.view` borné à
> `max-width: 1100px` centré (padding 24 px `@900`), « Moi » à 720 px, chat
> centré 720 px, Détail adaptatif `@container 980` ; le graphique « Mes
> écoutes par… » (`.st-section`) prend plus d'air `@900`.

L'app reste **phone-first**. À l'inspection, le contenu était **déjà** borné et
centré : `.view { max-width: 1100px; margin: 0 auto }` (+ padding `@900`), chat
centré 720 px, cartes Settings en 2 colonnes `@600`, Library avec rail de genres
+ grille `auto-fill` `@768`, Détail adaptatif `@container 980`. Le **seul vrai
manque** desktop était le **feed Stats**, plafonné à `max-width: 680px` → grandes
marges vides sur grand écran.

**Réalisé :**
- **Stats** : `@media (min-width: 900px)` → `#view-stats` passe à
  `max-width: 900px`, sections et overview **plus aérées** (padding élargi). Le
  récit reste en **colonne unique** (focale par focale) — c'est le design
  éditorial ; un masonry multi-colonnes a été **écarté** (hauteurs très
  variables → trous ; visuels resserrés). Le mobile (viewport < 680) n'est pas
  affecté.
- **Shell / Library / Détail** : déjà desktop-ready, conservés tels quels ; nav
  en onglets-haut conservée.
- **Vérification** : rendu **capturé en headless** (Playwright, harness local
  avec vrais CSS + modules + données mock) en desktop **et** mobile.
- **Écarté** : refonte multi-panneaux (sidebar verticale, 2-3 colonnes) —
  disproportionnée pour v2.0.

---

## 13 bis. Pochettes et photos (v2.18.0)

- **Pochettes** (`covers/`) : cherchées pour tout ce que l'app montre (fiches
  riches + albums au-dessus du seuil « très écouté »). Deezer d'abord (titre
  exact, puis titre sans mention d'édition — `cleanTitle`), **Last.fm en
  secours** (`album.getInfo`, `LASTFM_API_KEY`, étoile par défaut écartée).
  Un introuvable est retenté au bout de 30 jours ; 200 résolutions par refresh.
- **Photos d'artistes** (v2.18.1) : d'abord **via ses albums** — recherche
  d'album Deezer (`artist + album`, ses 2 albums les plus écoutés) dont
  l'artiste porte le même nom : l'album désigne le bon artiste quand le nom
  seul est ambigu (plusieurs « Last Train ») ; sinon recherche par nom,
  homonymes départagés par `nb_fan`. Silhouettes Deezer (`/artist//`,
  `d41d8cd98f00b204e9800998ecf8427e`) ignorées, côté serveur et client.
  `rules_version` : quand les règles changent, tout est re-cherché (`redo`),
  l'ancienne image restant affichée jusqu'à son tour.
- **Pochette générée** (repli) : voilée de sombre, initiales claires — sobre à
  côté des vraies pochettes.

## 14. Synchro Last.fm ([ADR-034](./ADR.md#adr-034), implémenté v2.16.0 — `functions/src/scrobbles/`)

Remplace l'export manuel (§ 3) pour PM-01. Sépare **l'import des faits**
(synchro) du **calcul des dérivés** (refresh) : le calcul relit les écoutes
depuis Storage seulement (jamais la Sheet ni `user.getRecentTracks`) ;
`refreshCache` n'appelle Last.fm que pour l'album canonique (`track.getInfo`)
et en secours des pochettes (`album.getInfo`).

**Flux « Actualiser »** (`refresh.js`) : `syncLastfm` puis `refreshCache` ; un
échec de synchro n'écrit rien et n'empêche pas le recalcul (toast).

**`syncLastfm`** (propriétaire, secret `LASTFM_API_KEY`) :
1. `to` = instant du clic (figé) ; `from` = `scrobbles_meta.last_uts`.
2. Utilisateur = `users/{uid}/settings/profile.lastfm_user` (Réglages ›
   Compte), validé `^[A-Za-z0-9_-]{2,40}$`.
3. `user.getRecentTracks` (`from + 1` → `to`, 200/page, toutes les pages,
   250 ms entre requêtes) ; lignes sans `uts` (*now playing*) ignorées ;
   **tout-ou-rien** (`lastfm.js`).
4. Normalisation (`model.js`) : `uts`, `artist`, `album`, `track` bruts (non
   rognés) ; `album_sur = {artist}-{album}`, `track_sur =
   {artist}-{album}-{track}`.
5. Fusion idempotente sur **(`uts`, `track_sur`)** dans chaque année touchée
   (append-only), puis `scrobbles_meta` (`last_uts`, `years`, `total`,
   `synced_at`, `last_added`).

**Stockage** (`store.js`) : Cloud Storage, `scrobbles/{YYYY}.ndjson.gz` (une
ligne = une écoute). `storage.rules` *deny-all* pour les clients ; accès
Functions (admin SDK). `refreshCache` lit les écoutes là, nulle part ailleurs.

**Migration (historique)** : les écoutes de la Sheet ont été copiées une fois
dans Storage (`migrateScrobbles`, faite le 2026-10-10) ; les clés abîmées par
les conversions de Google Sheets ont été réparées depuis le texte affiché
(décision PM, v2.16.2 ; notes sur une clé disparue supprimées) ; le code de
migration a été retiré en v2.17.0 ([ADR-044](./ADR.md#adr-044)).

**Mode local** : émulateur Storage ; `syncLastfm` y fabrique 12 écoutes après
la dernière connue (ni clé ni réseau).

**Hors périmètre** : doubles scrobbles entre applis (non dédoublonnés,
décision PM) ; modifications/suppressions faites sur Last.fm après import.

**Prérequis console** : Storage activé ; secret `LASTFM_API_KEY` posé par
Axel (`firebase functions:secrets:set LASTFM_API_KEY`, ou Secret Manager).

---

### Album canonique (v2.21.0, PM-29, [ADR-045](./ADR.md#adr-045) — `functions/src/albums/`)

Appliqué aux écoutes au début de `refreshCache` et de `exportListens`, avant
tout agrégat ; les écoutes Storage ne changent pas. Une écoute réécrite garde
`raw_album_sur`.

- `canon.js` (pur, testé) :
  - `editionKey` — minuscules sans accents ; retire « - Single/EP », les groupes
    entre parenthèses faits de mots d'édition (deluxe, remaster, anniversary,
    expanded, bonus, explicit, édition…, années), et ces mots en fin de titre ;
    depuis v2.23.4, une mention après « : » ou « - » en fin de titre faite
    de ces mots, et « expansion » / « réédition » / « augmentée » seulement
    quand ils sont marqués ainsi (entre parenthèses ou après « : » / « - ») ;
    garde tout groupe contenant remix, live, acoustic, instrumental, demo… ;
  - `isSuspect(album, titre)` — vide, « - Single/EP », ou même clé que le titre ;
  - `canonicalize(scrobbles, {resolved, splits, graded})` — 1) libellé suspect
    → album résolu du titre ; 2) groupes (artiste, `editionKey`) → un libellé :
    noté le plus récemment, sinon venu de la bibliothèque, sinon le plus
    écouté (« - Single » retiré sauf s'il porte la note) ; `splits` (libellés
    séparés) échappent aux deux règles. Renvoie aussi `variants`
    (album canonique → libellés bruts réunis, avec leur nombre d'écoutes).
- `resolve.js` : `track.getInfo` (autocorrect) ; `pickTrackAlbum` refuse un
  autre artiste (compilations) ou un album lui-même suspect. Cache
  `derived/track_albums.json.gz` (Storage, Functions seules) :
  `track_sur → [album|null, uts]` ; par « Actualiser » 45 s, 4 en parallèle,
  plus écoutés d'abord ; `null` réessayé après 30 jours ; échec réseau non
  mis en cache. Pas de réseau dans l'émulateur ni pour l'export.
- `index.js` : `album_splits` (ancienne curation « Séparer »,
  `users/{uid}/album_splits/{encodeURIComponent(album_sur)}`) **migrée** au
  premier passage (v2.32.0, `migrateSplits` / `splitCorrections`, testée) :
  pour chaque titre reçu sous un libellé séparé, une correction appliquée
  `{artist, track, raw_album_sur, to_album: libellé, to_album_sur: libellé,
  source: "split", batch: "separations"}` (id = `itemId`), plus le lot
  `correction_batches/separations` ; puis les séparations sont supprimées.
  Canon : une correction dont la cible est le libellé reçu lui-même
  (« remettre à part ») le garde tel quel, hors des groupes d'édition.
  `graded` = notes et leur `updated_at`.
- Carte de bibliothèque : `variants` (≤ 12) ; `refreshCache`
  renvoie et journalise `canon_pending` (titres restant à résoudre), écrit
  aussi dans `cache/agg_global` (`canon_pending`, `canon_merged`) et affiché
  dans Réglages › Synchronisation (`lastfm.js`, v2.21.1).
- Fiche album (`detail.js`) : section « Rattachés à cet album » (libellé,
  n×), pour information, et « Revoir ces titres dans Qualité › »
  (`OrpheeQuality.reviewAlbum`) : revue sur les titres rangés d'office sous
  cet album. Qualité : items `k: "linked"` (`buildQuality`, v2.32.0) — un
  par (artiste, titre, libellé reçu) dont l'album canonique diffère du
  libellé, hors items MusicBrainz ; silencieux (ni « à trancher », ni
  santé : déjà dans `base_listens`) ; carte : « Garder ici » / « Remettre
  à part » (décision « déplacer » vers le libellé, puis Appliquer).
  Invité : liste seule.

### Export pour analyse (v2.20.0 — `functions/src/export/`)

Réglages › Synchronisation › « Exporter pour analyse » : `exportListens`
(callable, propriétaire seul, lecture seule) relit écoutes (Storage) et
curation (Firestore) et renvoie un **JSON compact** que le client télécharge
(`orphee-export-AAAA-MM-JJ.json`) :

Depuis v2.33.1, `tops` : une ligne par album d'au moins 5 écoutes —
`[n° d'album, titre le plus écouté, ses écoutes, titres différents joués]`
(≈ 30 Ko), pour régler le « titre phare » sur la vraie bibliothèque.

```json
{ "version": 1, "exported_at": "…",
  "columns": { "albums": ["artist","album","genre","sousgenre","grade"],
               "listens": ["uts","album"] },
  "albums": [["Muse","Absolution","Rock","Alternative",4], …],
  "listens": [[1767225600, 0], …] }
```

Chaque album une fois ; écoutes triées, `album` = indice dans `albums`.
Albums **canoniques** (v2.21.0). **Diagnostic** (v2.21.2) : `diag.rows` =
`[artist, album, raw_album, track, suspect, lastfm]` pour chaque morceau
distinct des albums canoniques de ≤ 4 écoutes et, depuis v2.22.0, de chaque
libellé suspect (`lastfm` : album en cache, `null` = inconnu, `""` = jamais
cherché) ; v2.22.0 ajoute la proposition MusicBrainz `mb_kind, mb_album,
mb_year, mb_pos, mb_exact, mb_reason` (vides tant que le titre n'a pas été
vérifié). Seuls ces morceaux-là y figurent (PM-30).
Genre : celui de l'album, sinon celui de l'artiste. **Exclus** : commentaires,
conversation, récits. ~17 octets par écoute, plus le diagnostic.

### Vérification MusicBrainz (v2.22.0, PM-33, [ADR-046](./ADR.md#adr-046) — `functions/src/quality/`)

**Mode à blanc** : calcule et met en cache, ne change aucun album.

- `mb.js` (pur, testé, sauf `searchRecording`) :
  - `searchRecording(artiste, titre)` — `GET musicbrainz.org/ws/2/recording?query=…&fmt=json&limit=50`,
    requête Lucene `recording:"<titre de base>" AND artist:"<artiste>"`
    (titre de base : sans groupes entre parenthèses/crochets, « - … » final
    ni « feat. » ; nom composé « A et B » : `(artist:"A et B" OR artist:"A")`),
    d'abord avec `AND primarytype:album AND status:official`, puis sans
    filtre si aucun album studio n'est trouvé (deux requêtes espacées
    d'1,1 s) ; `User-Agent: Orphee/2.22 ( https://orphee-e7377.web.app )`,
    rien d'autre n'est envoyé ;
  - `parseSearch` — garde les enregistrements de même titre de base et de
    même artiste (ou de son artiste principal), leurs sorties officielles
    qui ne sont pas d'un autre artiste : `{rg, title, type, sec, date, disc,
    pos, total, release, exact}` (`exact` ignore les crédits d'invités,
    `stripFeat`) ; `compact` réduit à la plus ancienne sortie par album
    studio (et par version exacte) et un exemplaire par autre type ;
  - `propose(hits, albumActuel, {played, library, single, label})` — titre
    joué en remix/live/acoustique (`isOtherCut`, mentions entre parenthèses
    ou après « - » seulement) → `keep` ; libellé reçu d'album live
    (`isLiveLabel` : « Live at/in/from… », « … Live », « (Live) »,
    « Unplugged », « en concert », acoustique hors tête de libellé,
    « live/BBC/studio sessions » ; pas « Live Through This », « Dying to
    Live ») → `keep` « Album live : à part » (v2.35.0) ; album studio = type `Album` sans type
    secondaire (sauf `Mixtape/Street`) ; `ok` si l'album actuel en fait
    partie ; titres d'albums comparés par `albumKey` (clé d'édition,
    accolades comme parenthèses, « Pt. 2 » = « {Part Two} » = « Part II »,
    « Vol. » = « Volume ») et par les titres de **toutes** les sorties du même
    album (`alt`, gardés par `compact`) ; sinon le plus ancien, **parmi les albums de la bibliothèque
    s'il y en a** (`libraryIndex` : albums canoniques de plus de 4 écoutes,
    par artiste). `sure` seulement si version exacte, album de la
    bibliothèque, disque 1, hors coffret (piste > `BONUS_POS` 20 d'une
    sortie de plus de `BOX_TRACKS` 30 titres : coffret ou réédition au nom
    de l'album, v2.35.0), pas d'autre album la même année ; sinon `check`
    avec sa raison ; `keep` (single/EP, bande originale, aucun album
    studio), `unknown` ;
  - `mbTargets` — titres des albums canoniques de ≤ 4 écoutes et des
    libellés suspects, hors cache (`null` réessayé après 30 jours), plus
    écoutés d'abord. Clé `fold(artiste)|fold(titre)`.
- `store.js` : cache `derived/mb_tracks.json.gz` (Storage, Functions seules),
  `{version: 2, entries: {clé → [sorties|null, uts]}}` ; une autre version
  est ignorée (réinterrogée).
- `index.js` : `verifyCatalog` (callable, propriétaire seul, 1800 s, 1 GiB).
  Verrou et progression dans `cache/quality_progress`
  `{running, total, remaining, down, last_looked, started_at, updated_at,
  finished_at}` (verrou périmé après 3 min sans nouvelles) ; 1 requête toutes
  les 1,1 s, jusqu'à 28 min ; cache et progression écrits tous les 50 titres ;
  arrêt après 5 échecs réseau de suite (non mis en cache).
- Propositions pour l'écran (`model.js`, pur, testé) : `buildQuality(écoutes
  canoniques, cache, deps)` → une proposition par (artiste, titre, libellé
  reçu) — id `itemId` = 20 premiers hex du SHA-1, aussi id de l'arbitrage —
  `{id, a, t, f, r, s, n, k, to, y, p, c, x, w, rel, ts}` (`ts` : album_sur
  de l'album proposé s'il est dans la bibliothèque, et `to` prend alors son
  libellé) ; les « ok » sont
  seulement comptés — sauf s'ils portent un doute. `rv` (v2.35.0,
  `doubtOf(libellé reçu, album, proposition)`) : titre rangé ailleurs que
  son libellé dont le libellé est live et l'album non, ou dont l'album
  d'arrivée ne le contient qu'en coffret (même seuil) ; calculé pour les
  propositions et les rattachés d'office (avec le cache MusicBrainz).
  Client : tuile « à revoir » = items `rv` sans arbitrage, ou à
  arbitrage « déplacer » non `reviewed` ; carte « ↺ Rangement à revoir »
  (album d'aujourd'hui / libellé d'origine). « Garder ici » → arbitrage
  `reviewed: true` (créé depuis la correction appliquée s'il n'existe pas) ;
  « Remettre à part » → arbitrage « garder » `reviewed`, correction
  appliquée supprimée et « Actualiser » (sans correction : décision
  « déplacer » vers le libellé, au prochain lot) ; tous deux annulables.
  Anti-rafale (`ARM_MS` = 400) : une carte fraîche ignore les touchers.
  Chaque arbitrage enregistre `proposed_album`, `proposed_kind`,
  `proposed_reason` ; l'export (`quality.decisions`) les reprend, avec
  `reviewed`, et `quality.applied` liste les corrections appliquées. Résumé : `total_listens`, `base_listens` (hors titres
  douteux ou déjà au bon album), `unverified_listens`, nombres de titres et
  d'écoutes par issue. Écrit par `refreshQuality` (fin de `verifyCatalog`, et
  en parallèle de chaque `refreshCache`) dans `quality/summary` et
  `quality/items_{i}` (paquets de 800). Règle : **lecture propriétaire seul,
  écriture interdite** (`firestore.rules`, IM-8, IM-1).
- **Onglet Qualité** (`public/js/quality.js`, `css/quality.css`, v2.23.0) :
  4ᵉ onglet. **Invité : démo** (v2.32.1) — `demoCopy` lit une fois l'état
  d'Axel, puis arbitrages, passés, corrections, lots et notes reportées
  vivent dans des tables en mémoire (`memCol`, même interface que
  Firestore : rien n'est écrit, pas d'« Actualiser », pas de vérification
  MusicBrainz) ; bandeau « Démo · essaie tout, rien n'est enregistré ». Accueil : anneau de santé =
  (`base_listens` + écoutes « laissées telles quelles » confirmées par
  MusicBrainz + écoutes tranchées par Axel) / total, et la projection avec
  les sûres ; grand bouton « Vérifier N titres » (seul accès à la revue
  depuis v2.28.0, la tuile « à vérifier » faisait doublon) ; tuiles seront
  corrigés / laissés tels quels / passés / tes décisions ; bloc de vérification (lance `verifyCatalog`, progression
  `cache/quality_progress` en direct). Revue : une carte par titre « à
  vérifier » (file figée à l'ouverture, plus écoutés d'abord) — album actuel,
  preuve (pochette de la bibliothèque, sinon Cover Art Archive
  `coverartarchive.org/release/{id}/front-250`, année, piste, même version
  ou non ; depuis v2.23.3 le titre entre la piste précédente et la suivante,
  tels que MusicBrainz les écrit — `GET musicbrainz.org/ws/2/release/{id}?inc=recordings+artist-credits` (le crédit d'artiste de l'édition s'affiche sous l'album proposé, v2.23.11)
  demandé **par le navigateur** à l'affichage, une requête à la fois espacée
  d'1,1 s, gardée en mémoire de session, seul l'identifiant de l'édition est
  envoyé ; titre retrouvé par titre exact, titre de base, sinon par sa
  place ; toucher l'album → l'édition sur musicbrainz.org ; « Écouter » →
  YouTube Music, comme la fiche album, `/yt` sur Android)  ; depuis v2.23.10 chaque bloc porte son bouton — « Garder ici » / « Garder
  tout » sur l'album actuel, « Déplacer ici » sur la proposition (toucher
  l'album ne fait que vérifier : fiche ou MusicBrainz), la liste des titres
  réservant sa hauteur — puis « Chercher un autre album… » (albums de l'artiste
  dans la bibliothèque, recherche). Listes par artiste, 150 par page ; un
  titre ouvre un panneau (remettre l'ancien, annuler sa décision, choisir un
  album). Sous-écran et panneau sont des couches (`OrpheeNav.openLayer`) :
  « retour » ferme le panneau puis revient à l'accueil (v2.24.0 : les deux albums de la carte sont à égalité ; le choix s'allume — contour, reflet, ✓ — l'autre s'efface, puis la carte part tout droit en 0,16 s et la suivante arrive en 0,2 s ; barre de progression, compteur de série 🔥 qui chauffe — or à 5, orange à 10, rouge à 15, étincelles dès 8 — annonces à 5 puis toutes les 10 ; au retour l'anneau et « à vérifier » défilent, le gain flotte ; gerbe en fin de revue) ; le panneau se ferme aussi en le glissant vers le bas (> 90 px, depuis le haut de son contenu) ou par Échap. Bandeau « Annuler »
  après chaque décision. « Garder tout l'album » (v2.23.6, carte et panneau,
  si plusieurs titres rangés aujourd'hui sur le même album — quel que soit
  le libellé reçu, depuis v2.23.7 — sont sûrs ou à vérifier) : une
  décision « garder » par titre (`scope: "album"`), écrites par lots, retirées
  ensemble par « Annuler ».
  **Appliquer (v2.30.0, E10, ADR-046)** : l'accueil devient un processus
  vertical — ① à trancher (cartes `check` non tranchées, « Trancher ») →
  ② prêts (`readyItems` : `sure` non tranchés + arbitrages `move`, hors
  déjà appliqués ; « Appliquer ») → ✓ dans ta bibliothèque
  (`applied_corrections`, toucher → lots) ; anneau : plein = aujourd'hui,
  pointillé (`dashTo`) = une fois appliqué. « Appliquer » ouvre « Ce qui va
  changer » : sûres / décisions / total, et les **albums notés qui se
  vident** (somme des écoutes partantes ≥ écoutes de l'album) avec le choix
  de la note (reporter / laisser ; si l'album d'arrivée est déjà noté :
  garder la sienne / prendre l'autre). Écriture par paquets de 400 :
  `users/{uid}/applied_corrections/{itemId}` = `{artist, track,
  raw_album_sur, to_album, to_album_sur, source: mb|axel, batch, at}`,
  notes reportées dans `grades`, lot `users/{uid}/correction_batches/{id}`
  = `{at, count, carried[{from_sur, to_sur, grade, prev}]}` ; puis
  `OrpheeRefresh.run()`. `applyCanon` lit `applied_corrections`
  (`loadApplied`) : `canonicalize` fixe le titre d'album de l'écoute dont
  (artiste, titre, album_sur brut) correspond (`correctionKey`, avant
  séparations et Last.fm), puis l'album rejoint son groupe d'éditions
  (testé). Annuler un titre (supprime sa correction) ou un lot (supprime
  ses corrections, remet `prev` ou supprime la note reportée, supprime le
  lot) relance l'actualisation. Règles : owner seul (`users/{uid}/*`).
  Règle « sûr » élargie : `propose(…, {single})` — libellé reçu suspect
  (`isSuspect`) → sûr même si l'album est absent de la bibliothèque.
  « Je ne sais pas · passer » (v2.27.0) : `users/{uid}/quality_later/{itemId}`
  = `{artist, track, raw_album_sur, raw_album, proposed_album, reason,
  listens, at}` — pas un arbitrage, sans effet sur le rattachement (IM-9) ;
  la carte glisse vers le bas, la série n'est ni comptée ni cassée. Les
  passés vont en fin de file ; quand il ne reste qu'eux : « Il reste N titres
  passés » → « Les revoir » (repasser en revoyant les remet à la fin) ou
  « Plus tard » ; tuile « passés » à l'accueil. Une décision efface la marque.
  `exportListens` ajoute `quality = {decisions[], later[]}`
  (`buildQualityReview`, testé) pour les regarder ensemble.
- **Arbitrage** (curation, IM-9) : `users/{uid}/album_arbitrations/{itemId}`
  `{artist, track, raw_album_sur, decision: "move"|"keep", to_album,
  to_album_sur?, at}`, écrit par le client (propriétaire seul, règle
  générale `users/{userId}/**`), lu en direct (`onSnapshot`). **Pas encore
  appliqué** au rattachement : ce sera la bascule (étape 4) ; d'ici là
  « Séparer » reste sur la fiche album.

## 15. Trimestres & humeurs (PM-19, implémenté — `functions/src/refresh/quarters.js`)

**Période** = trimestre calendaire UTC. Par trimestre, à partir des faits :
`listens` ; `top_share` (part de l'album le plus écouté) ; `rap_share` ;
`intense_share` (Rock · Metal / Hard / Punk) ; `calm_share` = max(part
Classical / Jazz / Electro · Ambiant, Downtempo, Instrumental ; part des
écoutes de nuit 22 h → 5 h, heure de Paris approximée) ; `new_share` (albums
découverts dans le trimestre) ; `old_share` (albums découverts ≥ 3 ans avant).
**Genre effectif** = genre de l'album s'il est classé, sinon celui de l'artiste
(curation `users/{uid}/artist_genres`) — MODELE E8.

**Humeur** (Segmentation dérivée, IM-6) — **comparée à soi** depuis v2.14.0
([ADR-043](./ADR.md#adr-043)). Avec au moins 6 trimestres complets (≥ 30
écoutes, hors trimestre incomplet), on calcule la **moyenne et l'écart-type**
de chaque indicateur (`baselineOf`) ; l'humeur est l'indicateur dont l'écart
`z = (valeur − moyenne) / max(écart-type, 4 pts)` est le plus grand, **s'il
atteint 1** et si l'indicateur pèse au moins la moitié de son seuil absolu ;
sinon aucune (`mood_reason: "habitudes"`, « Dans tes habitudes »). Chaque
trimestre porte `baseline` (moyennes) pour la description chiffrée (« 52 % de
rap, contre 31 % d'habitude ») et `mood_rule` (`relative` / `absolute`). Le
trimestre de la dernière écoute est `partial` s'il n'est pas fini
(`data_until` = dernière écoute) : exclu des habitudes, signalé « incomplet ».

Repli (moins de 6 trimestres complets) : seuils absolus, `MOOD_RULES`, score =
indicateur / seuil :

| Humeur | Indicateur | Seuil |
|---|---|---|
| Obsession | `top_share` | 30 % |
| Intensité | `intense_share` | 35 % |
| Énergie | `rap_share` | 40 % |
| Introspection | `calm_share` | 35 % |
| Exploration | `new_share` | 40 % |
| Ancrage | `old_share` | 50 % |

L'humeur retenue est celle du plus haut score **s'il atteint 1** ; sinon aucune
(`mood_reason: "mixte"` — rien ne domine, pas d'étiquette plaquée) ; sous
30 écoutes, aucune (`"volume"`). **Bascule** = l'humeur change par rapport à
la dernière humeur franche. `refreshCache` journalise la répartition
(`quarters moods`).

**Écoutes sans album** (`Artiste-`, titre seul ou vidéo YouTube scrobblée
sans album — absentes de la bibliothèque) : elles comptent dans le volume,
les genres et l'heure, mais **ne sont pas des albums** (IM-4) — ni dans les
albums d'un trimestre ou d'une année, ni dans ses découvertes (`fresh`,
`old`, `new_albums`), ni dans « Ma journée » (`buildCommuting`) ou
`agg_top_albums` (v2.31.5 ; avant, « 3 Hours of Dark Fantasy Music- »
apparaissait comme album, sans artiste ni fiche).

**Un seul titre / titre phare** (v2.34.0, `buildOneTrack`,
`cache/agg_one_track`) : depuis `album_stats` (titre le plus écouté,
`unique_tracks_played`, `listen_count`) — part ≥ 35 %, part × titres joués
≥ 3, ≥ 20 écoutes du titre, ≥ 4 titres joués, album nommé ; réglé sur
l'export du 2026-10-12 (14 albums). Client : bloc « Un seul titre » de Moi
(3 lignes, « Voir les N titres »), albums notés Culte/Adoré ou coups de
cœur écartés à la volée ; encart « Titre phare » et titre en or sur la
fiche album (sans filtre de note).

**Genres dans le temps** (v2.33.0, `public/js/moi-genres.js`, en tête de
« Mes années ») : chaque élément de `agg_quarters.items` porte `styles`
(écoutes classées par `"genre|sous-genre"`, genre effectif : album, sinon
artiste) ; le client en tire, sur les trimestres d'au moins 150 écoutes :
les 3 genres les plus écoutés de la période (couleurs `ORPHEE_GENRE_COLORS`),
leurs parts par trimestre (sur les écoutes classées, le reste en « Autres »),
une bande de volume (`listens`), un titre (genre en tête au début vs à la
fin de la période) et une légende dynamique (période ou trimestre en
focus). Sous-genres d'un genre choisi : mêmes calculs, nuances de la
couleur du genre (foncée, elle-même, claire), colonne pâle sous 30 écoutes
du genre. Focus partagé entre les deux graphiques, retiré par un toucher
hors colonnes.

**Années** (v2.15.0, « Mes années ») : `buildQuarters` renvoie aussi `years`
(plus récente d'abord) — mêmes indicateurs et même humeur comparée à soi
(habitudes sur ≥ 3 années complètes, sinon seuils absolus), `top` (album qui
**illustre le titre** de la ligne, v2.31.6 : le plus écouté de l'artiste
`surge`, sinon du style `style` / `usual` / `dominant` — genre effectif de
l'album, sinon de l'artiste ; repli : le plus écouté de l'année),
`discovery` (album découvert cette année-là le plus écouté, autre que `top`
si possible), `partial` / `data_until`, `style` (genre · sous-genre dominant + part),
`highlight` (v2.19.0, `yearHighlights`, ce qui distingue l'année face aux
années d'avant) : `surge` — un artiste à ≥ 3 % des écoutes et ≥ 4× sa
meilleure part passée (ou absent avant), le plus gros écart (« Fulgurance :
X ») ; sinon `style` — un sous-genre à ≥ 5 %, ≥ 1,5× et ≥ +3 pts sa part
moyenne passée (« Plus de rap · cloud ») ; sinon `usual` (« Rock ·
alternative, comme d'hab ») ; première année ou < 30 écoutes : `dominant`. Écrit
dans `cache/agg_quarters` à côté de `items`. **Années blanches** (v2.18.0,
`blankYears`) : moins de 100 écoutes **et** moins de 5 % de l'année médiane —
écartées des années, de leurs trimestres, des habitudes et du graphe « Ans »
(même règle côté client, `stats.js`).

**Front** (`moi.js`, « Mes années ») : une ligne par année — l'année en grand
(24) à gauche, pochette de l'album de l'année (52 px, liseré couleur
d'humeur) ; humeur + écart court (15 / 13,5) ou, sans humeur, le
`highlight` (en 3e ligne sinon) ; album (13) ; écoutes, découverte, chapitres, « en cours » (12) ; 5
dernières années, la pastille d'en-tête (nombre d'années) déplie le reste. Toucher une année ouvre 4 pastilles T1→T4 et la carte du
trimestre choisi (humeur, description chiffrée, albums, récit, chapitre). Les
noms/couleurs d'humeur sont de la présentation ; les règles vivent côté
serveur seulement.

---

## 16. Boucle de curation (PM-22, PM-23 — `selection.js` + `moi.js`)

**Serveur** (`buildRecent`, testé) : faits récents seulement. « Récent » est
relatif à la **dernière écoute connue** (`ref_uts`), pas à l'horloge — avec un
import en retard, « ces 30 derniers jours » reste parlant. `hot` : albums les
plus écoutés sur 30 j ; `dormant` : albums les plus écoutés, plus écoutés depuis
≥ 2 ans ; `classified_artists` : artistes avec un genre dans `artist_genres`.

**Client** (curation LIVE, ADR-031) — la sélection ne décide rien (IM-6/IM-7) :
- **file du jour** ≤ 3 : jusqu'à 2 albums « chauds » **non notés** (≥ 3 écoutes
  récentes) + 1 album **noté 5 endormi** (« toujours ? »), complétée par des
  chauds ; « Passer » écarte un album 30 jours (`localStorage`, confort
  par appareil) ;
- **noter** = un tap 1-5, écrit via le builder partagé (`curation.js`,
  ADR-027 ; genre/sous-genre préservés par le merge), puis
  `orphee:album-graded` ;
- **retour d'impact** calculé avant/après, jamais inventé : entrée / sortie des
  adorés, gain de netteté, invitation à classer si l'album n'a pas de genre.

**Netteté du portrait** = part des écoutes portée par des albums **notés et
classés** (genre de l'album, sinon de l'artiste). Affichée dans « Qui je suis »
par sa barre seule : le flou du titre sous 70 % (maquette v3) a été retiré en
v2.13.2, à la demande du PM (lu comme un défaut d'affichage).

Correctif lié : la bibliothèque ne perd plus genre / sous-genre / description en
mémoire quand un événement de note ne porte que la note.

---

## 17. Chapitres & récits (PM-20, PM-25)

**Chapitres** (`moi.js`, curation d'Axel — E7) : un chapitre couvre des
trimestres **consécutifs** (`from` → `to`) ; un trimestre appartient
à au plus un chapitre. Depuis v2.29.0 ([ADR-047](./ADR.md#adr-047)), il naît
de « Raconte-moi » : le titre renvoyé par `narrateQuarter` devient `label`
(`by: "orphee"`), le récit va dans `users/{uid}/chapter_texts/{id}` =
`{text, by, updated_at}` (owner seul par la règle générique ; l'invité lit
`chapters`, jamais les textes). Plus de bouton « Nommer ». « Modifier le
chapitre » : titre + description (`by: "axel"` si la description change),
« Prolonger au trimestre suivant » (si libre), suppression (confirmée, texte
compris). La description s'affiche à chaque visite ; « Raconte-moi » disparaît une fois racontée. Le chapitre s'affiche sur la ligne de
l'année (« Mes années ») et dans la carte du trimestre. **Carte du trimestre**
(v2.31.1), de haut en bas : titre (le chapitre, sinon la période) + badge
d'humeur ; une ligne grise (période si chapitre, « après « humeur
précédente » » si bascule, « en cours · jusqu'au … » si incomplet) ; le récit
— sans récit, la phrase qui justifie l'humeur (`quarterDesc`) ; 3 chiffres ;
3 albums ; les gestes. Écriture client dans `users/{uid}/chapters` (règle
owner existante).

**Récits** (`chat/narrate.js`, [ADR-037](./ADR.md#adr-037)) : `factsOf` (faits
lisibles, sans curation ni chapitre) → `factsHash` (sha256 + version de
consigne) → cache `users/{uid}/narrations/{key}` ou appel Anthropic
(`max_tokens` 600, system prompt d'Orphée en cache, sans outils) ; `refusal` et
erreurs API → message propre ; tags retirés (`parseTags`). Consigne v2
(v2.29.0) : une première ligne « Titre : … » (2 à 6 mots, musique
seulement), séparée par `splitTitle` (testé) ; réponse `{title, text}`. Front : bouton
« Raconte-moi », texte échappé, `*titre*` en italique.

**Noms d'humeur** : source unique serveur (`MOOD_RULES.label` →
`agg_quarters.items[].mood_label`) ; le front ne garde que couleur et
description.

---

## 18. Classification d'artiste (PM-21, [ADR-038](./ADR.md#adr-038))

**Import unique** depuis l'onglet `Artists` de la Sheet (v2.7.0,
`source: "sheet"`) : fait, puis retiré du code en v2.17.0 (ADR-044). Seule
`artist_genres` fait foi (`loadArtistGenres` la lit, rien d'autre).

**Genre effectif** = album, sinon artiste — utilisé par `quarters.js`,
`selection.js` (côté serveur) et `OrpheeArtists.effective` (côté client :
territoires, netteté, étagères de la Bibliothèque, « À qualifier »).

**Passe guidée** (`moi.js`, carte « Classer un artiste ») : parmi les
150 artistes les plus écoutés, ceux sans classification et dont au moins un
album n'a pas de genre propre, du plus écouté au moins écouté ; genre puis
sous-genre en chips (R2, `refdata.js` ; un genre à sous-genre unique se classe
d'un geste) ; « Passer » 30 j (`localStorage`). Retour d'impact calculé
(albums désormais comptés, gain de netteté).

---

## 19. Fiche artiste (PM-26)

**Images** (`functions/src/covers/artists.js`, même principe que les pochettes,
[ADR-015](./ADR.md#adr-015)) : au refresh, pour les 150 artistes les plus
écoutés, d'abord **via ses albums** — recherche d'album Deezer
(`/search/album`, ses 2 albums les plus écoutés) dont l'artiste porte le même
nom (`pickArtistFromAlbums`) ; sinon recherche par nom `/search/artist`, nom
normalisé exact, homonymes départagés par `nb_fan` (`pickArtistImage`).
Résultat mémorisé dans `cache/agg_artist_images` (URL, ou `null` = inconnu de
Deezer) ; un échec réseau n'est pas mémorisé (retenté au refresh suivant).
Au plus 150 résolutions et 25 s par refresh (§ 13 bis).

**Vue Artistes** (v2.40.0, PM-37) : `cache/agg_artists` (`buildArtists`,
`refresh/artists.js`, pur, testé) = `{years, rows {piliers, decouvertes,
retrouvailles, fulgurances, perdus}, series {artiste → {y, n, first}},
with {artiste → [{a, n}]}, count, mine}` — années actives (`blankYears`
exclues), séances (écoutes à moins de 30 min), « Souvent avec » ≥ 10
séances, 4 au plus ; courbes pour les 300 plus écoutés + ceux des récits
(pas de tableaux imbriqués : Firestore les refuse). Client :
`library.js` (bascule `.lb-mode`, `localStorage` `orphee.lib.mode`,
`openCrate` force Albums, la loupe montre `.lb-sartists` au-dessus des
albums) et `lib-artists.js` (`OrpheeArtistsView.render/strip` : récits,
« Par genre » sur la curation live — genre de l'artiste, sinon genre le plus
écouté de ses albums).
« Ta musique » (v2.42.0) : `refreshCache` lit `settings/profile.artist_name`
(casse ignorée) ; `buildArtists` sort cet artiste des récits (9 au plus par
récit) et écrit `mine = {artist, tracks [{t, n}] (5)}` ou `null` ; le client
l'affiche en tête (« La BO de ta campagne ») et l'exclut de « Par genre ».
Un changement de nom prend effet au prochain « Actualiser ».
Fiche artiste (v2.41.0) : courbe `series` sous l'en-tête et « Souvent avec »
(`with`) ; toucher un voisin = `hop()` : la fiche se redessine et pousse une
couche `artist-hop` dont la fermeture restaure l'artiste précédent. Les
couches de `nav.js` portent leur profondeur (`orpheeDepth`) : `popstate`
ferme toutes celles au-delà, donc « fermer » après N sauts fait
`history.go(-(N + 1))`.

**« Tes mondes »** (v2.48.0, PM-40, ADR-052 ; supersède la constellation
égocentrée v2.47.0) : `cache/agg_clusters` (`buildClusters`,
`refresh/artists.js`, pur, testé) = `{top_n: 100, min_edge: 20,
resolution: 1.5, clusters [{top, plays, members [{a, n}]}], bridges}` —
communautés de co-écoute trouvées par **Louvain** (`louvain()`, local-moving
pondéré, **déterministe** : ordre fixe, départage par plus petit id →
agrégat reproductible) sur les 100 plus écoutés, liens ≥ 20 séances,
résolution 1,5 ; artistes isolés (degré 0) écartés ; clusters triés par
écoutes ; `bridges["i-j"]` = séances entre deux mondes (par rang). Le genre
n'y entre pas (coloré/nommé live, ADR-031). Client `worldmap.js`
(`OrpheeWorldmap.open(artiste)`, couche `nav.js`) : archipel plein écran. La
**disposition** (force sur les centroïdes : le poids d'un pont **rapproche**,
répulsion + anti-chevauchement dur, recadrage) et le **zoom** (pince/pan/
molette) sont côté client. Taille d'île = `plays` ; couleur = genre dominant
live. Les **membres** (bulles + **portraits** Deezer `agg_artist_images`,
sinon initiales, + noms) vivent dans un **calque à l'échelle de l'écran**
(`.wm-members`, positionné en JS depuis les coordonnées monde par `applyT`),
JAMAIS mis à l'échelle en bitmap → **nets au zoom** (v2.48.1). Niveau de
détail : `--z` (noms, apparaissent au zoom), `--iz` (étiquette de monde,
s'efface). Ouvert depuis l'artiste X :
`focusIsland` centre et zoome sur le monde de X, sa boule entourée (`.foc`).
**Tap** sur un monde → feuille de ses membres (chacun ouvre sa fiche). Visible
si `OrpheeWorldmap.has(artiste)`.

**Fiche** (`public/js/artist-sheet.js`) : « Ses albums », puis « À part »
(v2.36.0) : cartes portant `nature` (`albumNature`, `quality/model.js`, pur,
testé — libellé live, ou toutes les écoutes en `keep` MusicBrainz : single,
remix, live, bo, hors ; posé sur `libAll` après `refreshQuality` dans
`refreshCache`, porté par `libraryCard`), en liste (`.ar-apart`, pas de pochette) : titre, « Single · N écoutes », lien
YouTube Music (`/yt?q=` sur Android, comme la fiche album) ; le
compte « N albums » de l'en-tête n'inclut qu'eux. Couche d'historique (« retour » la
ferme), sous la fiche album (z-index 45 < 48/49) pour qu'un album s'ouvre
par-dessus. Sur téléphone (< 768 px), carte comme la fiche album (v2.23.5) :
90 dvh, arrondie, poignée. Geste commun avec la fiche album (v2.31.3),
armé au premier vrai mouvement (> 6 px) : tant que le contenu est tout en
haut, tirer vers le bas depuis n'importe où suit le doigt et ferme au-delà
de 110 px ; pousser l'en-tête vers le haut > 40 px passe en plein écran
(`.expanded`) ; vers le haut ailleurs, ou à l'horizontale, on laisse
défiler. Le défilement seul n'agrandit plus la carte (comme l'album : un
défilement fantôme au retour dans l'app la faisait sauter). En-tête teinté comme
la fiche album : couleur du genre de l'artiste, sinon palette de son album
le plus écouté. Depuis v2.26.1, même
architecture que la fiche album : la coque `.ar-sheet` glisse (transform,
`will-change` le temps de l'animation) et ne défile pas ; le contenu défile
dans `.ar-scroll`, jamais transformé ; la montée part après une image, le contenu entier est posé d'emblée
(pochettes à leur couleur), les images viennent une fois la carte arrêtée,
sans reconstruction ; le glisser suit le
doigt image par image (rAF). Un album ouvert par-dessus cache la fiche (`.under`, v2.32.2 : Chrome Android la peignait à travers l'album) jusqu'au début de sa fermeture (`orphee:album-leaving`) ; fond de l'en-tête en dégradé, pas en `mask-image`. Photo (sinon initiales), écoutes cumulées, nombre d'albums, année
de découverte ; genre de l'artiste en deux listes (R2 ; une valeur importée
hors référentiel reste affichée) → `OrpheeArtists.set` + toast ; albums triés
par écoutes (note affichée) ; trimestres où l'un de ses albums était dans le
top 4. Entrées : avatars de « Moi », nom dans la carte « Classer un artiste »,
nom de l'artiste dans la fiche album (la fiche album se referme d'abord).

---

## 20. Bibliothèque en bacs (PM-03, [ADR-039](./ADR.md#adr-039))

`public/js/library.js` + `public/css/library.css` (préfixe `lb-`). Écran fixe
(`body.view-library-active`, comme le Salon) : rail des bacs, puis un pager
horizontal (`scroll-snap-type: x mandatory`, un panneau par bac).

- **Bacs** (`buildCrates`) : « Adorés » (note 5, ou ancien coup de cœur non migré),
  puis un bac par genre effectif (`OrpheeArtists.effective`) — albums **notés
  ou très écoutés** (`listen_count ≥` seuil du percentile Oddity, comme la vue
  « curée » d'avant v2.11.0 ; la recherche couvre tout) —, triés par nombre
  d'albums, « Non classé » en dernier, puis « Paradoxes » (Oddity, mêmes
  réglages que « Moi », IM-6) ; albums dans l'ordre du tri choisi.
  `OrpheeLibrary.openCrate(key)` ouvre un bac, en haut (« Voir les N » de « Moi »).
- **Rail** : les noms sont positionnés à chaque image d'après `scrollLeft` du pager
  (centre = bac courant, voisins réduits et estompés) ; largeurs mesurées une
  fois (et au redimensionnement), seuls les changements sont écrits (v2.24.3). Toucher un voisin y va ;
  toucher le courant ouvre la feuille de tous les bacs (couche d'historique
  `crates`).
- **Piles de tranches** (tous les bacs, jusqu'à 1 000+ albums) : pile **virtualisée** —
  rangées de 58 px (tranche de 56 px), seules les tranches visibles (± marge) existent, recyclées
  et placées en `translateY`. Défilement natif **libre** (pas d'aimantation, pas
  de calage). `overflow-x: hidden` + `overscroll-behavior-y: contain`
  (l'horizontal remonte au pager). **Un toucher ouvre la fiche** ; la tranche
  s'éclaire sous le doigt (`:active`). Pas de réglette.
- **Fluidité** (v2.24.3, mesurée sur téléphone simulé, CPU ÷ 4) : le fond
  flouté d'une tranche est flouté sur un calque **quatre fois plus petit**
  agrandi ×4 (`blur(7.5px)` au lieu de `blur(30px)` plein format — rendu
  identique, ~16× moins de calcul) ; les bacs voisins se construisent à la
  fin du glissement (`scrollend`, sinon 140 ms sans défilement), plus en
  plein geste. Pile : 44 → 60 images/s sans saccade ; six glissements
  d'un bac à l'autre : 38 → 4 images de plus de 34 ms.
- **Tri** (`.lb-sort`, en bas à droite) : trois pictos — barres (écoutes,
  défaut), trois pastilles aux couleurs des notes (note décroissante, non
  notés à la fin, puis écoutes — v2.39.0, remplace artiste A→Z ; un tri
  « artiste » mémorisé retombe sur écoutes), disque + « az » (album
  A→Z puis artiste) ; `localeCompare` fr, insensible à la casse et aux
  accents ; vaut pour tous les bacs et la recherche ; mémorisé par appareil
  (`localStorage` `orphee.lib.sort`) ; changer de tri remet chaque bac au début.
- **Style de tranche** (choisi au labo `?labo` sur les vraies pochettes, puis
  retiré) : tranche sombre — calque `.bg` = pochette Deezer 56 px floutée
  (`blur(30px) saturate(.8) brightness(.42)`) sous un voile `rgba(12,14,13,.62)`
  — une teinte d'ambiance, mur régulier ; **vignette nette** 44 px de la
  pochette ; barre de note de 3 px ; deux lignes — titre de l'album (16 px,
  demi-gras) puis artiste (12 px, capitales adoucies) ; écoutes en pastille. Sans pochette réelle : dégradé génératif (`coverPalette()`).
  Ni canvas ni CORS.
- **Panneaux à la demande** : seul le bac courant et ses voisins sont
  construits ; au-delà de ± 2, un panneau est vidé.
- **Recherche** : loupe → champ (couche d'historique `search`), un bac unique
  « Recherche » sur artiste + album, tranches.
- **Mémoire** : par bac, l'album en haut de la pile, par `album_sur` ; tout rebuild (note posée, artiste classé, refresh) restaure
  bac courant et position.
- **Préversion** : `.github/workflows/preview.yml` déploie le Hosting d'une PR sur
  le canal `essai` (30 jours, même Firestore / Functions que la prod).

---

## 21. Partager ma bibliothèque (PM-28, [ADR-042](./ADR.md#adr-042))

- **Côté Axel** (`share.js`, Réglages) : « Créer un accès d'1 h » →
  `createShare` (propriétaire seulement) renvoie `{token, until}` ; le QR
  (`vendor/qrcode.js`, qrcode-generator MIT, dessiné en SVG) encode
  `https://…/#invite=<token>`. Le jeton (32 octets, base64url) n'est stocké
  en clair que dans le `localStorage` de l'appareil d'Axel, le temps de
  l'accès ; le serveur ne garde que `shares/{sha256(token)} {owner,
  created_at, until}`. Un seul accès à la fois (en créer un coupe le
  précédent). « Couper l'accès » → `revokeShare` (supprime `shares/*` et
  `guests/*`). Accès en cours créé ailleurs : affiché sans QR.
- **Côté invité** (`session.js`) : le jeton voyage dans le **fragment** (jamais
  envoyé au serveur d'hébergement), retiré de l'adresse aussitôt. Connexion
  **anonyme** en persistance `SESSION` (l'onglet seulement), puis `joinShare`
  (compte anonyme exigé) écrit `guests/{uid} {owner, share, until}` ; la
  page se recharge. `OrpheeSession.dataUid()` donne l'uid dont on lit les
  données (le sien, ou celui d'Axel). `OrpheeSession.ready(user)` (v2.24.2) :
  vrai pour le propriétaire ou un invité déjà enregistré ; la bibliothèque,
  l'en-tête (`refresh.js`) et « Moi » n'ouvrent aucune lecture avant —
  sinon le compte anonyme tout neuf, pendant l'échange du jeton, déclenchait
  des lectures refusées par les règles juste avant le rechargement. Bandeau « Bibliothèque de … · encore
  N min » ; contrôle serveur toutes les minutes ; à l'échéance ou à la
  coupure, déconnexion et « La visite est terminée ».
- **Interface invitée** (`html.is-guest`) : ni « À faire », ni boutons du
  trimestre, ni roue des Réglages, ni pastille de synchro ; fiche album et
  fiche artiste en lecture (« Sa note ») ; Salon : exemple écrit à la main
  sans donnée d'Axel, saisie désactivée. Simple confort : ce sont les règles
  qui protègent.
- **Règles** (`firestore.rules`) : `isGuest()` = compte anonyme, `guests/{uid}`
  existant, `until > request.time` et `shares/{share}` existant. L'invité lit
  `cache/*`, `album_stats/*`, `covers/*` et, chez Axel seulement,
  `grades`, `chapters`, `artist_genres`, `settings/{oddity,profile}`, et
  pour la démo Qualité (v2.32.1) `quality/*`, `album_arbitrations`,
  `applied_corrections`, `correction_batches`, `quality_later` —
  **pas** `chats`, `narrations`, ni le reste. Aucune écriture. `shares`
  lisible par le propriétaire, `guests` par personne.
- **Prérequis console** : fournisseur **Anonyme** activé dans Firebase
  Authentication.
- Vérifié sur émulateur : invité qui lit, écriture / lecture des chats /
  appel d'Orphée / `createShare` refusés, fiche en lecture, Salon fermé,
  coupure → fin de visite, lien coupé rejoué → « Ce lien n'est plus valable ».

## 22. Pile « Mis de côté » (PM-34 à PM-36, MODELE E11)

- **Curation E12 — CD** (v2.43.0, PM-38) : `users/{uid}/cds/{encodeURIComponent(album_sur)}`
  = `{album_sur, at}` ; `public/js/cds.js` (`OrpheeCds` : `has`, `toggle`,
  `count`, `keys`) lit **en direct** (`onSnapshot`, ADR-031) la collection de
  `OrpheeSession.dataUid()` — l'invité lit celle d'Axel (règle dédiée), n'écrit
  jamais. Fiche album (`detail.js`) : le disque (`.dt-coverstage.cd-out`) ne
  sort que si l'album est un CD ; la pochette et la pastille « Dans tes CD »
  basculent (vibration, « Annuler »). Bibliothèque (`library.js`) : bac
  `cds` tout à gauche, galette `.lb-spine .cd` sur la vignette, mode
  « Trier mes CD » (`.lb-sorting`) où un toucher de tranche bascule au lieu
  d'ouvrir la fiche. Aucun dérivé ne lit E12.
- **Curation E11** : `users/{uid}/aside/{album_sur}` = `{at, star, snooze_until?}`
  (`at`, `snooze_until` en millisecondes). Écrite par le client seul
  (`public/js/aside.js`), lue **en direct** (`onSnapshot`, ADR-031). Règle :
  propriétaire seul (`users/{uid}/*`) ; l'invité ne la lit pas (PM-35).
- **Jours d'écoute** (dérivé) : `refreshCache` lit la pile et écrit
  `private/aside` = `{items: {album_sur: [uts…]}, computed_at}` — pour chaque
  jour où l'album a été écouté depuis sa mise de côté, la **dernière** écoute
  du jour (heure de Paris approximée, UTC+1 ; `functions/src/refresh/aside.js`,
  testé). Le client compte les jours dont cette écoute suit `at` : « Garder »
  remet `at` au jour sans attendre d'actualisation, et aucune règle de
  calendrier n'est dupliquée côté client. Collection `private/*` : lecture
  propriétaire, écriture refusée (IM-1).
- **Signal** (`aside.js`, partie pure testée) : ≥ 3 jours → *prêt à noter* ;
  sinon mis de côté depuis plus de 91 jours → *oublié* ; sinon *à découvrir*.
  Ordre : envie forte, prêts, à découvrir, oubliés, puis le plus ancien.
  Question du jour : la première *prête* ou *oubliée* dont `snooze_until` est
  passé (« Pas maintenant » = 30 jours).
- **Écrans** : fiche album (marque-page, « Envie forte » une fois dans la
  pile) ; « À faire » (« Plus tard » à côté de « Passer » ; un album de la
  pile n'y est plus proposé) ; « Moi » (bloc « Une question » avant « À
  faire », absent s'il n'y a rien à demander) ; Bibliothèque (bac « Mis de
  côté » à gauche d'Adorés — l'écran s'ouvre quand même sur Adorés —, dans
  l'ordre de la pile — le sélecteur de tri y est
  masqué ; oubliés ternis, ★ à la place du nombre d'écoutes).
- **Noter sort de la pile** : l'événement `orphee:album-graded` porte
  `gradeSet` quand une note est posée ou changée (fiche, « À faire »,
  Orphée en proxy) ; `aside.js` retire alors l'album, avec « Annuler ».
  Changer le genre ou la description ne le retire pas.

## 23. Composants uniques (v2.31.0)

« Une fonction, un visage » (planche validée par Axel le 2026-10-11) :
`public/css/components.css`, chargé **en dernier** (il fait foi sur les
styles d'écran, qui ne gardent que la mise en place).

| Fonction | Classe | Où |
|---|---|---|
| Action du moment (une par écran) | `.o-btn.main` (48 px, arrondi 14, vert) | Suivant, Écouter, Enregistrer, Appliquer, Trancher (or : à décider), Actualiser, Partager, Fusion, connexion |
| Action secondaire | `.o-btn.soft` | Voir les N, Raconte-moi, Modifier le chapitre, Prolonger, Chercher un autre album, Afficher plus, Annuler le lot, Lancer la vérification, Envoyer le lien, Couper l'accès, Exporter |
| Remettre à plus tard | `.o-link` (`.gold`, `.danger`) | Passer, Plus tard, Pas maintenant, Je ne sais pas, Supprimer le chapitre, Se déconnecter |
| Choix parmi plusieurs | `.o-chip` (40 px, cerclée de `--c`, pleine si `.on`) | sous-genres, moments de la journée, trimestres, genres d'artiste (Classer), choix de note reportée, Mis de côté / Envie forte (or) |
| Onglets dans un bloc | `.o-seg` | Noter / Classer, Ans / Mois / Semaine / Journée |
| Bloc qui demande un geste | `.o-card` (fond gris, sans cadre) | À faire, Une question |
| Bandeau | `.toast` et `.q-toast`, même pilule | partout |

Couleur = sens : vert = agir · or = à décider, mis de côté, Adoré · couleur
d'une note ou d'un genre = cette note, ce genre. Les 5 boutons de note et
les tuiles de genre restent leurs propres composants.

**Échelle typographique** (`--t-*`, 6 niveaux, validée par Axel) : titre
d'écran ou de carte 28 gras (Qualité, Prêts, nom d'artiste, ton nom) ·
titre de bloc 19 gras (Moi, « Ta note », « Genre », « Écoutes dans le
temps », « Son genre », « Ses albums », sections des Réglages, carte de
revue) · **titre d'élément 17** (nom d'un album dans À faire, la revue, les
listes, les tranches ; l'artiste à classer ; l'artiste sous la pochette) ·
texte 15 · ligne sous un titre 13,5 gris · étiquette 12. Toutes les
feuilles d'écran y sont ramenées. Exceptions voulues : titre de l'album sous
sa pochette, grands chiffres (taux, compteurs, années), libellés dans les
boutons de note, axes du graphe, rail des bacs, champs de saisie (16 px :
en dessous, l'iPhone zoome au focus — corrigé pour le Salon), logos et
icônes ; l'ancien écran Stats (retiré) n'est pas repris. **Genre de l'artiste** : même sélecteur que l'album (bouton
résumé, tuiles, sous-genres en pastilles, repli après choix complet ; pas
d'effacement, comme avant). Une seule action principale par écran (la
migration des coups de cœur passe en secondaire).

**Navigation** : tout ce qui va « plus loin » s'ouvre en **carte** (poignée,
on la tire vers le bas, ou geste retour — couches `OrpheeNav`) : fiche
album, fiche artiste, panneaux de Qualité, et depuis v2.31.0 les
**sous-écrans de Qualité** (revue, Prêts, lots, listes : `.q-pane`, rendu
dans `view` = `paneBody`). Plus de bouton « ‹ Qualité » ; sur téléphone,
le « ← » des fiches et le « ← Retour » des Réglages sont masqués (gardés
sur grand écran, sans geste).

## Journal des divergences

Écarts connus entre le **modèle** (MODELE.md) et l'**implémentation** réelle, à
résorber. **D-1 et D-2 sont résorbés depuis v2.0** ([ADR-026](./ADR.md#adr-026),
[ADR-027](./ADR.md#adr-027)) ; D-3 et D-4 restent ouverts ; D-5 à D-7 sont des
écarts de l'ancienne doc, corrigés dans cette spec.

| # | Divergence | Invariant touché | Détail |
|---|---|---|---|
| **D-1** | ~~Échelle de notes matérialisée 3 fois~~ | IM-3 | ✅ **Résorbé (v2.0, [ADR-026](./ADR.md#adr-026)).** Source unique `functions/src/grades.js` → `public/js/refdata.js` **généré** + back **consommateur** (`aggregates.js`, `prompt-builder.js`) ; tables d'échelle de SPEC/SKILL générées ; échos retirés (`detail.js`). Canari **pre-commit + test** (`grades.test.js`). |
| **D-2** | ~~`grade_label` en deux casses~~ | IM-3 | ✅ **Résorbé (v2.0, [ADR-027](./ADR.md#adr-027)).** Les writers (`detail.js`, `chat.js`) **n'écrivent plus** `grade_label` dans `users/{uid}/grades` (via le builder partagé `public/js/curation.js`). L'affichage le dérive de `grade` (`library.applyCuration`) ; les outils agent aussi (`query_album_detail` dérive de la note via la source). Le cache garde le slug régénéré. Plus de double casse possible. |
| **D-3** | **Mémoire d'Orphée non persistée** | IM-7 / PM-15 | `[NOTE]`/`[PREF]` sont seulement retirés du texte ; `music_notes`/`preferences` ne sont jamais écrits. Concept A2 modélisé, implémentation à faire. |
| **D-4** | **`web_research_album` documenté mais absent** | — | Présenté comme 4ᵉ outil dans l'ancienne doc et `CLAUDE.md` ; seuls **3 outils** existent. PM-13 reste en connaissance interne. |
| **D-5** | **Nom de collection détail** | — | L'ancienne doc (et [ADR-012](./ADR.md#adr-012)) parlent de `agg_albums_with_stats` ; le code utilise la collection **`album_stats`**. Cette spec est alignée sur le code. |
| **D-6** | **`agg_year/{YYYY}` fantôme** | IM-5 | Listé dans l'ancien schéma, **jamais produit** par le code. Retiré de cette spec. |
| **D-8** | **Familles de genres des humeurs codées en dur** | IM-3 | Ouvert (relevé à l'audit du 2026-10-10). Les humeurs (intensité, calme…) s'appuient sur des listes de genres / sous-genres écrites dans `functions/src/refresh/quarters.js` (`INTENSE`, `CALM`), pas dérivées de la référence des genres (R2). Question à Axel : ces familles sont-elles une donnée de référence (→ à rattacher à R2) ou une règle de l'humeur (→ à documenter comme telle) ? |
| **D-7** | **Parsing des tags** | — | L'ancienne doc disait « le frontend parse » ; en réalité le **parsing est serveur**, seule l'**écriture** est client. Corrigé au § 7.3. |
