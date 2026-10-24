# Instructions Claude Code — Orphée

## Gouvernance — sources de vérité (lire en premier)

**Le repo Git est la source de vérité unique — fonctionnel, conceptuel ET technique.**

- **Fonctionnel & conceptuel** → `docs/PRODUIT.md`, `docs/MODELE.md` (intention produit, périmètre, processus métier, modèle conceptuel, invariants, vision). **Ces fichiers font foi.**
- **Technique** → `docs/SPEC.md` et le code. **Font foi.**
- **Notion = espace de réflexion non-autoritaire** (discovery, brouillon) : wiki « Orphée » (espace Notion privé). Une idée qui durcit est *promue* dans le repo. Notion ne fait **jamais** foi ; en cas de divergence, le repo gagne.

> **Règle absolue (PM-gate) : tout changement fonctionnel ou conceptuel passe par le PM (Axel) AVANT toute édition de `PRODUIT.md`/`MODELE.md` ou du code.** Ne jamais redéfinir unilatéralement un processus, un concept, un invariant ou le périmètre. Au moindre doute « est-ce du fonctionnel ? » → demander à Axel d'abord. Le technique pur (refactor, perf, bugfix sans impact fonctionnel) ne requiert pas ce passage.

Voir [ADR-024](docs/ADR.md) (gouvernance repo-first, supersède [ADR-022](docs/ADR.md), réaffirme [ADR-010](docs/ADR.md)).

### Hiérarchie des couches & cohérence de chaîne

**Priorité, du plus autoritaire au moins : Produit → Modèle → Spec → Code.**
Chaque couche se **conforme à celle du dessus** ; une couche basse ne contredit
jamais une couche haute. En cas de conflit, la couche **supérieure arbitre**.

**Gate de cohérence (obligatoire).** Avant et pendant toute modification,
vérifier qu'elle ne **casse pas une couche supérieure** (ex. du code qui viole un
invariant du Modèle, une Spec qui s'écarte de Produit). Si un changement — ou un
**bug / une divergence constatés** — **contredit une couche au-dessus** :

1. **ne pas trancher seul** et **ne jamais figer une divergence en silence** ;
2. **poser une question ciblée à Axel** : la couche haute est-elle l'intention
   (→ corriger la couche basse), ou doit-elle évoluer (→ PM-gate) ?
3. tracer l'écart au **journal des divergences** ([`SPEC.md`](docs/SPEC.md)) le
   temps de le résorber.

