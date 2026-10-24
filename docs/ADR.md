# ADR — Orphée

Architecture Decision Records.

> Les ADR-017 à ADR-021 formalisent les invariants de la rétro-documentation
> du 2026-06-07 (voir [`PRODUIT.md`](./PRODUIT.md) et [`MODELE.md`](./MODELE.md)).

---

> Les ADR-026 à ADR-029 cadrent le chantier majeur **v2.0** (fiabilisation :
> référentiel des notes à source unique, curation via Orphée durcie, stats sans
> donnée factice, mise en page desktop). Voir [`ROADMAP.md`](./ROADMAP.md) et la
> section v2.0 de [`SPEC.md`](./SPEC.md).

## ADR-052 — « Tes mondes » : clusters de co-écoute en archipel

**Date :** 2026-10-16 · **Statut :** Acceptée (PM-gate du 2026-10-16, maquettes validées au doigt) · **Supersède :** [ADR-051](#adr-051) · **Conforme à :** [IM-1](./MODELE.md#invariants-de-modèle), [IM-5](./MODELE.md#invariants-de-modèle), [IM-6](./MODELE.md#invariants-de-modèle), [IM-8](./MODELE.md#invariants-de-modèle) · **Préserve :** [ADR-005](#adr-005), [ADR-031](#adr-031)

**Décision :** « Souvent avec » devient une vue de la **forêt** plutôt que des arbres. La constellation égocentrée (ADR-051) montrait un voisinage à la fois ; mais le vrai motif est « tout est lié à tout » — ce qu'on veut voir, ce sont les **mondes** : des groupes d'artistes qu'Axel **enchaîne ensemble**, trouvés par **détection de communautés** (Louvain) sur le graphe de co-écoute. La vue est un **archipel** : chaque monde une île.

- **Clusters, pas genres.** Un monde peut **traverser les genres** (du Rap qu'on glisse dans ses sessions Rock). C'est précisément ce que la couleur seule ne montrait pas.
- **La distance dit le lien.** Pas de traits : le **poids des ponts** entre mondes **rapproche** les îles ; deux mondes qu'on enchaîne beaucoup se collent, deux mondes étrangers s'écartent. La **taille** d'une île = ses écoutes.
- **Zoom à niveau de détail.** Dézoomé : les mondes, sans noms. On **zoome** dans un monde → les **noms d'artistes** apparaissent (plus tard : portraits Deezer).
- **Entrée inchangée, forêt à la place des arbres.** Même bouton « Explorer » sur la fiche artiste (PM-40) ; il ouvre l'archipel **centré sur le monde de cet artiste** (sa boule entourée), d'où l'on dézoome. Remplace la constellation.
- **Réglages figés** (validés en maquette interactive) : 100 artistes les plus écoutés · lien ≥ 20 séances · résolution Louvain 1,5.

**Contexte :** itérations maquettes (2026-10-16). La constellation égocentrée (ADR-051, livrée v2.47.0) répondait à « voir *ce* lien », mais pas à « où suis-je dans l'ensemble ». Un outil interactif (curseurs nombre d'artistes / seuil / granularité) a servi à sentir le bon découpage ; la vraie vue fige un seul défaut.

**Conséquences :** le clustering tourne **côté serveur** au refresh (ADR-005), **déterministe** (ordre fixe, départage par plus petit id) → agrégat reproductible `cache/agg_clusters`. Dérivé pur (IM-1), **segmentation** (IM-6, n'altère pas la curation), **jamais une source** (IM-5), **sans genre** (coloré et nommé live, ADR-031), **lu par l'invité** (IM-8, `cache/*`). La **mise en page + le zoom** sont **côté client** (dépendent de l'écran). `firestore.rules` inchangé. L'agrégat `agg_proximity` et la vue égocentrée sont retirés.

---

## ADR-051 — « Souvent avec », explorable : constellation égocentrée

**Date :** 2026-10-16 · **Statut :** ⚠️ Superseded par [ADR-052](#adr-052) (v2.48.0) — la constellation égocentrée est remplacée par l'archipel « Tes mondes ». · Acceptée (PM-gate du 2026-10-16, prototypes validés au doigt) · **Conforme à :** [IM-1](./MODELE.md#invariants-de-modèle), [IM-5](./MODELE.md#invariants-de-modèle), [IM-8](./MODELE.md#invariants-de-modèle) · **Préserve :** [ADR-005](#adr-005), [ADR-031](#adr-031)

**Décision :** la proximité entre artistes (« Souvent avec », PM-26) devient **explorable**, via une **constellation égocentrée** ouverte depuis la fiche artiste (bouton « Explorer », PM-40) : un artiste au centre, ses voisins de co-écoute autour ; toucher un voisin le fait **marcher** au centre.

- **Égocentrée, pas graphe libre.** Un graphe de force complet est illisible sur téléphone (spaghetti). On ne montre qu'un **voisinage** à la fois (centre + 6 voisins).
- **Le poids tire, la taille dit l'écoute.** Le lien est un ressort pondéré : plus on enchaîne deux artistes, plus il est **court et épais**. La **taille** du nœud = ses **écoutes**. Les voisins liés entre eux s'attirent → **grappes de genre** naturelles. Aucun nombre : l'épaisseur suffit.
- **Couleur = genre, live.** Les nœuds sont teintés par le genre de l'artiste, lu **à la source** (curation, ADR-031) — jamais figé dans l'agrégat.
- **Continuité par pivot.** À chaque pas, la disposition neuve est **pivotée** pour que la boule d'où l'on vient reparte du **côté d'où l'on vient** ; l'animation interpole depuis l'état courant. On « garde le fil ».
- **Set borné.** Nœuds = artistes **présents** (≥ 50 écoutes, ~155) ; voisins au **même seuil que « Souvent avec »** (≥ 10 séances). L'agrégat reste minuscule.

**Contexte :** itérations maquettes (2026-10-15/16). Écartés successivement : graphe libre (spaghetti), zoom sémantique à 3 niveaux genres↔sous-genres↔artistes (à-coups au pinch, liens illisibles), nombres sur les liens (redondants avec l'épaisseur). Retenu : la vue égocentrée, dépouillée, qui répond à « voir *ce* lien entre *ces* deux nœuds » et « explorable sur téléphone ».

**Conséquences :** nouveau dérivé pur (IM-1) `cache/agg_proximity`, recalculé à l'actualisation (ADR-005, pas de cron), **jamais une source** (IM-5), **lu aussi par l'invité** (IM-8, `cache/*`). Aucun nouveau chemin d'écriture, aucune modification des règles Firestore (déjà couvert par `cache/{document=**}`). Le genre n'entre pas dans l'agrégat (ADR-031).

---

## ADR-050 — Ce qui « distingue » un créneau : sur-représentation + plancher de volume

**Date :** 2026-10-15 · **Statut :** Acceptée (PM-gate du 2026-10-15, maquette validée) · **Précise :** [ADR-028](#adr-028) · **Conforme à :** [IM-6](./MODELE.md#invariants-de-modèle)

**Décision :** deux usages, deux logiques.

- **Signature de créneau** (matin / soir / nuit — ce qui *caractérise* un moment) : genres et artistes par **sur-représentation** — le rapport entre leur **part dans la fenêtre** et leur **part globale** (`lift`) — en ne gardant que ceux qui franchissent un **plancher de volume** relatif (p. ex. un artiste ≥ 0,25 % des écoutes et ≥ 0,5 % des écoutes de la fenêtre ; un genre ≥ 1 % de la fenêtre). Premiers par `lift` ; si **aucun** ne franchit le plancher, les plus écoutés de la fenêtre.
- **« Ces jours-ci »** (la *phase du moment*) : genre dominant, album qui tourne et artistes du moment par **volume** (ce qu'on écoute vraiment, le plus), avec le `lift` montré **en regard** (« ×N habitude »).

La distinction est volontaire : *caractériser* un créneau appelle la sur-représentation (ce qu'on y met et pas ailleurs) ; dire une *phase* appelle le volume (ce qui tourne). Classer la phase par `lift` ferait remonter un genre rare (Classical, 1 fois par an d'habitude → lift énorme) alors que la phase est, elle, du Rock.

**Contexte :** l'album **typique** par heure (score `n²/total`, `buildCommuting`) revenait souvent à l'album le plus écouté d'Axel tous créneaux confondus → « pas utile si c'est global ». Le `lift` **pur** faisait l'inverse : un artiste écouté 28 fois en tout, presque tous le soir, passait « leader du soir » alors qu'Axel l'a à peine écouté (d'où le plancher) ; et pour la phase, « Classical » sortait en tête alors qu'Axel écoute du Rock (d'où le volume).

**Conséquences :** dérivé — Segmentation (IM-6), recalculé à l'actualisation ; **ne touche jamais la curation**. Tout chiffre reste réel (ADR-028). Le libellé reste honnête : « plus qu'au reste de la journée / qu'à ton habitude », jamais « ton top ». Remplace l'« album du créneau » dans l'onglet Journée (la carte album et les chips de moments quittent la vue).

---

## ADR-049 — « Moi » préparé d'avance, recalculé quand une source change

**Date :** 2026-10-13 · **Statut :** Acceptée — implémentée v2.38.0 · **Précise :** [ADR-031](#adr-031), [ADR-048](#adr-048) · **Préserve :** [ADR-005](#adr-005)

**Décision :** ce que « Moi » lit de la bibliothèque est **préparé d'avance** : `cache/agg_moi` = les albums notés ou coups de cœur, ceux de ≥ 20 écoutes et ceux cités par un agrégat (« À faire », trimestres, « Un seul titre », pile « Mis de côté »), **avec leur curation** (sans les descriptions), les genres de leurs artistes, et le seuil des paradoxes. Avec `agg_portrait` et `agg_oddities`, il est **recalculé quand une source change** :
- à la synchro (`refreshCache`) — les écoutes ;
- à **chaque geste de curation** (`onCurationWritten`, trigger Firestore sur `users/{uid}/grades|artist_genres|aside` et `settings/oddity`) — depuis la bibliothèque déjà calculée, sans Last.fm ni MusicBrainz (~0,3 s sur le jeu d'essai, 1 à 2 s à l'échelle d'Axel).

« Moi » s'affiche **en entier** sur ces agrégats (~270 Ko au lieu de ~2 Mo) et n'attend plus la bibliothèque ; celle-ci, chargée ensuite, le recalcule en direct (curation live, ADR-031).

**Contexte :** demande d'Axel (« je n'ai pas besoin de le recalculer à chaque affichage ») ; un calcul à la seule synchro aurait figé la curation jusqu'à la suivante (un album noté redemandé par « À faire » à la réouverture).

**Conséquences :** ADR-005 tient — ce n'est pas un cron : le recalcul ne part que d'un geste d'Axel. ADR-031 tient — la valeur courante de la curation est lue à sa source ; `agg_moi` en est un dérivé (IM-5), daté au plus d'un geste. Coût : une exécution de Function par écriture de curation. Premier trigger Firestore du projet (Eventarc). Limite connue : un lot d'écritures (notes reportées à « Appliquer ») déclenche un recalcul par écriture — à regrouper si ça devient fréquent.

---

## ADR-048 — « Moi » s'affiche d'abord sur ses agrégats, la curation live suit

**Date :** 2026-10-13 · **Statut :** Acceptée — implémentée v2.37.0 · **Précise :** [ADR-031](#adr-031) · **Conforme à :** [IM-5](./MODELE.md#invariants-de-modèle)

**Décision :**
1. Le **portrait** de « Moi » (3 genres, parts, sous-genre, artistes phares, netteté) est aussi **calculé à l'actualisation** (`cache/agg_portrait`, `buildPortrait`, même calcul que `moi.js`). « Moi » s'affiche **dès les agrégats** (~120 Ko) avec ce **premier jet**, puis se recalcule sur la **curation live** une fois la bibliothèque chargée (~2 Mo pour 11 600 albums).
2. Les blocs qui ont besoin de la bibliothèque (à faire, question, adorés, paradoxes, un seul titre) occupent d'abord leur place en **forme grise** (hauteur réservée, rien ne saute).
3. La bibliothèque ne se charge qu'**après** les agrégats : sur la connexion Firestore partagée, ses gros documents faisaient attendre les petits.

**Contexte :** mesure du 2026-10-13 (émulateur, bibliothèque à l'échelle, 5 Mbit/s) : tout s'affichait à ~7 s, d'un bloc ; désormais l'essentiel à ~2 s (connexion comprise), le reste quand la bibliothèque arrive.

**Conséquences :** ADR-031 tient — la valeur courante de la curation reste lue à sa source ; le premier jet est un **dérivé** daté de la dernière actualisation (IM-5), qui ne vit qu'une à deux secondes à l'écran. Un genre changé depuis la dernière actualisation n'y figure pas encore : la version live le corrige aussitôt chargée. Étapes suivantes possibles : garder la dernière version sur le téléphone (2ᵉ ouverture instantanée), appli hors ligne (*service worker*).

---

## ADR-047 — Orphée nomme le chapitre quand Axel lui demande de raconter

**Date :** 2026-10-11 · **Statut :** Acceptée (demande d'Axel, PM-gate du 2026-10-11)

**Décision :** « Raconte-moi » sur un trimestre (PM-25) crée ou met à jour
le **chapitre** du trimestre (E7) : Orphée en propose le **titre** (2 à 6
mots, sur la musique seulement) et son récit en devient la **description**.
Axel modifie ensuite titre et description (« Modifier le chapitre ») ; il
n'y a plus de bouton pour créer un chapitre à la main. `narrateQuarter`
renvoie `{title, text}` (`splitTitle`, consigne v2) ; c'est **l'app**, sur
le geste d'Axel, qui écrit le chapitre (`users/{uid}/chapters`) et sa
description (`users/{uid}/chapter_texts/{id}`, lisible par Axel seul).

**Contexte :** Axel aime ce qu'Orphée dit des trimestres et veut que ce
soit gardé et réutilisé, sans avoir à trouver lui-même un nom.

**Raison :** IM-7 tenu — Orphée n'agit sur la curation qu'à la demande
d'Axel (« Raconte-moi »), comme les tags du Salon ; le chapitre reste une
curation qu'Axel corrige à volonté. PRODUIT § 2 tenu — le titre parle de
musique, jamais de la vie. IM-8 tenu — l'invité lit le titre (chapitres)
mais jamais la description (récit) : elle vit dans une collection que les
règles existantes réservent au propriétaire.

**Conséquences :** PM-20 et PM-25 réécrits ; E7 gagne une description et
son origine (`by` : orphee / axel). Les chapitres déjà nommés restent tels
quels ; « Raconte-moi » sur un trimestre couvert les renomme (accord
d'Axel : pas d'existant à préserver).

## ADR-046 — Qualité des données : MusicBrainz fait référence, Axel arbitre

**Date :** 2026-10-11 · **Statut :** Acceptée (validée par le PM) · **Précise :** [ADR-045](#adr-045)

**Contexte :** l'export du 2026-10-11 montre que les règles d'ADR-045
(deviner si un libellé « ressemble » à un single, puis demander à Last.fm)
laissent passer cinq familles de cas :
- les faces B de singles, qui sont justes ;
- un album d'un autre artiste reçu avec l'écoute (Plug In Baby sous « Starboy ») ;
- les variantes de titre (« (edit) », « (US mix) ») ;
- les singles que Last.fm ne sait pas placer ;
- les compilations que Last.fm propose (« Greatest Hits »).

Ajouter une règle par cas ne tiendrait pas, et Axel ne voit pas ce que la
machine décide.

**Décision :**

1. **MusicBrainz fait référence.** Pour un titre (artiste + titre), on cherche
   l'enregistrement et les sorties qui le contiennent, avec leur type (Album,
   Single, EP), leurs types secondaires (Compilation, Live, Remix, Bande
   originale), leur date et la place du titre. Last.fm ne sert plus qu'en
   second recours, quand MusicBrainz ne connaît pas le titre.
2. **Une règle unique :** un titre appartient au **premier album studio de
   son artiste qui le contient** ; s'il n'y en a aucun (face B, bande
   originale, remix), il reste où il est. Les éditions restent réunies comme
   dans ADR-045.
3. **Trois issues par titre :**
   - **sûr** : même artiste, même version (un crédit d'invité ne compte
     pas), **album déjà dans la bibliothèque** (plus de 4 écoutes), disque
     principal (pas un disque bonus de réédition), pas d'autre album la
     même année. Prêt à appliquer, sans carte. *(Durci le 2026-10-11 par le
     PM après le premier essai réel : sans la bibliothèque, MusicBrainz
     plaçait Take Five ou Free Bird sur de mauvais albums.)* **Élargi le
     2026-10-11** (revue réelle : 25 « album absent » validés sur 25) : un
     titre reçu **comme single ou sans album** est aussi sûr quand l'album
     n'est pas dans la bibliothèque (même version, disque principal, seul
     album de l'année) ; venu d'une compilation, il reste à vérifier (c'est
     là que vivent les erreurs : Take Five, September).
   - **à vérifier** : autre version (mix, edit), plusieurs candidats, disque
     bonus, album absent de la bibliothèque, sources en désaccord. Attend
     Axel ; une carte non traitée ne change rien.
   - **inchangé** : aucun album studio, titre joué en remix/live/acoustique
     (un autre disque, ADR-045), ou titre inconnu partout.
4. **L'arbitrage d'Axel prime** : arbitrage > MusicBrainz > Last.fm > libellé
   reçu. C'est une curation (`users/{uid}/album_arbitrations`, propriétaire
   seul) qui survit à tout recalcul et à tout vidage de cache. Elle remplace
   la Séparation (`album_splits`) : les séparations existantes deviennent des
   corrections appliquées « remettre à part » — vers le libellé reçu lui-même,
   un lot annulable — *(précisé le 2026-10-12, v2.32.0 : « garder » veut
   dire « garder où il est aujourd'hui », pas « sur son libellé »)*.
5. **Rien ne s'applique sans Axel** *(précisé le 2026-10-11)*. Un titre
   passe par trois étapes : **à trancher** (carte) → **prêt** (sûr, ou
   décision « déplacer » d'Axel) → **appliqué**. Seul le bouton
   « Appliquer » fait passer les prêts dans la bibliothèque, **par lot
   daté** ; chaque correction appliquée est une curation
   (`users/{uid}/applied_corrections`) que le rattachement suit (PM-29).
   Les nouvelles corrections d'un « Actualiser » attendent le lot suivant :
   pas de bascule globale. Un lot, ou une correction seule, s'annule.
   **Note reportée** : quand un album noté se vide (toutes ses écoutes
   partent), sa note est recopiée sur l'album d'arrivée ; si celui-ci a
   déjà une note, Axel choisit. L'annulation remet les notes.
6. **Onglet Qualité** (propriétaire seul, IM-8) :
   - un taux de santé (part des écoutes rangées sur un album confirmé) ;
   - les titres à vérifier, une carte à la fois, avec la preuve : pochette,
     année, place du titre dans l'album ;
   - les corrections automatiques, comptées et annulables une à une ;
   - les titres laissés tels quels ;
   - les décisions d'Axel.

   La fiche album gagne la liste de ses **titres** (MusicBrainz) et un lien
   MusicBrainz. Navigation et « retour » comme dans le reste de l'app.
7. **Débit.** MusicBrainz impose 1 requête par seconde. On interroge les
   titres des petits albums (≤ 4 écoutes) et les libellés suspects, les plus
   écoutés d'abord, soit environ 12 000 titres au départ. Deux façons
   d'avancer, toujours à la demande (ADR-005), jamais par cron :
   - quelques dizaines de titres à chaque « Actualiser » ;
   - une **vérification longue** lancée depuis Qualité (jusqu'à environ
     30 min par lancement, reprise là où elle s'est arrêtée, progression
     visible).

   Les réponses sont mises en cache dans Storage (Functions seules). Un
   titre inconnu est réessayé après 30 jours.
8. **Données envoyées :** artiste et titre seulement. L'app s'identifie par
   son URL (exigence de MusicBrainz), jamais par l'email d'Axel.

**Conséquences :**
- le rattachement devient explicable : chaque titre déplacé a une source et
  une raison ;
- les compilations sont écartées par leur type plutôt que par une liste de
  mots ;
- l'amorçage prend quelques heures de vérification réparties sur plusieurs
  lancements, puis ne coûte que les nouveaux titres ;
- la couverture de MusicBrainz est plus faible sur le rap français de niche :
  Last.fm, puis l'arbitrage, prennent le relais ;
- l'espace Qualité est conçu pour accueillir d'autres contrôles (genres
  manquants, featurings, doublons d'artistes).

---

## ADR-045 — Album canonique : un dérivé appliqué avant tout calcul

**Date :** 2026-10-10 · **Statut :** Acceptée (décisions du PM), source et arbitrage précisés par [ADR-046](#adr-046) · **Précise :** IM-4

**Contexte :** le libellé d'album d'une écoute vient du lecteur (YT Music via
Last.fm). Hors page d'album (recherche, radio, clip), il envoie le single ou
le titre lui-même (« Unintended » au lieu de *Showbiz*), parfois rien ; les
éditions (Deluxe, Remastered, Anniversary) éclatent un album. Mesure sur
l'export du 2026-10-10 : 6,1 % d'écoutes sans album, 330 groupes d'éditions,
30 % des écoutes sur des « albums » de 1 à 4 écoutes.

**Décision :** l'écoute brute ne change jamais (IM-1) ; l'**album canonique**
est un dérivé appliqué aux écoutes au début de `refreshCache` (et de
l'export), avant tout agrégat :
1. libellé suspect (vide, « - Single/EP », égal au titre joué) → album de
   référence du titre via Last.fm `track.getInfo` (même artiste, pas une
   compilation ni le single lui-même) ; résolu par lots (45 s par
   « Actualiser », les plus écoutés d'abord), mis en cache dans Storage
   (`derived/track_albums.json.gz`, Functions seules) ; « inconnu » réessayé
   après 30 jours ;
2. éditions d'un même album (même artiste, même titre une fois retirées les
   mentions d'édition) réunies ; remix, live, acoustique restent à part.
   Édition retenue : la notée le plus récemment, sinon un libellé de la
   bibliothèque, le plus écouté.
Rattachement **automatique** ; Axel peut **séparer** un libellé (curation
`users/{uid}/album_splits`, propriétaire seul). Les notes **ne migrent pas** :
celle d'un faux album est abandonnée (« si je l'ai noté, c'est pas normal »).
Un vrai single sorti avant son album y est rattaché.

**Conséquences :** l'identité d'un album (IM-4) est la clé canonique
`{artiste}-{album}` ; le fait brut garde son libellé. La bibliothèque
perd quelques milliers de faux albums au fil des « Actualiser ». Non couvert
pour l'instant : un album éclaté par les featurings (artiste du titre ≠
artiste de l'album), à traiter à part (risque des compilations).

---

## ADR-044 — La Google Sheet n'est plus lue

**Date :** 2026-10-10 · **Statut :** Acceptée (décision du PM) · **Complète :** [ADR-034](#adr-034)

**Contexte :** après la migration des écoutes vers Cloud Storage (ADR-034),
la Sheet ne servait plus qu'à l'onglet `Artists`, alors que les genres
d'artistes vivent dans l'app depuis v2.7.0 (`artist_genres`, l'app fait foi).

**Décision :** plus aucune lecture de la Sheet. `refreshCache` ne lit que
Storage (écoutes) et Firestore (curation) ; le nombre d'artistes est dérivé
des écoutes. Le code d'import (`readSheet.js`, `migrateScrobbles`, import
unique des genres), la dépendance `googleapis` et le secret `SHEETS_ID`
sont retirés. Le mode local écrit ses écoutes fictives dans l'émulateur
Storage.

**Conséquences :** plus de quota ni de panne Google Sheets ; refresh plus
léger. La Sheet reste une sauvegarde hors de l'app (jamais modifiée).
Retour arrière : le code retiré reste dans l'historique git (v2.16.2).

---

## ADR-043 — Humeurs comparées à soi

**Date :** 2026-10-10 · **Statut :** Acceptée (validée par le PM)

**Contexte :** avec des seuils absolus identiques pour tous, la frise d'Axel
était presque entièrement « Exploration » : il découvre beaucoup, tout le
temps (> 40 % de nouveautés à chaque trimestre). La règle mesurait son
habitude au lieu de repérer ce qui change.

**Décision :** l'humeur est l'indicateur qui s'écarte le plus de la moyenne
personnelle (en écarts-types, ≥ 1, plancher d'écart-type 4 points, et
indicateur pesant au moins la moitié de son seuil absolu). Sans écart net :
« dans tes habitudes », pas d'étiquette. Description chiffrée face à la
moyenne. Trimestre incomplet signalé et exclu des habitudes. Repli sur les
seuils absolus tant qu'il y a moins de 6 trimestres complets.

**Conséquences :** la frise raconte des changements ; une humeur se justifie
par ses chiffres. Les humeurs passées peuvent changer quand la moyenne
évolue (dérivé recalculé, IM-5) ; les récits d'Orphée déjà générés se
régénèrent si leurs faits changent.

---

## ADR-042 — Partager sa bibliothèque : un invité anonyme, 1 h, lecture seule

**Date :** 2026-10-10 · **Statut :** Acceptée (validée par le PM, maquette)

**Contexte :** Axel veut montrer sa bibliothèque à un ami sans lui créer de
compte ni lui confier ses données, et sans exposer Orphée (sa clé, sa
conversation).

**Décision :** un **partage** d'1 h, un à la fois, créé par Axel (QR + lien).
L'ami entre en **compte anonyme Firebase** ; une Function échange le jeton
contre un accès `guests/{uid}`. Le jeton ne voyage que dans le fragment de
l'URL ; le serveur n'en garde que l'empreinte SHA-256. Ce sont les **règles
Firestore** qui bornent tout : lecture d'une liste fermée de données,
échéance comparée à l'heure du serveur, partage supprimé = accès mort.
Orphée et toutes les Functions d'écriture restent réservées au propriétaire
(ADR-041).

**Écarté :** jeton personnalisé (custom token) — demande un droit IAM de
signature au compte de service ; claims personnalisés — délai de
propagation du jeton ; partage permanent ou multi-durées — le PM veut 1 h.

**Conséquences :** activer le fournisseur Anonyme dans la console ; les
comptes anonymes s'accumulent (sans données) ; un invité peut rester sur la
page après coupure mais plus rien ne se charge, et l'app le fait sortir à la
minute suivante.

---

## ADR-041 — Orphée n'a qu'un propriétaire, appliqué par les règles

**Date :** 2026-10-10 · **Statut :** Acceptée (validée par le PM)

**Contexte :** Les règles n'exigeaient qu'« être connecté » et les Functions
que `request.auth`. Or rien ne limitait la connexion : tout compte Google
pouvait lire `cache/*` (données d'écoute d'Axel), appeler Orphée (clé
Anthropic d'Axel, donc à ses frais) et lancer `refreshCache`, qui réécrivait
alors le cache avec la curation (vide) de ce compte. Préalable aussi au futur
accès invité : on n'ouvre pas une porte d'invité sans serrure principale.

**Décision :** un propriétaire unique, désigné par son email dans
`config/owner`, document que les clients ne peuvent ni lire ni écrire (créé
depuis la console, comme `config/roles` du Grimoire). Règles et Functions
font la même vérification : email Google **vérifié** égal à celui-là. Échec
fermé si le document manque.

**Conséquences :** aucun email dans le code ; `config/owner` doit exister
**avant** le déploiement des règles, sinon Axel lui-même est refusé. Une
lecture de plus par requête Firestore (le `get` des règles). Le mode local
crée `config/owner` et un compte de test à email vérifié.

---

## ADR-040 — Une seule page de portrait : l'écran Stats est retiré

**Date :** 2026-10-09 · **Statut :** Acceptée (décision du PM) · **Retire :** PM-05

**Contexte :** Depuis la vision v3, « Moi » raconte qui est Axel ; l'écran Stats
restait à côté, avec des visualisations dont plusieurs ne servaient pas
(constellation inachevée, personnalités peu crédibles, capsule incomprise,
découvertes inutilisables, top albums trop restrictif).

**Décision :** ce qui sert monte dans « Moi » (chiffres clés dans l'en-tête, top
artistes, moments, écoutes par…) ; le reste est **supprimé**, vues **et** calculs
(`agg_constellation`, `agg_personalites`, `agg_capsule`, `agg_decouvertes` ne
sont plus écrits). `agg_top_albums_alltime` reste : Orphée s'en sert. « Moi »
adopte une grammaire unique de cinq briques (bloc, ligne d'album, exemples,
visage, carte d'action) : un album, un artiste se montrent partout de la même
façon ; cadre seulement pour l'action ; couleur seulement pour une note ou une
humeur. « Ceux qui me définissent » fond dans « Qui je suis » (visages par
genre). Adorés et paradoxes montrent 3 exemples et renvoient au bac de la
Bibliothèque, qui gagne un bac « Paradoxes » après les genres. Une étagère
défilant de côté a été maquettée puis écartée par le PM (défilement de trop
sur cet écran).

**Conséquences :** `stats-preview.js` et `stats-top.js` supprimés ; `stats.js`
devient un simple chargeur de données partagé (`OrpheeStats`) ; refresh plus
léger. Les anciens documents `cache/*` concernés restent en base sans lecteur
(dérivés, sans risque) jusqu'à un nettoyage.

---

## ADR-039 — Bibliothèque en bacs : glisser pour changer de bac, feuilleter ou parcourir les tranches

**Date :** 2026-10-09 · **Statut :** Acceptée (maquette validée par le PM) · **Remplace (côté interface) :** la vue « bac à disques » horizontale et ses filtres ; la bascule « curé ↔ tous » d'[ADR-012](#adr-012)

**Contexte :** La bibliothèque v1 montrait des étagères horizontales empilées : une
pochette et demie lisible par bac, deux genres par écran, deux sens de défilement
mêlés (un geste en biais faisait partir le bac de côté), filtres cachés derrière un
bouton flottant, et seulement les albums « très écoutés » par défaut. Une note posée
reconstruisait tout et ramenait chaque bac au début.

**Décision :**
- **Un geste = un sens.** Horizontal : changer de bac (pager natif à aimantation
  obligatoire). Vertical : parcourir le bac. Les noms des bacs forment un
  **carrousel** qui suit le doigt ; toucher le bac courant ouvre la liste de tous.
- **Bacs** : Adorés (note 5) puis un bac par genre effectif (MODELE E8), chacun
  avec tous ses albums, triés par écoutes. « Non classé » en dernier.
- **Tous les bacs sont des piles de tranches**, Adorés compris. Un mode « Bac » à
  feuilleter (physique maison : élan, ressort) a été construit puis retiré à
  l'usage : un seul album à la fois, un geste à part, moins utile que la pile ;
  les grandes pochettes adorées restent visibles dans « Moi ».
- **Tri au choix** (écoutes par défaut, artiste A→Z, album A→Z) par trois pictos
  sans mot, sous le pouce ; mémorisé par appareil.
- **Les piles de tranches** (défilement natif libre) ; **un toucher
  ouvre la fiche album**, comme partout dans l'app. Un « disque sorti » au-dessus
  de la pile et un dépliage au toucher ont été écartés : doublon de la fiche,
  geste à deviner. Tranches d'**épaisseur unique**.
- **Style de tranche choisi au labo, sur les vraies pochettes** (5 puis 4
  variantes comparées) : tranche **sombre, à peine teintée** par sa pochette
  (floutée, voile), avec la **vignette nette** de la pochette — c'est elle qui fait
  reconnaître l'album, le mur reste régulier. Écartés : couleurs calculées
  (moyenne, teinte vive, familles k-moyennes : ternes ou boueuses), pochette
  floutée en plein (« vidéo de mauvaise qualité »), bandes nettes. Aucune source
  publique de vraies tranches n'existe.
- **Pas de filtres** : les bacs et une recherche unique les remplacent. « À noter »
  et « Paradoxes » vivent dans « Moi ».
- **État conservé** : chaque bac retient l'album en haut de la pile ; une note posée
  reconstruit les bacs sans faire sauter la vue.

**Conséquences :** `library.js` / `library.css` réécrits (préfixe `lb-`) ; la
bibliothèque est un écran fixe comme le Salon (`view-library-active`).
`OrpheeLibrary.showOddity` disparaît (« Mes paradoxes » se déplie dans « Moi »).
Lien de préversion par PR (canal Hosting `essai`) pour régler le ressenti du doigt
sur téléphone avant fusion.

---

## ADR-038 — Classification d'artiste : import unique depuis la Sheet, puis l'app fait foi

**Date :** 2026-10-09 · **Statut :** Acceptée (MODELE E8 validé par le PM) · **Même principe que :** [ADR-013](#adr-013)

**Décision :** Les genres d'artistes deviennent une curation d'Axel dans `users/{uid}/artist_genres/{encodeURIComponent(artist)}` (`artist`, `genre`, `sousgenre`, `source` : `sheet` | `axel`). Au **premier** `refreshCache`, les genres de l'onglet `Artists` y sont recopiés (`source: "sheet"`) et un marqueur `users/{uid}/settings/artist_import` est posé ; ensuite la Sheet n'est plus consultée pour les genres, et une classification posée par Axel n'est jamais écrasée. **Genre effectif** d'un album = celui de l'album s'il est classé, sinon celui de son artiste — partout (trimestres, netteté, territoires, étagères).

**Contexte :** étape 8 du plan v3. Beaucoup d'écoutes n'avaient pas de genre (seuls les albums classés en portaient un), d'où des humeurs et un portrait flous.

**Conséquences :** `curation.js` (`loadArtistGenres`, `artistGenresFromSheet`), `quarters.js` / `selection.js` reçoivent la classification d'artiste ; client : `artists.js` (`window.OrpheeArtists`), carte « Classer un artiste » dans « Moi ». Suggestions par tags Last.fm : avec la clé API (étape 3).

---

## ADR-037 — Récits d'Orphée à la demande, ancrés sur les faits et mis en cache

**Date :** 2026-10-09 · **Statut :** Acceptée (concept validé sur la maquette v3)

**Décision :** Nouvelle Function `narrateQuarter` (`onCall`, auth requise) : pour un trimestre `AAAA-Tn`, elle relit `cache/agg_quarters` côté serveur, construit les **faits** (humeur, bascule, volumes, genres, top albums — jamais la curation ni le chapitre) et demande à Orphée 2-3 phrases avec le **même modèle et le même system prompt** que le Salon (`chat/anthropic.js`, client partagé). Le récit est stocké dans `users/{uid}/narrations/{AAAA-Tn}` avec une **empreinte des faits** : servi depuis ce cache tant que les faits ne changent pas, régénéré sinon.

**Contexte :** vision v3 — deux couches : la base calculée et vérifiable (règles d'humeur), puis Orphée qui raconte **à la demande**, sans pouvoir dire ce que la base ne dit pas.

**Raison :** coût maîtrisé (un appel par trimestre et par changement de faits), voix cohérente, et « pas d'invention » tenu par construction : les faits sont fournis côté serveur (le client ne peut pas les forger), fencés comme données ; la consigne interdit toute interprétation de vie (PRODUIT § 2).

**Conséquences :** `chat/anthropic.js` factorise clé, modèle et client (le Salon l'utilise aussi). Récit = produit de l'Agent (MODELE A5), régénérable, distinct de la curation. Le texte est rendu échappé ; seul `*titre*` devient de l'italique.

---

## ADR-036 — Navigation v3 : Moi · Bibliothèque · Salon

**Date :** 2026-10-09 · **Statut :** Acceptée · **Révise :** [ADR-033](#adr-033) (jeu d'onglets ; la barre persistante bas-mobile / haut-desktop est conservée)

**Décision :** La barre passe à **3 onglets — Moi · Bibliothèque · Le Salon** — et l'app s'ouvre sur **Moi** (vision v3, PM-18). **Réglages** et **Stats** sortent de la barre mais restent des vues : on y entre depuis « Moi » (roue dentée ; « Toutes les statistiques ») et on en revient par un bouton « ← Moi ». Mécanique : attribut `data-goto` + `window.OrpheeNav.activate()`.

**Contexte :** maquette v3 validée par le PM ; étape 2 du plan (ROADMAP). Stats reste accessible pendant la transition, avant que trimestres et humeurs ne la remplacent.

**Conséquences :** `nav.js` (onglets, `data-goto`, `OrpheeNav`), nouveau `moi.js` / `moi.css`. « Moi » **réutilise** l'existant au lieu de le dupliquer : `window.OrpheeStats` (mêmes agrégats, un seul chargement, événement `orphee:stats-reloaded` après refresh) et `window.OrpheeLibrary` (albums + curation LIVE, ADR-031). Le graphe « Écoutes par… » est la section Stats elle-même, réinsérée.

---

## ADR-035 — Orphée : police unique Bricolage Grotesque

**Date :** 2026-10-08 · **Statut :** Acceptée · **S'écarte de :** la typographie commune Odyssée (DM Sans + DM Mono)

**Décision :** Orphée utilise **une seule police, Bricolage Grotesque**, pour les titres **et** les annotations. Fin de la mono « machine à écrire » et des petites capitales espacées : les étiquettes deviennent de petits titres posés en casse normale. Police auto-hébergée (`public/fonts/`, variable graisse + taille optique), chiffres tabulaires pour garder l'alignement qu'offrait la mono.

**Contexte :** Axel trouvait les annotations en DM Mono capitales « à la Claude », génériques. Comparatif sur la maquette v3 (5 polices de titre, puis 5 voix d'annotation) : choix « B partout ».

**Raison :** une police unique, avec du caractère mais lisible, donne plus de personnalité qu'un duo neutre ; cohérent avec la vision v3 (l'app comme miroir personnel).

**Conséquences :** `--font-sans` = Bricolage ; `--font-mono` conservé comme **alias** de `--font-sans` (pas de réécriture de chaque règle) ; `text-transform: uppercase` et leur `letter-spacing` retirés (15 règles). Zagreus et Ariane gardent DM Sans + DM Mono : la suite n'est plus typographiquement uniforme — assumé, l'accent par app existait déjà.

---

## ADR-034 — Synchro Last.fm intégrée ; écoutes sur Cloud Storage

**Date :** 2026-10-08 · **Statut :** Acceptée — **implémentée v2.16.0** (2026-10-10) · **Supersède :** [ADR-003](#adr-003) · **Préserve :** [ADR-005](#adr-005), [ADR-006](#adr-006)

**Décision :**
1. **L'import des écoutes (PM-01) entre dans l'app.** Le bouton « Actualiser » commence par interroger l'API Last.fm (`user.getRecentTracks`, lecture seule, clé API en secret Functions) pour les écoutes postérieures à la dernière connue, puis enchaîne le refresh existant. Toujours **à la demande** (ADR-005), pas de cron.
2. **Les écoutes quittent la Sheet** pour **Cloud Storage**, partitionnées **par année** (seule l'année courante est réécrite à chaque synchro). Bucket fermé aux clients ; seules les Functions lisent/écrivent. La Sheet ne garde que l'onglet `Artists` (référentiel genres saisi par Axel).
3. **Append-only.** Une écoute importée n'est jamais modifiée ni retirée — un scrobble supprimé/édité sur Last.fm après import reste tel quel dans Orphée (faits immuables, IM-1).
4. **Clés recalculées à l'identique** de la Sheet : `album_sur = {artist}-{album}`, `track_sur = {artist}-{album}-{track}`.
5. **Dédoublonnage — doublons techniques uniquement.** Identité d'une écoute = **(`uts`, `track_sur`)** (cf. E1 Écoute : instant + titre joué). Garanties : fenêtre de synchro **figée** `(dernière uts connue, instant du clic]` (pas de dérive de pagination quand une écoute arrive en cours de synchro) ; fusion idempotente sur l'identité ; écriture **tout-ou-rien** (le curseur n'avance que si toute la fenêtre est récupérée). Les « now playing » (sans `uts`) sont ignorés. **Les doubles scrobbles entre deux applis ne sont pas traités** (décision PM : hors sujet).
6. **Migration une fois** : `F_Scrobbles` → Storage. ~~Garde-fou bloquant : la clé recalculée doit égaler la clé de la Sheet sur 100 % de l'historique.~~ **Révisé le 2026-10-10 (décision PM)** : le garde-fou a révélé que la Sheet elle-même fabriquait des clés abîmées (titres convertis en nombres ou en dates par Google Sheets, cellules en erreur). Les clés sont **réparées** depuis le texte affiché — celui qu'envoie Last.fm, donc plus jamais de doublon d'album — et les notes orphelines supprimées, Axel préférant re-noter (« au plus propre »). La migration **mesure** les doublons exacts (identité ci-dessus) hérités des collages successifs d'exports, **sans les retirer** ; leur nettoyage est une décision PM ultérieure sur rapport.

**Contexte :** le pipeline réel était Last.fm → outil web ghan.nl → CSV collé dans l'onglet `Source` → formules `F_Scrobbles` (il n'y a pas de script Python, contrairement à ADR-003). Corvée manuelle : au 2026-10-08, 2 mois d'écoutes manquaient. `refreshCache` relit en outre toute la Sheet (centaines de milliers de lignes, timeout 300 s) — plafond de volume en approche.

**Raison :** même API que l'outil existant → données identiques ; une étape de moins pour Axel ; Storage lève le plafond de volume sans faire de Firestore une base relationnelle (ADR-004 préservé). Écrire dans la Sheet a été écarté : elle cesserait d'être en lecture seule et garderait le plafond.

**Conséquences :** secret `LASTFM_API_KEY` + identifiant Last.fm du propriétaire (stocké dans Firestore, hors repo) ; règles Storage *deny-all* côté clients ; `readSheet.js` ne lit plus que `Artists` ; un nouvel artiste arrive **sans genre** jusqu'à saisie dans `Artists` ; la Sheet est conservée intacte quelques semaines après bascule (repli). L'onglet `Source` et ghan.nl deviennent inutiles.

---

## ADR-033 — Navigation : barre d'onglets persistante (bas mobile / haut desktop)

**Date :** 2026-06-10 · **Statut :** Acceptée · **Révise la position nav d'**[ADR-029](#adr-029)

**Décision :** La navigation passe d'un **menu flottant + popover** (Bibliothèque = accueil spécial, bouton flottant bas-gauche, barre-titre haute avec retour sur les autres vues) à une **barre d'onglets persistante** reprenant le pattern de Zagreus :
- **Mobile** : barre **en bas** (icône + label), pouce-friendly.
- **Desktop (≥900px)** : barre **en haut façon site web** — wordmark « Orphée » + logo à gauche, onglets à droite, **onglet actif en pilule**.
- 4 onglets : **Stats · Bibliothèque · Le Salon · Réglages**. Ouverture sur **Bibliothèque**.
- L'onglet de dialogue avec l'agent est nommé **« Le Salon »** (et non « Orphée ») : sur la barre haute, le wordmark de marque « Orphée » et un onglet « Orphée » se seraient dédoublés ; « Le Salon » lève la collision tout en gardant le registre (lieu où l'on cause de musique).

**Contexte :** ADR-029 (v2.0) avait *conservé* la navigation existante en adaptant la mise en page desktop. Le menu flottant cachait la navigation derrière un geste ; Axel veut une nav **toujours présente** et un Orphée d'un seul tap, sur le modèle éprouvé de Zagreus (cohérence de suite). La fiche album reste une **modale immersive** qui recouvre la barre (option retenue : pas de barre par-dessus l'album).

**Raison :** une barre persistante rend les 4 espaces (dont Orphée) visibles et atteignables en permanence ; le split bas-mobile / haut-desktop suit la convention de chaque plateforme. Réutilise le moteur de bascule de vues existant (`activate()` + événement `orphee:tab`) — seule l'UI de nav change.

**Conséquences :** `nav.js`/`nav.css` réécrits (barre `.tabnav`, `position:fixed`, z-index 40 < scrim detail 48). Suppression du FAB-menu, du popover et de la barre-titre haute des 4 onglets (la fiche album garde sa propre flèche retour). La stat « Gravés dans ta mémoire » et l'identité migrent dans **Réglages**. Le FAB recherche remonte au-dessus de la barre (mobile). Mise en page : `padding` des vues pour dégager la barre, hauteur du chat = `100dvh − barre` (composer au-dessus de la barre). Extraction en composant partagé `odyssee-design` = candidat futur, pas fait ici.

---

## ADR-032 — « Remontée de couche » : déclencheur mécanique, jugement humain

**Date :** 2026-06-10 · **Statut :** Acceptée · **Complète :** [ADR-024](#adr-024) (repo-first) et le gate de cohérence de chaîne ([`CLAUDE.md`](../CLAUDE.md))

**Décision :** Mécaniser **la seule part vérifiable** du gate de cohérence : le cas *montant* où une modif de Spec/Code touche en fait une couche de référence (Produit/Modèle) sans le vouloir — la **« remontée de couche »**. Un hook git `commit-msg` repère la **signature** d'un commit suspect — (1) `firestore.rules` touché (frontière `write:false` = natures de données, IM-1), ou (2) une ligne ajoutée/retirée citant un `IM-x`/`PM-xx` — **sans** modification de `PRODUIT.md`/`MODELE.md` (sinon c'est le cas *descendant* assumé). Quand la signature est là, le hook **exige** un accusé dans le message : `Remontée: non — <raison>` ou `Remontée: soumise`, sinon il **bloque** (contournement : `--no-verify`). Logique pure dans `.githooks/remontee.js`, testée (`functions/test/remontee.test.js`).

**Contexte :** le gate de cohérence ([`CLAUDE.md`](../CLAUDE.md)) mélangeait trois promesses : **A** source-sync (un dérivé colle à sa source — déjà mécanisé par 3 canaris pre-commit, ADR-023/025/026), **B** conformité de couche (une couche basse ne contredit pas une couche haute), **C** pas de divergence en silence. B est **sémantique** : aucune machine ne sait qu'un code « viole IM-7 » ou qu'une Spec « trahit l'intention Produit ». Le sens *descendant* (le PM édite Produit/Modèle en conscience) ne pose pas problème ; le risque réel est *montant* et silencieux.

**Raison :** **forcer la question plutôt qu'auto-juger.** La machine ne tranche pas la remontée (ce serait du faux positif ou du théâtre de conformité) ; elle détecte la signature et **refuse le commit silencieux** — impossible de toucher un `IM-x`/`PM-xx`/`firestore.rules` sans avoir *écrit* qu'on a pesé l'impact référence (trace d'audit dans `git log`). C'est le passage **Rappeler → Bloquer** (hiérarchie Éliminer > Bloquer > Rappeler) appliqué à un garde-fou qui, en prose dans une skill, se serait dissous. **Signaux volontairement étroits** : un déclencheur qui sonne rarement mais qu'on respecte vaut mieux qu'un large qu'on apprend à ignorer.

**Conséquences :** nouveau hook `.githooks/commit-msg` (frère des canaris `pre-commit`) + `.githooks/remontee.js` (pur, testé). Sous-section « Remontée de couche » ajoutée au gate dans `CLAUDE.md`. **Trajectoire** (hors périmètre de cet ADR) : promouvoir la convention par-couche dans la skill suite `odyssee-dev`, et la rendre **installable + auditable** via un futur skill `odyssee-gouvernance` (modes `init` interactif façon grill / `verify` mécanique) bâti sur un **manifeste de gouvernance** à source unique — ce hook en est la première brique de référence.

---

## ADR-031 — Curation lue à sa source (live), jamais depuis une projection cache

**Date :** 2026-06-08 · **Statut :** Acceptée · **Conforme à :** [IM-1, IM-5, IM-6](./MODELE.md#invariants-de-modèle) · [ADR-006](#adr-006)/[ADR-013](#adr-013)

**Décision :** La **Curation** (note, coup de cœur, description, genre/sous-genre)
est lue **LIVE depuis sa source `users/{uid}/grades`** partout où sa valeur
**courante** est rapportée — y compris par **Orphée** (contexte injecté,
`query_albums`, `query_album_detail`). Le cache d'agrégats peut porter une
**projection** de la curation, calculée au refresh, mais elle **ne fait jamais
foi pour le présent**. Point de passage unique : `library.applyCuration` (front)
et `curation-overlay` (back). Les **segmentations/agrégats dérivés** qui croisent
la curation **au moment du refresh** (distribution des notes, appartenance
Oddity, set « non notés ») restent **refresh-gated** — c'est leur nature de
*Dérivé* (IM-6, [ADR-005](#adr-005)) ; ils n'exposent pas une note prise pour
courante.

**Contexte :** bug en prod — Orphée rapportait *Coda* « non noté, sans
description » alors que la fiche l'affichait noté/décrit. Cause : Orphée lisait
la curation depuis le **cache** (projection figée au dernier refresh) au lieu de
la **source**. La fiche, elle, lit `users/{uid}/grades` en direct → d'où le
désalignement. Le PM (Axel) a (justement) exigé la conformité au modèle.

**Raison :** **IM-1** (la Curation est une nature à part, **pas un Dérivé**),
**IM-5** (« aucun dérivé n'est une source »), **IM-6** (« la curation ne se
déduit jamais des écoutes »). L'app fait foi pour les notations
([ADR-006](#adr-006)/[ADR-013](#adr-013)). Lire la curation à sa source, c'est
simplement appliquer le modèle — et aligner Orphée sur la fiche.

**Conséquences :** nouveau module `functions/src/chat/curation-overlay.js`
(`loadCurationMap` + `overlay`/`overlayList`) ; `buildContext(db, uid)` et
`query_albums` superposent la curation live (et filtrent « non notés » par le
live) ; `query_album_detail` lisait déjà la source. Test de non-régression
(`curation-overlay.test.js`).

**Durcissement (fait) — Éliminer la projection lue comme courante.** Les chunks
`agg_library_all_*` ne portent **plus** de curation : `libraryCard()` ne projette
que faits + dérivé (`album_sur, artist, album, listen_count, first_listen_y,
cover_url`) ; le front normalise puis superpose le live (`library.js#loadAll`),
et `query_listens(top_albums)` superpose aussi (dernier chemin Orphée). Plus
aucune copie périssable n'est lue comme « curation courante ».

**Frontière (IM-6 / [ADR-005](#adr-005)).** Les **vues Stats dérivées**
(`agg_top_albums`, `agg_oddities`, `agg_decouvertes`, `agg_personalites`,
distribution des notes…) **conservent** leur curation : ce sont des **snapshots
refresh-gated** où la note est figée au dernier refresh **avec** le reste de la
vue (écoutes, pics…). Les rendre partiellement-live serait incohérent. Ce ne
sont pas des surfaces « curation courante » — Orphée, qui en est une, superpose
le live quand elle les lit (`query_listens`).

---

## ADR-030 — Curation : une erreur reste une erreur (rejets en bulle, pas d'auto-correction) — révise ADR-027

**Date :** 2026-06-08 · **Statut :** Acceptée · **Révise :** [ADR-027](#adr-027) (le volet « auto-correction »)

**Décision :** Une action de curation invalide émise par Orphée n'est **jamais
appliquée** sur la donnée et **jamais « auto-corrigée » par le modèle**. Le
**tour de correction `[SYSTÈME]`** d'ADR-027 est **supprimé**. À la place,
`chatOrphee` renvoie les invalides dans un champ **`rejections`**
(`{type, album_sur, reason}`) ; le client les affiche en **bulle dismissible**
(`.cbubble`), que l'utilisateur ferme une fois comprise. La **réponse d'Orphée
n'est pas altérée**. Le system prompt impose en complément `album_sur = [id:...]`
du contexte dans les tags d'action, pour réduire les rejets à la source.

**Contexte :** en production, l'auto-correction d'ADR-027 **fuyait** : Orphée
**annonçait** la correction (« Correction — … : » suivi d'un tag strippé), et le
tour de correction **remplaçait sa vraie réponse** (une question « top artiste »
ne recevait jamais sa réponse). Au-delà du bug d'affichage, le PM (Axel) ne fait
**pas confiance** au principe : *une erreur qui déclenche une (ré)action du
modèle sur sa donnée n'est pas acceptable* — « une erreur devrait renvoyer une
erreur ».

**Raison :** **une erreur reste une erreur.** Pas d'interprétation du modèle qui
se transforme en écriture ; pas d'échec silencieux non plus. La **transparence**
(rejet visible, dismissible, hors du fil d'Orphée) prime sur la « magie » d'une
auto-réparation. Cela respecte IM-7 (l'agent reste un proxy) et le modèle de
confiance d'Axel.

**Conséquences :** suppression du tour de correction et de `buildRejectionNote`
(`curation-validation.js` conserve `validateActions`/`reasonFor`, dont les
`reason` deviennent **user-facing**) ; `chatOrphee` renvoie `rejections` ;
nouveau composant client `showCurationError` + styles `.cbubble` ; renfort du
prompt (`SKILL.md`). `SPEC.md` § 7.1/§ 7.4 mis à jour. Tests ajustés.

---

## ADR-029 — Mise en page desktop : shell centré à largeur max + élargissements ciblés

**Date :** 2026-06-08 · **Statut :** Acceptée · **Chantier :** v2.0

**Décision :** L'app reste **phone-first**. Sur grand écran, le contenu
(`.view`) est **borné (~1100 px) et centré** ; la navigation en onglets-haut est
**conservée**. Élargissements ciblés au-delà d'un breakpoint desktop : la
**Library** a déjà son layout desktop (rail de genres + grille `auto-fill`) ; le
**feed Stats**, jusque-là plafonné à 680 px, passe à une **colonne éditoriale
large (~900 px) et plus aérée** ; le **Détail** garde son adaptatif
`@container (min-width: 980px)`.

> **Précision (mise en œuvre, vérifiée au rendu).** À l'inspection, le shell
> était **déjà** borné/centré (`.view` 1100, chat 720, cartes Settings 2-col) :
> le seul vrai manque desktop était le feed Stats (680 px, grandes marges
> vides). Un **masonry multi-colonnes** y a été **écarté** : les sections sont un
> récit vertical à hauteurs très variables (graphe Écoutes, Constellation…) où
> un 2-colonnes crée des trous et resserre les visuels. Retenu : **colonne
> unique élargie + aérée** (fidèle au design éditorial), **vérifiée par capture
> headless** (Playwright) en desktop et mobile.

**Contexte :** `#app-screen` est `flex column` **sans largeur max** → il s'étire
pleine largeur sur desktop, alors que le contenu a des contraintes hétérogènes
(Stats plafonné 680 px, Library grille `@768`, Détail `@980`). D'où un rendu
« appli téléphone étirée » peu lisible. Roadmap « Adapter l'UI au desktop ».

**Raison :** Une colonne bornée et centrée respecte le design phone-first et le
kit (frame `wide` 780 px) **sans refondre la navigation** ; l'élargissement
ciblé exploite l'espace là où il a de la valeur (catalogue, stats) sans
réinventer chaque écran. Une refonte multi-panneaux (sidebar verticale,
2-3 colonnes) a été **écartée** comme disproportionnée pour v2.0.

**Conséquences :** largeur max + centrage sur le shell ; breakpoint desktop
documenté (cf. SPEC § Mise en page desktop) ; grilles Library/Stats
multi-colonnes au-delà du breakpoint ; modèle de nav inchangé ; Détail inchangé.

---

## ADR-028 — Stats : aucun visuel sans donnée réelle

**Date :** 2026-06-08 · **Statut :** Acceptée · **Chantier :** v2.0

**Décision :** Tout visuel de l'onglet Stats doit être **branché sur une donnée
réelle** calculée au refresh. Quand la donnée est **calculable** depuis les
faits (scrobbles), on l'agrège côté `refreshCache` (avec **tests par agrégat**,
cf. doctrine de test) ; quand elle **n'est pas dérivable**, le visuel est
**retiré**. **Aucun placeholder** ni légende qui ressemble à du réel. Un
**layout** aléatoire (positions force-directed de la Constellation) est licite ;
une **donnée** aléatoire ne l'est jamais. Un **état vide honnête** conditionnel
(`available:false` de la Capsule / Personnalités) est licite.

**Contexte :** le graphe Écoutes propose 5 granularités
(ans/mois/semaine/jour/heure) dont **4 sont `null`** tout en affichant légende +
phrase d'Orphée descriptive → placeholder trompeur. Roadmap « Fiabiliser
l'onglet Statistiques ». Posture retenue : **richesse** (brancher tout le
calculable) plutôt que retrait par défaut.

**Raison :** la confiance dans l'**introspection** (intention produit,
[ADR-008](#adr-008)) suppose que tout chiffre montré soit vrai. L'axe temporel
est intégralement dérivable des `uts` → on **enrichit** plutôt que d'appauvrir,
sauf donnée non dérivable.

**Conséquences :** nouveaux agrégats temporels (mensuel / hebdomadaire /
horaire…) dans `refreshCache` + tests ; **inventaire visuel-par-visuel** dans
SPEC ; retrait de tout visuel non dérivable ; règle « random = layout
seulement » ; réconciliation de l'axe horaire avec Commuting (une seule source
horaire, pas de doublon).

---

## ADR-027 — Curation via Orphée : builder partagé testable, validation serveur, auto-correction

**Date :** 2026-06-08 · **Statut :** Acceptée · **Chantier :** v2.0 · **Touche :** [IM-7](./MODELE.md#invariants-de-modèle) · **Volet auto-correction révisé par :** [ADR-030](#adr-030)

**Décision :** Trois décisions sur le chemin « Orphée note un album » (PM-07 en
**proxy** d'Axel, IM-7) :

1. **Builder de curation partagé et pur.** La construction du payload de curation
   (action d'Orphée **ou** saisie fiche → mutation Firestore) est extraite dans
   une **fonction pure unique** `public/js/curation.js`, exposée via un **wrapper
   UMD** (global navigateur **et** `require()` côté tests). `detail.js` et
   `chat.js` la **consomment** : fin de la duplication, **première brique
   d'infra de test front** (sans build, [ADR-002](#adr-002)), couverte par
   `node --test`.
2. **Validation serveur.** Dans `chatOrphee`, avant d'émettre les actions :
   **note ∈ [1..5]** et **existence de l'album** via un `get`
   `album_stats/{album_sur}`. `grade` / `flag` / `comment` exigent un album
   existant ; `ungrade` est un no-op toléré.
3. **Auto-correction.** Une action invalide n'est **pas** appliquée
   silencieusement : un **unique** tour de modèle supplémentaire injecte un
   message `[SYSTÈME]` décrivant le rejet ; Orphée **corrige** (souvent
   l'`album_sur`) ou l'**explique** à Axel. **Cap 1 tour** (anti-boucle, hors du
   budget des 5 tool calls) ; au-delà, rejet silencieux + log.

**Contexte :** le payload de curation était bâti **en double** (`detail.js` +
`chat.js`), portant deux fois la ligne `grade_label` fautive (D-2) ; **aucune
validation** (note hors 1-5 passait via `parseInt` ; `album_sur` jamais vérifié
→ curation **orpheline** possible) ; **pas d'infra de test front**. Roadmap
« Vérifier et tester la curation via Orphée ».

**Raison :** une seule copie écrite à la main (cohérent
[ADR-023](#adr-023)/[ADR-025](#adr-025)) ; le **jugement appartient à Axel** et
l'agent agit en **proxy** (IM-7) → une action de proxy invalide doit échouer
**visiblement**, ni écrire du faux ni échouer en silence ; **valider à la
source** (serveur, là où le parsing a lieu, outils en lecture seule) garde le
client bête.

**Conséquences :** nouveau `public/js/curation.js` (UMD) + tests ; `grade_label`
disparaît des writers (cf. [ADR-026](#adr-026)) ; `chatOrphee` gagne la
validation + un tour de feedback capé ; `graded_at` posé au premier grade dans
le chemin chat (aligné sur `detail.js`). Met à jour SPEC § 7.

---

## ADR-026 — Référentiel des notes en source unique générée (révise la cible d'ADR-019)

**Date :** 2026-06-08 · **Statut :** Acceptée · **Chantier :** v2.0 · **Révise la cible technique d'**[ADR-019](#adr-019) · **Réaffirme :** [IM-2/IM-3](./MODELE.md#invariants-de-modèle)

**Décision :** L'échelle de notes 1-5 (valeur, libellé, sens, couleur) vit dans
une **source unique écrite à la main**, d'où sont **générés / dérivés** tous les
consommateurs : `refdata.js` (front) est **généré** depuis elle ; les agrégats
(`aggregates.js`) et le `prompt-builder.js` (back) la **consomment** ; un
**canari pre-commit** bloque toute dérive (même dispositif qu'[ADR-025](#adr-025)).
`grade_label` est un **dérivé** de `grade` : il n'est **plus stocké** dans la
curation `users/{uid}/grades` (les writers cessent de l'écrire ; l'affichage et
les outils le **dérivent**), et ne subsiste que dans le **cache régénérable**,
calculé depuis la source unique (**casse canonique unique**).

**Contexte :** l'échelle était matérialisée **3×** (`refdata.js` Capitales,
`aggregates.js` minuscules, `prompt-builder.js` en dur) + échos (`detail.js`,
`system-prompt.js`), d'où le bug `grade_label` à **deux casses** selon l'outil
(divergences D-1 / D-2). ADR-019 posait la bonne **exigence** (référence unique,
IM-2/IM-3) mais visait une matérialisation « **en base** » Firestore.

**Raison :** pour une donnée **statique**, la **génération + canari** (déjà
éprouvée pour le prompt et les tags) élimine la dérive **sans coût runtime** ni
lecture Firestore, et garde l'outillage uniforme. Une référence « en base »
ajouterait une dépendance runtime pour une donnée qui ne bouge jamais.
`grade_label`, étant dérivable de `grade`, **ne doit pas vivre dans l'overlay**
de curation (anti-IM-5).

**Conséquences :** source unique des notes + étape de génération de `refdata.js`
+ consommation back + canari pre-commit ; les writers (`detail.js`, `chat.js`)
**cessent d'écrire** `grade_label` ; lecteurs / outils **dérivent** ; le cache
conserve `grade_label` (casse canonique). **Résorbe D-1 et D-2.** ADR-019 : sa
**cible technique** est révisée (l'invariant IM-2/IM-3 demeure).

---

## ADR-025 — Tags machine-readable à source unique, dispatch et doc dérivés

**Date :** 2026-06-07 · **Statut :** Acceptée · **Même famille que :** [ADR-023](#adr-023)

**Décision :** La définition des tags d'Orphée (`[GRADE]`, `[FLAG]`, `[COMMENT]`…) vit dans une **source unique** : `functions/src/chat/tags-spec.js` (données pures, un descripteur par tag). En dérivent :
- le **dispatch du parser** (`tags-parser.js` *require* le spec — plus de `switch` codé en dur ; seuls les parseurs de contenu, qui sont de la logique, restent dans le code, dans un registre gardé) ;
- les **3 tables de doc** (`SKILL.md`, `CLAUDE.md`, `SPEC.md`), **générées** par `functions/gen-tags-doc.js` et injectées entre marqueurs `<!-- tags:table:start/end -->`.

**Contexte :** la même définition était recopiée à la main **4 fois** (parser + table prompt dans `SKILL.md` + table `CLAUDE.md` + table `SPEC.md`). Elles avaient **déjà divergé** (libellés d'effet différents ; `SPEC.md` groupait NOTE/PREF/FOCUS/FILTER alors que les autres les listaient). C'est la « duplication restante de la table des tags (×4) » qu'[ADR-023](#adr-023) renvoyait à plus tard.

**Raison :** même principe qu'ADR-023 — **« une seule copie écrite à la main ; tout le reste est généré »** ([IM-2/IM-3](./MODELE.md)), hiérarchie **Éliminer > Bloquer > Rappeler**. Le spec est un module JS (pas du JSON) pour que le parser le *require* directement au runtime, sans étape de build pour le comportement. Seules les **tables markdown** sont des fichiers générés.

**Conséquences :** nouveau `tags-spec.js` + `gen-tags-doc.js` (`--check`). `npm run gen` = `gen-tags-doc` **puis** `gen-prompt` (la table fraîche de `SKILL.md` est ensuite bakée dans le prompt) ; le `predeploy` Firebase passe de `gen-prompt` à `gen`. **Garde-fou mécanique** : le hook `pre-commit` régénère en mémoire et **bloque le commit** si une table a dérivé du spec (le « canari de duplication » de la roadmap, appliqué ici). Au chargement, `tags-parser.js` *throw* si un tag `kind:action` du spec n'a pas de parseur. Divergence sémantique levée : `SPEC.md` liste désormais chaque tag strip sur sa propre ligne. **Règle : ne jamais redéfinir un tag ailleurs — éditer `tags-spec.js` puis `npm run gen`.**

---

## ADR-024 — Gouvernance repo-first : le repo fait foi, PM-gate conservé (supersède ADR-022)

**Date :** 2026-06-07 · **Statut :** Acceptée · **Supersède :** [ADR-022](#adr-022) · **Réaffirme :** [ADR-010](#adr-010)

**Décision :** Le repo Git est la **source de vérité unique** — fonctionnel, conceptuel ET technique.
- **Fonctionnel & conceptuel** → `PRODUIT.md`, `MODELE.md` (font foi).
- **Technique** → `SPEC.md`, code (font foi).
- **Notion = espace de réflexion non-autoritaire** (discovery, brouillon). Une idée qui durcit est *promue* dans le repo. Notion ne fait **jamais** foi ; en cas de divergence, le repo gagne.
- **PM-gate (conservé d'ADR-022)** : tout changement **fonctionnel ou conceptuel** passe par le **PM (Axel) AVANT** édition de `PRODUIT.md`/`MODELE.md`. Aucune redéfinition unilatérale d'un processus, concept, invariant ou périmètre. Le **technique pur** (refactor, perf, bugfix sans impact fonctionnel) n'y est pas soumis.

**Contexte :** ADR-022 posait « Notion fait foi pour le fonctionnel/conceptuel, `PRODUIT/MODELE.md` = reflet ». Mais ce reflet est **écrit à la main** (aucun mécanisme de sync Notion → repo) : c'est une **copie manuelle d'une source autoritaire** — exactement le motif de duplication que la rétro-doc érige en anti-pattern (invariant IM-2/IM-3, « une donnée n'existe qu'une fois ») et qu'[ADR-023](#adr-023) vient d'éliminer pour le system prompt. La gouvernance d'ADR-022 violait donc le principe qu'elle est censée protéger.

**Raison :** Une seule copie écrite à la main. Mettre l'autorité dans le repo supprime la dérive (pas de second exemplaire), garde l'outillage uniforme (versioning, diff, hooks) et conserve la seule pièce d'ADR-022 qui valait de l'or : le **PM-gate**, garde-fou humain contre la dérive fonctionnelle (le « vibe-coding » qui redéfinit le périmètre sans décision). Notion reste un atelier de pensée utile, mais sans autorité — donc rien à synchroniser.

**Conséquences :** Statut d'ADR-022 → « Supersédée par ADR-024 ». Section *Gouvernance* de `CLAUDE.md` réécrite repo-first. Bandeaux de `PRODUIT.md`/`MODELE.md` : « Notion fait foi / reflet » → « ce document fait foi ; Notion = réflexion non-autoritaire ; PM-gate ». Le sens « Notion → repo » disparaît : on édite directement dans le repo (après passage PM pour le fonctionnel).

---

## ADR-023 — System prompt à source unique, généré depuis SKILL.md

**Date :** 2026-06-07 · **Statut :** Acceptée

**Décision :** Le system prompt d'Orphée n'est plus recopié à la main dans `functions/src/chat/system-prompt.js`. `docs/SKILL.md` est la **source de vérité unique** : `functions/gen-prompt.js` en extrait le prompt (de la première section `##` jusqu'à la fin) vers un artefact `functions/src/chat/orphee.skill.md` que `system-prompt.js` se contente de **charger**.

**Contexte :** `system-prompt.js` contenait une copie manuelle de 378 lignes de `SKILL.md`, « synchronisée à la main ». Elle avait déjà divergé en silence : 3 sections de `SKILL.md` (`Contexte dynamique`, `` Commande `/contexte` ``, `Contexte culturel des albums`, ~100 lignes) n'arrivaient jamais au modèle, sans que rien ne bloque ni signale.

**Raison :** Application directe du principe **« une seule copie écrite à la main ; tout le reste est généré »** (même famille que les invariants « une donnée n'existe qu'une fois », cf. [IM-2/IM-3](./MODELE.md)). Hiérarchie de garde-fou **Éliminer > Bloquer > Rappeler** : la recopie n'existant plus, elle ne peut plus diverger. Lecture du `.md` brut (et non génération d'un `.js`) pour éviter d'échapper les backticks et `${}` du markdown.

**Conséquences :** Nouveau `functions/gen-prompt.js` (`buildPrompt`/`generate`, via `npm run gen-prompt`). `system-prompt.js` réduit à un chargeur (~14 lignes) avec repli génération à la volée si l'artefact manque. Artefact `orphee.skill.md` **gitignoré**, régénéré par un `predeploy` Firebase — donc en local *et* en CI. **Règle : ne jamais éditer `system-prompt.js` ni l'artefact — éditer `SKILL.md`.** Le prompt en prod ne change qu'au prochain déploiement (qui restaure les 3 sections). La duplication restante de la table des tags (×4) sera traitée à part (un `tags-spec` unique → parser + prompt + doc générés).

---

## ADR-022 — Gouvernance par couche : Notion = fonctionnel/conceptuel, repo = technique/code

**Date :** 2026-06-07 · **Statut :** **Supersédée par [ADR-024](#adr-024)** · **Affinait :** [ADR-010](#adr-010)

**Décision :** La source de vérité dépend de la couche.
- **Fonctionnel & conceptuel** (intention produit, périmètre, processus métier,
  modèle conceptuel, invariants, vision) → **Notion fait foi** (wiki « Orphée »,
  espace Notion privé).
- **Technique** (spécification d'implémentation `docs/SPEC.md`, code) → **repo Git
  fait foi**.

`docs/PRODUIT.md` et `docs/MODELE.md` sont le **reflet** dans le repo du
fonctionnel/conceptuel défini dans Notion (lecture en contexte de code) — le sens
va **Notion → repo**, jamais l'inverse.

**Règle :** tout changement fonctionnel ou conceptuel passe par le **PM (Axel)
AVANT** toute modification de doc ou de code. Aucune redéfinition unilatérale d'un
processus, concept, invariant ou du périmètre. Le technique pur (refactor, perf,
bugfix sans impact fonctionnel) n'est pas concerné.

**Contexte :** ADR-010 posait « repo = source de vérité, Notion = discovery ». À
l'usage, le fonctionnel/conceptuel se pilote dans Notion (partie hors-code, lue par
le PM) ; le repo porte l'implémentation. La rétro-doc a d'abord mis PRODUIT/MODELE
au repo avec Notion en miroir ; ce sens est inversé pour la couche fonctionnelle.

**Raison :** Séparer l'autorité par couche évite les définitions divergentes et
protège le périmètre : un agent (ou un humain) ne fige pas le « quoi/pourquoi » sans
le PM, mais reste autonome sur le « comment » technique.

**Conséquences :** Section « Gouvernance » en tête de `CLAUDE.md` (lue au démarrage
de session). Bandeaux de renvoi vers Notion en tête de `PRODUIT.md`/`MODELE.md`. Les
pages Notion fonctionnelles (Produit, Modèle) sont la référence ; les pages Notion
techniques (Specs, Skill, Release Notes, ADR) renvoient au repo.

---

## ADR-021 — Orphée est un agent-proxy

**Date :** 2026-06-07 · **Statut :** Acceptée

**Décision :** Orphée est modélisé comme un **acteur-service** qui agit sur la
bibliothèque **au nom d'Axel**, jamais de sa propre initiative. Sa **mémoire**
et ses **instructions de service** sont des concepts distincts de la donnée
utilisateur. Ses outils d'exploration sont en **lecture seule**.

**Contexte :** Axel peut curer lui-même (fiche album) ou demander à Orphée de le
faire. Dans le second cas, Orphée n'est qu'un canal : la curation reste celle
d'Axel.

**Raison :** Le jugement appartient à l'utilisateur. Donner à l'agent une
volonté propre sur la curation casserait la confiance dans la bibliothèque.
Séparer mémoire/instructions de la donnée utilisateur garde le modèle lisible.

**Conséquences :** Invariant **IM-7**. Les actions de curation émises par tags
sont appliquées comme proxy d'Axel. La mémoire de l'agent (notes mémoire,
préférences) est modélisée mais **non implémentée** en v0.1 (divergence D-3).
Les 3 outils du chat sont read-only ([ADR-009](#adr-009)).

---

## ADR-020 — Dérivés (indicateurs, relations, segmentations) ; les vues ne sont que des représentations

**Date :** 2026-06-07 · **Statut :** Acceptée

**Décision :** Le « dérivé » se décline en trois formes : **indicateur** (valeur
calculée à propos d'une entité, ex. rang par écoutes), **relation** (lien entre
entités, ex. Écho), **segmentation** (catégorie assignée en croisant
indicateurs + informations + règles, ex. Oddity). Une **vue** (graphique,
écran) n'est pas un concept de données : c'est une **représentation UI** d'un
concept.

**Contexte :** Le terme « agrégat/vue » mélangeait deux choses : de la donnée
dérivée précalculée (stockée) et des représentations d'écran. La constellation
n'est pas une donnée, c'est une représentation de l'Écho ; une distribution est
une représentation de la curation.

**Raison :** Distinguer la donnée dérivée (régénérable, stockable) de sa
représentation (UI) évite de traiter un graphique comme une source de vérité et
clarifie où vit chaque chose.

**Conséquences :** Invariants **IM-5** et **IM-6**. Oddity est une segmentation
(pas une entité), Écho une relation porteuse de ses propres indicateurs. Les
vues stats sont rangées en couche Produit/UI, hors modèle de données.

---

## ADR-019 — Référentiel unique des notes et des genres

**Date :** 2026-06-07 · **Statut :** Acceptée · **Cible technique révisée par :** [ADR-026](#adr-026) (source générée + canari, plutôt qu'« en base ») ; l'invariant IM-2/IM-3 demeure.

**Décision :** L'échelle de notes 1-5 et les couples (genre, sous-genre) sont
chacun **une seule donnée de référence**. Toute matérialisation (front, back,
prompt) en **dérive**, ne la redéfinit pas. La cible est **une référence
unique en base** ; le détail (front/back) en consomme une copie dérivée.

**Contexte :** L'échelle de notes est aujourd'hui matérialisée **trois fois**
dans le code, en deux casses (`refdata.js` en capitales, `aggregates.js` et
`prompt-builder.js` en minuscules), d'où le bug `grade_label` à deux casses
(divergences D-1, D-2).

**Raison :** Une donnée de référence dupliquée diverge en silence : toute
comparaison de libellé finit par casser. Le concept « note » ne doit exister
qu'une fois (IM-2/IM-3).

**Conséquences :** Invariants **IM-2** et **IM-3**. Convergence à planifier vers
une source unique ; `grade_label` est de toute façon dérivable de `grade` et ne
devrait jamais être stocké en deux casses. Non corrigé dans la passe rétro-doc
(doc-only).

---

## ADR-018 — Modèle conceptuel : natures disjointes et primauté de la source

**Date :** 2026-06-07 · **Statut :** Acceptée

**Décision :** Tout concept de données appartient à **une** nature : *Fait*
(immuable, importé), *Dérivé* (recalculable), *Curation* (éditée par
l'utilisateur), *Référence* (donnée unique), *Agent* (service). L'identité d'un
Album est `album_sur` ; la hiérarchie est Artiste › Album › Track. Aucun dérivé
n'est une source.

**Contexte :** La frontière entre faits importés, curation possédée par
l'utilisateur et données dérivées était implicite. La formaliser donne le socle
de toute la doc (métier → modèle → spec).

**Raison :** Séparer les natures rend explicite qui possède quoi, ce qui est
immuable et ce qui est régénérable. C'est l'expression conceptuelle de la
frontière technique « référence read-only / overlay mutable »
([ADR-004](#adr-004), [ADR-006](#adr-006)).

**Conséquences :** Invariants **IM-1**, **IM-4**, **IM-5**. Techniquement :
`cache/*`, `album_stats/*`, `covers/*` en `write:false` (référence dérivée),
`users/{uid}/*` mutable (curation + espace utilisateur), Sheet en lecture seule
(faits).

---

## ADR-017 — Documentation pilotée par le métier

**Date :** 2026-06-07 · **Statut :** Acceptée

**Décision :** La documentation est organisée en couches, du métier vers la
technique : **Produit & processus** ([`PRODUIT.md`](./PRODUIT.md)) → **modèle
conceptuel** ([`MODELE.md`](./MODELE.md)) → **spécification technique**
([`SPEC.md`](./SPEC.md)) → **décisions** (ce fichier). La spec technique doit
toujours s'inscrire dans le modèle ; les écarts sont consignés dans un journal
des divergences.

**Contexte :** Orphée a été construit en proto, sans specs propres. La
rétro-documentation a d'abord été tentée par la technique, ce qui noyait les
invariants métier dans des détails d'implémentation.

**Raison :** Les invariants stables sont métier (processus, modèle conceptuel),
pas techniques. Mener par le métier rend la doc durable : la technique peut
évoluer tant qu'elle respecte le modèle.

**Conséquences :** Deux nouveaux documents (`PRODUIT.md`, `MODELE.md`),
`SPEC.md` refondu et mappé au modèle, `CLAUDE.md` doté d'une section
« Règles + invariants ». Le repo reste la source de vérité, Notion en miroir
([ADR-010](#adr-010)).

---

## ADR-015 — Pochettes via Deezer, cache dans la collection `covers`

**Date :** 2026-05-31 · **Statut :** Acceptée

**Décision :** Les pochettes d'albums sont résolues côté serveur via l'API publique Deezer (`api.deezer.com/search/album`) et cachées dans une nouvelle collection Firestore `covers/{album_sur}`. On stocke l'**URL** de l'image hébergée par Deezer, jamais le binaire.

**Contexte :** La bibliothèque n'a pas de pochettes ; `covers.js` sait déjà afficher une image si `cover_url` est présent, sinon un rendu génératif. Il manquait uniquement la donnée. Plusieurs sources évaluées : Deezer et iTunes (gratuites, sans clé), Spotify (OAuth + secret), MusicBrainz/Cover Art Archive (exact mais lent et rate-limité). YouTube Music écarté (pas d'API officielle, thumbnails 16:9).

**Raison :** Deezer est gratuit, sans clé API (donc aucun secret à gérer, ADR cohérent avec la sécurité), renvoie des pochettes carrées 1000px (`cover_xl`) et couvre l'essentiel du catalogue. Stocker l'URL plutôt que le PNG évite les coûts de stockage, les questions de copyright sur la rediffusion du binaire, et garde le pipeline simple. Le cache `covers` évite de re-solliciter Deezer à chaque refresh (rate limit ~50 req/5s) : un album résolu (trouvé ou non) n'est jamais re-cherché.

**Conséquences :** Nouvelle collection `covers` (serveur-écrite, `write:false`, lisible par tout user authentifié — même pattern que `cache`/`album_stats`). Nouveau module `functions/src/covers/` (`deezer.js` + `index.js`). `refreshCache` enrichit `libAll[i].cover_url` pour le set gradeable avant l'écriture des chunks, avec un cap de résolutions par run pour rester sous le timeout 300s. Un doc `source:"manual"` n'est jamais écrasé par Deezer → mécanisme d'override pour les albums absents de Deezer (ex. *Chronicle of the Chained*). Mauvais match possible sur homonymes : corrigeable au cas par cas via override manuel.

---

## ADR-014 — Albums dérivés des scrobbles, onglet Albums Sheet supprimé

**Date :** 2026-05-30 · **Statut :** Acceptée

**Décision :** L'onglet `Albums` de la Google Sheet n'est plus lu lors du refresh. Les albums sont désormais dérivés directement des clés `album_sur` uniques de `F_Scrobbles`.

**Contexte :** L'onglet Albums était une liste tenue à la main (~120 entrées) ; il ne reflétait qu'une fraction des ~9 500 albums présents dans les scrobbles et dérivait structurellement. Le genre et la note étaient saisis manuellement dans la Sheet, mais depuis ADR-013 la curation est gérée dans l'app (Firestore `users/{uid}/grades/`). La Sheet n'apportait plus que `artist`, `album` et `First_listen_y` — des données extractibles des scrobbles.

**Raison :** La bibliothèque devient exhaustive : chaque album écouté est présent. `first_listen_y` est désormais calculé depuis le `uts` minimal des scrobbles de l'album. `artist` et `album` sont pris du premier scrobble rencontré. La curation (note, genre, coup de cœur) reste dans Firestore. Le seed one-shot `import_v0` (ADR-013) a déjà migré les données existantes.

**Conséquences :** `readSheet.js` ne lit plus que `F_Scrobbles` + `Artists`. `buildLibrary` prend `(scrobbles, curationByKey)` au lieu de `(scrobbles, albumsEnriched)`. `mergeCuration`, `seedCurationFromSheet`, `importIfNeeded` sont supprimés. `loadCuration` ne prend plus de paramètre `albums`.

---

## ADR-001 — Nom du projet : Orphée

**Date :** 2026-05-22 · **Statut :** Acceptée

**Décision :** Le curateur musical s'appelle Orphée.

**Contexte :** Cohérence triptyque Zagreus / Ariane / Orphée — toutes figures de la mythologie grecque. Réfs Hades pour Zagreus et Orphée (jeu Hades II).

**Raison :** Orphée est le musicien légendaire grec — référence évidente, sonorité élégante, lien thématique fort.

---

## ADR-002 — JS vanilla, cohérence Zagreus/Ariane

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Frontend vanilla, pas de framework.

**Raison :** Cohérence avec Zagreus et Ariane, pas de build step, déploiement direct Firebase Hosting.

---

## ADR-003 — Google Sheets reste source de vérité

**Date :** 2026-05-23 · **Statut :** Supersédée par [ADR-034](#adr-034)

**Décision :** Garder le pipeline existant Python → CSV → Google Sheets. L'app Orphée lit la Sheet, ne la remplace pas.

**Contexte :** Pipeline existant fonctionne. Last.fm → Python → CSV → Sheets en place depuis longtemps.

**Raison :** Ne pas casser ce qui marche. La Sheet est un format universel, manipulable par d'autres outils. Migration possible plus tard.

**Conséquences :** L'app doit gérer la lecture Sheets API (latence) → cache Firestore intermédiaire.

---

## ADR-004 — Firestore en cache, pas en base relationnelle

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Firestore stocke uniquement des agrégats pré-calculés (cache) et de la user data clé-valeur. Aucun stockage relationnel vivant.

**Contexte :** Firestore est orienté documents et mal adapté au relationnel. Or les données musicales sont fortement relationnelles (écoutes ↔ tracks ↔ albums ↔ artistes).

**Raison :** En stockant des agrégats déjà joinés au moment du refresh, on évite tout besoin de jointure côté lecture. Firestore reste adapté pour ce pattern de lecture seule sur documents autonomes.

**Conséquences :** Le travail relationnel se fait côté Firebase Function en JS, à chaque refresh. Pas de pénalité au runtime de l'app.

---

## ADR-005 — Refresh manuel, pas automatique

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** L'utilisateur déclenche le refresh via un bouton. Pas de cron ni de polling.

**Contexte :** La Sheet est mise à jour manuellement par Axel (via le pipeline Python qu'il lance lui-même). Aucune raison de refresh sans qu'il y ait eu de modif.

**Raison :** Économie de coût Sheets API, contrôle utilisateur, simplicité d'implémentation.

**Conséquences :** Indicateur de fraîcheur visible dans l'app. Si > 7 jours, suggestion discrète de refresh.

---

## ADR-006 — Pas d'écriture retour vers Sheets

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Les notations faites dans l'app Orphée restent dans Firestore. Pas de synchronisation vers Sheets.

**Contexte :** Axel abandonne Looker au profit de l'app Orphée. La Sheet n'a plus besoin de contenir les notations à jour.

**Raison :** Simplicité. Évite les conflits d'écriture, les pertes de données, la latence.

**Conséquences :** L'app Orphée devient la **référence absolue** pour les notations. Au premier refresh, les notes existantes dans la colonne `album_grade` sont importées comme valeurs initiales puis Firestore fait foi.

---

## ADR-007 — Personnalité Orphée intégrée dans la skill

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Orphée n'est pas un assistant générique mais un personnage défini (savant musical introverti, élégant, sans jugement sur les goûts).

**Contexte :** Cohérence avec Zagreus et Ariane (skills à personnalité forte).

**Raison :** Une personnalité claire améliore l'expérience et la qualité des interactions. Skill stricte (anti-exemples explicites) pour maintenir la cohérence.

**Conséquences :** Maintenance régulière du ton à monitorer au fil des évolutions.

---

## ADR-008 — Pas d'algorithme de recommandation

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Orphée n'a pas de fonction "albums similaires à Spotify". Le périmètre est sa bibliothèque existante.

**Contexte :** Risque de transformer Orphée en énième moteur de reco musicale.

**Raison :** Le pain point d'Axel est de **comprendre sa bibliothèque actuelle**, pas d'en découvrir d'autre. Les recommandations existent partout (Spotify, Last.fm…), pas besoin de réinventer. La valeur d'Orphée est dans l'introspection.

**Conséquences :** Hors périmètre v1.0. Pourra être réintroduit si Axel le demande explicitement plus tard, mais avec une approche différente (par exemple "qu'est-ce que tu écoutes en ce moment de similaire à X que je connais déjà ?").

---

## ADR-009 — Architecture par tools pour les queries complexes

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Orphée ne reçoit pas toute la bibliothèque à chaque appel. Elle reçoit des agrégats fixes, du contexte ciblé selon la commande, et peut appeler des tools pour fouiller.

**Contexte :** Plusieurs centaines de milliers d'écoutes, impossible à injecter à chaque message.

**Raison :** Pattern moderne des agents IA. Coût maîtrisé, précision préservée, évolutif.

**Conséquences :** Function `chatOrphee` doit gérer la boucle multi-turn avec tools. Limite garde-fou : 5 tool calls par message.

---

## ADR-010 — Notion en parallèle, repo Git comme source de vérité

**Date :** 2026-05-23 · **Statut :** Acceptée · **Réaffirmé par :** [ADR-024](#adr-024) (ADR-022, qui l'avait infléchi vers Notion, est supersédé)

**Décision :** Notion pour discovery et brainstorming. Repo Git contient la doc technique finalisée et le code.

**Contexte :** Cohérence avec Zagreus et Ariane.

**Raison :** Claude Code lit le repo. Une seule source de vérité par couche.

**Conséquences :** Discipline à maintenir : propager au repo via PR quand spec change dans Notion.

---

## ADR-011 — Contexte culturel via recherche web avec confirmation

**Date :** 2026-05-23 · **Statut :** Acceptée

**Décision :** Orphée peut fouiller le web pour raconter l'histoire d'un album, le contexte créatif et la réception, via un tool dédié `web_research_album`. Confirmation obligatoire avant chaque recherche.

**Contexte :** Axel veut découvrir le processus créatif, l'état d'esprit du groupe, l'avis du public au moment de la sortie d'un album. Cette info n'est pas dans la Sheet — il faut aller en ligne.

**Raison :** Combinaison de connaissance interne de Claude (pour les classiques) + recherche web (pour les détails précis et les albums obscurs). Confirmation utilisateur car la recherche web a un coût (~0,05-0,20 € par session) et un délai. Donne aussi le contrôle à Axel.

**Conséquences :** 
- Nouveau tool `web_research_album` côté Function
- Skill Orphée doit imposer "proposer puis confirmer avant d'appeler"
- Si usage intensif, cache léger possible dans `cache/album_research/{album_sur}` avec TTL ~6 mois (l'histoire d'un album ne change pas)

---

## ADR-012 — Index bibliothèque chunké, distinct des docs détail par album

**Date :** 2026-05-25 · **Statut :** Acceptée

**Décision :** La vue bibliothèque s'appuie sur deux agrégats légers écrits par `refreshCache`, séparés des docs riches `agg_albums_with_stats/{album_sur}` (étape 8, vue détail) :
- `cache/agg_library_curated` — doc unique : albums notés + `personal_fav`, triés (favoris, note desc, écoutes desc). Vue par défaut.
- `cache/agg_library_all_meta` + `cache/agg_library_all_{i}` — liste complète chunkée par 1000, triée par écoutes desc. Chargée à la demande (bascule « Tous les albums »).

Champs carte : `album_sur, artist, album, listen_count, grade, grade_label, personal_fav, genre, sousgenre, first_listen_y`.

**Contexte :** Le référentiel compte ~9 545 albums (pas ~120 comme estimé initialement). Un doc Firestore unique dépasse alors la limite de 1 MiB. Le choix produit (étape 3) est « notés/favoris par défaut, le reste sur bascule ».

**Raison :** Le set curé (~339 albums) tient dans un doc → chargement par défaut en 1 lecture rapide. La liste complète n'est lue (≈10 lectures) que si l'utilisateur le demande. Tout en mémoire client → recherche et filtres de l'étape 4 deviennent du pur JS, sans index Firestore. Les docs détail riches (étape 8) restent une collection séparée car ils portent l'Écho, les stats mensuelles, etc., inutiles au browse.

**Conséquences :**
- `refreshCache` écrit ~15 docs par refresh (1 batch).
- Chunks obsolètes possibles si le nombre d'albums baisse : le frontend ne lit que `chunk_count` de `agg_library_all_meta`, les surplus sont ignorés (pas de nettoyage en v0.1).
- Albums sans titre (`album` vide, ex. scrobbles podcast `Artist-`) exclus de la bibliothèque.

---

## ADR-013 — Curation possédée par l'app (Firestore) ; Sheet = ingestion seule

**Date :** 2026-05-25 · **Statut :** Acceptée

**Décision :** Séparer nettement deux natures de données :
- **Donnée importée / dérivée** (écoutes, identité des albums, première écoute) : produite par le pipeline Last.fm → Python → Sheet. Le Sheet reste une source d'**ingestion** lue par `refreshCache`. Remplaçable à terme par une ingestion Last.fm directe (roadmap v0.2) → le Sheet devient optionnel.
- **Curation d'Axel** (note, genre, sous-genre, coup de cœur, commentaire) : **possédée par l'app**, stockée dans Firestore, éditée **depuis l'app**. Le référentiel genres + sous-genres est une **config de l'app** (constante `GENRES` côté front aujourd'hui ; doc Firestore éditable plus tard).

**Contexte :** Le filtre genre de l'étape 4 a révélé le problème : la classification vivait à moitié dans un onglet de tableur (lecture fragile de la ligne 16 de « Paramètres », repli `MB_Genre` qui masquait les trous, échelle de notes ambiguë). On ne lit pas le goût de quelqu'un depuis une sortie de pipeline.

**Raison :** Classer/noter est le cœur éditable de l'app — ça doit s'y faire, pas dans un tableur. Sépare les responsabilités (ingestion lourde vs domaine éditable), supprime le couplage fragile au Sheet, et trace la voie vers un Orphée sans Sheet.

**Conséquences :**
- Suppression de la lecture de l'onglet « Paramètres » (`buildGenres`, `agg_genres`, range ligne 16).
- Référentiel `GENRES` (genres + sous-genres) figé en config app, calqué sur le gsheet.
- `MD_album_genre`/`MD_album_sousgenre` restent lus à l'ingestion comme **valeurs initiales** (seed), normalisées (`N/A`/vide → non classé) ; à terme la curation passe par l'app.
- **Classer un album = action in-app**, à construire avec la notation (épisode curation, étape 6). Jusque-là le filtre genre fonctionne sur le seed et « Non classé » sert de levier.
- Met à jour le cadre des étapes 6 (notation + classification) et v0.2 (ingestion Last.fm directe).

---

## ADR-016 — Endpoint public de redirection vers l'app YouTube Music

> Anciennement numéroté ADR-014 (collision avec « Albums dérivés des
> scrobbles »). Renuméroté en ADR-016 lors de la passe de rétro-documentation
> du 2026-06-07.

**Date :** 2026-06-01 · **Statut :** Acceptée

**Décision :** Ajouter une Firebase Function HTTP publique `ytmusicLink` (europe-west1), exposée via un rewrite hosting `/yt`, qui répond `302 Location: intent://…` vers l'app YouTube Music. Elle déroge à la règle « auth sur toutes les Functions ».

**Contexte :** Depuis une PWA installée (WebAPK, standalone), aucun moyen client ne lance l'app native : un lien https reste dans le webview, un `intent://` client donne `ERR_UNKNOWN_URL_SCHEME`, et un Custom Tab (`_blank`) supprime le handoff App Link. Le seul relais fiable documenté est un **302 serveur vers `intent://`**, que Chrome dispatche vers l'app.

**Raison :** L'auth Firebase est impossible sur une navigation top-level du navigateur (pas d'ID token transportable sans le fuiter en URL). L'exception est sûre car l'endpoint **ne lit ni n'écrit aucune donnée** : il émet une redirection déterministe vers une destination **figée** (host + scheme + package codés en dur), seul le paramètre `q` variant, sanitisé (chars de contrôle retirés, longueur plafonnée, percent-encodé). Aucun open-redirect, aucune injection d'en-tête, aucune surface d'abus exploitable.

**Conséquences :**
- GET uniquement, `Cache-Control: no-store`, pas de log du `q`.
- Le bouton « Écouter » pointe sur `/yt?q=…` (navigation top-level) sur Android ; desktop garde le lien web en `_blank`.
- Repli `S.browser_fallback_url` : si l'app est absente, l'intent ouvre la page web.
