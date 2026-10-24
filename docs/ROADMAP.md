# Orphée — Roadmap

**Ce qui vient.** Volontairement léger : on déplace une ligne d'une section à
l'autre, sans périmètre détaillé ni tests par item (un doc forward trop lourd
fossilise — leçon de l'ancien `IMPLEMENTATION_PLAN.md`, retiré).

> Le scope est **fonctionnel** → tout ajout/réordonnancement passe par le PM (Axel), cf. gouvernance ([ADR-024](./ADR.md)).

## Maintenant

**Qualité des données** (validée 2026-10-11, maquette faite, [ADR-046](./ADR.md#adr-046), PM-31 → PM-33) — en premier :
1. ✅ MusicBrainz en **mode à blanc** (v2.22.0-v2.22.1) : propositions calculées et exportées, rien d'appliqué ; vérification sur le vrai export.
2. ✅ Onglet **Qualité** (v2.23.0, mode à blanc) : santé, cartes « à vérifier » avec preuve, corrections comptées et annulables, décisions enregistrées.
3. Fiche album : liste des titres et lien MusicBrainz.
4. ✅ **Appliquer** (v2.30.0) : processus à trancher → prêts → appliqués, par lot daté et annulable, note reportée ; singles sûrs. Reste : « Séparer » quitte la fiche album (ses séparations deviennent des décisions « garder »).

**Lot B — élégance et « Ma journée »** (accord d'Axel, maquette d'abord) :
- ✅ **« Ma journée »** (v2.28.0) — « Mes moments » fondu dans l'onglet Journée de « Mes écoutes par… », interactif (toucher un moment ou une heure → son album typique) ; boutons « voir / déplier » sous les blocs.
- ✅ **Journée refondue + « Ces jours-ci »** (maquette validée le 2026-10-15, [ADR-050](./ADR.md#adr-050)) — PR A (v2.45.0) : accroche **« Ces jours-ci »** (30 derniers jours : phase, artistes du moment, album qui tourne) en tête de « Moi » (PM-39). PR B (v2.46.0) : onglet **Journée** refondu (deux pics surlignés, **signatures genre+artiste par créneau** matin/soir/nuit, plus de total ni de chips ; l'« album du créneau » et « Ma journée » cèdent la place).
- **Passe d'élégance sur « Moi »** — moins de bordures, boutons de note plus calmes dans « À faire », typographie des nombres, mouvement, en-tête plus léger.

**Vision v3 « Moi »** — l'app passe de tableau de bord à miroir. Cf. PRODUIT § 1, PM-18 → PM-24. Livrée, sauf mention :

1. ✅ **Écran « Moi »** (v2.2.0 → v2.19.0) — portrait, « À faire », moments, années › trimestres, adorés, paradoxes, « Écoutes par… » ; l'écran Stats est retiré (v2.12.0).
2. ✅ **Coquille « Moi »** (v2.2.0) — onglets Moi · Bibliothèque · Salon (réglages en icône) ; « Moi » avec l'existant (artistes signatures, moments, « Écoutes par… », mur des adorés). Stats accessible pendant la transition.
3. ✅ **Synchro Last.fm** (ADR-034, v2.16.0) — « Actualiser » récupère les nouvelles écoutes, sur Cloud Storage ; la Sheet n'est plus lue (v2.17.0, ADR-044).
4. ✅ **Boucle de curation** (v2.4.0 — le « trimestre qui s'achève » viendra avec les chapitres) — carte « À qualifier » (tap 1-5), retour d'impact, netteté du portrait.
5. ✅ **Trimestres & humeurs** (v2.3.0 — seuils à calibrer sur la vraie bibliothèque) — agrégats + règles testées, timeline cliquable, bascules.
6. ✅ **Fusion coup de cœur → 5** (v2.6.0 — migration à déclencher par Axel dans Réglages) — migration des notes, retrait de la commande d'Orphée.
7. ✅ **Chapitres & « Raconte-moi »** (v2.5.0) — nouvel espace Firestore + règles ; récit d'Orphée mis en cache.
8. 🟡 **Classification par artiste** (v2.7.0 — import + passe guidée) — reste : suggestions depuis les tags Last.fm (la clé est en place). 32 % des écoutes sont encore sans genre (export du 2026-10-10).
9. **Notification hebdomadaire** (opt-in) — plus tard.

## Ensuite

- **Titres d'un album dans l'ordre du disque** — la fiche album montrerait tous les titres dans l'ordre de l'album, chacun avec sa barre de volume, le plus écouté en or. Aujourd'hui seuls les 8 plus écoutés sont gardés, sans ordre. Piste retenue : liste de titres MusicBrainz, cherchée à la demande à la 1ʳᵉ ouverture d'une fiche puis mise en cache (lecture seule) ; édition choisie automatiquement (celle où le plus de titres écoutés se retrouvent ; identifiant réutilisé si la Qualité l'a déjà trouvé) ; titres écoutés non rattachés sous la liste (« Autres titres écoutés ») ; repli sur l'affichage actuel si introuvable. Pur affichage (aucune donnée réécrite, rien à arbitrer). À cadrer — PM-gate.

- **Albums éclatés par les featurings** — un album compté chez l'artiste invité d'un titre (*Comment c'est loin* chez Gringe) ; suite de PM-29, à cadrer (risque des compilations « Best of »).
- **Collection de CD** — voir tous les CD possédés et prioriser ceux à acheter. Pure curation (aucune écoute CD suivie). Concept à modéliser (album hors écoutes, possession / envie, priorité) — PM-gate.

- **Ouvrir le repo / partager à Last.fm — durcissement & privacy** (audit du 2026-10-14 ; aucune vulnérabilité exploitable trouvée, reste l'hygiène) :
  - **CSP bloquante** — la CSP complète est en `Report-Only` (v2.43.4). La passer en `Content-Security-Policy` une fois validée sans violation sur le site réel (desktop + mobile : connexion, Actualiser, pochettes, chat).
  - **Privacy de l'historique git** (avant de rendre le repo public) — retirer au moins « Gaelle » (`docs/SKILL.md`, donnée sur un tiers) et le profil perso (« 37 ans », anecdotes d'écoute) ; décider pour le nom réel + Gmail présents dans chaque commit. Retrait complet = `git filter-repo` + force-push (et les `refs/pull/*` de GitHub gardent les vieux commits : suppression/recréation du repo au besoin). À piloter par Axel.
  - **Bump `firebase-admin` 12→13** — solde les 8 alertes `npm audit` modérées restantes (toutes côté serveur, non embarquées dans le navigateur) ; changement majeur, à tester (gate predeploy).
  - **Vérifier le partage de la page Notion** — l'URL du wiki est dans le repo (anodin seulement si la page n'est pas publique).

## Plus tard

- **Skill `odyssee-gouvernance` (suite)** — un outil qui *installe* (mode `init`, interview façon `/grill-me`) et *vérifie* (mode `verify`, **mécanique**) la gouvernance par couche d'une app, sur un **manifeste de gouvernance** à source unique. But : étendre la gouvernance d'Orphée aux autres apps (Zagreus partiel ; Ariane/Ulysse à initier) sans la recopier à la main ; vendoriser `grill-me` dans `odyssee-skills`. 1ʳᵉ brique livrée : le déclencheur « remontée de couche » ([ADR-032](./ADR.md)). *(Remplace/absorbe « canari de duplication », « canari liste de lecture » et « process anti-divergence » ci-dessous.)*
- **Rendre la visualisation d'Écho exploitable** — aujourd'hui l'Écho (la parenté entre albums) est faiblement matérialisé. Chantier de fond d'abord sur **la notion d'Écho elle-même** (qu'est-ce qui en fait un lien pertinent ?), puis sur sa visualisation, pour qu'elle devienne réellement utile et pas décorative.
- **Concevoir et développer la « mémoire » d'Orphée** — qu'Orphée retienne des éléments sur Axel au fil des échanges (goûts, contexte, anecdotes) et les **réinjecte au bon moment**, sans tout ressortir à chaque message. Concept A2 modélisé mais non implémenté (cf. divergence D-3, [SPEC.md](./SPEC.md)) : conceptualiser le quoi/quand-injecter avant de coder.
- **Canari de duplication** — un check qui bloque si une chaîne-témoin apparaît dans deux docs.
- **Canari liste de lecture** — vérifier que chaque doc canonique de `docs/` est cité dans `CLAUDE.md`.
- **Process anti-divergence** — deux sessions parallèles ont divergé sur `main` le 2026-06-07 (gouvernance Notion-first vs repo-first) sans se voir. Définir une coordination.

## Idées en réserve

- **Données sur le téléphone, pour partager l'app à des amis** (idée d'Axel, 2026-10-09, à explorer) — stocker la donnée en local sur le téléphone (import de son export Last.fm, curation en local) pour que des amis utilisent l'app sans qu'Axel ait à héberger ni gérer leurs données personnelles. Impliquerait de renoncer à la version PC / à la synchro entre appareils. Questions ouvertes : Orphée (le chat) sans serveur — clé API à qui ? ; sauvegarde / perte du téléphone ; import des écoutes sans la Sheet.
