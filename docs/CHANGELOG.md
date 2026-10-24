# Changelog — Orphée

Toutes les versions livrées.

Format :
- **Ce qui change pour Axel** : orienté usage
- **Sous le capot** : changements d'architecture
- **Connu / à venir** : optionnel

---

## v2.50.0 — 2026-10-29

### Ce qui change pour Axel
- **Aperçu public `/preview`** : une page vitrine en cadre mobile (forcé même
  sur PC) qui fait défiler des écrans réels de l'app sur données de
  démonstration, sans backend ni donnée réelle. Pensée pour partager le projet.
- **README** réécrit en porte d'entrée publique : le produit *et* la méthode
  (gouvernance par couches, skills, hooks).

### Sous le capot
- `public/preview/` : page autonome (cadre téléphone, navigation tap/flèches/
  points) + captures WebP générées via le mode local (émulateurs + données
  fictives). Pochettes génériques (fallback de l'app), mention des droits dans
  la page.
- `tools/dev/seed.js` : nom de démo neutre, 10 CD de démonstration aux notes
  imposées variées (le bac « Mes CD » montre des exemples au lieu d'un vide).
- **Nettoyage avant passage public** : pseudo Last.fm réel et URL Notion privée
  retirés des docs (aucun secret n'a jamais été dans le dépôt).

---

## v2.49.1 — 2026-10-18

### Ce qui change pour Axel
- « Tes mondes » : les archipels d'un même genre se regroupent (le rap d'un
  côté, le rock de l'autre, au lieu d'être entremêlés), et les îles sont plus
  espacées pour que les noms ne chevauchent plus les cercles voisins.

### Sous le capot
- worldmap.js `layout` : attraction douce de chaque île vers le centroïde de
  son genre dominant ; marge de répulsion et d'anti-chevauchement portée à +40
  pour réserver la place des étiquettes. Réglage de disposition seul, aucune
  donnée ni agrégat modifié.

---

## v2.49.0 — 2026-10-17

### Ce qui change pour Axel
- **Fiche album › Écoutes dans le temps** : la courbe mensuelle devient des **barres par année**, comme sur la fiche artiste — on lit d'un coup les années où l'album a tourné (une année creuse = barre vide). Note « pic en <année> · N sur X ans ».

### Sous le capot
- `detail.js renderChart` agrège le `monthly_distribution` existant en années (repli sur `.ar-curve`, le même rendu que la fiche artiste). Client seul, aucun agrégat serveur ajouté.

---

## v2.48.2 — 2026-10-16

### Ce qui change pour Axel
- **« Tes mondes »** : les portraits **remplissent** maintenant la bulle (ils s'affichaient en bas, les initiales restant par-dessus).

### Sous le capot
- `.wm-face img` en `position:absolute; inset:0` : sans ça, la grille plaçait la photo en 2ᵉ ligne sous les initiales au lieu de les recouvrir.

---

## v2.48.1 — 2026-10-16

### Ce qui change pour Axel
- **« Tes mondes »** : les nœuds affichent maintenant le **portrait** de l'artiste (photo Deezer, sinon initiales), et les **noms sont nets au zoom** (ils étaient flous).

### Sous le capot
- Les membres (bulles + photos + noms) passent dans un **calque à l'échelle de l'écran**, positionné en JS, au lieu d'être mis à l'échelle en bitmap par le `transform` du zoom (source du flou). Photos via `agg_artist_images`, repli initiales si 404.

---

## v2.48.0 — 2026-10-16

### Ce qui change pour Axel
- **« Tes mondes »** remplace la constellation « Souvent avec » : depuis une fiche artiste, **« Explorer »** ouvre un **archipel** des groupes d'artistes que tu enchaînes ensemble (des **mondes**, pas des genres — un monde peut mélanger Rap et Rock). Chaque monde une **île** (taille = écoutes) ; la **distance** entre îles dit combien tu bascules de l'une à l'autre ; la **couleur** = le genre dominant.
- **Pince pour zoomer** : dézoomé tu vois tes mondes, tu zoomes dans l'un et les **noms d'artistes** apparaissent. L'archipel s'ouvre **centré sur le monde de l'artiste** d'où tu viens. **Touche un monde** pour la liste de ses membres.
- L'invité y a droit (lecture seule).

### Sous le capot
- Nouvel agrégat `cache/agg_clusters` (`buildClusters` + `louvain`, purs + testés) : détection de communautés **déterministe** sur la co-écoute (100 plus écoutés, liens ≥ 20 séances, résolution 1,5), recalculée à l'actualisation, **sans genre** (coloré/nommé live, ADR-031). Clustering serveur, **mise en page + zoom côté client** (`worldmap.js`).
- Retrait de la vue égocentrée (`constellation.js`/`.css`, `agg_proximity`, `buildProximity`). Dérivé « Monde d'écoute » (IM-1/IM-6), jamais une source (IM-5), lu par l'invité (IM-8). `firestore.rules` inchangé.
- Décision [ADR-052](ADR.md#adr-052) (supersède [ADR-051](ADR.md#adr-051)), [PM-40](PRODUIT.md).

---

## v2.47.0 — 2026-10-16

### Ce qui change pour Axel
- **Constellation « Souvent avec »** : depuis une fiche artiste, un bouton **« Explorer »** ouvre une carte plein écran de tes artistes enchaînés. L'artiste au centre, ses voisins autour ; la **taille** d'une boule = ses **écoutes**, l'**épaisseur** d'un lien = combien tu enchaînes les deux, la **couleur** = le genre (les ponts entre genres sautent aux yeux). **Touche un voisin** : il glisse au centre et tu marches de proche en proche ; la boule d'où tu viens repart du côté d'où tu viens, **← Retour** remonte tes pas.
- L'invité y a droit comme toi (lecture seule).

### Sous le capot
- Nouvel agrégat `cache/agg_proximity` (`buildProximity`, pur + testé) : voisins de co-écoute des artistes présents (≥ 50 écoutes), top 8, ≥ 10 séances — recalculé à l'actualisation, sans genre (coloré live, ADR-031). `firestore.rules` inchangé (déjà couvert par `cache/*`).
- Client `constellation.js` : vue égocentrée à forces (ressort pondéré, répulsion), continuité par **pivot** au changement de centre. Dérivé pur, jamais une source (IM-1, IM-5) ; lu par l'invité (IM-8).
- Décision [ADR-051](ADR.md#adr-051), [PM-40](PRODUIT.md).

---

## v2.46.3 — 2026-10-15

### Ce qui change pour Axel
- **Ces jours-ci** : la frise des 30 jours prend toute la **largeur** du bloc et **monte en hauteur**, barres franches — une petite silhouette de ville. « cette semaine » sous le bord droit.
- Un peu de couleur : la **semaine en cours** (barres + libellé) passe au **vert**, les badges **« ×N habitude »** à l'**or**, et l'**album qui tourne** montre sa **pochette** (à droite) — ses écoutes passent sous la phrase pour lui laisser la place.

### Sous le capot
- `daysSpark` : `preserveAspectRatio="none"` (remplit la largeur au lieu de centrer), hauteur 76 px, repère en HTML ; barres « now » en `--accent`. Badge en `--accent-2`, pochette via `cover()`/`renderCover`.

## v2.46.2 — 2026-10-15

### Ce qui change pour Axel
- **Ces jours-ci**, passe d'habillage : **plus de carte** (le bloc coule comme les autres sections), **le genre à sa couleur** (Rock rose, Rap doré, Electro turquoise…) et le reste en neutre — fini le tout-vert. Chaque artiste du moment a son **portrait** (photo). Et la frise des 30 jours est **groupée par semaine** (petit espace entre chaque, la semaine en cours plus claire avec son repère) pour se repérer d'un coup d'œil.

### Sous le capot
- `moi.js`/`moi.css` : `buildDaysBlock` décartonné, mot du genre coloré via `ORPHEE_GENRE_COLORS`, avatars via `face()` (→ fiche artiste), `daysSpark` regroupée par semaine. Aucun changement serveur.

## v2.46.1 — 2026-10-15

### Ce qui change pour Axel
- **Ces jours-ci** nomme ta phase par le genre que tu écoutes **le plus** en ce moment (ex. *Rock*), au lieu du genre le plus *sur-représenté* — un genre rare comme *Classical* sortait en tête juste parce que tu n'en écoutes presque jamais d'habitude. Les artistes, eux, étaient déjà par volume.
- **Tes écoutes par…** : l'album du créneau retrouve sa **vraie pochette** (il la calculait avant que les pochettes soient résolues → un dessin de secours s'affichait).

### Sous le capot
- `buildDays` : genre dominant par **volume** (ADR-050 précisé). `handler.js` : `buildStats` déplacé **après** `enrichCovers` (cover_url des `top` par année/mois/jour).

## v2.46.0 — 2026-10-15

### Ce qui change pour Axel
- **Moi › Tes écoutes par… › Journée** refondue : plus de total ni de pastilles de moments. Une phrase (« Ta journée a deux pics : **le matin** et **le soir** »), les **deux pics surlignés** au vert clair sur le graphe horaire, et sous le graphe la **signature de chaque créneau** — les **genres et artistes** que tu écoutes *plus à ce moment qu'au reste de la journée* (Matin · Soir · Nuit). L'« album du créneau » et « Ma journée » cèdent la place.
- Effet au prochain « Actualiser ».

### Sous le capot
- `buildCommuting` reçoit `artistGenres` et produit `signatures` par créneau (genres + artistes par sur-représentation + plancher de volume, ADR-050) ; test dédié. `stats.js` propage `signatures`, `stats-charts.js` refond l'onglet Journée (pics surlignés, phrase, signatures ; plus de chips ni d'album-du-créneau ; héros masqué).

## v2.45.0 — 2026-10-15

### Ce qui change pour Axel
- **Moi › « Ces jours-ci »** : une nouvelle accroche **tout en haut de Moi**, avant les focales. Tes **30 derniers jours** d'écoutes, promus en première chose qu'on voit : une phrase (« Une phase *Electro* — *Ólafur Arnalds* en boucle »), le volume, un mini-graphe des jours, tes **artistes du moment** avec un badge **« ×N habitude »** (ce que tu écoutes bien plus que d'ordinaire), et l'**album qui tourne**. L'invité le voit aussi.
- Effet au prochain « Actualiser ».

### Sous le capot
- Nouvel agrégat `cache/agg_days` (`buildDays`, PM-39, ADR-050) : fenêtre 30 j relative à la dernière écoute ; artistes du moment par volume + sur-représentation (`lift`), genre et album par sur-représentation + plancher de volume. Lu dans `stats.js` (`data.days`) et rendu par `moi.js` (`buildDaysBlock`). Tests `buildDays`.

## v2.44.5 — 2026-10-14

### Ce qui change pour Axel
- **Moi › Tes écoutes par…** : le tap sur une barre fonctionne enfin sur **Ans, Mois et Semaine** (plus seulement Journée). Le correctif précédent ne tenait pas : au vrai tap, le survol redessinait le graphe et le clic partait sur une barre déjà détachée. Le survol (et son infobulle, redondante avec la carte) est retiré — plus net, et ça marche partout.

### Sous le capot
- `stats-charts.js` : suppression du redessin au survol (`mouseenter`/`mouseleave`, infobulle) ; sélection par simple délégation, barres jamais détachées.

## v2.44.4 — 2026-10-14

### Ce qui change pour Axel
- **Moi › Tes écoutes par…** : correction — au **tap** sur une barre, l'album du créneau ne changeait pas (toujours l'album du pic). Le survol redessinait le graphe et « avalait » le tap. Toucher une barre ouvre maintenant bien l'album de cette période.

### Sous le capot
- `stats-charts.js` : sélection par **délégation** sur le conteneur stable (survit au redessin de survol).

## v2.44.3 — 2026-10-14

### Ce qui change pour Axel
- **Moi › Tes écoutes par…** : sous le graphe, **l'album du créneau** — touche une barre (Par année, Par mois, Semaine) et Orphée te montre l'album qui a marqué cette période, à ouvrir d'un geste. L'onglet **Journée** garde ses moments (« Ma journée »). Dernière étape de la refonte de « Moi ».
- Effet au prochain « Actualiser ».

### Sous le capot
- `agg_stats` : album typique (score n²/total) par année, mois et jour de semaine.

## v2.44.2 — 2026-10-14

### Ce qui change pour Axel
- **Moi › Ce que tes notes racontent** : *Ce que tu adores*, *Tes paradoxes* et *Un seul titre* sont regroupés en un seul chapitre. L'accent de note vit dans le mot-titre — **adores** en or, **paradoxes** en bleu — et n'est plus répété sur chaque paradoxe (juste les écoutes). Refonte de « Moi » (3/4).

## v2.44.1 — 2026-10-14

### Ce qui change pour Axel
- **Moi › Qui tu es** : chaque genre dominant devient une **carte teintée de sa couleur**, avec les visages de ses 3 artistes phares et leurs noms. Le pourcentage n'est plus répété sur la carte (il reste dans la barre). Refonte de « Moi » (2/4).

## v2.44.0 — 2026-10-14

### Ce qui change pour Axel
- **« Moi » parle à la 2ᵉ personne partout** (Orphée s'adresse à toi) : **Qui tu es**, **Tes années**, **Ce que tu adores**, **Tes paradoxes**, **Tes écoutes par…**. Première étape d'une refonte de « Moi » (PM-18).

## v2.43.4 — 2026-10-14

### Sous le capot
- **Durcissement** : en-têtes de sécurité HTTP (anti-clickjacking `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) et une CSP complète en `Report-Only` à valider avant de la rendre bloquante. Dépendances des Functions mises à jour (`npm audit` : 2 critiques et 3 hautes éliminées).

## v2.43.3 — 2026-10-14

### Ce qui change pour Axel
- **Bibliothèque** : la bascule **Albums | Artistes** et la loupe descendent en bas à gauche, sous le pouce, dans la même pilule que les tris ; l'onglet choisi est en vert. La liste gagne une ligne en haut.

## v2.43.2 — 2026-10-14

### Ce qui change pour Axel
- **Fiche album** : le halo à la couleur de ta note s'allume en fondu une fois la fiche posée, au lieu de clignoter pendant l'ouverture.
- **Bibliothèque** : la galette des albums en CD est plus grande et dépasse davantage ; les titres de toutes les tranches se décalent un peu pour lui faire place.

## v2.43.1 — 2026-10-14

### Ce qui change pour Axel
- **Fiche album** : ajouter ou retirer un CD (ou mettre de côté) ne fait plus clignoter « Écouter sur YT Music », la pastille et ta note.

### Sous le capot
- La Bibliothèque ne se reconstruit plus sous une fiche album ouverte : les galettes suivent sur place, les bacs se recomposent à la fermeture de la fiche.

## v2.43.0 — 2026-10-14

### Ce qui change pour Axel
- **Mes CD.** Dans la fiche album, touche la **pochette** (ou la pastille **« Dans tes CD »**) : le disque sort, l'album est dans tes CD ; retouche pour le retirer, avec « Annuler ». Le disque ne sort plus qu'à l'ouverture d'un album que tu as en CD ; pour les autres, la pochette seule et la pastille grisée.
- **Bibliothèque** : une petite galette dépasse de la vignette des albums en CD ; un bac **« Mes CD »** tout à gauche (la Bibliothèque s'ouvre toujours sur Adorés).
- **Trier mes CD** : le picto galette, à droite du sélecteur de tri. Parcours un bac et touche chaque album que tu as en CD (une coche apparaît, la fiche ne s'ouvre pas) ; « Terminé » quand c'est fini.
- Un invité voit tes CD, sans pouvoir les changer.

### Sous le capot
- Curation E12 `users/{uid}/cds/{album_sur}` (`cds.js`, lecture en direct) ; règle Firestore : lecture invité. Aucun dérivé ne la lit.

## v2.42.1 — 2026-10-14

### Ce qui change pour Axel
- **Bibliothèque › Albums** : rangée **par note** par défaut (si tu avais choisi un autre tri, il reste mémorisé).
- **Bibliothèque › Artistes** : chaque récit et « Par genre » montrent 3, 6 ou 9 visages — des rangées pleines. Les **Découvertes** n'ont plus de courbe : deux barres ne disaient rien.

## v2.42.0 — 2026-10-14

### Ce qui change pour Axel
- **Ta musique** : dans Réglages › Compte, **« Ton nom d'artiste »**. Une fois renseigné, au prochain « Actualiser », la vue Artistes s'ouvre sur **La BO de ta campagne** : ton visage, tes écoutes, ta courbe, et tes 5 titres les plus écoutés (chacun s'ouvre sur YouTube Music). Tu sors des récits et de « Par genre ».
- **Récits à 9** : chaque récit (piliers, découvertes…) compte au plus 9 artistes, une grille 3 × 3 une fois déplié.

### Sous le capot
- `buildArtists(scrobbles, artistName)` : `mine` (titres les plus écoutés), testé ; nom lu dans `settings/profile.artist_name`.

## v2.41.0 — 2026-10-14

### Ce qui change pour Axel
- **Fiche artiste** : sous l'en-tête, la **courbe de ses années**. Après « À part », **Souvent avec** : les artistes que tu enchaînes avec lui dans une même séance ; en toucher un ouvre sa fiche, et **retour** te ramène à l'artiste d'avant.
- **Bibliothèque › Artistes** : « Par genre » remonte juste sous tes piliers et montre ses 9 artistes d'un coup, sans dépliage. « Voir les N » a le même bouton que dans « Moi » (le nombre en couleur, chevron).
- Effet au prochain « Actualiser » si la vue Artistes n'a pas encore été calculée.

### Sous le capot
- `nav.js` : chaque couche connaît sa profondeur ; un retour ferme toutes les couches au-delà (sauts d'artiste en artiste empilés).

## v2.40.0 — 2026-10-14

### Ce qui change pour Axel
- **Bibliothèque › Artistes** : en haut, la bascule **Albums | Artistes**. Les artistes ne sont pas une liste alphabétique mais des récits — **tes piliers**, **découvertes**, **retrouvailles**, **fulgurances**, **perdus de vue** — avec, sous chaque visage, la courbe de ses années (la forme dit l'histoire). Puis **par genre**, et « Tous les artistes » qui ouvre la loupe. Même grammaire que « Moi » : 3 visages, « Voir les N ».
- **La loupe** montre les artistes trouvés au-dessus des albums ; toucher un visage ouvre sa fiche.
- Effet au prochain « Actualiser ».

### Sous le capot
- `cache/agg_artists` (`buildArtists`, testé) : récits, courbes, et déjà « Souvent avec » pour la fiche artiste (prochaine version).

## v2.39.0 — 2026-10-14

### Ce qui change pour Axel
- **Bibliothèque : tri par note.** En bas, le picto aux trois pastilles range un bac d'Adoré à Zappé, les non notés à la fin, et à note égale les plus écoutés d'abord. Il remplace « artiste A→Z » : les artistes auront bientôt leur propre vue.

## v2.38.3 — 2026-10-14

### Ce qui change pour Axel
- **L'en-tête de « Moi » ignore aussi 2019** (année blanche, 29 écoutes) : il affiche le même total que « Mes écoutes par… » (47 968 au lieu de 47 997).

## v2.38.2 — 2026-10-14

### Ce qui change pour Axel
- **« À faire » ne change plus une seconde après l'ouverture** : la liste « Classer un artiste » est préparée sur toute ta bibliothèque, comme celle qu'on calcule ensuite — plus de « Classer · 2 » qui disparaît.

## v2.38.1 — 2026-10-14

### Ce qui change pour Axel
- Avant la première actualisation (rien de préparé encore), « Moi » réserve la place du portrait au lieu d'afficher « Ton portrait se dessine. », et la forme grise de « À faire » a sa vraie hauteur : rien ne saute.

## v2.38.0 — 2026-10-13

### Ce qui change pour Axel
- **« Moi » s'affiche en entier, d'un coup** : portrait, « À faire », adorés, paradoxes, « Un seul titre »… n'attendent plus ta bibliothèque. Tout est préparé d'avance (~270 Ko au lieu de ~2 Mo) : à la synchro pour tes écoutes, et dans la seconde qui suit **chaque note ou genre posé** — à la réouverture, ce que tu viens de noter n'est plus redemandé.
- Mesuré à l'échelle de tes 11 600 albums (réseau 4G moyen) : « Moi » complet à ~2,5 s.

### Sous le capot
- `cache/agg_moi` (`buildMoiSlice`, testé) ; trigger `onCurationWritten` (notes, genres, pile, réglages des paradoxes) qui recalcule `agg_moi`, `agg_portrait` et `agg_oddities` (ADR-049).
- **Premier déploiement** : il active Eventarc sur le projet ; si le déploiement échoue sur une permission « en cours de propagation », relancer le workflow suffit.

## v2.37.0 — 2026-10-13

### Ce qui change pour Axel
- **« Moi » s'ouvre bien plus vite** : ton portrait, tes années et tes écoutes s'affichent en ~2 s au lieu d'attendre toute ta bibliothèque (~7 s mesurées à l'échelle de tes 11 600 albums). « À faire », tes adorés et tes paradoxes arrivent ensuite, à leur place déjà réservée (une forme grise qui respire) : rien ne saute.
- Le portrait affiché d'abord est celui de ta dernière actualisation ; si tu as changé un genre depuis, il se corrige dès que la bibliothèque est là.

### Sous le capot
- `cache/agg_portrait` (`buildPortrait`, testé) ; la bibliothèque se charge après les agrégats (ADR-048).

## v2.36.1 — 2026-10-13

### Ce qui change pour Axel
- **Le portrait s'affiche d'un coup** à l'ouverture : il n'apparaît plus vide (« Ton portrait se dessine. ») quelques secondes avant de se remplir.
- **Une seule barre pour tes genres** : Pop, Rock, Electro et « Autres », pleine, aux couleurs du graphe des genres, avec les parts dessous ; puis chaque genre et ses artistes phares. Fini les trois barres à moitié vides.

### Sous le capot
- « Moi » ne se reconstruit plus sur un événement reçu avant son premier chargement (la pile « Mis de côté » en émet un au démarrage).

## v2.36.0 — 2026-10-13

### Ce qui change pour Axel
- **Fiche artiste : les vrais albums d'abord.** Singles et leurs faces B, remix, lives et BO passent dans une section **« À part »**, sous les albums : une liste, sans pochettes, chacun nommé pour ce qu'il est (« Single · 2 écoutes », « Live · 42 écoutes ») ; le toucher le cherche sur YouTube Music. Chez Muse : *Hysteria*, *Starlight*, *Unintended* (faces B), *Invincible* (remix), *Live at Reading*… Le compte d'albums de l'en-tête ne compte plus qu'eux. Effet au prochain « Actualiser ».
- « 1 écoute » au singulier sur la fiche artiste.

### Sous le capot
- `albumNature` (testé) : un libellé est « à part » s'il est live, ou si toutes ses écoutes sont des titres que MusicBrainz laisse à part.

## v2.35.0 — 2026-10-13

### Ce qui change pour Axel
- **« À revoir »**, nouvelle tuile de Qualité : les titres déjà rangés que le moteur met maintenant en doute — un live rangé sur l'album studio (*Whole Lotta Rosie* de *Live at River Plate* sur *Let There Be Rock*), ou un titre rangé sur un coffret qui porte le nom de l'album (*Happy Xmas* sur *Imagine*, piste 32 sur 59). Pour chacun : **Garder ici** (il ne reviendra plus) ou **Remettre à part** (le rangement est défait, annulable). Effet au prochain « Actualiser ».
- **Un live reste à part**, même quand c'est l'album qui le dit (*Live in Copenhagen*, *MTV Unplugged*, sessions acoustiques) : il ne t'est plus proposé sur l'album studio.
- **Coffrets et rééditions** : un titre trouvé seulement après la 20ᵉ piste d'une sortie de plus de 30 titres n'est plus jamais « sûr » (une Deluxe de 22 titres reste un album).
- **Moins de clics par erreur** : une carte qui vient d'arriver ignore les touchers une fraction de seconde — un toucher en rythme ne tranche plus la suivante sans l'avoir lue.
- **Export pour analyse** : chaque décision garde ce qui était proposé au moment de trancher, et les corrections appliquées y figurent — de quoi mesurer, dans quelques semaines, ce que tu valides à coup sûr.

### Sous le capot
- `isLiveLabel`, `doubtOf`, `BONUS_POS` (`quality/mb.js`, testés) ; `rv` sur les propositions et les rattachés d'office.

## v2.34.1 — 2026-10-12

### Ce qui change pour Axel
- **Moi se lit dans l'ordre** : « Qui je suis » et « Mes années » passent en petit surtitre au-dessus de leur phrase (*Pop, Rock et Electro.*, *Du rock à l'electro.*), qui devient le vrai titre du bloc — un peu moins grosse qu'avant, pour ne plus écraser les autres titres.
- La phrase des genres élide enfin : *du rock à l'electro*, plus *au electro*.
- **« Un seul titre »** a sa ligne, comme les autres blocs : *Des titres que tu écoutes pour eux seuls, toi qui écoutes d'habitude les albums en entier.*

## v2.34.0 — 2026-10-12

### Ce qui change pour Axel
- **« Un seul titre »**, nouveau bloc de Moi, après tes paradoxes : l'album bof, le titre énorme. La chanson en grand (*drugs* — EDEN), ce qui la rend exceptionnelle en or (**3× la moyenne** d'un titre de son album) et sa part de l'album en barre (43 %). Les albums que tu as notés Culte ou Adoré n'y sont pas — ceux-là, tu les aimes en entier. Toucher une ligne ouvre l'album.
- **Fiche album** : quand un titre tient l'album, un encart **« Titre phare »** le dit (*3× la moyenne · 43 % de tes écoutes de l'album*) et il passe en or dans la liste des titres.
- Effet au prochain « Actualiser ».

### Sous le capot
- `cache/agg_one_track` (`buildOneTrack`, testé), réglé sur ton export : 14 albums aujourd'hui.

## v2.33.1 — 2026-10-12

### Ce qui change pour Axel
- **Export pour analyse** : une ligne de plus par album (dès 5 écoutes) — son titre le plus écouté, ses écoutes et le nombre de titres différents joués. De quoi régler le futur « titre phare » (l'album bof, le titre énorme) sur tes vrais chiffres. Environ 30 Ko de plus.

## v2.33.0 — 2026-10-12

### Ce qui change pour Axel
- **« Mes années » s'ouvre sur tes genres dans le temps.** Un titre qui se calcule (« Du rap au rock. »), puis une colonne par trimestre : en haut, une fine **bande de volume** (combien tu as écouté) ; dessous, la **part de tes 3 genres** phares, le reste en gris. La légende donne la période entière ; touche un trimestre, elle ne parle plus que de lui (écoutes et parts). Toucher ailleurs revient à la période.
- **« Voir les sous-genres »** déplie le même graphique pour un genre au choix (Rock, Rap, Electro…) : ses 3 sous-genres en nuances de sa couleur, avec leur bande de volume. Le trimestre touché reste en avant dans les deux graphiques.
- Les parts portent sur tes écoutes classées : plus tu classes d'artistes, plus le graphique est juste.

### Sous le capot
- `agg_quarters.items[].styles` : écoutes classées par « genre|sous-genre » (test ajouté). Nouveau module client `moi-genres.js`.

## v2.32.2 — 2026-10-12

### Ce qui change pour Axel
- **Album ouvert depuis une fiche artiste** (Android) : la fiche album s'affiche enfin entière. Chrome laissait transparaître la fiche artiste à travers l'album (pochettes, « Ses albums » mêlés aux notes et au genre). La fiche artiste se cache désormais tant que l'album la recouvre, et revient dès qu'il commence à partir ; son fond teinté n'utilise plus de masque (suspect principal).

## v2.32.1 — 2026-10-12

### Ce qui change pour Axel
- **Le partage devient une démo de la Qualité.** Ton invité voit l'onglet Qualité tel qu'il est chez toi, et peut **tout essayer** — trancher, passer, appliquer, ouvrir les lots, annuler — avec les animations. Un bandeau le dit : *Démo · essaie tout, rien n'est enregistré*. Ses gestes vivent dans sa page et disparaissent avec elle ; ta bibliothèque, tes décisions et tes notes ne bougent pas. La vérification MusicBrainz reste à toi.
- Depuis une fiche album, l'invité peut aussi « Revoir ces titres dans Qualité ».

### Sous le capot
- `firestore.rules` : l'invité lit `quality/*` et, chez toi, `album_arbitrations`, `applied_corrections`, `correction_batches`, `quality_later` — en lecture seule (IM-8). Vérifié sur l'émulateur : après un parcours invité complet (trancher, appliquer), aucun document écrit.

## v2.32.0 — 2026-10-12

### Ce qui change pour Axel
- **« Séparer » quitte la fiche album.** La section « Rattachés à cet album » reste (pour savoir ce qui a été réuni), avec **« Revoir ces titres dans Qualité ›»** : chaque titre rangé d'office sous cet album s'y tranche avec la carte habituelle — **Garder ici**, ou **Remettre à part** sur son libellé d'origine (puis « Appliquer », comme toute correction).
- Ces rattachements d'office restent **silencieux** : ils n'arrivent pas dans « à trancher » et ne changent pas le taux de santé.
- **Tes séparations existantes** deviennent, au prochain « Actualiser », des corrections « remettre à part » réunies dans un lot **« Séparations »** — rien ne bouge pour toi, et le lot s'annule comme les autres.

### Sous le capot
- Qualité : items `linked` (rattachés d'office) ; canon : une correction vers le libellé reçu le garde tel quel ; `album_splits` migré puis supprimé (`migrateSplits`, testée). Données de l'émulateur : quelques éditions Deluxe pour voir « Rattachés ».

## v2.31.6 — 2026-10-12

### Ce qui change pour Axel
- **Mes années** : l'album affiché sur la ligne d'une année illustre son titre. « Fulgurance : Novelists » montre un album de Novelists ; « Rock · alternative, comme d'hab » montre ton album de rock alternatif le plus écouté — plus *Feu* (rap) sous un titre « Rock ». La découverte de l'année reste en petit. Effet au prochain « Actualiser ».

## v2.31.5 — 2026-10-12

### Ce qui change pour Axel
- **Mes années, trimestres, Ma journée** : les écoutes sans album (titre seul, vidéo YouTube comme « 3 Hours of Dark Fantasy Music ») ne s'affichent plus comme un album — sans artiste et sans fiche. Elles comptent toujours dans tes écoutes, tes genres et tes heures. Les **découvertes** d'un trimestre ne comptent plus que de vrais albums (le « 647 découvertes » de fin 2023 baissera), et l'humeur d'un trimestre peut changer en conséquence. Effet au prochain « Actualiser ».

## v2.31.4 — 2026-10-12

### Ce qui change pour Axel
- **Qualité · revue** : le titre à ranger est désormais le sujet de la carte — encadré en or pointillé (comme « à trancher »), « ♪ Titre à ranger », le titre en grand puis l'artiste — au lieu d'une ligne qui se lisait comme un intitulé. Les deux albums dessous sont ses destinations possibles.
- **Roadmap** : « Titres d'un album dans l'ordre du disque » ajouté (piste MusicBrainz, à cadrer).

## v2.31.3 — 2026-10-11

### Ce qui change pour Axel
- **Fiche artiste** :
  - les albums apparaissent tout de suite à leur couleur, puis leur pochette — plus de cases noires à l'ouverture ;
  - l'en-tête prend la couleur du genre de l'artiste, comme la fiche album prend celle de sa pochette ;
  - la carte ne saute plus quand on revient dans l'app : comme la fiche album, elle ne s'agrandit plus d'elle-même quand le contenu défile, seulement en poussant l'en-tête vers le haut.
- **Fiches album et artiste** : la carte se tire vers le bas depuis n'importe où tant qu'on est en haut de la fiche — plus besoin de viser tout en haut. Un geste vers le haut ou de côté fait toujours défiler.

## v2.31.2 — 2026-10-11

### Ce qui change pour Axel (sur PC)
- **Fiche album** : une seule barre de défilement (la page dessous ne défile plus) ; le CD sorti reste à côté de la pochette au lieu de glisser sous le titre ; la pochette s'aligne sur le contenu.
- **Fiche artiste** : une fenêtre posée au centre, sous la barre du haut, au lieu d'une colonne collée en haut de l'écran.
- **Réglages** : centrés comme les autres écrans.
- **Qualité** : « laissés tels quels » est collé à son nombre ; plus d'ombre parasite en bas de l'écran.

### Sous le capot
- Les cartes fermées (fiche artiste, sous-écrans et volets de Qualité) sont masquées et sorties du focus clavier une fois descendues.

## v2.31.1 — 2026-10-11

### Ce qui change pour Axel
- **À faire › Classer un artiste** : le genre se choisit avec les mêmes tuiles que sur les fiches album et artiste (tuiles à la couleur du genre, puis sous-genres en pastilles, confettis).
- **Carte du trimestre, remise en ordre** : le titre du chapitre (ou la période) avec son humeur, une seule ligne grise (période, bascule, trimestre en cours), puis le récit d'Orphée — ou, sans récit, la phrase qui explique l'humeur —, les chiffres, les 3 albums et « Modifier le chapitre ». Fini « Chapitre · … », la période répétée et l'étiquette « Orphée raconte ».
- **Réglages sans mode d'emploi** : Actualiser, puis une ligne d'état (« Actualisé il y a 44 min », écoutes Last.fm, titres à rattacher) ; « Exporter » sans légende ; Partager en une ligne ; Compte = ton nom Last.fm, ton e-mail et « Se déconnecter » sur une ligne.
- **Qualité** : plus de vide noir à faire défiler en bas de l'écran.

### Sous le capot
- Qualité : `.q-wrap` ne dégage plus la barre du bas une seconde fois (`#app-screen` le fait déjà).

## v2.31.0 — 2026-10-11

### Ce qui change pour Axel
- **Une fonction, un visage, partout.** Chaque élément a désormais une seule apparence, sur tous les écrans :
  - **l'action du moment** : un bouton vert plein (Suivant, Écouter, Enregistrer, Appliquer…) ;
  - **les actions secondaires** : le même bouton, fond gris (Voir les N, Raconte-moi, Modifier…) ;
  - **remettre à plus tard** : un simple texte gris (Passer, Pas maintenant, Je ne sais pas) ;
  - **les choix** : une même pastille, cerclée de sa couleur, pleine une fois choisie (sous-genres, moments, trimestres, Mis de côté…) ;
  - **les onglets** d'un bloc, **les cartes** (« À faire », « Une question ») et **le bandeau** du bas : un seul style chacun.
- **La couleur dit le sens** : vert = agir, or = à décider / mis de côté / Adoré, la couleur d'une note ou d'un genre = cette note, ce genre.
- **Mêmes tailles de texte partout** : 6 tailles seulement — titre d'écran, titre de bloc, titre d'élément (le nom d'un album dans une carte ou une liste), texte, ligne sous un titre, étiquette — sur tous les écrans, Salon compris. « Ta note », « Genre », « Son genre », « Ses albums » sont maintenant des titres comme « Mes années ».
- **Salon** : toucher le champ de saisie ne fait plus zoomer l'écran sur iPhone.
- **Fiche artiste** : le genre se choisit comme sur l'album (bouton résumé, tuiles à la couleur du genre, sous-genres en pastilles, confettis), au lieu des deux menus.
- **Plus de bouton « retour »** sur téléphone : tout ce qui s'ouvre « plus loin » est une carte qu'on tire vers le bas (ou le geste retour) — y compris, désormais, les écrans de Qualité (revue, Prêts, lots). Les Réglages se quittent par le geste retour.

## v2.30.0 — 2026-10-11

### Ce qui change pour Axel
- **Qualité devient un processus en trois étapes**, l'une sous l'autre, chacune avec son bouton : **① à trancher** (pointillés ambre, « Trancher ») → **② prêts** (pointillés verts, « Appliquer ») → **✓ dans ta bibliothèque** (plein). Pointillé = pas encore réel, plein = réel ; l'anneau suit le même code (plein aujourd'hui, pointillé une fois appliqué).
- **« Appliquer »** montre d'abord **ce qui va changer** : corrections sûres, tes décisions, et les **albums notés qui se vident**. Leur note n'est jamais perdue : elle est **reportée** sur l'album d'arrivée (s'il est déjà noté, tu choisis laquelle garder). Puis les titres rejoignent leur album et l'app s'actualise.
- **Rien ne s'applique sans toi** : les nouvelles corrections trouvées à chaque « Actualiser » attendent dans « prêts » jusqu'au prochain « Appliquer ».
- **✓ Dans ta bibliothèque** liste les **lots** datés (« 11 oct. · 385 titres · 2 notes reportées ») : annule un titre, ou tout un lot — tout revient comme avant, notes comprises.
- **Singles et titres sans album** : quand MusicBrainz sait de quel album ils viennent (même version, disque principal), ils sont maintenant **prêts** sans carte, même si tu n'as pas cet album en entier. Venus d'une compilation, ils restent à trancher.

### Sous le capot
- Nouvelles curations `users/{uid}/applied_corrections` et `correction_batches` ; le rattachement (`applyCanon`) les suit, avant Last.fm (testé).

## v2.29.0 — 2026-10-11

### Ce qui change pour Axel
- **Orphée nomme tes chapitres.** Sur un trimestre, « Raconte-moi » : Orphée raconte, **donne un titre au chapitre** (sur la musique : « L'hiver Bon Iver ») et son récit en devient la **description**.
  - Titre et description sont **gardés** : tu les retrouves à chaque visite du trimestre, sans redemander.
  - « **Modifier le chapitre** » te laisse changer le titre et réécrire la description (puis prolonger au trimestre suivant, ou supprimer).
  - Plus de bouton pour nommer un chapitre à la main : c'est Orphée qui propose, toi qui corriges.
  - L'invité voit le titre du chapitre, jamais la description.

## v2.28.1 — 2026-10-11

### Ce qui change pour Axel
- **Mes années** : les **fulgurances** (« Fulgurance : Aphex Twin ») s'affichent en **or**, comme Adoré, au lieu d'un gris qui les cachait.
- « en cours » (l'année actuelle) repasse en gris, comme le reste de la ligne : l'or est réservé aux fulgurances.

## v2.28.0 — 2026-10-11

### Ce qui change pour Axel
- **« Ma journée »** : « Mes moments » rejoint le graphe de fin. Dans « Mes écoutes par… », l'onglet **Journée** remplace « Heure » :
  - les barres sont teintées par moment : nuit, trajet du matin, journée, retour du soir, soirée ;
  - touche un moment (en pastille) ou une heure (une barre) : son **album typique** apparaît, avec sa pochette ; le toucher ouvre sa fiche ;
  - « typique » : l'album que tu écoutes beaucoup à ce moment-là **et surtout à ce moment-là**, pour que ton album le plus écouté n'habite pas toutes les heures.
- **Les boutons « voir » et « déplier » passent sous les blocs**, en grand : « Voir les 17 adorés › », « Voir les 9 paradoxes › », « Voir les 13 années ⌄ » (puis « Replier »), « Voir les 3 albums mis de côté ».

- **Qualité** : la tuile « à vérifier » disparaît, elle faisait doublon avec le grand bouton vert « Vérifier 307 titres » — qui garde le décompte animé au retour de revue.

### Sous le capot
- `agg_commuting` gagne `moments` et `hour_top` (calculés à l'actualisation, testés) ; les moments sont définis une seule fois, côté serveur.

## v2.27.0 — 2026-10-11

### Ce qui change pour Axel
- **Qualité : « Je ne sais pas · passer »**. Sous chaque carte, tu peux passer un titre dont tu n'es pas sûr : rien n'est décidé, ta série continue, et tu peux annuler.
  - Les titres passés reviennent **en fin de revue** : « Il reste 3 titres passés » → **Les revoir** ou **Plus tard**. Une tuile **« passés »** sur l'accueil Qualité permet de les reprendre quand tu veux.
  - Ils partent dans **l'export** (Réglages › Synchronisation), avec tes décisions, pour qu'on les regarde ensemble.
  - Passer ne change rien à ta bibliothèque ; décider un titre passé le retire des passés.

## v2.26.1 — 2026-10-11

### Ce qui change pour Axel
- **Fiche artiste** : elle ne clignote plus à l'ouverture et se tire bien au doigt. Elle monte en glissant (même à la première ouverture), les pochettes de ses albums arrivent une fois la carte arrêtée, et la carte suit le doigt quand tu la tires vers le bas, sans que le contenu défile en même temps.
- **Fiche album** : le contour à la couleur de la note fait maintenant tout le tour de la fiche (il passait sous l'en-tête et ne se voyait qu'en bas).

## v2.26.0 — 2026-10-11

### Ce qui change pour Axel
- **Classer un album devient aussi satisfaisant que le noter** (fiche album) :
  - replié, le genre tient en **un bouton** qui le résume (« ● Rock · punk », ou le genre de l'artiste en retrait) ; le toucher déplie les tuiles, qui se replient d'elles-mêmes une fois le choix fait ;
  - le genre se choisit en **grosses tuiles**, chacune à sa couleur ; la tuile choisie se remplit, gonfle et prend un reflet, avec une onde et une petite gerbe de confettis à sa couleur ;
  - les **sous-genres** se déplient en grosses pastilles cerclées de la couleur du genre ;
  - une phrase dit ce que ça change : « *Rock · alternative* rejoint ton territoire Rock · 22 % de tes écoutes » ;
  - **Jazz, Blues, Podcast** (un seul sous-genre) se posent d'un seul toucher ;
  - tant que l'album n'a pas son propre genre, celui de l'artiste est indiqué (« Electro · techno — hérité de l'artiste ») et sa tuile est cerclée de pointillés ;
  - retoucher un genre ou un sous-genre le retire.

### Sous le capot
- Les couleurs des genres deviennent une référence unique (`ORPHEE_GENRE_COLORS`, `refdata.js`), lue aussi par les statistiques.

## v2.25.1 — 2026-10-11

### Ce qui change pour Axel
- **Le bac « Mis de côté » passe à gauche d'Adorés.** La Bibliothèque s'ouvre toujours sur Adorés, comme avant ; la pile est à un glissement vers la droite, toujours au même endroit.

## v2.25.0 — 2026-10-11

### Ce qui change pour Axel
- **Mis de côté** : quand tu n'es pas prêt à noter un album, mets-le de côté pour y revenir au bon moment.
  - Dans « À faire », **Plus tard** à côté de « Passer » ; dans la fiche album, le **marque-page** « Mettre de côté ». Une fois l'album dans la pile, **Envie forte** (étoile) le fait passer devant.
  - Dans la Bibliothèque, un bac **« Mis de côté »** : les envies fortes d'abord, puis les albums que tu as réécoutés depuis (prêts à noter), puis ceux à découvrir ; ceux qui dorment depuis plus de 3 mois sont ternis, en bas. Toucher un album ouvre sa fiche, où tu notes.
  - Dans « Moi », **une question** à la fois : « Tu as réécouté *X* 4 jours depuis que tu l'as mis de côté. Tu le notes ? » (Ouvrir · Pas maintenant), ou « *X* dort depuis 4 mois. Toujours envie ? » (Garder · Sortir). Une question écartée ne revient pas avant un mois.
  - **Noter l'album le sort de la pile**, avec « Annuler ».
  - « Réécouté » compte les **jours** où tu as écouté l'album, mis à jour à chaque « Actualiser ». L'invité ne voit pas la pile.

### Sous le capot
- Nouvelle curation `users/{uid}/aside` (E11) ; jours d'écoute calculés par `refreshCache` dans `private/aside` (lecture propriétaire seul, écriture refusée) ; signal et ordre dans `aside.js` (partie pure testée).
- Correctif : « À faire » pouvait rester vide si « Moi » se redessinait avant la fin du chargement de la bibliothèque.

## v2.24.3 — 2026-10-11

### Ce qui change pour Axel
- **La bibliothèque est nettement plus fluide** : la pile d'un bac défile à 60 images/s sans à-coup, et le glissement d'un bac à l'autre ne saccade presque plus (sur un téléphone moyen simulé : 38 saccades sur six glissements avant, 4 après). Même rendu : c'est le fond flouté des tranches qui est calculé beaucoup plus économiquement, et le bac voisin qui se prépare une fois le geste fini plutôt que pendant.

## v2.24.2 — 2026-10-11

### Sous le capot
- **Arrivée d'un invité plus propre** : pendant l'échange du lien (juste avant que la page se recharge), la bibliothèque, l'en-tête et « Moi » tentaient déjà de lire tes données et se faisaient refuser par les règles. Ils attendent désormais que l'accès de l'invité soit enregistré. Rien ne changeait pour l'invité, mais la console n'a plus d'erreurs.

## v2.24.1 — 2026-10-11

### Ce qui change pour Axel
- **Un invité peut essayer** : sur une fiche album, une ligne l'invite à toucher une note ou un genre « pour essayer : rien n'est enregistré ». Il profite des animations et des confettis, mais **rien n'est écrit** chez toi ; en rouvrant la fiche, il retrouve ta vraie note.

## v2.24.0 — 2026-10-11

### Ce qui change pour Axel
- **Qualité devient un plaisir** (maquette « délice ») :
  - les deux albums de la carte sont à égalité ; celui que tu choisis **s'allume** (contour lumineux, reflet, ✓) pendant que l'autre s'efface, puis la carte suivante arrive aussitôt — 0,4 s en tout ;
  - une **barre de progression** se remplit, et un **compteur de série 🔥** chauffe à mesure que tu enchaînes (or à 5, orange à 10, il bout à 15, avec des étincelles) ; « 5 de suite ! », « 10 · ça chauffe ! », « 20 · en ébullition ! » s'affichent en grand ;
  - au retour sur l'accueil, l'anneau et le nombre de titres à vérifier défilent jusqu'à leurs nouvelles valeurs ; une gerbe de confettis salue la fin de revue ;
  - tous les boutons s'enfoncent et rebondissent, avec une petite vibration (Android).
- **Fiche album** : la note se pose avec les **5 boutons de couleur** de « Moi » (une onde, la fiche prend un halo à la couleur de la note, une phrase d'impact) ; retoucher la note la retire. Le **genre et le sous-genre se choisissent en pastilles**, à la place des menus déroulants.
- **Des confettis pour chaque note**, à sa couleur, de plus en plus généreux : quelques-uns pour Zappé, trois salves pour Culte, et pour **Adoré** un éclair doré, une pluie d'or sur tout l'écran et des étoiles. Aussi dans « À faire » de « Moi ».
- Tout est coupé si ton téléphone demande moins d'animations.

## v2.23.11 — 2026-10-11

### Ce qui change pour Axel
- **Qualité** : chaque album de la carte affiche son **artiste** — celui de ta bibliothèque pour l'album d'aujourd'hui, celui que crédite MusicBrainz pour l'album proposé. Un album d'un autre artiste se repère d'un coup d'œil.

## v2.23.10 — 2026-10-11

### Ce qui change pour Axel
- **Qualité · on touche l'album où le titre doit aller** : « Garder ici » (et « Garder tout ») sont dans le bloc de l'album d'aujourd'hui, « Déplacer ici » dans celui de l'album proposé ; « Chercher un autre album… » en dessous. Toucher l'album lui-même ne décide rien : il ouvre sa fiche ou MusicBrainz pour vérifier.
- La liste des titres garde sa place pendant le chargement : les boutons ne sautent plus.

## v2.23.9 — 2026-10-11

### Ce qui change pour Axel
- **Qualité** : sur la carte, l'album où le titre est rangé aujourd'hui n'est plus grisé — c'est un choix à part entière, à égalité avec la proposition. Il affiche **sa pochette** (elle manquait quand le titre avait été reçu en single ou sans album) et, si c'est un album de ta bibliothèque, le toucher ouvre sa fiche.

## v2.23.8 — 2026-10-11

### Ce qui change pour Axel
- **Qualité** : « Autre album… » et « Garder tout l'album » deviennent de vrais boutons, au même style que « Garder », sous les deux choix principaux (côte à côte quand il y en a deux).

## v2.23.7 — 2026-10-11

### Ce qui change pour Axel
- **« Garder tout l'album »** compte désormais tous les titres rangés aujourd'hui sur cet album, même reçus autrement (en single, en titre seul, sans album) — avant, seuls ceux reçus sous le même nom d'album comptaient, si bien que le bouton n'apparaissait presque jamais.

## v2.23.6 — 2026-10-11

### Ce qui change pour Axel
- **Qualité · « Garder tout l'album »** : quand plusieurs titres d'un même album seraient déplacés (un double album comme *Mercury – Acts 1 & 2*, une compilation que tu écoutes telle quelle), un seul geste les garde tous. Sur la carte (sous « Autre album… ») et dans le panneau d'un titre ; « Annuler » juste après les remet tous.

## v2.23.5 — 2026-10-11

### Ce qui change pour Axel
- **La fiche artiste se comporte comme la fiche album** sur téléphone : une carte qui laisse voir l'écran derrière, avec sa poignée ; **tirer vers le bas** (sur la poignée, ou sur le portrait quand tu es en haut) la ferme, **pousser vers le haut** ou faire défiler la passe en plein écran. Toucher la poignée ou « retour » la ferment toujours.

## v2.23.4 — 2026-10-11

### Ce qui change pour Axel
- **Les rééditions augmentées sont réunies à leur album**, comme les Deluxe : « Les étoiles vagabondes : expansion » et « Les étoiles vagabondes » ne font plus qu'un, sous le libellé que tu as le plus écouté (ou celui que tu as noté) ; idem « Orion (Réédition) ». Les cartes qui proposaient de déplacer ces titres vers l'original disparaissent.
- Le mot ne compte que s'il est marqué comme une mention d'édition (après « : », « - » ou entre parenthèses) : un album comme « The Great Expansion » n'est jamais touché.
- Effet au prochain « Actualiser ».

## v2.23.3 — 2026-10-11

### Ce qui change pour Axel
- **Qualité, la preuve sur chaque carte** : sous l'album proposé, le titre surligné entre la piste précédente et la suivante, tels que MusicBrainz les écrit — tu reconnais l'album d'un coup d'œil.
- **Toucher l'album ouvre son édition sur MusicBrainz**, la source elle-même, pour vérifier hors d'Orphée ; **« Écouter »** ouvre l'album sur YouTube Music en cas de doute.
- La liste des titres est demandée à MusicBrainz par ton téléphone, carte par carte (seul l'identifiant de l'édition est envoyé) ; si MusicBrainz ne répond pas, le lien reste.

## v2.23.2 — 2026-10-11

### Ce qui change pour Axel
- **Qualité** : un panneau (« Autre album… », le détail d'un titre) se ferme en le **faisant glisser vers le bas**, comme la fiche album. Toucher au-dessus ou « retour » marchent toujours.

## v2.23.1 — 2026-10-11

### Ce qui change pour Axel
- **Qualité** ne propose plus de déplacer un titre vers le même album écrit autrement : « High Visceral, Pt. 2 » et « High Visceral {Part Two} », « Vol. 6 » et « Volume 6 », « Part II » et « Pt. 2 » sont reconnus comme un seul album. November reste donc où il est.
- Quand l'album proposé est dans ta bibliothèque, il s'affiche sous le nom que tu lui connais.
- Touche « Actualiser » une fois pour que l'onglet se recalcule (pas besoin de relancer la vérification).

## v2.23.0 — 2026-10-11

### Ce qui change pour Axel
- **Nouvel onglet Qualité**, entre Bibliothèque et Le Salon (toi seul, jamais un invité) :
  - un anneau dit quelle part de tes écoutes est sur le bon album, et ce que ce serait une fois les corrections appliquées ;
  - **« Vérifier N titres »** : une carte par titre douteux, les plus écoutés d'abord — l'album d'aujourd'hui, l'album proposé avec sa pochette, son année et la place du titre ; toucher l'album ouvre sa fiche. **Garder**, **Déplacer** ou **Autre album…**, et « Annuler » juste après si tu t'es trompé ;
  - les listes **seront corrigés**, **laissés tels quels** et **tes décisions**, par artiste ; toucher un titre permet de revenir en arrière ;
  - la vérification MusicBrainz se lance et se suit désormais ici (elle a quitté Réglages) ;
  - « retour » fonctionne comme partout : il ferme le panneau, puis revient à l'accueil de Qualité.
- **Toujours en mode à blanc** : tes décisions sont gardées, mais rien ne change encore dans ta bibliothèque. L'application des corrections viendra ensuite ; d'ici là, « Séparer » reste sur la fiche album.

## v2.22.1 — 2026-10-11

### Ce qui change pour Axel
- **La vérification MusicBrainz est plus juste**, d'après le premier essai sur tes 1 400 titres :
  - une proposition n'est **sûre que si l'album est déjà dans ta bibliothèque** ; sinon elle sera à vérifier par toi ;
  - les grands classiques (Take Five, Free Bird, September…) retrouvent leur album studio au lieu d'une réédition obscure ou d'un live ;
  - « avec Daft Punk » ou « feat. » ne compte plus comme une autre version ; les titres à plusieurs artistes (« Doja Cat et The Weeknd ») sont retrouvés ;
  - remix, live et acoustique restent à part, comme convenu ; un titre seulement ajouté en disque bonus d'une réédition est à vérifier.
- **Relance « Vérifier avec MusicBrainz »** : la vérification repart de zéro avec la nouvelle recherche. Toujours rien de changé dans ta bibliothèque.

## v2.22.0 — 2026-10-11

### Ce qui change pour Axel
- **Réglages › Synchronisation › « Vérifier avec MusicBrainz »** : l'app interroge MusicBrainz, l'encyclopédie ouverte de la musique, pour chaque titre douteux (petits albums, singles, titres seuls), les plus écoutés d'abord. **Rien ne change encore dans ta bibliothèque** : c'est le mode à blanc, pour vérifier ensemble avant d'appliquer.
- Un lancement dure jusqu'à 30 minutes et reprend là où il s'est arrêté (MusicBrainz n'accepte qu'une question par seconde) ; la progression s'affiche en direct, et tu peux quitter l'app pendant ce temps.
- **L'export pour analyse** donne, pour chaque titre vérifié, ce que MusicBrainz propose : l'album, l'année, la place du titre, et si c'est sûr, à vérifier ou à laisser tel quel (face B, bande originale…).

### Sous le capot
- Nouvelle fonction `verifyCatalog` (ADR-046, PM-33) : cache des réponses sur Storage, progression dans `cache/quality_progress`. Seuls l'artiste et le titre sont envoyés à MusicBrainz.

### Connu / à venir
- L'onglet **Qualité** (cartes à vérifier, corrections comptées et annulables, tes décisions) et l'application des corrections viendront une fois les propositions vérifiées sur tes vraies données.

## v2.21.2 — 2026-10-10

### Ce qui change pour Axel
- **L'export pour analyse** contient en plus un diagnostic des petits albums (4 écoutes ou moins) : leurs morceaux et ce que Last.fm a répondu, pour comprendre pourquoi certains titres (Hysteria, Muscle Museum…) ne sont pas encore rattachés à leur album.

## v2.21.1 — 2026-10-10

### Ce qui change pour Axel
- **Réglages › Synchronisation** dit où en est le rattachement des titres à leur album : « 340 titres restent à rattacher » jusqu'à « tous tes titres sont rattachés ». À zéro, « Actualiser » redevient rapide.

## v2.21.0 — 2026-10-10

### Ce qui change pour Axel
- **Chaque écoute retrouve son vrai album** : un titre écouté depuis une recherche, une radio ou un clip (« Unintended ») compte désormais dans son album (*Showbiz*), et les éditions Deluxe, Remastered ou Anniversary d'un album n'en font plus qu'un. Remix et live restent à part.
- Le rattachement se fait au fil des « Actualiser » (les titres les plus écoutés d'abord) : la bibliothèque perd peu à peu ses milliers de faux albums.
- **Sur la fiche d'un album**, « Rattachés à cet album » montre ce qui y a été réuni ; « Séparer » garde un libellé à part si Orphée s'est trompée (et « Rattacher » revient en arrière).
- Une note posée sur un faux album (un single, un titre seul) est abandonnée, comme décidé.

## v2.20.0 — 2026-10-10

### Ce qui change pour Axel
- **Exporter pour analyse** (Réglages › Synchronisation) : un fichier JSON léger avec tes albums (artiste, titre, genre, note) et tes écoutes (date + album), sans titres de morceaux, commentaires ni conversations. Pour analyser tes vraies données hors de l'app, par exemple régler les seuils de « Fulgurance ».

## v2.19.0 — 2026-10-10

### Ce qui change pour Axel
- **Ce qui distingue chaque année** : « Mes années » ne répète plus « Rock · alternative » partout. Chaque année dit ce qu'elle a eu de neuf face aux précédentes : un artiste qui explose (« Fulgurance : Twenty One Pilots »), sinon un sous-genre plus présent que d'habitude (« Plus de rap · cloud »), sinon « …, comme d'hab ». Visible après le prochain « Actualiser ».

## v2.18.1 — 2026-10-10

### Ce qui change pour Axel
- **Les bonnes photos d'artistes** : Orphée reconnaît l'artiste par un de ses albums que tu écoutes (« Weathering » pour Last Train, « Absolution » pour Muse) au lieu de son seul nom, souvent partagé par d'autres. Les photos se mettent à jour au fil des « Actualiser ».
- **« Voir plus » plus net** : en haut de chaque bloc, une petite pastille avec le nombre et une flèche (› vers la Bibliothèque, ⌄ pour déplier les années) ; plus de texte coupé, et une zone facile à toucher.
- Un album sans artiste n'affiche plus « · · ».

## v2.18.0 — 2026-10-10

### Ce qui change pour Axel
- **Plus de pochettes** : Last.fm prend le relais quand Deezer ne trouve pas, les titres « (Deluxe Edition) », « - EP »… sont nettoyés pour la recherche, et les albums introuvables sont recherchés à nouveau chaque mois. Les pochettes générées (en attendant) sont plus sobres.
- **Bonnes photos d'artistes** : plus de silhouette grise, et entre deux homonymes c'est le bon artiste (le plus suivi) qui gagne. Toutes les photos sont recherchées à nouveau une fois.
- **Mes années** : les 5 dernières, l'année en grand à côté de la pochette, « Toutes › » pour remonter. Sans humeur marquée, l'année dit ce qui a dominé (« Rock · alternative ») au lieu de « Dans tes habitudes ».
- **Années blanches masquées partout** (2019 chez toi) : ni ligne, ni trimestres, ni barre dans « Mes écoutes par… ».
- **« Tout voir › »** discret en haut des blocs, à la place des gros boutons « Voir les N ».
- **Mes paradoxes** : « parmi tes 230 albums les plus écoutés » plutôt qu'un pourcentage.
- Après « Actualiser », adorés et paradoxes réapparaissent tout de suite.

### Sous le capot
- `covers/` : `cleanTitle`, `lastfm.js` (`pickImage`), retry 30 j ; `artists.js` : `nb_fan`, silhouette d41d8, `rules_version` ; `quarters.js` : `style`, `blankYears` ; `refreshCache` reçoit `LASTFM_API_KEY`. PRODUIT PM-19, SPEC § 13 bis, § 15. Tests.

## v2.17.0 — 2026-10-10

### Ce qui change pour Axel
- **La Google Sheet n'est plus utilisée du tout** : tes écoutes viennent de Last.fm, tes genres d'artistes et tes notes vivent dans l'app. Plus de quota ni de panne Google Sheets, et « Actualiser » est plus léger. Garde la Sheet comme sauvegarde si tu veux : elle n'est jamais modifiée.
- Réglages › Synchronisation n'affiche plus la migration (faite) : seulement le nombre d'écoutes, la dernière et la date de synchro.

### Sous le capot
- ADR-044 : `readSheet.js`, `migrateScrobbles`, l'import unique des genres, `googleapis` et le secret `SHEETS_ID` retirés ; `refreshCache` ne lit que Storage + Firestore ; mode local sur l'émulateur Storage. SPEC § 1, 2, 3, 5, 8, 14, 18 ; CLAUDE.md ; SKILL.

## v2.16.2 — 2026-10-10

### Ce qui change pour Axel
- **Migration vers Last.fm débloquée, au plus propre** : les 29 albums dont la Sheet avait abîmé la clé (« 08:08 » devenu « 0,3388… », « 7/7 » devenu « 46210 », « #ERROR! ») reprennent leur vrai titre, celui qu'envoie Last.fm : plus de doublons à venir. Le rapport liste les clés réparées et les notes perdues (à re-noter) avant que tu valides.

## v2.16.1 — 2026-10-10

### Ce qui change pour Axel
- **Vérification des écoutes plus juste** : un album nommé « 08:08 » ou « true » était lu comme une heure ou un booléen ; il est maintenant lu comme le texte affiché dans la Sheet. Le rapport montre l'écart invisible (« position 18 : U+00A0… » pour un espace insécable) et un exemple par album.

## v2.16.0 — 2026-10-10

### Ce qui change pour Axel
- **« Actualiser » va chercher tes nouvelles écoutes sur Last.fm** : plus d'export à coller dans la Sheet. Le message dit combien sont arrivées (« 312 nouvelles écoutes »).
- **Bascule une fois**, dans Réglages › Synchronisation : « Vérifier mes écoutes » montre un rapport (nombre d'écoutes, doublons hérités, clés d'album) sans rien écrire, puis « Passer à Last.fm ». Bloqué si une seule clé d'album ne correspond pas, pour ne jamais détacher une note de son album.
- **La Sheet n'est pas modifiée** et ne sert plus qu'à l'onglet `Artists`.

### Sous le capot
- ADR-034 implémenté : `syncLastfm`, `migrateScrobbles` (`functions/src/scrobbles/`), écoutes sur Cloud Storage par année (`storage.rules` fermé), `cache/scrobbles_meta`. `refreshCache` lit Storage après migration : l'import des faits et le calcul des dérivés sont séparés. SPEC § 14, PRODUIT PM-01. Tests.
- Prérequis : Storage activé, secret `LASTFM_API_KEY`.

## v2.15.0 — 2026-10-10

### Ce qui change pour Axel
- **« Mes années » remplace la frise des trimestres** : une ligne par année, comme un sommaire. La pochette de ton album de l'année porte l'année (et la couleur de son humeur) ; à côté, l'humeur et son écart à tes habitudes (« Énergie · +23 pts de rap »), l'album, puis en petit les écoutes, la découverte de l'année et tes chapitres.
- **Les 3 dernières années d'abord**, « Voir les N autres années » pour remonter.
- **Toucher une année** ouvre ses trimestres (T1 → T4) : humeur chiffrée, albums, « Raconte-moi », chapitre.
- Après la mise à jour, appuie une fois sur « Actualiser » pour calculer tes années.

### Sous le capot
- `quarters.js` : `years` (même humeur comparée à soi, album et découverte de l'année, année en cours) dans `cache/agg_quarters` ; `moi.js` : `buildQuarters` → « Mes années ». PRODUIT PM-19, SPEC § 15. Test.

## v2.14.0 — 2026-10-10

### Ce qui change pour Axel
- **Des humeurs qui te ressemblent** : un trimestre prend l'humeur de ce qui s'écarte nettement de **tes** habitudes, plus de ce qui dépasse un seuil commun à tous. Toi qui découvres sans arrêt, tu n'es plus « Exploration » à chaque trimestre ; un trimestre sans écart net est « Dans tes habitudes ».
- **Des chiffres à la place de la phrase toute faite** : « 52 % de rap, contre 31 % d'habitude », « Clancy fait 33 % du trimestre ; d'habitude ton album n°1 en fait 12 % ».
- **Trimestre incomplet signalé** : celui en cours (ou dont les écoutes s'arrêtent tôt) dit « Trimestre incomplet · écoutes jusqu'au … ».

### Sous le capot
- ADR-043 ; `quarters.js` : `baselineOf`, `assignMoodRelative`, `partial` / `data_until`, `baseline`, `mood_rule` ; repli sur les seuils absolus sous 6 trimestres complets. PM-19, MODELE (Humeur), SPEC § 15. Tests.

## v2.13.3 — 2026-10-10

### Ce qui change pour Axel
- **Bibliothèque allégée** : les bacs de genre ne montrent plus que tes albums notés et tes albums très écoutés (le seuil « très écouté » de Réglages › Avancé, 90ᵉ percentile par défaut). La longue traîne d'albums à quelques écoutes revient à sa place : on la trouve avec la loupe. Ce filtre existait avant les bacs et s'était perdu dans la refonte.

## v2.13.2 — 2026-10-10

### Ce qui change pour Axel
- **« Rock, Rap et Electro. » est net** : le léger flou du titre de « Qui je suis » (qui suivait la netteté du portrait) est retiré ; la barre « Portrait net à X % » suffit à le dire.

## v2.13.1 — 2026-10-10

### Ce qui change pour Axel
- **Bibliothèque sur iPhone (Safari)** : la pile de tranches se dessine en entier. Safari mesurait mal sa hauteur, et un flou par tranche saturait sa mémoire graphique ; sur iPhone, la teinte de la pochette est désormais obtenue sans flou.
- **Visite plus rapide à ouvrir** : créer un accès réveille aussitôt le serveur d'invitation, pour que le scan de ton ami ne paie pas le démarrage à froid.

### Sous le capot
- `library.css` : plus de `height:100%` sous le pager (étirement flex) ; `library.js` : hauteur de pile relue à chaque rendu, `ResizeObserver`. `share.js` : appel de réveil de `joinShare` après `createShare` (refusé, sans effet).

## v2.13.0 — 2026-10-10

### Ce qui change pour Axel
- **Partager ma bibliothèque** (Réglages) : « Créer un accès d'1 h » affiche un QR à faire scanner, ou un lien à envoyer. Ton ami entre sans compte et voit « Moi » et la Bibliothèque, en lecture seule, avec un bandeau « Bibliothèque de mélomane · encore N min ».
- **Le Salon reste à toi** : chez l'invité il est grisé, avec un exemple de conversation qui ne contient rien de toi ; il ne peut pas écrire à Orphée.
- **Tu gardes la main** : « Couper l'accès » ferme la porte tout de suite, même pour ceux déjà entrés ; au bout d'1 h, la visite se termine toute seule.

### Sous le capot
- ADR-042, PM-28, IM-8 ; `createShare` / `joinShare` / `revokeShare` ; `session.js`, `share.js`, QR `vendor/qrcode.js` (MIT) ; règles : `isGuest()`, liste fermée de lectures. SPEC § 21.
- Prérequis : fournisseur **Anonyme** activé dans Firebase Authentication.

## v2.12.1 — 2026-10-10

### Ce qui change pour Axel
- **Orphée n'ouvre plus qu'à toi.** Un autre compte Google qui trouverait l'adresse est refusé (« Cet espace est privé ») : il ne lit plus rien, ne parle pas à Orphée (donc ne consomme pas ta clé) et ne peut plus lancer « Actualiser ».

### Sous le capot
- ADR-041 : propriétaire unique désigné dans `config/owner` (console Firebase), vérifié par `firestore.rules` et par `requireOwner` dans `refreshCache`, `chatOrphee`, `narrateQuarter`. Échec fermé. Tests : `owner.test.js`.

## v2.12.0 — 2026-10-09

### Ce qui change pour Axel
- **« Moi » commence par toi** : ta photo, ton nom Last.fm (à saisir une fois dans Réglages › Compte — « Ajouter mon nom Last.fm » y mène) et tes chiffres : écoutes, albums, depuis quand.
- **Un ordre qui se lit d'une traite** : qui je suis → à faire → mes moments → mes trimestres → ce que j'adore → mes paradoxes → mes écoutes par…
- **Tes artistes rejoignent leurs genres** : sous chaque genre de « Qui je suis », les visages de ses trois artistes phares ; un toucher ouvre leur fiche.
- **Une page cohérente** : chaque bloc a un titre et une ligne qui dit ce que tu regardes ; un album s'affiche toujours de la même façon (une ligne avec sa pochette, ou une pochette titrée) ; seule la carte « À faire », où tu agis, garde un cadre ; la couleur ne dit plus qu'une note ou une humeur.
- **Adorés et paradoxes : trois exemples**, puis « Voir les N » t'emmène dans le bac de la Bibliothèque. Nouveau bac **Paradoxes**, après les genres.
- **Mes trimestres** : le détail sans cadre, les trois albums du trimestre avec leurs écoutes, « Raconte-moi » et « Nommer ce chapitre » côte à côte (le champ s'ouvre au toucher).
- **Plus de silhouettes grises** à la place des photos d'artistes, et plus de léger défilement horizontal sur téléphone.
- **L'écran Stats disparaît** : ce qui servait est dans « Moi », le reste (répartition des notes, top albums, constellation, personnalités, capsule, découvertes) est supprimé.

### Sous le capot
- ADR-040 ; PM-05 retiré, PM-18 réécrit ; `stats.js` réduit au chargement des données, `stats-preview.js` / `stats-top.js` supprimés ; le refresh ne calcule plus constellation, personnalités, capsule ni découvertes. Profil : `users/{uid}/settings/profile.lastfm_user`. `OrpheeLibrary.openCrate`, bac `paradoxes` ; image par défaut Deezer filtrée (serveur et client).

## v2.11.0 — 2026-10-09

### Ce qui change pour Axel
- **La bibliothèque devient une suite de bacs**, comme chez un disquaire : **Adorés**, puis un bac par genre, chacun avec **tous** ses albums, les plus écoutés devant.
- **Glisse de côté pour changer de bac** : les noms des bacs défilent avec ton doigt ; touche le nom du bac courant pour voir tous les bacs d'un coup.
- **Chaque bac est une pile de tranches** : sombres, à peine teintées par leur pochette, avec sa vignette nette, le titre de l'album en grand et l'artiste en dessous. Touche une tranche pour ouvrir la fiche de l'album.
- **Choisis l'ordre** avec les trois petits pictos en bas à droite : les plus écoutés, les artistes de A à Z ou les albums de A à Z. Ton choix est retenu.
- **Une loupe** cherche dans toute la bibliothèque. Les anciens filtres disparaissent : « À noter » et « Mes paradoxes » sont dans « Moi » (« Voir tout » y déplie la liste).
- **Noter un album ne fait plus sauter la vue** : chaque bac garde l'album où tu étais.
- **Rapide même avec un gros bac** (ton Rock : 1 109 albums) : seules les tranches visibles existent, le défilement est libre et fluide.

### Sous le capot
- `library.js` / `library.css` réécrits (ADR-039, SPEC § 20) : physique maison (élan + ressort) pour feuilleter, pool de cartes recyclées, pile de tranches native, couleurs extraites des pochettes sur l'appareil.
- **Lien de préversion** : chaque PR qui touche l'interface est déployée sur un canal de test Firebase (`.github/workflows/preview.yml`), pour l'essayer sur téléphone avant fusion.

## v2.10.0 — 2026-10-09

### Ce qui change pour Axel
- **Les notes parlent français** : **Zappé · Sympa · Génial · Culte · Adoré** (1 → 5), mêmes couleurs. L'ordre alphabétique est conservé : trier A→Z range toujours du 5 au 1, comme avec l'anglais. Tes notes ne bougent pas (elles sont stockées en chiffres) ; seul leur nom change, partout dans l'app.
- **Orphée** utilise les nouveaux noms et comprend toujours les anciens (« mets-le en Classic » marche encore).
- **« Mes paradoxes »** est confirmé comme nom de l'ancienne Oddity.

### Sous le capot
- Libellés changés à la source unique `functions/src/grades.js` (slugs `key` anglais inchangés : cache et distributions intacts), régénérés vers `refdata.js`, SPEC et SKILL ; test : tri alphabétique = notes décroissantes (136 tests).

## v2.9.0 — 2026-10-09

### Ce qui change pour Axel
- **Mes paradoxes.** Nouvelle section de « Moi » : les albums que tu écoutes énormément sans les adorer (tes 10 % d'albums les plus écoutés, notés Skip ou Nice). C'est l'ancienne « Oddity », devenue une facette de ton portrait ; « Voir tout » ouvre la bibliothèque filtrée (le filtre s'appelle maintenant « ✦ Paradoxes »).
- **Un en-tête commun sur tous les écrans** : l'âge de tes données (« il y a 3 j ») — touche-le pour actualiser — et la roue des réglages, partout au même endroit.
- **Une seule carte « À faire »** dans « Moi » : noter un album et classer un artiste réunis, avec un sélecteur quand les deux t'attendent.
- **Réglages simplifiés** : synchronisation et compte d'abord ; le seuil d'écoutes et les notes des paradoxes sont rangés dans « Avancé », replié (les valeurs par défaut suffisent).

### Sous le capot
- `nav.js` construit l'en-tête (`.apphead`), `refresh.js` y branche la pastille ; `orpheeOddity.list()` et `OrpheeLibrary.showOddity()` ; PRODUIT PM-27, PM-16 replié ; SPEC § 10.

## v2.8.0 — 2026-10-09

### Ce qui change pour Axel
- **La fiche artiste.** Touche un artiste — dans « Ceux qui me définissent », dans la carte « Classer un artiste » ou sur son nom dans une fiche album — : sa photo, ses écoutes cumulées, depuis quand tu l'écoutes, son genre (modifiable sur place), tous ses albums (touche-les pour ouvrir leur fiche) et les trimestres où il a compté. « Retour » la referme.
- **Les photos d'artistes** viennent de Deezer, comme les pochettes, pour tes 150 artistes les plus écoutés — uniquement quand le nom correspond exactement (pas de photo d'un homonyme). Elles arrivent au prochain « Actualiser », par vagues de 60.

### Sous le capot
- `functions/src/covers/artists.js` → `cache/agg_artist_images` (correspondance stricte, échecs réseau non mémorisés, budget de 25 s par refresh) ; 3 nouveaux tests (135). `public/js/artist-sheet.js` (couche d'historique, sous la fiche album). SPEC § 19.

## v2.7.1 — 2026-10-09

### Corrigé
- **Le bouton retour du téléphone ne fait plus quitter l'app.** Il remonte toujours d'un cran : il ferme la fiche album, le panneau de recherche ou le mode feuillette, revient à l'écran précédent (Moi après une Bibliothèque ouverte depuis un artiste, après les Réglages ou les Stats…) et ne quitte l'app que depuis « Moi ».
- **La fiche album confirme chaque enregistrement** (« Enregistré · Great ») et prévient si ça échoue — avant, une erreur passait inaperçue. Le message s'affiche maintenant au-dessus de la fiche et de la barre.
- **Le Salon affiche l'italique et le gras d'Orphée** au lieu des astérisques (`*In Rainbows*` → *In Rainbows*).

### Sous le capot
- `nav.js` : historique par écran et par couche (`openLayer` / `closeLayer` / `back`, profondeur portée par l'état) ; `library.js` : feuillette et recherche en couches ; `detail.js` : entrée d'historique avec profondeur. `window.OrpheeToast` ; `text.js` (rendu sûr partagé Salon + récits).

## v2.7.0 — 2026-10-09

### Ce qui change pour Axel
- **Tes genres d'artistes entrent dans l'app.** Au prochain « Actualiser », les genres de ton onglet `Artists` sont importés une fois ; ensuite c'est l'app qui fait foi. Un album sans genre prend celui de son artiste — partout : territoires, humeurs des trimestres, netteté, étagères de la Bibliothèque.
- **Carte « Classer un artiste » dans « Moi »** : les artistes que tu écoutes le plus et qui n'ont pas encore de genre, un par un. Touche le genre puis le sous-genre (un seul geste quand il n'y en a qu'un) ; « Passer » le met de côté 30 jours. Tu vois l'effet : « 4 albums comptent maintenant dans tes territoires », « portrait +2 % ».

### Sous le capot
- `users/{uid}/artist_genres` + marqueur d'import (ADR-038). Serveur : `loadArtistGenres` (import unique, jamais d'écrasement), trimestres et sélection sur le genre effectif. Client : `artists.js` (`OrpheeArtists`). 4 nouveaux tests (132). SPEC § 18.

### Connu / à venir
- Suggestions de genre par tags Last.fm : avec ta clé API (étape 3).

## v2.6.0 — 2026-10-09

### Ce qui change pour Axel
- **Le coup de cœur rejoint la note 5 (Adored).** Plus d'étoile dans la fiche album ; l'étagère « Coups de cœur » de la Bibliothèque devient « Adorés ».
- **Tu migres toi-même tes anciens coups de cœur** : une carte « Coups de cœur → Adored » en haut des Réglages montre la liste exacte (« Classic → Adored », « déjà Adored »…) ; rien ne change tant que tu n'as pas appuyé sur « Tout passer à Adored » et confirmé. La carte disparaît une fois faite.
- **Orphée ne parle plus de coup de cœur** : « Adored, coup de cœur ;) » = une note 5. Le tag `[FLAG]` est obsolète (retiré du texte, sans effet).

### Sous le capot
- Nouveau `public/js/fusion.js` (batchs ≤ 400, builder partagé ADR-027, genre/description préservés). `tags-spec` : `[FLAG]` → strip, `[GRADE]` sans `personal_fav` ; `query_albums` sans filtre coup de cœur ; plus de ❤️ dans le contexte. SKILL.md et tables générées mises à jour. 130 tests.

## v2.5.0 — 2026-10-09

### Ce qui change pour Axel
- **Nomme tes chapitres.** Sur la carte d'un trimestre, « Ce chapitre, pour moi » : donne-lui un nom, prolonge-le au trimestre suivant, renomme-le ou supprime-le. Quand un trimestre est une bascule, Orphée t'invite à le nommer. Tes chapitres s'affichent en bande au-dessus de la frise.
- **« Raconte-moi ce trimestre ».** Orphée raconte le trimestre en deux ou trois phrases, avec sa voix, **uniquement à partir des faits** affichés (humeur, bascule, albums, volumes) — jamais d'hypothèse sur ta vie. Le récit est gardé : le redemander ne coûte rien tant que le trimestre ne change pas.

### Sous le capot
- Nouvelle Function `narrateQuarter` (ADR-037) ; `chat/anthropic.js` partage clé, modèle et client avec le Salon. Récits dans `users/{uid}/narrations`, chapitres dans `users/{uid}/chapters` (règle owner existante, aucune règle Firestore modifiée).
- Noms d'humeur : source unique côté serveur (`mood_label`). 4 nouveaux tests (faits, empreinte, consigne). SPEC § 17.

## v2.4.0 — 2026-10-09

### Ce qui change pour Axel
- **La carte « À qualifier » en haut de « Moi ».** Chaque jour, jusqu'à 3 albums choisis au bon moment : ceux que tu écoutes beaucoup en ce moment sans les avoir notés (« 41 écoutes ces 30 derniers jours · pas encore noté »), et un album Adored que tu n'écoutes plus depuis des années (« toujours ? »). Un tap de 1 à 5 suffit ; « Passer » le met de côté 30 jours.
- **Tu vois l'impact de chaque note** : « Rejoint tes albums adorés », « Ton portrait passe à 76 % de netteté (+1) », et une invitation à classer l'album s'il n'a pas de genre.
- **« Portrait net à X % »** dans « Qui je suis » : la part de tes écoutes portée par des albums notés et classés. Plus tu qualifies, plus ton portrait est net — le titre lui-même se précise.
- Corrigé : noter un album depuis sa fiche ne fait plus disparaître son genre de la bibliothèque jusqu'au rechargement.

### Sous le capot
- Nouveau `functions/src/refresh/selection.js` (pur, 3 tests) → `cache/agg_recent`. Sélection, écriture (builder partagé, ADR-027) et calcul d'impact côté client sur la curation LIVE. SPEC § 16.

### Connu / à venir
- « Pendant que c'est chaud » est relatif à ta dernière écoute importée : avec la synchro Last.fm (en attente de ta clé), ce sera vraiment « en ce moment ».

## v2.3.0 — 2026-10-09

### Ce qui change pour Axel
- **« Mes trimestres » dans « Moi »** : ta frise, année par année, trimestre par trimestre. Chaque barre a la couleur de son humeur (Exploration, Obsession, Énergie, Intensité, Introspection, Ancrage) et la hauteur de son volume d'écoutes. Touche un trimestre : son humeur, la **bascule** s'il y en a une (« après Obsession, place à Introspection »), trois faits (écoutes, part de l'album phare, découvertes…) et ses 4 albums les plus écoutés (touche-les pour ouvrir la fiche).
- **Pas d'étiquette plaquée** : un trimestre où rien ne domine est « sans humeur franche ».
- Il faut **Actualiser** une fois pour que la frise apparaisse (nouveau calcul).

### Sous le capot
- Nouveau `functions/src/refresh/quarters.js` (pur, 8 tests) → `cache/agg_quarters`. Règles et seuils : SPEC § 15. Genre effectif = album sinon artiste (onglet `Artists`). `refreshCache` journalise la répartition des humeurs pour calibrer les seuils.
- Front : `moi.js` présente la frise (aucune règle côté client).

### Connu / à venir
- Seuils à ajuster sur ta vraie bibliothèque (sur les données fictives, la moitié des trimestres n'ont pas d'humeur franche).
- Chapitres (nommer une bascule) : étape 7.

## v2.2.1 — 2026-10-09

### Ce qui change pour Axel
- **« Qui je suis » va plus loin** : chaque territoire montre sa part de tes écoutes, son sous-genre dominant et ses deux artistes phares (« Rock · alternative — 19 % — Twenty One Pilots et Linkin Park »).
- **Toucher un artiste de « Ceux qui me définissent » ouvre ses albums** dans la Bibliothèque (recherche pré-remplie, sans clavier qui surgit).
- **« Mes écoutes par… » sans la courbe** : les barres seules (aussi dans Stats).

### Sous le capot
- `moi.js` : territoires calculés sur `OrpheeLibrary` (curation LIVE). `library.js` : `OrpheeLibrary.search(q)` (filtres remis à zéro, panneau ouvert sans focus). `stats-charts.js` : tracé de tendance retiré.

## v2.2.0 — 2026-10-09

### Ce qui change pour Axel
- **Orphée s'ouvre sur « Moi ».** Qui tu es d'abord : tes territoires (genres dominants), ceux qui te définissent (top artistes), tes moments (l'album du matin en transport, celui du soir), tes écoutes par an / mois / semaine / heure, puis le mur des albums que tu adores — touche une pochette pour ouvrir l'album.
- **La barre passe à trois onglets : Moi · Bibliothèque · Le Salon.** Les Réglages s'ouvrent par la roue dentée de « Moi » ; toutes les anciennes statistiques restent là, via « Toutes les statistiques » (retour par « ← Moi »).

### Sous le capot
- Nouveau `moi.js` / `moi.css` ; `nav.js` : 3 onglets, entrées hors barre `data-goto`, `window.OrpheeNav`. ADR-036 (révise ADR-033).
- Réutilisation sans duplication : `window.OrpheeStats` (agrégats chargés une fois, `orphee:stats-reloaded` après refresh) et `window.OrpheeLibrary` (curation LIVE, ADR-031). Le graphe « Écoutes par… » est la section Stats réinsérée.
- Mode local : `shoot-app.js` capture « Moi » et passe par `OrpheeNav`. Vérifié en local : ouverture sur Moi, album adoré → fiche, Réglages et Stats aller-retour, aucun débordement mobile, aucune erreur.

### Connu / à venir
- Trimestres et humeurs, carte « À qualifier », netteté du portrait : étapes suivantes du plan (ROADMAP).

## v2.1.6 — 2026-10-08

### Ce qui change pour Axel
- **Nouvelle typographie : Bricolage Grotesque, partout.** Une police simple mais qui a une main, pour les titres comme pour les petites annotations. Fini les étiquettes en capitales façon machine à écrire : elles deviennent de petits titres posés (« 01 Global » au lieu de « 01 GLOBAL »).

### Sous le capot
- `public/fonts/` : Bricolage Grotesque variable (graisses 200→800 + taille optique, 77 Ko, Fontsource 5.3.0, SIL OFL 1.1) remplace DM Sans + DM Mono. `--font-mono` devient un alias de `--font-sans` ; chiffres tabulaires sur l'app. 15 règles `uppercase` + `letter-spacing` retirées. Voir ADR-035.

### Connu / à venir
- L'onglet Stats déborde horizontalement sur mobile (~60 px) — **préexistant**, sera traité avec la refonte « Moi ».

## v2.1.5 — 2026-10-08

### Ce qui change pour Axel
- **Plus aucune requête vers Google Fonts.** Les polices (DM Sans, DM Mono) sont livrées avec l'app : même rendu, démarrage sans dépendance externe, et Google ne voit plus passer chaque ouverture d'Orphée. Les titres en gras (700) utilisent désormais la vraie graisse au lieu d'un gras simulé.

### Sous le capot
- `public/fonts/` : DM Sans variable (toutes graisses, 37 Ko) + DM Mono 400/500, sous-ensemble latin, issus de Fontsource 5.3.0 — licence SIL OFL 1.1 (`public/fonts/OFL.txt`).
- `public/css/fonts.css` (`@font-face`, `font-display: swap`) + `preload` de DM Sans dans `index.html` ; liens et `preconnect` Google Fonts retirés.

## v2.1.4 — 2026-10-08

### Ce qui change pour Axel
- **Orphée tourne en local, avec des données fictives** : `cd tools/dev && npm install && npm run dev` lance la vraie app sur http://127.0.0.1:5050, connectée à un compte de test, sans jamais toucher tes vraies données. Sert aussi à Claude pour voir et capturer chaque écran avant/après une modification.

### Sous le capot
- **Émulateurs Firebase** (Auth, Firestore, Functions, Hosting) sur le projet fictif `demo-orphee` — bloc `emulators` dans `firebase.json`.
- **`public/js/dev-emulators.js`** : branche le SDK sur les émulateurs **seulement** sur localhost avec un projet `demo-*` (no-op en prod et avec `firebase serve` sur le vrai projet). `auth.js` : connexion par compte de test en mode local au lieu de la popup Google.
- **`readSheet.js`** : sous émulateur (`FUNCTIONS_EMULATOR`), lit des écoutes fictives (`functions/.dev-fixture.json`, ignoré par git et par le déploiement) au lieu de la Sheet.
- **`tools/dev/seed.js`** génère les données (déterministes) puis appelle le **vrai `refreshCache`** — cache au schéma exact. **`shoot-app.js`** capture tous les écrans (mobile + desktop).
- **Harness `tools/visual`** réparé : il rendait une page vide (`file://` bloquait `mocks.js`).

## v2.1.3 — 2026-10-08

### Ce qui change pour Axel
- **Chargement un peu plus léger** : une librairie de graphiques (~200 Ko) n'est plus téléchargée — aucun graphique ne s'en servait, tout est dessiné en SVG maison.

### Sous le capot
- **Chart.js retiré** de `index.html` (chargé depuis le CDN, 0 usage).
- **`public/proto-patchwork.html` supprimé** : prototype qui était déployé publiquement sur Hosting.
- **Predeploy Functions = `gen` + `lint` + `test`** : le déploiement est désormais réellement bloqué par un lint ou un test en échec, comme `CLAUDE.md` l'affirmait déjà (le predeploy ne lançait que `gen`).

## v2.1.2 — 2026-06-14

### Ce qui change pour Axel
- **Nouvelle icône d'app.** Orphée arbore une pochette — un disque iridescent émeraude→or — sur l'écran d'accueil et l'installation PWA (192/512/1024).

### Sous le capot
- **`design-system.css` devient la source unique des tokens.** `style.css` ne redéfinit plus les couleurs / type / rayons du système — il en gardait une copie qui avait silencieusement divergé sur les gris (`--text`, `--muted`). Seul `--sync-neutral` (état repos du point de sync, absent du DS) reste local. Suppression de `--gold` (mort, 0 usage) ; `--accent-hover` → `--accent-hi` (nom canonique du DS).
- **Liens `icon` / `apple-touch-icon`** ajoutés dans `index.html` — fin des 404 `/favicon.ico`, icône d'accueil iOS.
- Icônes PWA 192/512 remplacées (opaques, plein cadre, prêtes pour le masquage adaptatif) + 1024 ajoutée ; entrée `manifest.json` correspondante.

## v2.1.1 — 2026-06-10

### Corrigé
- **Le Salon : le composer réapparaît.** Avec la nouvelle barre, la zone du chat gardait `min-height: 100vh` (hérité du shell) qui écrasait sa hauteur calculée → le champ de saisie filait derrière la barre du bas. `min-height: 0` en mode chat le remet juste au-dessus de la barre.
- **Bibliothèque : la loupe ne chevauche plus la barre.** Le FAB recherche est remonté au-dessus de la barre (la règle vivait dans `nav.css`, écrasée par `library.css` chargé après — déplacée dans `library.css`).

## v2.1.0 — 2026-06-10

### Ce qui change pour Axel
- **Une vraie barre d'onglets, toujours là.** Fini le bouton-menu flottant qui cachait la navigation : les 4 espaces — **Stats · Bibliothèque · Le Salon · Réglages** — sont visibles en permanence. Sur **téléphone** en bas (sous le pouce), sur **grand écran** en haut façon site web (Orphée + logo à gauche, onglet actif en pilule). L'app ouvre toujours sur la **Bibliothèque**.
- **« Le Salon »** : l'onglet pour parler à Orphée s'appelle désormais ainsi — un lieu où l'on cause de musique, sans répéter « Orphée » deux fois dans la barre.
- La fiche album reste **immersive** (elle recouvre la barre ; tu la fermes pour revenir).
- « Gravés dans ta mémoire » vit maintenant dans **Réglages**.

### Sous le capot
- `nav.js`/`nav.css` réécrits : barre `.tabnav` `position:fixed` (z-index 40, sous le scrim du detail), responsive **bas-mobile / haut-desktop** au breakpoint 900px (pilule active), wordmark de marque à gauche en desktop. Suppression FAB-menu + popover + barre-titre haute. Réutilise le moteur de vues existant (`activate()` + `orphee:tab`). Chat : zone = `100dvh − barre`, composer au-dessus ; FAB recherche remonté. Stat curation reloggée dans Réglages (`#stats-summary` suivi par `refresh.js`). ADR-033 (révise la position nav d'ADR-029).

## v2.0.2 — 2026-06-10

### Ce qui change pour Axel
- Rien de visible — garde-fou de gouvernance pour le dev.

### Sous le capot
- **Déclencheur « remontée de couche »** (ADR-032). Le risque sournois en dev rapide : modifier Spec/Code en touchant *en fait* une couche de référence (Produit/Modèle) sans le voir. Un hook git `commit-msg` repère la **signature** d'un commit suspect — `firestore.rules` touché, ou une ligne `IM-x`/`PM-xx`, **sans** modif de `PRODUIT.md`/`MODELE.md` — et **exige** un accusé dans le message (`Remontée: non — <raison>` / `Remontée: soumise`), sinon il bloque. La machine ne *juge* pas la remontée (humain) ; elle **force la question** au bon moment (Rappeler → Bloquer). Logique pure dans `.githooks/remontee.js`, testée. Première brique du futur skill `odyssee-gouvernance` (cf. ROADMAP).

## v2.0.1 — 2026-06-08

### Corrigé
- **Noter / commenter un album via Orphée fonctionne à nouveau.** Orphée
  recopiait la clé du contexte **avec** son préfixe (`id:Novelists-Coda` au lieu
  de `Novelists-Coda`) → l'album était jugé « introuvable » et la note/description
  **n'étaient jamais écrites** (rien n'apparaissait). Le parser de tags retire
  désormais ce préfixe `id:` de façon déterministe (filet de sécurité), et le
  system prompt précise que l'`album_sur` est la **valeur après `id:`**, jamais le
  préfixe. Tests de parsing ajoutés.

## v2.0 — 2026-06-08

Chantier majeur de **fiabilisation** (Socle → Curation → Stats → Desktop), mené
depuis `PRODUIT.md`/`MODELE.md` et la roadmap. ADR-026 → ADR-029.

### Ce qui change pour Axel
- **Noter via Orphée est fiable de bout en bout.** Quand tu lui demandes de noter
  ou commenter un album, ça s'écrit vraiment — et si elle vise un album qui
  n'existe pas ou une note hors barème, elle **ne fait plus n'importe quoi en
  silence** : elle se corrige ou te le dit.
- **L'onglet Stats ne ment plus.** Les focales Écoutes **Mois / Semaine / Heure**
  affichent enfin de vraies données (avant : vides, avec une phrase qui faisait
  croire le contraire). La focale **Jour**, qui doublonnait **Heure**, est retirée.
- **Stats lisible sur grand écran** : la colonne s'élargit et respire au lieu de
  rester une bande étroite au milieu. (Mobile inchangé.)
- **(Invisible mais important)** Le barème qu'Orphée avait en tête était **faux**
  — un niveau « Meh » fantôme sur une échelle 0-5. Elle reconnaît de nouveau le
  vrai **1-5 : Skip · Nice · Great · Classic · Adored**.

### Sous le capot
- **Référentiel des notes à source unique** (ADR-026, ferme D-1) : l'échelle 1-5
  vit dans `functions/src/grades.js` ; `public/js/refdata.js` (front) et les
  tables d'échelle de SPEC/SKILL sont **générées**, le back **consomme**. Canari
  pre-commit + test bloquent toute dérive. `grade_label` devient un dérivé.
- **Curation durcie** (ADR-027, ferme D-2) : builder pur partagé
  `public/js/curation.js` (wrapper UMD = global navigateur **et** require côté
  tests → **1ʳᵉ infra de test front**) consommé par `detail.js` et `chat.js` ;
  `grade_label` retiré de l'overlay (dérivé à l'affichage et côté agent).
  Validation serveur (note ∈ [1..5] + existence album via `album_stats`) +
  **auto-correction** : action invalide → 1 tour `[SYSTÈME]` (cap 1).
- **Stats réelles** (ADR-028) : nouveaux agrégats `agg_stats.by_month` /
  `by_weekday` ; l'axe **Heure** réutilise `agg_commuting.band` (une seule source
  horaire). Plus aucun visuel sans donnée.
- **Desktop** (ADR-029) : `#view-stats` passe à 900 px aérés `@media ≥900px`,
  récit en colonne unique. Le shell était déjà borné/centré.
- **Outillage** : harness de vérification visuelle headless `tools/visual/`
  (Playwright, vrais CSS + modules + mocks) + hook SessionStart (`.claude/`).
- **Qualité** : 93/93 tests (`node --test`), lint propre, revue de code (1
  régression anti-traversal corrigée).

## v1.4.5 — 2026-06-07

### Ce qui change pour Axel
- Rien de visible — Orphée répond pareil, mais moins cher et un peu plus vite.

### Sous le capot
- **Prompt caching Anthropic branché sur le system prompt.** Le prompt stable (+ les définitions d'outils) est désormais envoyé en bloc `system` avec un point de cache (`cache_control: ephemeral`) : au lieu d'être refacturé en entier à chaque message et à chaque tour de la boucle multi-turn, il est servi depuis le cache Anthropic (TTL ~5 min). Le contexte dynamique reste injecté dans le message utilisateur, après le point de cache, pour ne pas l'invalider. Le coût/latence des tokens en cache chute (~0,1× en lecture). Observabilité ajoutée dans les logs (`cache_read_input_tokens` / `cache_creation_input_tokens`) et test garde-fou (`system-prompt.test.js`) qui vérifie que le `cache_control` est bien posé.

## v1.4.4 — 2026-06-07

### Ce qui change pour Axel
- Rien de visible — robustesse interne, suite directe de v1.4.3.

### Sous le capot
- **Définition des tags à source unique** (`functions/src/chat/tags-spec.js`). La même définition était recopiée **4 fois** (parser + table du prompt dans `SKILL.md` + `CLAUDE.md` + `SPEC.md`) et avait déjà divergé. Désormais le parser *dérive* son dispatch du spec (plus de `switch` codé en dur ; seuls les parseurs de contenu restent dans le code, dans un registre gardé), et les 3 tables de doc sont **générées** (`gen-tags-doc.js`) entre marqueurs. `npm run gen` enchaîne `gen-tags-doc` puis `gen-prompt` ; le `predeploy` Firebase l'utilise. Garde-fou mécanique : le hook `pre-commit` **bloque le commit** si une table a dérivé du spec. ADR-025 (même famille qu'ADR-023).

## v1.4.3 — 2026-06-07

### Ce qui change pour Axel
- **Orphée retrouve l'intégralité de ses instructions.** Trois pans de sa personnalité et de son rôle — sa façon d'exploiter le contexte injecté, la commande `/contexte`, et tout son savoir sur le contexte culturel des albums (~100 lignes) — avaient **silencieusement disparu** du cerveau réellement utilisé par Orphée : tu les avais écrits, mais ils n'arrivaient jamais jusqu'à elle. Ils sont de retour (effectif au prochain déploiement).

### Sous le capot
- **Le system prompt n'est plus recopié à la main.** `docs/SKILL.md` devient la **source de vérité unique** ; le prompt chargé par `chatOrphee` est *généré* depuis lui (`functions/gen-prompt.js` → `orphee.skill.md`, gitignoré, régénéré au `predeploy` + repli runtime). `system-prompt.js` passe de **378 lignes recopiées à un chargeur de ~14 lignes**. La copie ne pouvant plus exister, elle ne peut plus diverger (principe « une seule copie à la main », ADR-023).

## v1.4.2 — 2026-06-06

### Ce qui change pour Axel
- **La curation de la fiche album tient sur une seule ligne.** Fini les cinq chips de note étalés puis les deux sélecteurs sur une ligne à part : la note, le genre et le sous-genre sont désormais alignés ensemble.
- **La note devient un chip unique, coloré selon ta note** (ou « Noter » si l'album n'est pas encore noté). Un clic déplie un petit écran flottant avec la liste des notes ; tu choisis, ou tu re-cliques la note active pour la retirer.

### Sous le capot
- Détail album : section « Ta note » réduite à une ligne `[note] [genre] [sous-genre]` (`.dt-curation`). La note est un déclencheur (`.dt-gradebtn`) qui ouvre un popover animé (`.dt-gpop`, fade + scale, fermeture au clic extérieur / Échap) contenant les chips. Le badge de note redondant du hero (`gradePill`) est retiré ; sa règle CSS `.dt-gradetag` devient morte.

## v1.4.1 — 2026-06-05

### Ce qui change pour Axel
- **Orphée peut enfin écrire une description d'album.** Demande-lui d'ajouter une note, un souvenir ou un contexte d'écoute sur un album : le texte atterrit dans le champ description de la fiche. Avant, elle n'avait aucun moyen de l'enregistrer — le texte restait dans le chat et se perdait.
- **La description se lit comme un vrai texte d'album.** Dans la fiche, elle n'est plus un champ de saisie : elle s'affiche en lecture, à la hauteur exacte du texte (pas de barre de défilement). Un clic dessus permet de l'éditer. Quand l'album n'a pas encore de description, une invite te suggère d'en parler à Orphée.

### Corrigé
- Une description ajoutée via Orphée n'apparaissait pas dans le détail album : elle n'était tout simplement jamais sauvegardée, faute de mécanisme dédié.

### Sous le capot
- Nouveau tag `[COMMENT: album_sur "texte"]` : écrit uniquement `commentaire` dans `users/{uid}/grades/{album_sur}` (merge), **sans toucher la note** — là où passer par `[GRADE]` aurait remis la note à `null`. Parsing serveur (`tags-parser.js`), side-effect client (`chat.js`) qui re-dispatche un snapshot complet pour ne pas réinitialiser note/genre en mémoire.
- Table des tags synchronisée (`SKILL.md`, `system-prompt.js`, `SPEC.md`, `CLAUDE.md`). Tests de parsing (`tags-parser.test.js`).
- Détail album : la description passe d'un `<textarea>` permanent à un rendu lecture seule (`.dt-desc`, `white-space: pre-wrap`, hauteur naturelle) qui bascule en édition au clic ; le textarea s'auto-dimensionne (bordures incluses, `overflow:hidden` → pas de scrollbar). `save()` lit désormais le commentaire en mémoire et non plus le textarea, pour qu'un changement de note n'efface plus la description.

## v1.4.0 — 2026-06-05

### Ce qui change pour Axel
- **Orphée peut maintenant fouiller ta bibliothèque elle-même.** Au lieu de se limiter aux agrégats injectés (top 20, Oddity…), elle interroge le cache en direct quand ta question l'exige : « mes albums de rap non notés depuis 2018 », « la distribution mensuelle d'*Untrue* », « le détail de tel album ». Elle enchaîne jusqu'à 5 recherches avant de répondre.
- **Réponses plus précises et ancrées.** Quand Orphée cite un chiffre ou un classement, il vient de tes vraies données, pas d'une approximation.

### Sous le capot
- 3 tools Anthropic exposés à `chatOrphee` (ADR-009) : `query_albums` (filtre/tri sur la biblio complète), `query_listens` (agrégats : count, monthly_distribution, top_tracks, top_artists/albums, by_genre), `query_album_detail` (stats + curation + Écho + statut Oddity).
- Nouveau module `functions/src/chat/tools.js` : schémas + exécution sur le cache Firestore (lectures serveur via admin SDK, hors règles). Helpers de filtre/tri **purs et testés** (`functions/test/tools.test.js`).
- `chatOrphee` passe en boucle multi-turn tool-use, garde-fou 5 appels (ADR-009), extraction robuste du texte final, réponse forcée si la limite est atteinte.
- Section « Tools » synchronisée dans le system prompt (`SKILL.md` + `system-prompt.js`).

### Connu / à venir
- `web_research_album` (contexte d'album via web) reste à câbler — confirmation utilisateur + recherche web.
- Les agrégats sont figés au dernier refresh ; seul `monthly_distribution` est filtrable par année (pas de découpe année arbitraire par artiste/genre, absente du cache).

## v1.3.0 — 2026-06-03

### Ce qui change pour Axel
- **L'onglet Stats est entièrement refait.** Fini les 5 graphiques Chart.js basiques : le feed est maintenant un journal narratif en 9 sections — vue d'ensemble, écoutes par année, distribution des notes (3 visualisations au choix), constellation, top artistes, top albums, personnalités, commuting, capsule.
- **Chaque section se révèle au scroll.** Compteurs animés, barres qui poussent, pochettes génératives, graphe de force pour la constellation — tout s'active au moment où ça entre dans le champ de vision.
- **Distribution des notes en 3 modes.** Vitrail (ruban proportionnel), Couronne (rayons SVG), Gravés (champ de pierres par album noté).
- **Toutes les sections sont connectées aux vraies données Firestore.** Les phrases générées, les couvertures, les classements — tout vient du cache `agg_*` calculé par `refreshCache`.
- **Personnalités : muses/météores/ombres avec stats temporelles.** Moyenne d'écoutes/mois pour les muses, pic d'intensité pour les météores, heure moyenne d'écoute pour les ombres. Expand/collapse 3→10 albums par archétype.
- **Commuting : filtre par année.** Des pills "Tout + années" permettent de voir comment les habitudes d'écoute en trajet ont évolué au fil du temps.
- **Top albums avec vraies pochettes.** Les covers Deezer résolues par le backend s'affichent directement (couverture générative en fallback).

### Sous le capot
- `stats.js` entièrement réécrit — orchestration pure, plus de Chart.js
- Nouveaux modules : `stats-util.js` (primitives partagées), `stats-charts.js` (écoutes + grades), `stats-top.js` (top artistes + albums), `stats-preview.js` (constellation + personnalités + aperçus)
- Nouveau fichier CSS : `stats.css` (phone-first)
- Aucun framework, aucune dépendance ajoutée — tout en vanilla DOM + IntersectionObserver + rAF
- Nouveau aggregate `agg_personalites` : calcul serveur des muses/météores/ombres avec stats temporelles (circular mean pour l'heure, monthly_distribution pour le pic)
- `buildCommuting` refactorisé avec `computeSlice()` pour générer `byYear` en un seul passage O(S)
- `buildTopAlbums` déplacé après `enrichCovers` pour inclure les cover_url

### Connu / à venir
- La Capsule temporelle et Découvertes afficheront des données réelles après un prochain refresh
- "Moi-même" absent du top artistes : probablement un nom d'artiste spécifique dans Last.fm — vérifier les données brutes

## v1.2.0 — 2026-06-01

### Ce qui change pour Axel
- **La bibliothèque met les pochettes en avant.** Bandeau marque, ligne de compteur et barre de recherche inline supprimés : l'écran respire et les pochettes prennent toute la place.
- **Pochettes 30 % plus grandes** (mobile et desktop).
- **Recherche en bouton flottant.** Un bouton rond en bas à droite, toujours visible, ouvre une carte avec la recherche et les trois filtres (Note · À noter · Oddity). Re-cliquer le ferme.
- **Légende épurée** sous chaque bac : album · artiste · écoutes, sur une seule ligne centrée.
- **Défilement des bacs plus naturel.** Élan (inertie) au drag souris, puis la pochette la plus proche du centre se cale en douceur ; le tactile garde le momentum natif avec un snap léger.
- **Sections dans des zones discrètes.** Chaque genre s'inscrit dans une carte cernée d'un filet léger pour mieux se distinguer.
- **Espacement symétrique.** Nom de section ↔ pochette ↔ légende resserré et symétrique.
- **Disque CD à l'ouverture.** Une fois l'album detail en place (slide-up), un disque brillant (type CD) sort de moitié derrière la pochette qui se décale légèrement. Drag vers le bas : le disque rentre et la carte redescend. (Jaquette du disque à venir.)
- **Biblio épurée.** Plus de barre de titre en haut (on sait qu'on y est) : le menu passe dans un bouton flottant en bas à gauche, en paire avec la recherche en bas à droite. Les autres vues gardent leur barre + flèche retour.
- **Menu en carte flottante.** Le bouton menu ouvre désormais une petite carte (comme la recherche) au-dessus, au lieu d'un tiroir latéral : plus condensé et plus facile à atteindre au pouce. Les mêmes infos (sections, compteur, nom, réglages) y figurent.
- **Recherche plus fluide.** La saisie ne se relance plus à chaque lettre : la recherche attend une courte pause avant de filtrer, sans bloquer la frappe.
- **« Écouter sur YT Music » ouvre la vraie app.** Sur Android, le bouton passe par un petit relais serveur (`/yt`) qui redirige vers l'app YouTube Music : c'est le seul moyen fiable de lancer l'app native depuis une PWA installée. Repli sur la page web si l'app n'est pas installée. Desktop : page web dans un nouvel onglet.
- **Défilement vertical fluide par-dessus les pochettes.** Monter/descendre la bibliothèque fonctionne même quand le doigt passe sur un bac : un geste vertical fait défiler la page, un geste horizontal feuillette le bac — plus de conflit.
- **Défilement** encore un peu plus freiné.
- **Détail album plus fluide à l'ouverture et au premier défilement.** Plus de scintillement la première fois qu'on fait défiler la fiche, et le slide-up reste net (le contenu lourd — graphe, listes — n'apparaît qu'une fois la carte posée).
- **Feuilletage à plat.** Le bouton « feuillette → » d'un bac ouvre désormais une vue plein écran du genre, en grille (2 pochettes par ligne sur mobile). Flèche retour en haut à gauche pour revenir aux bacs ; clic sur une pochette → détail album. La recherche et les filtres s'appliquent aussi à cette vue.

### Sous le capot
- `library.js` : recherche + lenses extraites dans un panneau flottant persistant (la saisie ne perd plus le focus aux re-renders) ; momentum souris en rAF avec friction puis snap doux ; légende sur une ligne.
- `detail.js` / `detail.css` : disque CD placeholder (dégradés radial + conique) déclenché après le slide-up, qui coulisse de 50 % derrière la pochette ; neutralisation du tap-highlight / sélection sur les pochettes.
- `detail.js` / `detail.css` : **refonte de la fluidité du détail album.** (1) Découplage scroll/animation : `.dt-overlay` n'est plus que la coque (slide + clip arrondi, `overflow:hidden`), un enfant `.dt-scroll` porte le défilement — animer un `transform` sur un scroller à coins arrondis forçait une re-rasterisation de la couche clippée au premier scroll (le scintillement). (2) Suppression des `backdrop-filter: blur()` (scrim + boutons sticky) au profit de fonds translucides solides : un flou recalculé à chaque frame de scroll/animation est le principal coût GPU mobile. (3) Stats (graphe SVG + listes) : le fetch Firestore démarre dès l'ouverture mais le rendu DOM est différé après la fin du slide (~400 ms) pour ne pas reflower la carte en pleine animation. `will-change` reste transitoire (`.animating`) sur la coque seule.
- `nav.js` / `nav.css` : top bar masquée sur la vue library, bouton menu flottant `.nav-fab` (bas-gauche, glassy) qui *toggle* une carte popover `.nav-pop` (remplace le drawer + scrim : fade/scale, click-outside pour fermer) ; rail desktop recalé en `top:0`.
- `library.js` : recherche en debounce 320 ms + garde sur changement de requête + `render` déféré en `requestAnimationFrame` pour ne plus bloquer la frappe.
- `library.css` : `touch-action: pan-x pan-y` sur `.mc-crate` **et** `.mc-rec`. Les restrictions `touch-action` se cumulent en descendant la chaîne d'ancêtres : `pan-x` sur le bac bridait tout son contenu à l'horizontal et bloquait le défilement vertical par-dessus les pochettes. Autoriser les deux axes laisse le navigateur arbitrer par la direction initiale du geste.
- Nouvelle Function publique `ytmusicLink` (europe-west1) + rewrite hosting `/yt` : `302` vers `intent://…` (cf. ADR-014). Depuis une PWA standalone, ni un lien https ni un `intent://` client ne lancent l'app native — seul un 302 serveur vers `intent://` est dispatché par Chrome. Endpoint sans auth justifié : zéro donnée, destination figée, `q` sanitisé → pas d'open-redirect. `detail.js` : Android pointe sur `/yt?q=…` en navigation top-level (ni `_blank` ni `noreferrer`, qui cassent le handoff).
- `library.js` / `library.css` : vue à plat « feuillette » (`.mc-flat`, overlay `position:fixed` z-40 sous le FAB recherche z-41 pour que les filtres restent actifs). Le bouton feuillette appelle `openFlat(genre)` au lieu du scroll horizontal ; grille `auto-fill minmax(150px)` (2/ligne mobile). Tuiles `makeTile()` qui réutilisent l'`IntersectionObserver` partagé pour le lazy-load des pochettes ; `render()` re-synchronise la grille quand un filtre change (`if (flatGenre) renderFlat(shelves)`). Fermeture par flèche retour ou Échap (cède au détail s'il est ouvert).
- `library.css` : pochette en focus alignée sur la taille du detail (186px mobile / 226px desktop), coins à 18px pour un morph sans rupture ; `scroll-snap` mandatory → proximity ; styles FAB + panneau ; `.mc-shelf` en carte « zone » (tokens design system) ; padding vertical des bacs symétrique. Nettoyage du CSS mort (brand row, compteur, toolbar, légende multi-lignes).

---

## v1.1.0 — 2026-05-31

### Ce qui change pour Axel
- **Les vraies pochettes d'albums apparaissent.** Récupérées automatiquement pour les albums notés ou suffisamment écoutés ; les autres gardent le rendu génératif. Aucune action de ta part.
- **Override manuel.** Un album absent du catalogue source reçoit une image fournie à la main qui n'est jamais écrasée — appliqué à *Chronicle of the Chained*.

### Sous le capot
- Pochettes résolues côté serveur via l'API publique Deezer (sans clé) et cachées dans une collection `covers/{album_sur}` — un album cherché (trouvé ou non) n'est jamais re-sollicité (ADR-015).
- `refreshCache` enrichit `cover_url` du set gradeable avant l'écriture des chunks ; cap de 300 résolutions/run pour tenir le timeout. Règle Firestore `covers` (lecture authentifiée, écriture serveur).
- Tests unitaires du module covers (cache, not_found, override manuel, id invalide).

---

## v1.0.1 — 2026-05-31

### Ce qui change pour Axel
- **Bouton « Écouter sur YT Music ».** Dans le détail d'un album, un bouton ouvre YouTube Music directement sur la recherche artiste + album (l'app sur mobile, le web sinon).

### Sous le capot
- Lien profond `music.youtube.com/search?q=…` rendu dans le hero du détail, href construit à l'ouverture. Sur Android, URL `intent://` (package `com.google.android.apps.youtube.music`, `browser_fallback_url`) pour ouvrir l'app native plutôt qu'un navigateur in-app ; fallback `https` ailleurs. Pur frontend, aucun backend ni secret.

---

## v1.0.0 — 2026-05-31

Première version stable. Orphée sort de l'alpha : la bibliothèque, la
navigation et le détail d'album forment un ensemble cohérent et fluide.
Consolide les itérations v0.1.2 → v0.1.4 (jamais taguées).

### Ce qui change pour Axel
- **Une bibliothèque taillée pour la curation.** Par défaut, seuls les albums « à noter » s'affichent (déjà notés ou assez écoutés pour le mériter) ; la longue traîne reste à un filtre ou une recherche près. L'app est nettement plus fluide.
- **Navigation façon Claude pour Android.** L'app ouvre sur la bibliothèque ; un tiroir donne accès à Stats et Orphée, avec ta stat de curation mise en avant. App-bar épurée, chat à composer toujours docké.
- **Le détail d'album est une vraie bottom-sheet.** On la tire par le haut pour la fermer ou la passer en plein écran, son contenu défile comme un écran normal. L'étoile en haut à droite gère le coup de cœur.

### Sous le capot
- Détail album : bottom-sheet ancrée au viewport (`position: fixed`, `dvh`), drag façon Vaul/Material attaché à l'en-tête (le corps défile en natif), fermeture animée unifiée.
- Bibliothèque : porte « gradeable » dans `matches()` qui réduit drastiquement le nombre de cartes rendues ; rendu des pochettes paresseux, focus piloté par le scroll.
- Navigation : `nav.js`/`nav.css` réécrits (tiroir + app-bar), chat docké en hauteur viewport.

---

## v0.1.4-alpha — 2026-05-31

### Ce qui change pour Axel
- **Le détail d'un album est désormais une vraie *bottom-sheet* posée sur la bibliothèque.** Elle s'ouvre sur ~90 % de l'écran, avec une barre de préhension en haut. On tire la carte par le haut (barre ou pochette) pour la fermer d'un glissement vers le bas, ou pour la pousser en plein écran. Le corps de la fiche, lui, défile comme un écran normal — les deux gestes ne se gênent plus. Ouverture rendue plus fluide.
- **Fermer le détail en glissant vers le bas.** Le geste ne recharge plus la page : la fiche glisse vers le bas et disparaît (au-delà d'un petit seuil), sinon elle revient en place. La pochette suit le doigt et le fond s'estompe pendant le glissement. La flèche retour, l'échap et le scrim referment aussi la fiche avec la même animation descendante.
- **Plus de cadre « Ajouter aux coups de cœur »** dans la fiche : l'étoile en haut à droite suffit.

### Sous le capot
- `detail.css` : l'overlay devient une bottom-sheet ancrée en bas (`translateY(100%)` ↔ `.open translateY(0)`, transition de `transform` pilotée par classe — plus de keyframe `dtRise`/`dtSink` dont le `fill-mode: both` écrasait le transform inline et bloquait le slide-down). Barre de préhension `.dt-handle`. Sur desktop (`min-width: 768px`), la fiche reprend la pleine hauteur sans coins arrondis ni barre.
- `detail.css` : **la bottom-sheet est ancrée au viewport (`position: fixed`, hauteurs en `dvh`) et non plus au document de la bibliothèque.** L'`#app-screen` grandit avec la liste (très haute) : en `position: absolute; height: 90%` la fiche était dimensionnée sur tout le document et calée sur son bas, d'où le contenu inatteignable. Corrige aussi le ressenti bancal du drag.
- `detail.js` : geste de drag (façon Vaul/Material) **attaché à l'en-tête uniquement** (`topBar` + `heroEl`), jamais au conteneur de scroll — le corps défile donc nativement et les deux gestes ne se disputent plus le `touchmove`. `touch-action: none` sur l'en-tête. Glissement vers le bas > 110 px → fermeture (la pochette suit le doigt, le fond s'estompe) ; poussée vers le haut > 40 px → plein écran ; sinon retour à la position de repos. L'extension auto en plein écran au défilement a été retirée : elle transitionnait la `height` pendant le scroll et faisait scintiller le contenu au premier défilement vers le bas (la fiche ancrée au viewport laisse déjà tout atteindre par simple scroll).
- `detail.css` : état `.dt-overlay.expanded` (hauteur 100 %, sans rayon) — la fiche est ancrée en bas, elle grandit donc vers le haut. `will-change: transform` pour promouvoir le slide sur le compositeur. Ouverture via double `requestAnimationFrame` (au lieu d'un reflow forcé) et `loadStats` décalé après la frame de slide.
- `detail.js` : fermeture unifiée via `animateDown()` + garde `closing` (retire `.open`, laisse la transition CSS jouer, puis démonte). `popstate`, échap et scrim animent tous la descente. Suppression du bloc favori (`favRow`/`favStar`/`favLabel`) ; `refreshFav` ne pilote plus que l'étoile de l'app-bar.
- `detail.css` : `overscroll-behavior-y: contain` sur `.dt-overlay` (coupe le pull-to-refresh du navigateur) ; suppression des styles morts `.dt-fav`.

---

## v0.1.3-alpha — 2026-05-31

### Ce qui change pour Axel
- **Nouvelle navigation, façon Claude pour Android.** L'app s'ouvre directement sur la bibliothèque. En haut à gauche, un menu (☰) ouvre un tiroir latéral avec Bibliothèque · Stats · Orphée, et en bas ton nom + un engrenage pour les réglages. Sur les autres écrans, la flèche retour (en haut à gauche) ramène à la bibliothèque.
- **Top app-bar épurée** : juste le nom de l'écran. Pas de couleur ni de trait — un léger voile/ombre apparaît seulement quand le contenu passe dessous.
- **Le tiroir met en avant ta curation** : sous « Orphée · curateur musical », une ligne « Gravés dans ta mémoire » avec ton avancement de notation.
- **Plus de barre d'onglets en bas.** L'écran est dégagé.
- **Le chat ressemble à celui de Claude** : la zone de saisie reste toujours affichée en bas, les messages défilent au-dessus, et l'input remonte au-dessus du clavier quand tu écris.

### Sous le capot
- `nav.js` réécrit : top app-bar (contrôle gauche menu/retour + titre de l'écran) + tiroir latéral (`drawer-*`) avec scrim, à la place de l'ancienne barre d'onglets bas/top. Conserve l'événement `orphee:tab`. Le compteur de curation (`stats-summary`) est déplacé dans le tiroir (refresh.js / settings.js continuent de l'alimenter via son `id`). Vraie icône engrenage (Feather) pour les réglages.
- `nav.css` réécrit : `topbar` transparente/sans bordure, voile (`blur` + ombre douce) ajouté via `.scrolled` (toggle au scroll fenêtre). `drawer` slide-in gauche, bloc `drawer-stat`.
- `style.css` : `#view-chat` passe en hauteur `calc(100dvh - 52px)` en flex colonne (messages scrollables, composer docké). `interactive-widget=resizes-content` au viewport pour le clavier. `.mc-brandrow` masquée.
- `library.css` : titre de page `.mc-h1` masqué (désormais dans l'app-bar) ; rail desktop recalé sous l'app-bar (`top: 52px`).

---

## v0.1.2-alpha — 2026-05-30

### Ce qui change pour Axel
- **La bibliothèque se concentre sur les albums « à noter ».** Par défaut, elle n'affiche plus que les albums déjà notés et ceux suffisamment écoutés pour mériter une note (le haut de ton percentile d'écoutes). La longue traîne d'albums à peine écoutés (l'étagère « Autre » à ~7000 titres) ne s'affiche plus par défaut — l'app entière est nettement plus fluide.
- **Rien n'est perdu** : une recherche, ou un filtre explicite (note / favori / pépite), contourne ce tri et redonne accès à toute la bibliothèque.

### Sous le capot
- `library.js` : `matches()` applique une porte « gradeable » (note non nulle **ou** `listen_count >= seuil percentile`) sur la vue par défaut (`all` / `ungraded`, hors recherche/favori/pépite). Réduit drastiquement le nombre de cartes rendues — donc le coût des animations pilotées par le scroll et de la construction DOM. Le seuil réutilise `oddityThreshold` (même percentile que les pépites).
- `library.js` : le compteur d'en-tête reflète désormais le nombre d'albums affichés (`allItems.filter(matches).length`), pas le total brut.

---

## v0.1.1-alpha — 2026-05-30

### Ce qui change pour Axel
- **La bibliothèque est beaucoup plus fluide.** Le « bac à disques » ramait sur les grandes bibliothèques : tout est de nouveau réactif, au chargement comme au scroll et à la recherche.

### Corrigé
- **Les pochettes réapparaissent dans la bibliothèque.** Le rendu paresseux les faisait disparaître (la couche pochette se réduisait à 0 px quand l'art se chargeait). Le détail album n'était pas touché.
- **La barre d'onglets (bas d'écran, mobile) reste collée en bas.** Elle descendait au bout du contenu quand la bibliothèque dépassait la hauteur de l'écran.
- **On voit enfin quel album est sélectionné en scrollant.** Restauration du « bac à disques » fidèle au design : les pochettes se chevauchent, les inactives sont réduites et atténuées, et la pochette centrée se soulève et s'éclaircit. (Avant : cartes plates espacées, juste une ombre — illisible.)
- **La note d'un album s'affiche en barre colorée en bas de la pochette** (pleine largeur), au lieu d'une pastille dans le coin — conforme au design.
- **Le focus ne traîne plus derrière le défilement.** La pochette centrée est toujours nette : c'est le glissement lui-même qui fait le focus (animation pilotée par le scroll, plus de classe JS en retard).
- **On peut maintenant centrer (et donc mettre au point) les pochettes tout à gauche et tout à droite** d'une étagère.

### Sous le capot
- `library.js` : rendu des pochettes **paresseux** (IntersectionObserver). Chaque carte affiche d'abord un dégradé de palette bon marché ; l'art génératif complet (SVG + couches grain/monogramme en `mix-blend-mode`) n'est rendu qu'à l'approche du viewport. Évite de compositer des milliers de couches blend d'un coup.
- `library.js` : drag-to-scroll des étagères via pointer capture sur la crate, au lieu de listeners `pointermove`/`pointerup` sur `window` ajoutés à chaque shelf et jamais retirés — fuite qui s'aggravait à chaque re-render (filtre/recherche).
- `library.css` : couche `.mc-cover` dédiée pour le rendu différé.
- `covers.js` : `renderCover` anticipe les **vraies pochettes** (roadmap v0.2). Si `album.cover_url` existe, affiche l'`<img>` (lazy, `object-fit:cover`) avec dégradé de palette en placeholder et repli automatique sur l'art génératif si l'image échoue. `applyCuration` propage `cover_url`. Reste à peupler la donnée côté Function.
- `library.css` : `.mc-cover` reçoit `width/height:100%` — `renderCover` passe l'élément en `position:relative`, ce qui annulait l'étirement par `inset:0` et réduisait la couche à 0 px.
- `nav.css` : la barre d'onglets phone passe de `position:absolute` (relative à `#app-screen`, qui grandit avec le contenu) à `position:fixed` (collée au viewport). `#app-screen` est `display:none` avant l'auth, donc la barre fixe n'apparaît qu'une fois connecté.
- `library.css` : `.mc-rec` retrouve le chevauchement (`margin-left:-46px`), l'état de repos atténué (`scale(.84)`, `opacity:.68`) et le relief de l'actif (`translateY(-12px)` + ombre + liseré), fidèle au handoff `responsive.jsx`. Desktop : hover qui soulève et pousse les voisines. `.mc-rgrade` redevient une barre 4 px pleine largeur en bas (au lieu d'une pastille d'angle). `.mc-redge` repasse à gauche (16 px) pour vendre la profondeur du chevauchement.
- `library.css` : focus du « bac » désormais **piloté par le scroll** sur mobile (`animation-timeline: view(inline)`, keyframes `mc-crate-focus`) au lieu d'une classe `.active` togglée en JS — le relief suit exactement la position de défilement, sans latence. La classe JS `.active` ne sert plus qu'au z-index (empilement) et à la légende. Repli automatique sur l'ancien comportement si le navigateur ne supporte pas les animations pilotées par le scroll, et respect de `prefers-reduced-motion`.
- `library.css` : padding latéral de la crate passé à `calc(50% - 69px)` (demi-viewport moins demi-pochette) pour que la première et la dernière pochette puissent atteindre le centre.

---

## v0.1.0-alpha — 2026-05-30

### Ce qui change pour Axel
- **Nouvelle bibliothèque "bac à disques"** : les albums sont organisés en étagères horizontales par genre, scrollables. Plus facile de retrouver une époque ou un mood.
- **Pochettes génératives** : chaque album a maintenant une pochette unique, déterministe (même album → même art), générée depuis son nom et son genre. La bibliothèque est enfin visuelle.
- **Navigation en bas de l'écran** (mobile) avec les labels français : Bibliothèque · Stats · Orphée · Réglages. Sur desktop, elle monte en barre top.
- **Détail album redesigné** : hero coloré depuis la palette de la pochette, courbe d'écoutes en SVG émeraude, titres avec mini-barres de progression, section Écho avec mini-pochettes.

### Sous le capot
- `covers.js` : moteur générative vanilla JS — hash déterministe + PRNG Mulberry32, 8 motifs SVG par genre, grain + vignette. Expose `renderCover()`, `coverPalette()`, `coverInitials()`.
- `detail.js` : réécriture complète en DOM dynamique (`dt-*`). Hero color-wash depuis `coverPalette`. Graphique SVG natif (sans Chart.js). Genre/sousgenre conservés dans "Ta note".
- `nav.js` : remplace `tabs.js`. Bottom bar phone / top bar desktop. Labels français. Conserve `orphee:tab` pour compat.
- `library.js` : réécriture bac à disques. `buildShelves()` regroupe par genre, ChipBar 3 chips (Note / À noter / Oddity), rail genre desktop. Drag-to-scroll + caption album actif. Logique data/filter/oddity inchangée.
- `style.css` : nettoyage — suppression des classes dead (old tabs, library grid, detail v1, echo v1, curation modal).
- `detail.css`, `nav.css`, `library.css` : nouveaux fichiers CSS dédiés.

### Connu / à venir
- La section Écho dans le detail affiche des mini-pochettes — les covers écho ne reçoivent pas encore le genre (manque dans `echo[]` Firestore) donc elles tomberont sur le motif `default`. À enrichir côté Function quand l'occasion se présente.
- La vue détail reste testable uniquement en prod (Firebase Auth requis).

---

## v0.0.19-alpha — 2026-05-30

### Ce qui change pour Axel
- **Orphée réagit vraiment après une notation** : plus de "Noté." froid — elle reconnaît le moment, fait une observation sur la bibliothèque, propose une suite
- **Résonances musicales** : Orphée peut faire une association à voix haute quand quelque chose lui rappelle une autre musique. Ce n'est pas une recommandation — c'est un savant qui pense

### Sous le capot
- `SKILL.md` + `system-prompt.js` : deux nouvelles sections "Après une notation" et "Résonances musicales", exemples inclus
- Anti-exemple clarifié : recommandation algo ≠ résonance musicale

---

## v0.0.18-alpha — 2026-05-30

### Ce qui change pour Axel
- **Notation via le chat opérationnelle** : quand Orphée génère un `[GRADE]`, la note est écrite en Firestore et la bibliothèque se met à jour en temps réel
- Idem pour `[FLAG]` (coup de cœur) et `[UNGRADE]` (retrait de note)
- Les tags machine-readable (`[GRADE]`, `[FLAG]`, `[UNGRADE]`, `[NOTE]`, etc.) ne s'affichent plus en clair dans le chat

### Sous le capot
- `tags-parser.js` : `parseTags()` généraliste remplace `parseSuggest()` — strip tous les tags connus, retourne `{cleanText, suggestions, actions}`
- `chatOrphee.js` : retourne `actions` dans la réponse Function
- `prompt-builder.js` : injecte `[id:album_sur]` dans chaque entrée du contexte — Orphée utilise la vraie clé Firestore au lieu de la reconstruire
- `system-prompt.js` : précise qu'`album_sur` doit venir du `[id:...]` du contexte
- `chat.js` : `executeActions()` gère grade / ungrade / flag avec sécurité anti-traversal

---

## v0.0.17-alpha — 2026-05-30

### Ce qui change pour Axel
- **Autosave** : plus de bouton Enregistrer — les réglages se sauvegardent automatiquement 600 ms après le dernier changement (slider ou chip). Un `✓` discret confirme la sauvegarde.
- **Header live** : changer le seuil met à jour le `X / Y · Z%` immédiatement (si la bibliothèque est chargée), sans attendre un refresh.

---

## v0.0.16-alpha — 2026-05-30

### Ce qui change pour Axel
- Settings réorganisés en 3 sections : **Gradeability** (seuil d'écoutes + indicateur X / Y), **Oddity** (notes éligibles + compte), **Synchronisation**
- Indicateur Gradeability : affiche le nb d'albums au-dessus du seuil sur le total (ex : 952 / 9 543) — sans division, pour voir directement le scope
- **% en haut à droite corrigé** : était `tous les albums notés / gradeable` → pouvait dépasser 100 %. Maintenant : `albums notés ET gradeable / gradeable` — toujours ≤ 100 %
- Format header : `248 / 950 · 26%` (notés gradeable / total gradeable · pourcentage)
- PWA : icônes ajoutées — l'app est désormais installable depuis Brave mobile

---

## v0.0.15-alpha — 2026-05-30

### Ce qui change pour Axel
- La bibliothèque est maintenant exhaustive : **tous les albums que tu as écoutés** apparaissent, pas seulement les ~120 de l'onglet Albums du Sheet que tu tenais à la main
- L'année de première écoute est calculée automatiquement depuis tes scrobbles — plus besoin de la renseigner manuellement

### Sous le capot
- `buildLibrary` dérive les albums depuis les clés `album_sur` uniques de `F_Scrobbles` (ADR-014)
- `readSheet.js` ne lit plus l'onglet `Albums`
- `mergeCuration`, `seedCurationFromSheet`, `importIfNeeded` supprimés (dead code depuis ADR-013)
- `first_listen_y` calculé depuis le `uts` minimal des scrobbles par album
- Hotfix : `artist`/`album` convertis en string au chargement (certaines cellules Sheet sont numériques → crash `.trim()`)

---

## v0.0.14-alpha — 2026-05-30

### Ce qui change pour Axel
- Chip "Tous" supprimé — désélectionner le chip actif revient à "tout afficher"
- Nouveau chip "None" pour filtrer les albums sans note
- Chat : focus automatique sur la zone de saisie en arrivant sur l'onglet (curseur + clavier mobile)

---

## v0.0.13-alpha — 2026-05-30

### Ce qui change pour Axel
- Header Orphée affiche maintenant "curateur musical" et les stats
- Le % de notation est calculé sur les albums au-dessus de ton seuil d'écoute oddity — pas sur les 9000 au total

### Sous le capot
- `buildOddities` retourne `albums_above_threshold` (albums ≥ seuil percentile)
- `agg_global` stocke ce chiffre au refresh pour que le frontend l'utilise
- Les stats étaient masquées par `display:none` (visible seulement à ≥ 600 px) — corrigé

---

## v0.0.12-alpha — 2026-05-29

### Ce qui change pour Axel
- Barre d'onglets sans emoji, labels anglais (Library, Stats, Settings)
- Tab "Orphée" en couleur accent — ressort dans la barre
- Tab bar ne se rétrécit plus au scroll (hauteur fixe 44 px)

---

## v0.0.11-alpha — 2026-05-29

### Ce qui change pour Axel
- Les suggestions d'Orphée s'affichent en chips cliquables — plus de tags `[SUGGEST: ...]` en clair dans le chat

### Sous le capot
- `tags-parser.js` : extraction des tags `[SUGGEST]` côté Function, texte propre retourné au client
- `chat.js` : `renderSuggestions()` + listener délégué sur les chips, `sendText()` réutilisable

---

## v0.0.10-alpha — 2026-05-29

### Ce qui change pour Axel
- En-tête épuré : dot · "Orphée" · description uniquement — plus de bouton actualiser ni d'avatar dans le header
- Onglet Settings : ton email et le bouton "Se déconnecter" en bas, section Synchronisation pour l'actualisation

---

## v0.0.9-alpha — 2026-05-29

### Ce qui change pour Axel
- **Zone de chat corrigée** : plus de double cadre visible autour de la saisie
- **Onglets cohérents** : même police, même taille (12,5 px), même gradient d'activation que les autres apps
- **PWA standalone** : Orphée s'ouvre maintenant en plein écran comme Ariane (manifest.json ajouté)

### Sous le capot
- `.k-inputwrap .chat-input` : reset border/background supprime la double zone imbriquée
- `manifest.json` + `<link rel="manifest">` : display standalone activé
- `theme-color` aligné sur `--bg` Orphée (#0a0c0b)

---

## v0.0.8-alpha — 2026-05-29

### Ce qui change pour Axel
- **En-tête harmonisé** : dot · wordmark "Orphée" vert · résumé stats. Style Odyssée cohérent avec Zagreus et Ariane.
- **Bulles de chat asymétriques** : rayon 18/4 px (Orphée à gauche, toi à droite) — cohérent avec le design system
- **Ta bulle** : fond vert-dim + bordure accent — tu te distingues clairement d'Orphée
- **Composer modernisé** : saisie en capsule arrondie + bouton envoi circulaire vert

### Sous le capot
- `kit.css` intégré (k-header, k-tabs, k-composer, k-chip…)
- Header restructuré : `.topbar-left/.topbar-right` → `.k-header` (dot · k-name · k-sub · k-meta)
- Tabs : `.tab` + `.k-tab` — règle `is-active::after` pour soulignement accent Orphée
- Chat input : `.chat-input-area` + `.k-composer` — textarea + k-send circulaire
- `.chat-msg` : `border-radius: 18px 18px 18px 4px` ; `.chat-msg--user` : `accent-dim` + `18px 18px 4px 18px`

---

## v0.0.7-alpha — 2026-05-29

### Sous le capot
- Design system Odyssée partagé : `design-system.css` intégré, `data-app="orphee"` sur body
- Tokens alignés : sync dot → `var(--ok)` / `var(--warn)`, ombres → `var(--shadow-*)`, chips → `var(--accent-dim)`

---

## v0.0.6-alpha — 2026-05-29

### Ce qui change pour Axel
- **Onglet Orphée activé** : tu peux maintenant écrire à Orphée. Elle connaît ta bibliothèque (écoutes, distribution des notes, top artistes et albums, Oddity, albums non notés) et répond dans son style.

### Sous le capot
- Function `chatOrphee` (europe-west1, Sonnet) : system prompt issu de SKILL.md, contexte dynamique `[CONTEXTE]` injecté à chaque message, historique 20 messages depuis Firestore.
- `refreshCache` calcule et écrit désormais `agg_oddities` et `agg_unrated_top` dans le cache.
- UI chat mobile-first : messages bulles, auto-resize textarea, persistence dans `users/{uid}/chats/main/messages/`.

### Connu / à venir
- Pas de parsing de tags pour l'instant (step 10) : les tags `[GRADE]`, `[SUGGEST]` etc. apparaissent en texte brut si Orphée en génère.
- Pas de tools (step 11) : Orphée répond avec le seul contexte injecté, sans pouvoir interroger la bibliothèque en détail.
- **Smoke tests à effectuer après déploiement** : ouvrir l'onglet 💬, envoyer "bonjour", vérifier qu'Orphée répond dans son ton. Lancer un refresh d'abord si le cache est vide.

---

## v0.0.5-alpha — 2026-05-26

### Ce qui change pour Axel
- **Fiche détail album plein écran** (clic sur une carte) : métadonnées, notation en autosave, graphe des écoutes par mois, top titres. Retour via le bouton du téléphone.
- **Écho** — le compagnon temporel : pour un album, ce que tu écoutais à la même période (autour de son pic d'écoute, ±3 mois). Compagnons triés par intensité, **barre relative** aux écoutes de la période, cliquables pour naviguer d'écho en écho. Messages poétiques quand il n'y a pas d'écho.

### Sous le capot
- `cache/album_stats/{album_sur}` (notés OU ≥10 écoutes) : monthly_distribution, top_tracks, écho (pic + fenêtre via histogramme mensuel) + `echo_ref`.
- Fiche détail = surface unique (la modale de notation est absorbée).
- Tests purs : `buildAlbumStats`, `buildEcho`, `monthKey`.

### Connu / à venir
- `echo_window_months` / `echo_top_n` en Settings (v0.2) ; Écho multi-périodes (v0.2).

---

## v0.0.4-alpha — 2026-05-26

### Ce qui change pour Axel
- **Oddity** : repère tes albums beaucoup écoutés mais peu notés. Onglet ⚙️ Settings avec curseur de seuil (percentile) + choix des notes éligibles, **aperçu live** du nombre d'albums concernés. Filtre **✦ Oddity** dans la bibliothèque.

### Sous le capot
- Calcul Oddity **côté client** sur la donnée déjà chargée → réglage interactif sans refresh (cohérent ADR-012).
- Réglages dans `users/{uid}/settings/oddity` ; défauts percentile 90, éligibles [Skip, Nice].
- Onglet Settings activé (`settings.js`).

### Connu / à venir
- Onglet Oddity dédié avec liste d'albums dynamique (v0.2).
- `agg_oddities` backend quand le chat en aura besoin.

---

## v0.0.3-alpha — 2026-05-26

### Ce qui change pour Axel
- **Noter et classer depuis l'app** : clic sur une carte → panneau pour la note (Skip → Adored), le coup de cœur, le genre/sous-genre et un commentaire. Enregistrement immédiat, modif visible aussitôt (et après rechargement).
- Échelle de note simplifiée à **5 niveaux** : Skip · Nice · Great · Classic · Adored.
- Filtre note en **chips** (Tous + 5 notes), code couleur cohérent entre cartes, stats et panneau.

### Sous le capot
- Curation possédée par l'app dans Firestore (`users/{uid}/grades/`), éditée in-app ; le Sheet n'en est plus la source (ADR-013).
- Import one-shot des notes + classif existantes du Sheet (normalisation 0-4 → 1-5).
- `refreshCache` fusionne identité album (Sheet) + curation (Firestore). Biblio superpose la curation live par-dessus le cache.
- Référentiel partagé `refdata.js` (notes, couleurs, genres) — source unique.

---

## v0.0.2-alpha — 2026-05-25

### Ce qui change pour Axel
- **Onglet Stats** avec 5 graphiques interactifs : distribution des notes, genres (donut, par écoutes), écoutes par année, top 10 artistes, top 10 albums.
- Bascule entre onglets 🎵 Bibliothèque ↔ 📊 Stats ; charts responsives.

### Sous le capot
- `refreshCache` calcule `cache/agg_stats` (distribution notes 0-4, écoutes/an, genres) ; top artistes/albums réutilisés.
- Charts via Chart.js (CDN épinglé). Infra d'onglets (`tabs.js`).
- Harnais de tests étendu (`buildStats`), gate predeploy lint + tests.

---

## v0.0.1-alpha — 2026-05-25

### Ce qui change pour Axel
- **Vue bibliothèque** : grille de tes albums. Par défaut « Notés & favoris » (triés par note puis écoutes) ; bascule « Tous les albums » pour parcourir l'ensemble (~9 500), du plus écouté au moins écouté.
- Carte d'album : titre, artiste, écoutes, libellé de note (Adored → OK) et genre.
- **Refresh manuel** depuis la Sheet « Music Library DB » via le bouton Actualiser (écoutes/albums/notés).

### Sous le capot
- Function `refreshCache` : agrégats `agg_global`, top artistes/albums, et index bibliothèque chunké (`agg_library_curated` + `agg_library_all_*`).
- Auth Google obligatoire ; cache Firestore en lecture seule via l'app.
- Hosting en `no-cache` + cleanup policy Artifact Registry (déploiements fiables).

### Connu / à venir
- Filtres et recherche (étape 4).
- Note affichée sur l'échelle source 0-4 ; normalisation 0-5 et notation depuis l'app en étape 6.
- Mojibake d'accents sur certains titres (donnée source, à traiter en amont).

---

## v0.1 — en cours

### Ce qui reste
- **Contexte d'album via web** : Orphée raconte l'histoire créative d'un album en cherchant sur le web, toujours avec confirmation préalable (`web_research_album`)

*(Les tools `query_albums` / `query_listens` / `query_album_detail` sont livrés en v1.4.0.)*