Le **technique pur** qui ne touche aucune couche supérieure (refactor, perf,
bugfix sans impact sur Produit/Modèle/Spec) procède librement. Cette règle
**complète le PM-gate** ci-dessus : le PM-gate couvre les *changements*
fonctionnels voulus ; le gate de cohérence couvre aussi les *ruptures
involontaires* de chaîne (un bug technique qui viole le Modèle, p.ex. lire un
dérivé comme s'il était la source — cf. [ADR-031](docs/ADR.md)).

**Remontée de couche (garde-fou mécanique, [ADR-032](docs/ADR.md)).** Le cas le
plus sournois est *montant* : en dev rapide, modifier Spec/Code en touchant *en
fait* une couche de référence (Produit/Modèle) sans le voir. Le dev en est
**force de proposition** : au moindre soupçon, il le **soumet à Axel** avant de
figer — il ne tranche pas seul. Pour que ça se déclenche au bon moment plutôt
que de dépendre de la vigilance, un hook `commit-msg` repère la **signature**
d'une remontée — `firestore.rules` touché, ou une ligne `IM-x`/`PM-xx`, **sans**
modification de `PRODUIT.md`/`MODELE.md` — et **exige** un accusé dans le
message : `Remontée: non — <raison>` ou `Remontée: soumise`. La machine ne
*juge* pas la remontée (c'est humain) ; elle **force la question**. Signaux
volontairement étroits, élargissables.

---

## Démarrage de session — obligatoire

Avant toute autre action, charger les deux skills :

1. `/odyssee-dev` — conventions git, changelog, checklist commit, stack, sécurité
2. `/odyssee-design` — design system Odyssée, tokens, composants k-*, voix Orphée

---

## Lecture obligatoire avant toute modification

Dans cet ordre (du métier vers la technique, ADR-017) :

1. `docs/PRODUIT.md` — Intention, périmètre, processus métier (PM-01…)
2. `docs/MODELE.md` — Modèle conceptuel, entités, invariants (IM-1…)
3. `docs/SPEC.md` — Spécification technique + journal des divergences
4. `docs/SKILL.md` — Personnalité Orphée, system prompt, exemples
5. `docs/CHANGELOG.md` — Versions livrées
6. `docs/ADR.md` — Décisions techniques structurantes
7. `docs/ROADMAP.md` — Ce qui vient (Maintenant / Ensuite / Plus tard)

---

## Conventions spécifiques à Orphée

- **Écoutes via Last.fm** (`syncLastfm`, clé `LASTFM_API_KEY`) → Cloud Storage ; la Google Sheet n'est plus lue (ADR-034, ADR-044).
- **Firestore en cache uniquement** — pas de stockage relationnel vivant (ADR-004).
- **Refresh à la demande**, jamais automatique (ADR-005).
- **Firestore fait foi pour les notations** (ADR-006) ; la Sheet n'est plus qu'une sauvegarde hors app.

---

## Règles + invariants

Ces invariants ne doivent **jamais casser en silence**. Définis dans `MODELE.md`, tracés dans `ADR.md`.

- **IM-1 — Natures disjointes.** Tout concept est *Fait* (immuable, importé), *Dérivé* (recalculable), *Curation* (éditée par l'utilisateur), *Référence* (donnée unique) ou *Agent*. Techniquement : écoutes en append-only (Storage, Functions seules) ; `cache/*`, `album_stats/*`, `covers/*` en `write:false` ; `users/{uid}/*` mutable par l'owner.
- **IM-2 / IM-3 — La note n'existe qu'une fois.** L'échelle 1-5 et les couples (genre, sous-genre) sont chacun **une donnée de référence unique** ; front/back/prompt en dérivent. Résolu pour l'échelle : source unique `functions/src/grades.js`, front généré, canari (ADR-026 ; D-1/D-2 résorbés). Référence des genres : `public/js/refdata.js` (`ORPHEE_GENRES`).
- **IM-4 — Identité album = `album_sur`** partout ; hiérarchie Artiste › Album › Track. C'est la clé de l'**album canonique** (PM-29, ADR-045) : le libellé brut de l'écoute reste un fait, le rattachement est dérivé.
- **IM-5 — Primauté de la source.** Aucun dérivé n'est une source ; une **vue** ne fait que représenter un concept.
- **IM-6 — Segmentation (Oddity) = catégorisation dérivée** croisant indicateurs + curation + règles ; n'altère jamais la curation.
- **IM-7 — Orphée est un agent-proxy** : agit sur la curation **au nom d'Axel**, jamais de lui-même ; ses outils sont en lecture seule ; sa mémoire/ses instructions sont distinctes de la donnée utilisateur.
- **IM-8 — Invité en lecture seule** : un ami (partage d'1 h, révocable, PM-28) lit la curation et les dérivés, n'écrit jamais, ne parle pas à Orphée, ne voit ni la conversation ni les récits. Appliqué par `firestore.rules`.
- **IM-9 — L'arbitrage prime** : MusicBrainz et Last.fm ne font que *proposer* un rattachement ; un arbitrage d'Axel (curation) l'emporte toujours et survit à tout recalcul ; toute correction automatique est comptée, montrée et annulable, et ne s'applique qu'au geste d'Axel (« Appliquer », par lot — ADR-046).

Avant de modifier du code, vérifier qu'aucun de ces invariants n'est rompu. En cas de doute sur un « immuable », demander avant de figer.

---

## Architecture clé

Lire la section "Architecture du chat — Orphée et ses tools" dans SPEC.md.

Le pattern central : **Orphée ne reçoit pas toute la donnée à chaque appel.** Elle reçoit :
1. Des **agrégats permanents** (top artistes, distribution des notes…) — toujours, via `buildContext`
2. La **curation live** (`users/{uid}/grades`) superposée à ces agrégats (ADR-031) — pas de contexte propre à une commande
3. La possibilité d'**appeler des tools** pour fouiller plus loin

**3 tools** sont exposés via le paramètre `tools` de l'API Anthropic, tous en **lecture seule** :
- `query_albums` — recherche/filtre sur le référentiel
- `query_listens` — agrégats sur les écoutes
- `query_album_detail` — détail complet d'un album

`web_research_album` (recherche web, ADR-011) est **prévu mais non implémenté** (divergence D-4) : il n'existe pas dans le code, le contexte d'album s'appuie sur la connaissance interne du modèle.

Boucle multi-turn avec limite de 5 tool calls par message.

---

## System prompt Orphée

- Généré à partir de `docs/SKILL.md` (toutes sections).
- Chargé une fois au démarrage de la Function `chatOrphee`.
- Le contexte dynamique est injecté à chaque message dans `[CONTEXTE]...[/CONTEXTE]`.

---

## Refresh à la demande

Côté client, « Actualiser » (`refresh.js` — pastille de fraîcheur de l'en-tête, bouton de Réglages) enchaîne :
1. `syncLastfm` (nouvelles écoutes Last.fm → Cloud Storage, delta)
2. puis `refreshCache`, qui :
   - lit les écoutes dans Storage et la curation dans Firestore (`users/{uid}/grades`, `artist_genres`, `album_splits`, `settings/oddity`) ;
   - applique l'album canonique (PM-29) ;
   - calcule les agrégats en croisant les sources ;
   - résout pochettes et photos d'artistes ;
   - écrit `cache/*` et `album_stats/*` en Firestore.

Pas de cron. Pas de polling. L'utilisateur déclenche lui-même « Actualiser ».

---

## Tags machine-readable

Émis par Orphée en fin de réponse, **parsés côté serveur** (`tags-parser.js`) ; les actions d'écriture sont ensuite **appliquées côté client** (`chat.js`) sur `users/{uid}/grades` — Orphée agit en proxy d'Axel (IM-7). `[NOTE]`/`[PREF]`/`[FOCUS]`/`[FILTER]` sont seulement retirés du texte en v0.1.

<!-- tags:table:start -->
| Tag | Effet |
|-----|-------|
| `[GRADE: album_sur grade=X commentaire="..."]` | Note un album |
| `[UNGRADE: album_sur]` | Retire la note |
| `[FLAG: album_sur]` | Obsolète — coup de cœur fusionné dans la note 5 (Adoré) |
| `[COMMENT: album_sur "texte"]` | Ajoute/maj la description d'un album, **sans toucher la note** |
| `[NOTE: priority=N tags=[...] texte]` | Note libre en mémoire musicale |
| `[PREF: key=value]` | Préférence déclarée |
| `[FOCUS: album_sur]` | L'app affiche l'album en détail |
| `[FILTER: type=X value=Y]` | L'app applique un filtre |
| `[SUGGEST: cmd1 cmd2 "mot un" "mot deux"]` | Chips de commandes — les tokens multi-mots doivent être entre guillemets doubles |
<!-- tags:table:end -->

> Table générée depuis `functions/src/chat/tags-spec.js` (ADR-025) — ne pas éditer à la main.

Voir `docs/SPEC.md` pour le format précis.

---

## Système de notation

Échelle **1-5** : 1 Zappé · 2 Sympa · 3 Génial · 4 Culte · 5 Adoré (v2.10.0 ; anciens noms anglais Skip · Nice · Great · Classic · Adored, slugs `key` inchangés). Libellés à la source unique `functions/src/grades.js` ; tri alphabétique = notes décroissantes.

**Firestore fait foi.** Les notes de l'ancienne Sheet ont été importées une fois (import_v0) ; la Sheet n'est plus lue (ADR-044).

---

## Oddity (affichée « Mes paradoxes »)

Calculé deux fois : au refresh (`cache/agg_oddities`, pour Orphée) et en live côté client (`orpheeOddity`, `library.js`) pour « Mes paradoxes », le bac Paradoxes et l'aperçu des Réglages. Paramètres dans `users/{uid}/settings/oddity`.

```
oddity = (grade ∈ oddity_eligible_grades)
         ET (listen_count >= percentile_N de toute la bibliothèque)
```

Defaults : `percentile=90`, `eligible=[1,2]` (Zappé, Sympa).

---

## Tests

- **Fonctions pures** de nombreux modules (agrégats, trimestres, album canonique, écoutes/scrobbles, partage, curation, tags, pochettes, export…) : tests unitaires avec le runner natif Node (`npm test` → `node --test`), dans `functions/test/`.
- Gardés par le predeploy (gen + lint + test, `firebase.json`) — ils bloquent le déploiement si un test échoue.
- Toute nouvelle fonction pure d'agrégat doit venir avec ses cas de test.
- **UI / intégration** : test manuel sur l'app déployée avant merge.
