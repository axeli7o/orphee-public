# Mode local — Orphée sur émulateurs Firebase

Lance la **vraie app** en local, connectée, avec des **données fictives** —
sans toucher au projet réel. Même principe qu'Elminster.

```bash
cd tools/dev
npm install          # une fois (firebase-tools + SDK pour --offline)
npm run dev          # → http://127.0.0.1:5050, bouton « compte de test local »
```

Prérequis : Node ≥ 22, **Java** (émulateur Firestore).

## Ce qui se passe
- `firebase emulators:exec --project demo-orphee` démarre Auth, Firestore,
  Functions et Hosting. Le préfixe `demo-` garantit qu'**aucun service réel**
  n'est joignable.
- `seed.js` génère ~26 000 écoutes fictives (vrais artistes/albums, écoutes
  et notes inventées, déterministes), crée le compte `axel@example.com`, écrit
  notes / coups de cœur / genres / réglages Oddity / une conversation, puis
  appelle le **vrai `refreshCache`** : le cache est produit par le pipeline de
  prod, schéma exact par construction.
- Côté app, `public/js/dev-emulators.js` branche le SDK sur les émulateurs —
  **uniquement** sur localhost avec un projet `demo-*`. En prod, et avec
  `firebase serve` sur le vrai projet, il ne fait rien.
- Les écoutes fictives sont écrites dans l'émulateur **Storage**, comme le
  fait la synchro Last.fm en prod ; « Actualiser » y ajoute 12 écoutes
  fictives (`syncLastfm` sous émulateur : ni clé ni réseau).

## Ce qui marche / ne marche pas en local
- ✅ Bibliothèque, fiche album, curation, Stats, Réglages, **« Actualiser »**
  (relance le pipeline sur les écoutes fictives).
- ✅ Pochettes : résolues via Deezer si le poste a du réseau, sinon art génératif.
- ⚠️ Le Salon : l'historique s'affiche ; envoyer un message échoue sans clé
  Anthropic (`functions/.secret.local` avec `ANTHROPIC_API_KEY=…` pour un vrai
  dialogue — fichier ignoré par git).

## Captures (vérification visuelle)
```bash
npm --prefix ../visual run setup        # une fois : Playwright
node shoot-app.js [--offline] [dossier] # app lancée par npm run dev
```
Mobile (390) + desktop (1280) : connexion, bibliothèque, recherche, fiche
album, Stats, Salon, Réglages. `--offline` pour un environnement sans réseau
sortant (coupe les polices Google, sert le SDK depuis `node_modules`).
