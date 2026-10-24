# Orphée — Modèle conceptuel de données

**Statut :** à jour de v2.21.0 (né rétro-documentation de v0.1) · **Dernière mise à jour :** 2026-10-10

> ✅ **Ce document fait foi** (le repo Git est la source de vérité unique). Notion
> est un espace de réflexion **non-autoritaire** (wiki « Orphée ») ; une idée qui
> durcit est *promue* ici. **PM-gate : tout changement de concept, d'entité ou
> d'invariant passe par le PM (Axel) avant édition.** Voir [ADR-024](./ADR.md) et
> la section Gouvernance de [`CLAUDE.md`](../CLAUDE.md).

Ce document décrit **les concepts de données d'Orphée et leurs relations**,
indépendamment de leur matérialisation technique. C'est le langage commun :
chaque concept y apparaît **une seule fois**. La
[spécification technique](./SPEC.md) doit s'y conformer ; quand elle s'en
écarte, c'est une divergence à corriger (voir [SPEC.md § Journal des
divergences](./SPEC.md#journal-des-divergences)).

> Prérequis : [`PRODUIT.md`](./PRODUIT.md) (intention + processus métier).

---

## 1. Les cinq natures de concept

Tout concept du modèle appartient à **une** de ces natures. C'est la
distinction structurante (invariant **IM-1**).

| Nature | Définition | Qui le possède | Mutabilité |
|---|---|---|---|
| **Fait** | Événement ou identité importés du monde réel | Système | Immuable |
| **Dérivé** | Calculé à partir des faits (± curation ± règles) | personne (régénérable) | Recalculable |
| **Curation** | Le jugement et le classement d'Axel | Utilisateur | Éditable |
| **Référence** | Donnée de référence partagée, définie une fois | Référence | Donnée unique |
| **Agent** | Le service Orphée : ses instructions, sa mémoire | Orphée (service) | — |

Le **Dérivé** se décline en trois formes :
- **Indicateur** — une valeur calculée *à propos d'*une entité (ex. rang par
  écoutes d'un album) ;
- **Relation** — un lien calculé *entre* entités (ex. Écho) ;
- **Segmentation** — une catégorie assignée à une entité en croisant ses
  indicateurs, ses informations et des règles (ex. Oddity).

Une **Vue** (graphique, écran) n'est **pas** un concept de données : c'est une
**représentation UI** d'un ou plusieurs concepts ci-dessus. Elle vit dans la
couche Produit/UI, jamais dans ce modèle (invariant **IM-5**).

---

## 2. Carte du modèle

```
FAITS (immuables · Système — écoutes Last.fm, append-only)
   E2 Artiste ──crée──▶ E3 Album ──contient──▶ E4 Track ◀──joue── E1 Écoute (événement daté,
                         (identité = album_sur                       libellé d'album brut)
                          de l'album canonique)
   Hiérarchie de navigation : Artiste › Album › Track

DÉRIVÉ (recalculable · jamais une source)
   Relation   Album canonique : écoute → Album (titre résolu, éditions réunies, arbitrages)
   Relation   Proposition de rattachement : titre → Album proposé (source, confiance, raison)
   Indicateur Fiche de référence d'un titre / d'un album (MusicBrainz, en cache)
   Indicateur Santé : part des écoutes sur un album confirmé
   Indicateurs de l'Album : rang / nb écoutes · première écoute · pic ·
                            distribution mensuelle · top titres · pochette …
   Indicateurs : image d'artiste · netteté du portrait · bascule
   Relation   Écho : co-écoute Album ↔ Album (graphe) + ses propres indicateurs
   Segmentation Oddity : catégorie(Album) = f(indicateurs, curation, règles)
   Segmentation Humeur : catégorie(Période) comparée à soi
   Segmentation Qualification d'une année : fulgurance / sous-genre en hausse / comme d'hab
   Segmentation Sélection « À qualifier »
   Segmentation Signal de la pile : prêt à noter / à découvrir / oublié

CURATION (éditée par Axel)
   E5 Curation (Utilisateur, Album) : note (1-5) · coup de cœur (retiré en v2.6.0 → note 5) · description ·
                                      classification = couple (genre, sous-genre)
   E6 Réglages (Oddity : percentile, notes éligibles)
   E7 Chapitre (intervalle de trimestres → libellé) · E8 Classification d'artiste
   E9 Arbitrage (titre reçu sous un libellé → déplacer vers un album, ou garder)
   E10 Correction appliquée (titre reçu → album, par lot daté ; note reportée)
   E11 Mise de côté (album → date, envie forte, question reportée)
   E12 CD (album → Axel l'a en CD)

RÉFÉRENCE (donnée unique)
   R1 Réf. Notes   : échelle 1-5 (libellé, sens, couleur)
   R2 Réf. Genres  : couples (genre, sous-genre) — 9 genres + leurs sous-genres

AGENT — Orphée (service/proxy, agit AU NOM d'Axel)
   A1 Instructions de service (personnalité / skill)
   A2 Mémoire : notes mémoire · préférences déclarées          (⛔ non implémenté)
   A3 Capacités : outils de lecture · actions de curation par tags (proxy d'Axel)
   A4 Conversation : dialogue Axel ↔ Orphée

VUES (couche Produit/UI — représentations, hors modèle de données)
   « Moi » (portrait, à faire, moments, années › trimestres, adorés, paradoxes, écoutes par…)
     → représente indicateurs et curation ; Bibliothèque (bacs) ; Qualité ; fiches album et artiste
   (Constellation, Capsule, Découvertes, Personnalités : vues retirées en v2.12.0, ADR-040)
```

---

## 3. Dictionnaire des concepts

### Faits

| Concept | Identité | Attributs conceptuels | Relations |
|---|---|---|---|
| **E1 Écoute** | événement (instant + titre joué) | instant, artiste, titre, **libellé d'album tel qu'envoyé par le lecteur** (brut, jamais corrigé) | *joue* un Track ; *compte dans* son album canonique (dérivé, v2.21.0) |
| **E2 Artiste** | nom | genre/sous-genre de référence | *crée* des Albums |
| **E3 Album** | **`album_sur`** (clé composite `{artiste}-{album}`) **de l'album canonique** (v2.21.0) | titre, artiste | *créé par* un Artiste, *contient* des Tracks. L'écoute garde le **libellé brut** envoyé par le lecteur (fait) ; l'album qu'elle compte est son album canonique (dérivé) |
| **E4 Track** | clé composite `{artiste}-{album}-{titre}` | titre | *sur* un Album |

### Dérivé

| Concept | Forme | Portée | Calculé à partir de |
|---|---|---|---|
| **Album canonique** | Relation | écoute → Album | libellé brut + propositions de rattachement retenues + règles d'édition + arbitrages (curation) ; appliqué avant tout autre dérivé ([ADR-045](./ADR.md#adr-045), [ADR-046](./ADR.md#adr-046)) |
| **Proposition de rattachement** | Relation | (artiste, titre, libellé reçu) → Album proposé | fiche de référence (MusicBrainz, sinon Last.fm) + bibliothèque. Porte sa **source**, sa **confiance** (sûr / à vérifier / inchangé) et sa **raison**. Règle : le premier album studio de l'artiste qui contient le titre. Ne change le rattachement qu'**une fois appliquée par Axel** (E10), et jamais contre un arbitrage (E9) |
| **Fiche de référence** | Indicateur (cache d'une source externe) | par titre et par album | MusicBrainz : sorties contenant le titre (type, types secondaires, date, place) ; titres d'un album. Régénérable : ce n'est **pas** une Référence au sens R1/R2 |
| **Santé** | Indicateur | bibliothèque | part des écoutes rangées sur un album confirmé (par la source ou par Axel) |
| **Indicateurs de l'Album** | Indicateur | par album | faits (écoutes) ; la **pochette** est résolue chez Deezer, sinon Last.fm (v2.18.0) |
| **Écho** | Relation (graphe) | arête Album ↔ Album, pondérée + indicateurs | co-occurrence d'écoutes dans le temps |
| **Signal de la pile** | Segmentation | catégorie d'une Mise de côté | **jours distincts** d'écoute de l'album **depuis la date** de mise de côté (faits) + E11 + règles : **prêt à noter** (≥ 3 jours distincts depuis), sinon **oublié** (mis de côté il y a plus de 3 mois), sinon **à découvrir**. Ordonne le bac et choisit la question de « Moi » ; ne touche jamais E11 (IM-6) |
| **Oddity** | Segmentation | catégorie d'Album — affichée « Mes paradoxes » (v2.9.0) | indicateurs (écoutes) + information (curation : note) + règles (percentile, notes éligibles) |

### Curation

| Concept | Identité | Attributs | Propriétaire |
|---|---|---|---|
| **E5 Curation** | (Utilisateur, Album) — **0..1 par album** | **note (1-5, optionnelle)**, coup de cœur *(retiré en v2.6.0 : fusionné dans la note 5, migration déclenchée par Axel)*, description, classification = couple (genre, sous-genre), horodatages | **Axel** |
| **E9 Arbitrage** | (Utilisateur, artiste, titre, libellé reçu) | décision : **déplacer** (vers un Album) ou **garder** ; horodatage ; **proposition du moment** (album, confiance, raison — trace, v2.35.0) ; **revu** (confirmé depuis « À revoir ») | **Axel** : prime sur toute proposition (IM-9). Remplace la *Séparation* de v2.21.0 (v2.32.0) : chaque libellé séparé devient, pour chacun de ses titres, une **correction appliquée « remettre à part »** (vers ce libellé lui-même, E10), dans un lot « Séparations » annulable ; les séparations sont ensuite supprimées. « Remettre à part » garde le libellé reçu tel quel, hors des groupes d'édition ([ADR-046](./ADR.md#adr-046)). Un titre **passé** (« je ne sais pas », v2.27.0) n'est **pas** un arbitrage : simple marque de revue (date), sans aucun effet sur le rattachement ; une décision l'efface |
| **E10 Correction appliquée** | (Utilisateur, artiste, titre, libellé reçu) | album d'arrivée ; source (MusicBrainz / décision d'Axel) ; **lot** (date, notes reportées) | **Axel** : créée seulement par « Appliquer » ; le rattachement la suit (prime sur MusicBrainz et Last.fm, IM-9) ; annulable seule ou par lot. Une proposition non appliquée ne change rien (v2.30.0, [ADR-046](./ADR.md#adr-046)) |
| **E11 Mise de côté** | (Utilisateur, Album) — **0..1 par album** | date (de mise de côté, remise au jour par « Garder ») ; **envie forte** (oui/non) ; question reportée jusqu'au (date, « Pas maintenant ») | **Axel** : il met de côté, étoile, garde ou sort. Retirée quand Axel note l'album (geste explicite, annulable) ; jamais créée ni retirée par un calcul (IM-6) |
| **E12 CD** | (Utilisateur, Album) — **0..1 par album** | date d'ajout | **Axel** : il marque ou retire (fiche album, mode « Trier mes CD », PM-38). Concept distinct de E5 : **posséder n'est pas apprécier** — aucun effet sur la note ni sur aucun dérivé. Rattaché par `album_sur` (IM-4), il suit l'album canonique. Lu par l'invité, jamais écrit par lui (IM-8) (v2.43.0) |
| **E6 Réglages** | Utilisateur | segmentation Oddity : percentile, notes éligibles | Axel |

### Référence

| Concept | Identité | Attributs | Nature |
|---|---|---|---|
| **R1 Réf. Notes** | valeur 1-5 | libellé, sens, couleur | **Donnée unique** |
| **R2 Réf. Genres** | genre | sous-genres associés (couples valides) | **Donnée unique** |

### Agent — Orphée

| Concept | Description | État |
|---|---|---|
| **A1 Instructions de service** | Définition du personnage et de ses règles (source du system prompt) | ✅ |
| **A2 Mémoire** | Notes mémoire (observations sur les goûts) + préférences déclarées | ⛔ non implémenté en v0.1 |
| **A3 Capacités** | Outils d'exploration **en lecture seule** ; actions de curation émises sous forme de tags, exécutées **comme proxy d'Axel** | ✅ |
| **A4 Conversation** | Historique du dialogue Axel ↔ Orphée | ✅ |

---

### Vision v3 — Identité (validée par le PM le 2026-10-08, livrée sauf mention)

| Concept | Nature | Description |
|---|---|---|
| **Période** | Référence | Découpage du temps en **années**, chacune en **trimestres** T1→T4 (v2.15.0). Une **année blanche** (presque sans écoutes : < 100 et < 5 % de l'année médiane) n'existe pour aucune vue |
| **Humeur** | Dérivé — Segmentation | Catégorie musicale d'une Période (exploration, obsession, énergie, intensité, introspection, ancrage…) calculée sur règles vérifiables : nouveauté, concentration, genres, volume, moment d'écoute — **relativement aux habitudes** de l'Utilisateur (moyenne et écart de ses périodes complètes, v2.14.0 ; seuils absolus faute d'historique). N'altère jamais la curation (IM-6). ✅ |
| **Qualification d'une année** | Dérivé — Segmentation | Ce qui distingue une année des précédentes : un artiste qui explose (**fulgurance** : ≥ 3 % des écoutes et ≥ 4× sa meilleure part passée), sinon un sous-genre en hausse nette, sinon « comme d'hab » ; la première année reçoit son style dominant. ✅ v2.19.0 |
| **Fréquence d'un album** | Dérivé — Indicateur | Forme temporelle des écoutes : *fulgurant* (pic bref) ↔ *intemporel* (régulier sur des années). ⛔ à venir |
| **E8 Classification d'artiste** | Curation | (Utilisateur, Artiste) → couple (genre, sous-genre) de R2. **Défaut** pour tous ses albums ; la classification d'album (E5) le **remplace** si posée. Genre effectif d'un album = album, sinon artiste. Import unique depuis l'onglet `Artists`, puis l'app fait foi. Des **suggestions** externes (tags Last.fm) peuvent être proposées, **jamais écrites sans validation d'Axel**. ✅ v2.7.0 (suggestions : à venir) |
| **A5 Récit** | Agent | Texte d'Orphée racontant une Période **à partir des seuls faits** calculés ; mis en cache, régénéré si les faits changent. Ne contient aucune interprétation de vie ; distinct de la curation (IM-7). Depuis v2.29.0, accompagné d'un titre ; récit et titre deviennent le chapitre (E7) quand Axel le demande. ✅ v2.5.0 |
| **E7 Chapitre** | Curation | (Utilisateur, **intervalle de Périodes consécutives**) → **titre** et **description**, avec leur origine (Orphée / Axel). ✅ v2.5.0. Depuis v2.29.0 ([ADR-047](./ADR.md#adr-047)) : **nommé par Orphée quand Axel lui demande de raconter** (titre sur la musique, son récit en description), puis modifiable par Axel. Orphée ne l'écrit jamais de lui-même (IM-7) ; la description n'est lisible que par Axel (IM-8) |
| **Récit d'artiste** | Dérivé — Catégorie | Pilier, découverte, retrouvailles, fulgurance ou perdu de vue : règle vérifiable sur les écoutes par année active (années blanches exclues), un récit au plus par artiste (PM-37). Recalculé à l'actualisation ; ni note ni genre n'y entrent. ✅ v2.40.0 |
| **Proximité d'artistes** | Dérivé — Relation | (Artiste, Artiste) → nombre de **séances partagées** (écoutes à < 30 min d'écart). Base de « Souvent avec » (PM-26, `agg_artists.with`) et des **mondes d'écoute** ci-dessous. Recalculée à l'actualisation ; jamais une source (IM-5) ; symétrique, ni note ni genre n'y entrent. ✅ v2.41.0 |
| **Monde d'écoute** | Dérivé — Segmentation | Groupe d'artistes qu'Axel **enchaîne ensemble**, trouvé par **détection de communautés** (Louvain) sur le graphe de co-écoute des 100 plus écoutés (liens ≥ 20 séances, résolution 1,5). Peut **traverser les genres**. Base de « Tes mondes » (PM-40, [ADR-052](./ADR.md#adr-052)). Calculé à l'actualisation, **déterministe** ; n'altère jamais la curation (IM-6) ; jamais une source (IM-5) ; le genre (couleur, dominante) est appliqué live (ADR-031). Lu par l'invité (IM-8). ✅ v2.48.0 |
| **Nature d'un libellé** | Dérivé — Catégorie | Un « album » qui n'en est pas un : **live** (libellé live), ou **single / remix / BO / hors album** quand **toutes** ses écoutes sont des titres que MusicBrainz laisse à part (PM-29). Les autres sont des albums. Recalculé à l'actualisation ; ne change ni le rattachement ni la curation (IM-5, IM-9). ✅ v2.36.0 |
| **Titre phare** | Dérivé — Indicateur | Album **tenu par un titre** : son titre le plus écouté pèse au moins 3 fois un titre moyen de l'album **et** au moins 35 % de ses écoutes (≥ 20 écoutes, ≥ 4 titres joués). Calculé à l'actualisation ; la note n'y entre pas — c'est la vue « Un seul titre » qui écarte les albums Culte et Adoré (curation live). ✅ v2.34.0 |
| **Bascule** | Dérivé — Indicateur | Période où l'humeur change nettement, ou qui porte une obsession / une explosion de découvertes : motif d'invitation à nommer un chapitre. ✅ |
| **Image d'artiste** | Dérivé — Indicateur | Photo d'un artiste résolue chez Deezer, **par un de ses albums écoutés** (le nom seul est ambigu), sinon par le nom ; silhouettes par défaut ignorées ; régénérable, jamais une source. ✅ v2.8.0 (via ses albums v2.18.1) |
| **Netteté du portrait** | Dérivé — Indicateur | Part des écoutes couverte par des albums notés et classés (genre effectif). Feedback de la curation. ✅ v2.4.0 |
| **Sélection « À qualifier »** | Dérivé — Segmentation | Albums proposés à la notation (récents et non notés, notes anciennes à réévaluer). Ne décide rien (IM-6, IM-7). ✅ v2.4.0 |
| **Signature de créneau** | Dérivé — Segmentation | Ce qui **caractérise** un moment de la journée (matin 7-9 h · soir 18-20 h · nuit 0-5 h, heures de Paris) : les **genres** et **artistes sur-représentés** à ce créneau par rapport au reste de la journée (`lift` + plancher de volume, [ADR-050](./ADR.md#adr-050)). Remplace l'« album du créneau » de l'onglet Journée. Recalculé à l'actualisation ; ne touche jamais la curation (IM-6). ✅ v2.46.0 |
| **Phase récente (« Ces jours-ci »)** | Dérivé — Segmentation | Les **30 derniers jours** d'écoutes : volume, **artistes du moment** (classés par écoutes, avec leur sur-représentation « ×habitude »), **album qui tourne**, **genre dominant** ([ADR-050](./ADR.md#adr-050)). Accroche en tête de « Moi ». N'appartient à aucune focale ; snapshot daté de la dernière actualisation ; ne touche jamais la curation (IM-6). ⛔ à venir |

## 4. Invariants de modèle

- **IM-1 — Natures disjointes.** Tout concept est *Fait* (immuable), *Dérivé*
  (indicateur / relation / segmentation, recalculable), *Curation* (éditée par
  l'Utilisateur), *Référence* (donnée unique) ou *Agent*. Ces natures ne se
  mélangent pas.
- **IM-2 — Unicité de la Note.** La note n'existe qu'au sein de la Curation,
  une seule par (Utilisateur, Album).
- **IM-3 — Référence unique.** L'échelle 1-5 et les couples (genre, sous-genre)
  sont chacun **une seule donnée de référence**. Toute matérialisation
  (interface, calcul, prompt) en **dérive**, ne la redéfinit pas.
- **IM-4 — Identité album.** `album_sur` est l'identité d'un Album partout ; la
  hiérarchie est Artiste › Album › Track. C'est la clé de l'**album
  canonique** : le libellé brut d'une écoute est un fait conservé, son
  rattachement un dérivé, jamais l'inverse ([ADR-045](./ADR.md#adr-045)).
- **IM-5 — Primauté de la source.** Aucun dérivé n'est une source : tout dérivé
  est régénérable par recalcul. Une **vue** ne fait que *représenter* un
  concept, elle n'en est jamais la source. *Corollaire :* la valeur **courante**
  d'une **Curation** se lit à sa **source** (`users/{uid}/grades`), **jamais**
  depuis une projection dérivée (cache d'agrégats) qui peut être périmée — voir
  [ADR-031](./ADR.md#adr-031).
- **IM-6 — Segmentation = catégorisation dérivée.** Une segmentation (ex.
  Oddity) croise indicateurs + informations + règles ; elle n'altère pas la
  curation, et la curation ne se déduit jamais des écoutes.
- **IM-7 — Agent proxy.** Orphée agit **au nom de** l'Utilisateur sur la
  Curation, **jamais de sa propre initiative**. Sa mémoire et ses instructions
  sont distinctes de la donnée utilisateur. Ses outils d'exploration sont en
  lecture seule.

- **IM-8 — Invité en lecture seule.** Un **invité** (un ami à qui Axel
  partage sa bibliothèque, PM-28) **lit** la Curation et les dérivés d'Axel le
  temps d'un **Partage** (1 h, révocable) — y compris l'état de la Qualité
  (propositions, arbitrages, corrections), où il peut tout essayer **en
  démo**, sur une copie locale jamais enregistrée (v2.32.1) ; il n'écrit
  **jamais**, ne parle
  pas à Orphée et ne voit ni la Conversation (A4) ni les Récits (A5). Le
  Partage est un **droit d'accès**, pas une donnée musicale : il ne relève
  d'aucune des cinq natures (comme le propriétaire, `config/owner`).

- **IM-9 — L'arbitrage prime.** Une source externe (MusicBrainz, Last.fm)
  ne fait que **proposer** un rattachement ; elle n'écrit jamais la Curation.
  Un **Arbitrage** d'Axel l'emporte sur toute proposition et survit à tout
  recalcul et à tout vidage de cache. Toute correction automatique est
  **comptée, montrée et annulable**, et **rien ne s'applique sans le geste
  d'Axel** (« Appliquer », par lot daté — v2.30.0).

Chaque invariant est tracé en décision : voir
[ADR-018](./ADR.md#adr-018) à [ADR-021](./ADR.md#adr-021) ; IM-8 :
[ADR-042](./ADR.md#adr-042) ; précision d'IM-4 : [ADR-045](./ADR.md#adr-045) ; IM-9 :
[ADR-046](./ADR.md#adr-046).
