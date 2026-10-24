# Orphée

Un **curateur musical personnel**. Orphée lit tes écoutes Last.fm, te laisse
noter tes albums, et te les raconte : tes phases du moment, ce que tu écoutes
ensemble, ce que tes notes disent de toi. Une app web (PWA) à un seul
propriétaire, avec un agent conversationnel qui agit sur ta curation — jamais
de lui-même.

> **Aperçu interactif** → **[orphee-e7377.web.app/preview](https://orphee-e7377.web.app/preview/)**
> (écrans réels sur données de démonstration, en cadre mobile).

Ce dépôt se lit à deux niveaux : c'est un **vrai produit déployé**, et la
**méthode de développement assisté par IA** qui l'a construit, lisible de bout
en bout.

---

## Ce que fait l'app

- **Moi** — ton portrait d'écoute : phases du moment, genres dominants, tes
  années, ce que tes notes racontent.
- **Bibliothèque** — tes albums rangés en bacs, comme chez un disquaire :
  Adorés, par genre, « paradoxes », tes CD.
- **Fiche album** — noter de 1 à 5, genre, écoutes dans le temps.
- **Tes mondes** — ce que tu écoutes ensemble, regroupé en archipels d'artistes.
- **Le Salon** — Orphée, l'agent : il lit ta curation et agit en ton nom
  (notes, descriptions), avec des outils en lecture seule.
- **Qualité** — corriger les rattachements d'albums, par lots, toujours
  annulables.
- **Invité** — un partage d'une heure, révocable, en lecture seule.

## Comment c'est construit — la méthode

Le cœur réutilisable de ce dépôt est une **gouvernance par couches**. Chaque
couche se conforme à celle du dessus ; en cas de conflit, la couche supérieure
arbitre.

| Couche | Fait foi pour | Fichier |
|---|---|---|
| **Produit** | intention, périmètre, processus métier | [`docs/PRODUIT.md`](docs/PRODUIT.md) |
| **Modèle** | concepts, natures, invariants | [`docs/MODELE.md`](docs/MODELE.md) |
| **Spec** | réalisation + journal des divergences | [`docs/SPEC.md`](docs/SPEC.md) |
| **Code** | ce dépôt | `functions/`, `public/` |

Autour, trois garde-fous :

- **PM-gate** — tout changement fonctionnel passe par le propriétaire avant
  d'éditer Produit/Modèle ou le code.
- **Gate de cohérence** — une couche basse ne contredit jamais une couche
  haute ; un écart assumé va au journal des divergences de la Spec.
- **Hooks Git** (`.githooks/`) — datation du changelog, et détection des
  « remontées de couche » (toucher les règles de sécurité ou une référence de
  modèle sans mettre à jour la couche au-dessus).

Les décisions structurantes sont tracées dans [`docs/ADR.md`](docs/ADR.md), la
suite dans [`docs/ROADMAP.md`](docs/ROADMAP.md), les versions dans
[`docs/CHANGELOG.md`](docs/CHANGELOG.md). [`CLAUDE.md`](CLAUDE.md) donne à
l'assistant les règles du dépôt.

## Stack

- **Firebase** — Hosting, Firestore (cache uniquement, pas de base relationnelle
  vivante), Cloud Functions (Node, `europe-west1`), Auth, Storage.
- **Frontend** — JavaScript vanilla, sans framework, modules IIFE.
- **Agent** — API Anthropic côté serveur ; le *system prompt* est généré depuis
  [`docs/SKILL.md`](docs/SKILL.md).
- **Écoutes** — synchro Last.fm à la demande (jamais de cron), stockées dans
  Cloud Storage.

## Lancer en local

La vraie app, sur des émulateurs Firebase et des **données fictives**, sans
toucher à aucun service réel :

```bash
cd tools/dev
npm install     # une fois (firebase-tools + SDK)
npm run dev     # → http://127.0.0.1:5050, bouton « compte de test local »
```

Prérequis : Node ≥ 22 et Java (émulateur Firestore). Détails :
[`tools/dev/README.md`](tools/dev/README.md).

## Sécurité & confidentialité

- **Aucun secret dans le dépôt.** Les clés (`ANTHROPIC_API_KEY`,
  `LASTFM_API_KEY`) vivent dans Secret Manager ; la config web Firebase est
  publique par nature et servie par Hosting.
- **Propriétaire unique**, identifié par e-mail Google vérifié stocké dans
  Firestore (`config/owner`) — hors dépôt.
- **Accès borné par les règles** [`firestore.rules`](firestore.rules) /
  [`storage.rules`](storage.rules), pas par l'interface : propriétaire en
  écriture, invité en lecture seule et révocable, caches en lecture seule.
- **Données personnelles** (écoutes, notes réelles) hors dépôt ; le mode local
  et la démo n'utilisent que des données inventées.

## Licence

Code source consultable à titre de référence. Les pochettes d'albums montrées
dans l'app sont résolues à la volée (Deezer) et ne sont pas redistribuées ;
l'aperçu utilise des pochettes génériques.
