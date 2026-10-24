# Orphée — Produit & processus métier

**Statut :** à jour de v2.21.0 (né rétro-documentation de v0.1) · **Dernière mise à jour :** 2026-10-10

> ✅ **Ce document fait foi** (le repo Git est la source de vérité unique). Notion
> est un espace de réflexion **non-autoritaire** (wiki « Orphée ») ; une idée qui
> durcit est *promue* ici. **PM-gate : tout changement fonctionnel ou conceptuel
> passe par le PM (Axel) avant édition.** Voir [ADR-024](./ADR.md) et la section
> Gouvernance de [`CLAUDE.md`](../CLAUDE.md).

Ce document décrit Orphée **du point de vue métier**, indépendamment de la
technique. Il est la couche la plus stable de la documentation : l'intention
produit, les acteurs, et les processus métier changent rarement.

> **Ordre de lecture de la doc.** Ce document (intention + processus) →
> [`MODELE.md`](./MODELE.md) (modèle conceptuel de données) →
> [`SPEC.md`](./SPEC.md) (spécification technique, qui doit *s'inscrire* dans
> les deux premiers) → [`ADR.md`](./ADR.md) (décisions). Voir
> [ADR-017](./ADR.md#adr-017).

---

## 1. Intention

Orphée est le **curateur musical personnel d'Axel**. Il l'aide à :

1. **Curer** — noter, classer, décrire ses albums (le geste de base) ;
2. **Se reconnaître** — comprendre *qui il est* à travers ce qu'il écoute et
   *quand* il l'écoute : une synthèse (le portrait), et une **timeline des
   humeurs** saison par saison ;
3. **Montrer** — exposer cette identité, d'abord la synthèse (« qui je suis »),
   puis, pour le curieux, les albums adorés qui se cachent derrière.

**Les chiffres ne sont pas une fin : ils servent le portrait.** On montre la
*synthèse* des écoutes, jamais leur détail brut. *(Vision v3, validée par le PM
le 2026-10-08, livrée de v2.2.0 à v2.21.0 : « Moi » est l'écran d'accueil ;
restent la notification et la fréquence d'un album, cf.
[`ROADMAP.md`](./ROADMAP.md).)*

Orphée n'est pas un moteur de recommandation. La valeur est dans
l'**introspection sur l'existant**, pas dans la découverte de nouveauté
(voir [ADR-008](./ADR.md#adr-008)).

## 2. Périmètre (invariants produit)

- **Le pain point est de comprendre la bibliothèque actuelle**, pas d'en
  découvrir une autre. Pas de reco « à la Spotify ».
- **Les notations vivent dans l'app.** L'app fait foi ; aucune écriture retour
  vers la source d'ingestion (voir [ADR-006](./ADR.md#adr-006)).
- **Pas d'invention.** Quand Orphée ne sait pas, il le dit.
- **Pas de jugement sur les goûts.** Tout choix musical est légitime.
- **Orphée décrit la musique, pas la vie d'Axel.** Une humeur est *musicale*
  (exploration, intensité…) et calculée sur des règles vérifiables ; seul Axel
  donne un sens de vie à une période (il **nomme ses chapitres**).

## 3. La personnalité Orphée

Orphée est un **personnage**, pas un assistant générique : savant musical
introverti, élégant, pointu sans être pédant, qui ne juge jamais les goûts
d'Axel (voir [ADR-007](./ADR.md#adr-007)). La définition complète du
personnage — ton, philosophie, anti-exemples, format de réponse — est dans
[`SKILL.md`](./SKILL.md), qui est aussi la **source du system prompt** de
l'agent.

Au niveau métier, Orphée est modélisé comme un **acteur-service** : il agit sur
la bibliothèque **au nom d'Axel** (comme un proxy), jamais de sa propre
initiative. Voir [`MODELE.md` § Agent](./MODELE.md#agent--orphée) et
[ADR-021](./ADR.md#adr-021).

---

## 4. Acteurs

| Acteur | Rôle |
|---|---|
| **Axel** (Utilisateur) | Possède la bibliothèque et la curation. **Seul à décider d'une note.** |
| **Orphée** (Agent) | Lit, éclaire, propose. N'exécute une action de curation que sur **intention explicite** d'Axel, et alors comme son **proxy**. Ne crée jamais de faits, ne modifie jamais la référence. |
| **Système** (Ingestion & Calcul) | Synchro Last.fm + recalcul de tout le dérivé à la demande. Produit les faits et tout le dérivé. |
| **Invité** (un ami d'Axel) | Le temps d'un partage (1 h, révocable, PM-28) : **lit** la curation et le dérivé d'Axel, n'écrit jamais, ne parle pas à Orphée (IM-8). |

---

## 5. Processus métier

Légende d'état : ✅ implémenté · 🟡 partiel · ⛔ modélisé, non implémenté en v0.1.

### 5.1 Cycle de vie de la donnée

| ID | Processus | Acteur | Déclencheur | Effet (postcondition) | Règle métier | État |
|---|---|---|---|---|---|---|
| **PM-01** | Importer les écoutes | Axel → Système | Bouton « Actualiser » (début du refresh) | Les écoutes Last.fm postérieures à la dernière connue sont ajoutées | Faits **immuables**, *append-only* : un scrobble supprimé/édité sur Last.fm reste tel quel ; une même écoute n'est jamais comptée deux fois ; à la demande uniquement ([ADR-034](./ADR.md#adr-034)). L'historique a été migré une fois depuis l'ancienne Google Sheet (v2.16 : clés d'album abîmées par la Sheet réparées, notes posées sur une clé abîmée perdues — décision PM) ; la Sheet n'est **plus lue du tout** ([ADR-044](./ADR.md#adr-044)) | ✅ v2.16.0 (Sheet abandonnée v2.17.0) |
| **PM-29** | Rattacher chaque écoute à son vrai album | Système (au nom d'Axel) ; Axel arbitre (PM-32) | « Actualiser » | Un titre écouté hors de sa page d'album (single, titre seul, sans album, album d'un autre artiste) compte dans son album ; les éditions (Deluxe, Remastered…) d'un album n'en font qu'un. La fiche d'un album liste ce qui lui est rattaché, avec « Revoir ces titres dans Qualité » : chaque titre rangé d'office s'y tranche comme les autres — **Garder ici** ou **Remettre à part** sur son libellé d'origine (v2.32.0 ; « Séparer » a quitté la fiche). Ces rattachements d'office restent **silencieux** : ni « à trancher », ni dans le taux de santé | **Un titre appartient au premier album studio de son artiste qui le contient** ; sans album studio (face B, bande originale, remix, live), il reste où il est. **Un live est une version à part**, que le mot soit dans le titre ou dans l'album reçu (« Live at River Plate », « MTV Unplugged », sessions acoustiques — confirmé le 2026-10-13) ; un titre trouvé seulement **dans un coffret** qui porte le nom de l'album (après la 20ᵉ piste d'une sortie de plus de 30 titres : *Imagine*, piste 32 sur 59) n'est jamais « sûr ». Source : **MusicBrainz**, puis Last.fm en second recours ; **l'arbitrage d'Axel prime toujours**. Une proposition (sûre ou tranchée par Axel) ne change le rattachement **qu'une fois appliquée** par Axel (PM-31, par lot) ; l'écoute d'origine n'est jamais modifiée ; la note d'un album qui se vide est **reportée** sur l'album d'arrivée ([ADR-045](./ADR.md#adr-045), [ADR-046](./ADR.md#adr-046)) | ✅ v2.21.0 · MusicBrainz, arbitrage et application v2.30.0 |
| **PM-02** | Actualiser la bibliothèque | Axel → Système | Bouton « Actualiser » (Réglages, ou la pastille en haut de l'écran) | Synchro Last.fm (PM-01), puis faits + curation recroisés → tout le dérivé régénéré : albums canoniques (PM-29), pochettes et photos d'artistes, portrait, années, paradoxes | **À la demande uniquement** ([ADR-005](./ADR.md#adr-005)) ; pas d'écriture retour vers la source ([ADR-006](./ADR.md#adr-006)) | ✅ |

### 5.2 Consultation

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-03** | Parcourir la bibliothèque | Axel | Onglet Bibliothèque | Des **bacs** comme chez un disquaire : **Mes CD** (PM-38, tout à gauche, v2.43.0), **Mis de côté** (PM-35, à gauche, v2.25.1), **Adorés** — l'écran s'ouvre toujours sur Adorés —, puis un bac par genre (genre effectif), puis **Paradoxes** (v2.12.0), chacun avec ses albums **notés ou très écoutés** (seuil « très écouté » de Réglages › Avancé, rétabli en v2.13.3 ; la loupe cherche dans tout), rangés **par note** par défaut (v2.42.1 ; avant, les plus écoutés devant) (en bas à gauche, sous le pouce, la bascule **« Albums | Artistes »** et la loupe, PM-37 — v2.43.3). On change de bac en glissant de côté (les noms défilent avec le doigt ; toucher le bac courant liste tous les bacs). chaque bac est une **pile de tranches** (chacune avec la vignette de sa pochette, d'où dépasse une petite galette si Axel a l'album en CD, PM-38) ; un toucher ouvre la fiche album. **Tri** au choix, par trois pictos discrets : écoutes, **note** (Adoré → Zappé, non notés à la fin, à note égale les plus écoutés — v2.39.0, remplace « artiste A→Z »), album A→Z. Une **loupe** cherche dans toute la bibliothèque | Lecture seule ; la note s'édite dans la fiche album. Pas de filtres : bacs + recherche suffisent ([ADR-039](./ADR.md#adr-039)) | ✅ v2.11.0 |
| **PM-04** | Consulter une fiche album | Axel *(ou l'invité, en lecture)* | Ouvre un album | Détail : pochette, métadonnées, « Écouter » (PM-06), ta note / genre / description, **titre phare** en or s'il tient l'album (v2.34.0), **écoutes par année** (barres, comme la fiche artiste — v2.49.0), top titres, ce qui y est **rattaché** (PM-29, avec « Corriger dans Qualité »), Écho ; à venir ([ADR-046](./ADR.md#adr-046)) : la **liste de ses titres** (MusicBrainz) et un lien MusicBrainz | Lecture seule (sauf la curation, cf. 5.3) | ✅ |
| **PM-05** | ~~Explorer les statistiques~~ | — | — | **Retiré en v2.12.0** ([ADR-040](./ADR.md#adr-040)) : ce qui servait (chiffres clés, top artistes, moments, écoutes par…) vit dans « Moi » ; le reste (distribution des notes, top albums, constellation, personnalités, capsule, découvertes) est supprimé | — | ⛔ retiré |
| **PM-06** | Écouter un album | Axel | Bouton « Écouter » | Ouvre YouTube Music | Externe ; aucune donnée lue ni écrite ([ADR-016](./ADR.md#adr-016)) | ✅ |

### 5.3 Curation — le cœur éditable

Toutes ces actions écrivent **une seule** entité : la **Curation** d'un album
(voir [`MODELE.md`](./MODELE.md)). Elles sont accessibles **soit** directement
dans la fiche album, **soit** en demandant à Orphée de les faire (proxy).

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-07** | Noter un album (1-5) | Axel *(ou Orphée en proxy)* | Sélecteur de note (fiche) **ou** demande à Orphée | Note posée | **Axel décide** ; Orphée ne note jamais de sa propre initiative | ✅ |
| **PM-08** | Marquer un coup de cœur | Axel *(ou Orphée en proxy)* | Étoile (fiche) **ou** demande à Orphée | Coup de cœur basculé | Booléen indépendant de la note | ✅ → **retiré (v2.6.0)** : fusionné dans la note 5 (Adoré). Plus d'étoile ni de commande pour Orphée ; Axel migre ses coups de cœur depuis Réglages (liste exacte, puis confirmation) |
| **PM-09** | Classifier (genre / sous-genre) | Axel | Un bouton résume le genre (replié) ; le toucher déplie de grosses **tuiles** de genre à sa couleur, puis des **pastilles** de sous-genre, qui se replient seules une fois le choix complet (fiche, v2.26.0) ; tant que l'album n'a pas son genre, celui de l'artiste est indiqué (« hérité de l'artiste », tuile en pointillés) | Couple (genre, sous-genre) posé, avec onde, petite gerbe de confettis et sa part de territoire (« rejoint ton territoire Rock · 22 % ») ; un genre à un seul sous-genre (Jazz, Blues, Podcast) pose les deux d'un toucher ; retoucher retire | Le référentiel genres est une donnée de référence ([ADR-013](./ADR.md#adr-013)) | ✅ |
| **PM-10** | Décrire un album | Axel *(ou Orphée en proxy)* | Champ description (fiche) **ou** demande à Orphée | Description mise à jour | **Sans toucher la note** | ✅ |
| **PM-11** | Retirer la note | Axel *(ou Orphée en proxy)* | Fiche (note remise à vide) **ou** demande à Orphée | Note retirée | — | ✅ |
| **PM-16** | Régler la segmentation Oddity | Axel | Réglages › Avancé (percentile, notes éligibles) | Paramètres enregistrés ; aperçu immédiat | Valeurs par défaut suffisantes (90ᵉ percentile, Zappé/Sympa) : réglage replié | ✅ (replié v2.9.0) |

> **Vocabulaire** — à ne pas confondre :
> - **Classifier** = ranger un album dans un *genre / sous-genre*. C'est de la
>   **curation** (Axel le fait).
> - **Classer / rang** = position calculée par *nombre d'écoutes*. C'est un
>   **indicateur dérivé** de l'album, qui ne dépend d'aucune curation.

> **Garde-fou proxy (v2.0 ✅).** Quand Orphée agit en proxy (PM-07, PM-08,
> PM-10, PM-11), elle **ne fabrique jamais** une curation invalide : une demande
> portant sur un **album inconnu** ou une **note hors barème** est **rejetée**,
> et Orphée **se corrige** ou **le signale** à Axel plutôt que d'écrire du faux.
> Renforce « Pas d'invention » (§ 2) et l'invariant **IM-7** (proxy fidèle).
> Détail technique : [`SPEC.md` § 7.4](./SPEC.md).

### 5.3 bis Identité — vision v3 (validée 2026-10-08, livrée sauf mention)

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-18** | Voir qui tu es | Axel (ou l'invité, PM-28) | Écran d'accueil « Moi » | **Voix : 2ᵉ personne partout** (Orphée parle à Axel — « Tes années », « Ta journée », « Qui tu es », « Tes paradoxes »… ; v2.44.0). Dans l'ordre : **ces jours-ci** (l'accroche en tête, PM-39) · **toi** (photo, nom Last.fm, écoutes · albums · depuis) · **qui tu es** (netteté, la **barre pleine** des 3 genres dominants + « Autres » avec leurs parts, puis une **carte par genre dominant**, teintée de sa couleur : nom + sous-genre, les **visages** — photos Deezer — de ses 3 artistes phares superposés → fiche artiste, et une ligne-signature ; le % n'est plus répété sur la carte, il vit dans la barre — v2.44.0) · **une question** sur la pile « Mis de côté » (PM-36, Axel seul) · **à faire** (le geste, Axel seul) · **Tes années** (PM-19) · **Ce que tes notes racontent** (chapitre groupant, v2.44.0 : **Ce que tu adores** — « adores » en or —, **Tes paradoxes** — « paradoxes » en bleu, sans note par album —, et **Un seul titre** inchangé : l'album bof, le titre énorme, « N× la moyenne », sa part de l'album, ouvre la fiche) · **Tes écoutes par…** (par année · mois · semaine · **Journée**) : une phrase qui change par vue ; en année / mois / semaine, **toucher une barre révèle l'album du créneau** (emblématique, tappable → fiche). En **Journée** (refonte v2.46.0) : plus de total ni de chips de moments — la **journée type** en barres, **ses deux pics (matin, soir) surlignés** au vert clair, et sous le graphe la **signature de chaque créneau** (matin · soir · nuit) = les **genres et artistes** qu'on y écoute **plus qu'au reste de la journée** (sur-représentation, [ADR-050](./ADR.md#adr-050)). Chaque bloc : un titre + une ligne qui dit ce qu'il montre. Adorés/paradoxes : **3 exemples** + « Voir les N › » vers le bac (PM-03) | Synthèse seulement, jamais le détail des écoutes ; tout chiffre est réel ([ADR-028](./ADR.md#adr-028)) | ✅ v2.12.0 — refonte v2.44.0 |
| **PM-39** | Voir ce qui me prend en ce moment | Axel (ou l'invité, PM-28) | **Accroche en tête de « Moi »**, avant les focales | **« Ces jours-ci »** : tes **30 derniers jours** d'écoutes, promus en première chose qu'on voit. Une phrase d'accroche (« Une phase *Rock* — *Twenty One Pilots* en boucle »), le volume (écoutes sur 30 jours), un **mini-graphe** des jours, puis les **artistes du moment** classés par écoutes avec un badge **« ×N habitude »** (leur sur-représentation face à ta moyenne), et l'**album qui tourne**. N'appartient à aucune focale : c'est le vivant, le récent, mis en avant (instinct d'Axel validé le 2026-10-15) | Synthèse seulement ; tout chiffre réel ([ADR-028](./ADR.md#adr-028)) ; dérivé par sur-représentation ([ADR-050](./ADR.md#adr-050)) ; snapshot daté de la dernière actualisation, jamais la curation (IM-6) | ⛔ v2.45.0 |
| **PM-19** | Parcourir mes années | Axel | Section « Mes années » de « Moi » | **En tête, les genres dans le temps** (v2.33.0) : un titre qui se calcule (« Du rap au rock. », ou « Toujours rock. »), une colonne par trimestre — en haut une **bande de volume** (écoutes du trimestre), dessous la **part de tes 3 genres** les plus écoutés sur toute la période (les mêmes partout, à leur couleur), le reste en « Autres » ; la **légende** dit la période entière (parts, écoutes) ou, un trimestre touché, ce trimestre ; repliés dessous (« Voir les sous-genres »), les **3 sous-genres** d'un genre choisi, en nuances de sa couleur, même principe. Un trimestre touché est mis en avant **dans les deux graphiques** ; toucher ailleurs le retire. Parts sur les écoutes classées ; trimestres de moins de 150 écoutes omis. Puis **une ligne par année** (v2.15.0), la plus récente en haut, les **5 dernières** visibles (v2.18.0) puis une pastille pour déplier les autres : l'**année en grand**, la pochette de l'**album qui illustre l'année** (liseré couleur d'humeur ; v2.31.6 : l'album de l'artiste qui explose, du sous-genre qui monte ou du style dominant — celui que dit le titre, pas le n°1 tous genres confondus) ; puis l'**humeur et son écart** à tes habitudes ; l'album ; et en petit **ce qui distingue l'année** (v2.19.0), les écoutes, la **découverte de l'année** et les chapitres. Ce qui distingue l'année, face aux années d'avant : un artiste qui explose (« **Fulgurance** : Twenty One Pilots » — ≥ 3 % des écoutes et ≥ 4× sa meilleure année passée), sinon un sous-genre plus présent que d'habitude (« Plus de rap · cloud »), sinon « Rock · alternative, comme d'hab » ; sans humeur, c'est lui qui vient en titre. Une **année blanche** (presque sans écoutes) n'est jamais affichée. Toucher une année ouvre ses **trimestres** (humeur, albums, récit, chapitre). Le volume d'écoutes (« Écoutes par… » : ans / mois / semaine / heure) reste visible dans « Moi » — l'effet waouh est voulu | Humeur = segmentation dérivée sur règles vérifiables, jamais une interprétation de vie. **Comparée à soi** (v2.14.0) : l'humeur dit ce qui s'écarte nettement de **tes** habitudes (« plus de rap que d'habitude »), chiffres à l'appui ; un trimestre sans écart net est « dans tes habitudes », sans étiquette. Un trimestre incomplet (en cours, ou données arrêtées) est signalé | ✅ v2.19.0 (frise v2.3.0, années v2.15.0, comparée à soi v2.14.0) |
| **PM-22** | Qualifier rapidement | Axel | Carte « À qualifier » à l'ouverture de « Moi » : quelques albums choisis au bon moment — très écoutés récemment et non notés (« pendant que c'est chaud »), anciennes notes à réévaluer, trimestre qui s'achève | Note posée d'un tap (1-5), sans ouvrir la fiche ; **« Plus tard »** met l'album de côté (PM-34, v2.25.0) | La sélection est **dérivée** et ne décide rien ; Axel seul note (IM-7). Suppose des écoutes fraîches → dépend de la synchro Last.fm (PM-01) | 🟡 v2.4.0 — « pendant que c'est chaud » et « toujours Adoré ? » ; « trimestre qui s'achève » avec les chapitres |
| **PM-23** | Voir l'impact de sa curation | Système → Axel | Après chaque note / classification / chapitre | Retour immédiat de ce qui a changé dans le portrait (« rejoint tes adorés », « entre dans tes artistes signatures », « ton T3 est net ») + **netteté du portrait** : part des écoutes couverte par des albums notés et classés | Le geste de curation doit se sentir utile : noter rend le portrait plus net | ✅ v2.4.0 |
| **PM-24** | Être relancé (optionnel) | Système → Axel | Notification hebdomadaire (« 3 albums t'attendent »), **seulement si Axel l'active** | Ouvre la carte « À qualifier » | Opt-in, désactivable ; reste « à la demande » côté données (ADR-005) | ⛔ plus tard |
| **PM-26** | Consulter une fiche artiste | Axel | Toucher un artiste (avatars de « Moi », carte « Classer », nom dans la fiche album) | Fiche par-dessus l'écran : photo, écoutes cumulées, genre de l'artiste (modifiable), ses albums (ouvrent leur fiche), puis **À part** : les libellés qui ne sont pas des albums — singles et leurs faces B, remix, lives, BO — en **liste** et non en pochettes — on ne mélange pas les concepts —, chacun nommé pour ce qu'il est (« Single · 2 écoutes ») ; le toucher le cherche sur YouTube Music (v2.36.0) ; sous l'en-tête, la **courbe de ses années** ; après « À part », **Souvent avec** : les 4 artistes le plus souvent enchaînés avec lui dans une même séance (≥ 10 séances), le toucher ouvre sa fiche (v2.41.0), et un bouton **« Explorer »** ouvre l'archipel **« Tes mondes »** (PM-40) ; trimestres où il a compté | Lecture + classification d'artiste (E8) ; « retour » revient à l'artiste précédent, puis ferme la fiche ; une séance = des écoutes à moins de 30 min d'écart | ✅ v2.8.0 |
| **PM-40** | Explorer mes mondes d'écoute | Axel (ou l'invité, PM-28) | Fiche artiste › **« Explorer »** (sous « Souvent avec », PM-26) | **« Tes mondes »** : un **archipel** des groupes d'artistes que tu **enchaînes ensemble** (clusters de co-écoute, pas de genre). Chaque monde une **île** (taille = écoutes) ; la **distance** entre îles = combien tu bascules de l'une à l'autre (pas de traits — le poids rapproche) ; la **couleur** = le genre dominant, donc les mondes qui **traversent les genres** se voient. **Pince pour zoomer** : dézoomé, les mondes ; zoomé dans un monde, les **portraits** (photos Deezer, sinon initiales) et les **noms d'artistes** apparaissent, nets (rendus à l'échelle de l'écran, jamais mis à l'échelle en bitmap — v2.48.1). **Tap sur un monde** → la liste de ses membres (chacun ouvre sa fiche). Ouvert depuis l'artiste X, l'archipel s'ouvre **centré sur le monde de X** (sa boule entourée), d'où l'on dézoome vers toute la forêt. Remplace la constellation égocentrée (v2.47.0). Réglages figés : 100 artistes · lien ≥ 20 séances · granularité 1,5 ; le bouton n'apparaît que si l'artiste appartient à un monde | Lecture seule, rien d'inventé ([ADR-028](./ADR.md#adr-028)) ; dérivé de segmentation ([ADR-052](./ADR.md#adr-052)), jamais une source (IM-5), n'altère pas la curation (IM-6) ; genre nommé/coloré live (ADR-031) ; l'invité y a droit (IM-8) | ⛔ v2.48.0 |
| **PM-27** | Voir mes paradoxes | Axel | Section « Mes paradoxes » de « Moi » | Les albums très écoutés mais notés bas (segmentation Oddity), du plus écouté au moins ; « voir tout » déplie la liste sur place | Une facette d'identité, pas un jugement : dérivée, ne touche jamais la note (IM-6) | ✅ v2.9.0 |
| **PM-28** | Partager ma bibliothèque | Axel → un ami (l'**invité**) | Réglages › « Partager ma bibliothèque » : un QR (ou un lien) valable **1 h** | L'invité scanne et entre **sans compte** : il voit « Moi » (sans « À faire ») et la Bibliothèque, les fiches en lecture (notes, descriptions, paradoxes, chapitres, CD — PM-38) ; sur une fiche, il peut **essayer** la note et le genre, avec les animations, sans que rien ne soit enregistré (v2.24.1) ; il voit aussi l'onglet **Qualité en démo** (v2.32.1) : il part de l'état réel d'Axel et peut tout y faire — trancher, passer, appliquer, annuler — sur une copie qui disparaît avec la page, sans jamais rien écrire (pas de vérification MusicBrainz) ; c'est la vitrine pour montrer l'app ; un bandeau dit chez qui il est et le temps restant. Le Salon est grisé : un exemple de conversation **sans aucune donnée d'Axel**, saisie fermée | Lecture seule, bornée dans le temps, coupable à tout moment ; jamais la conversation ni Orphée (IM-8, [ADR-042](./ADR.md#adr-042)) | ✅ v2.13.0 |
| **PM-21** | Classifier un artiste | Axel | Passe de classification (artistes les plus écoutés d'abord), suggestion pré-remplie depuis les tags Last.fm | Couple (genre, sous-genre) posé pour l'artiste, hérité par ses albums non classés | La suggestion n'est **jamais** écrite sans validation ; la classification d'album prime | 🟡 v2.7.0 — import unique depuis la Sheet (fait) + passe guidée ; suggestions Last.fm à venir (la clé API est en place depuis v2.16.0) |
| **PM-20** | Nommer un chapitre | Orphée, à la demande d'Axel ; puis Axel | « Raconte-moi » sur un trimestre (PM-25) : Orphée **nomme le chapitre** (2 à 6 mots) et son récit en devient la **description** ; « Modifier le chapitre » permet ensuite à Axel de changer titre et description, de prolonger au trimestre suivant ou de supprimer | Chapitre posé sur **un ou plusieurs trimestres consécutifs**, gardé : titre et description s'affichent à chaque visite du trimestre | **Curation** d'Axel, écrite par Orphée **seulement à sa demande** (IM-7, [ADR-047](./ADR.md#adr-047)) ; le titre parle de **musique**, jamais de la vie ; plus de création à la main. L'invité lit le titre, jamais la description (IM-8) | ✅ v2.5.0 · v2.29.0 nommé par Orphée |
| **PM-25** | Se faire raconter une période | Axel → Orphée | « Raconte-moi ce trimestre » sur la carte d'un trimestre | Orphée raconte le trimestre en 2-3 phrases, avec sa voix, et nomme son chapitre (PM-20) ; le récit est gardé comme description du chapitre | **Uniquement à partir des faits calculés** ; décrit la musique, jamais la vie ; mis en cache tant que les faits ne changent pas ([ADR-037](./ADR.md#adr-037)) | ✅ v2.5.0 |

### 5.3 ter Qualité des données (validée 2026-10-11, livrée v2.23.0 → v2.30.0)

Un **onglet Qualité** (entre Bibliothèque et Le Salon, **propriétaire seul**)
rend visible ce que la machine corrige et laisse Axel trancher. La v1 couvre
le rattachement aux albums (PM-29) ; d'autres contrôles s'y ajouteront
(genres manquants, featurings, doublons d'artistes). Navigation et
« retour » du téléphone comme dans le reste de l'app : « retour » ferme le
panneau ouvert, puis revient à l'accueil de Qualité ([ADR-046](./ADR.md#adr-046)).

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-31** | Voir la qualité de ses données et l'appliquer | Axel | Onglet Qualité | Un **taux de santé** (trait plein : aujourd'hui ; pointillé : une fois appliqué), puis un **processus en trois étapes**, l'une sous l'autre, chacune avec son bouton : **① à trancher** (pointillés ambre, « Trancher › » ouvre la revue, PM-32) → **② prêts** (pointillés verts : corrections sûres et décisions « déplacer », « Appliquer › ») → **✓ dans ta bibliothèque** (plein : ce qui est appliqué ; toucher → les **lots** datés, chacun ou chaque titre annulable). Puis les titres déjà au bon endroit. « Appliquer » montre d'abord ce qui va changer (nombre, **albums notés qui se vident** et le report de leur note) puis range et actualise | **Rien ne s'applique sans Axel** : ni MusicBrainz ni un « Actualiser » ne déplacent un titre ; les nouvelles corrections attendent le lot suivant. Une note n'est jamais perdue : reportée sur l'album d'arrivée (s'il en a déjà une, Axel choisit) ; l'annulation remet tout, notes comprises ([ADR-046](./ADR.md#adr-046)) | ✅ v2.30.0 |
| **PM-32** | Arbitrer un rattachement | Axel | Une carte « à vérifier », ou un titre des listes | Carte par carte : le titre, son album actuel, l'album proposé avec sa **preuve** (pochette, année, place du titre, et si c'est le même enregistrement ou une autre version) ; toucher l'album ouvre sa fiche (PM-04). chaque album porte son bouton — **Garder ici** (et **Garder tout**) sur l'album actuel, **Déplacer ici** sur la proposition (v2.23.10) — puis **Chercher un autre album…** ; **« Je ne sais pas · passer »** met le titre de côté sans rien décider : il revient en fin de revue (« Les revoir », ou la tuile « passés ») et part dans l'export pour qu'on le regarde ensemble (v2.27.0) ; **« Garder tout »** garde d'un coup tous les titres reçus sous ce libellé (un double album, une compilation écoutée telle quelle, v2.23.6). Une carte qui vient d'arriver **ignore les touchers une fraction de seconde** : un toucher en rythme ne tranche plus la suivante sans l'avoir lue (v2.35.0). **À revoir** (tuile ambre, v2.35.0) : les titres **déjà rangés** que le moteur met en doute (version live rangée sur un album studio, coffret au nom de l'album) — souvent un « Déplacer ici » touché trop vite — en cartes : l'album d'aujourd'hui (**Garder ici** : confirmé, il ne revient plus) face au libellé d'origine (**Remettre à part** : le rangement est défait, annulable) ; **Plus tard** le saute | **L'arbitrage prime** sur MusicBrainz, Last.fm et le libellé reçu, et survit à toute actualisation ; il remplace « Séparer » (v2.32.0 : les séparations existantes deviennent des corrections « remettre à part », annulables en lot) | 🟡 v2.23.0 — décisions enregistrées, prises en compte à la bascule ; preuve : pochette, année, le titre entre ses voisins tels que MusicBrainz les écrit, lien vers l'édition sur MusicBrainz et « Écouter » (v2.23.3) |
| **PM-33** | Lancer la vérification | Axel | Onglet Qualité, tant qu'il reste des titres à interroger | MusicBrainz est interrogé pour les titres en attente, les plus écoutés d'abord ; la progression s'affiche ; on peut relancer pour continuer | À la demande uniquement ([ADR-005](./ADR.md#adr-005)) ; 1 requête par seconde (règle MusicBrainz) : l'amorçage prend plusieurs lancements, ensuite quelques secondes. Seuls l'artiste et le titre sont envoyés | ✅ v2.22.0 (dans Qualité depuis v2.23.0) |

### 5.3 quater Mis de côté (validée 2026-10-11, livrée v2.25.0)

Parfois Axel n'est pas prêt à noter un album : il veut l'écouter posément et y
revenir au bon moment. La **pile « Mis de côté »** garde ces albums. Chaque
onglet garde son rôle : **Moi** pose une question à la fois, la
**Bibliothèque** montre la pile, la **fiche album** est l'endroit où l'on agit
et où l'on note.

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-34** | Mettre un album de côté | Axel | « Plus tard » (marque-page) sur la carte « À faire » (PM-22), ou le marque-page de la fiche album | L'album entre dans la pile, daté du jour ; le marque-page de la fiche se remplit. Dans la fiche, une fois l'album mis de côté : **« Envie forte »** (étoile) le fait passer devant. Retoucher le marque-page le retire | Curation d'Axel (E11). **Noter l'album le sort de la pile** (annulable). « Plus tard » ≠ « Passer » : passer reporte seulement dans « À faire » | ✅ v2.25.0 |
| **PM-35** | Retrouver la pile | Axel | Bac **« Mis de côté »** de la Bibliothèque (PM-03), juste à gauche d'Adorés : la Bibliothèque s'ouvre toujours sur Adorés, la pile est à un glissement | Un bac comme les autres, sans badge ni bouton : d'abord les envies fortes (étoile), puis les albums **prêts à noter**, puis **à découvrir** ; en bas, sous « Ils dorment depuis plus de 3 mois », les **oubliés**, ternis. Toucher un album ouvre sa fiche, où l'on note | Lecture seule dans le bac ; on agit dans la fiche. Les signaux sont dérivés des écoutes et ne décident rien (IM-6). **L'invité ne voit pas ce bac** (intention personnelle, comme « À faire ») | ✅ v2.25.0 |
| **PM-36** | Être questionné sur la pile | Système → Axel | Bloc « Une question » de « Moi » | **Une seule question à la fois**, jamais une liste ; le bloc disparaît s'il n'y a rien à demander. Prêt à noter : « Tu as réécouté *X* 4 jours depuis que tu l'as mis de côté. Tu le notes ? » → **Ouvrir** (la fiche) ou **Pas maintenant**. Oublié : « *X* dort depuis 4 mois. Toujours envie ? » → **Garder** (la date repart du jour) ou **Sortir** (annulable) | Moi reste un récap : on n'y note pas, on ouvre la fiche. Une question écartée ne revient pas avant **un mois**. Les envies fortes passent d'abord | ✅ v2.25.0 |
| **PM-37** | Parcourir mes artistes | Axel (ou l'invité, PM-28) | Bibliothèque › bascule **« Albums \| Artistes »** en bas à gauche, avec la loupe, l'onglet choisi en vert (v2.43.3 ; l'appli rouvre sur le dernier choisi) | Pas une liste alphabétique : des **récits**, dans la grammaire de « Moi » (titre, ligne, 3 visages, « Voir les N ») — **Tes piliers** (≥ 10 écoutes sur au moins les 2/3 des années actives), **Découvertes** (arrivés ces 2 dernières années, ≥ 60 écoutes), **Retrouvailles** (beaucoup avant, un creux, de retour), **Fulgurances** (une année ≥ 60 % de leurs écoutes, puis presque rien), **Perdus de vue** (≥ 200 écoutes, presque rien ces 2 dernières années) ; un artiste n'apparaît que dans un récit, 9 au plus par récit, toujours un multiple de 3 — 3, 6 ou 9, des rangées pleines (v2.42.1) ; les Découvertes n'ont pas de courbe (deux barres ne disent rien, leur présence suffit). **Ta musique** (v2.42.0) : si Axel a donné son **nom d'artiste** (Réglages › Compte), ce nom sort des récits et de « Par genre » et ouvre la vue avec **La BO de ta campagne** — son visage, ses écoutes depuis la première année, sa courbe, puis ses 5 titres les plus écoutés, chacun cherché sur YouTube Music ; toucher l'en-tête ouvre sa fiche. Sous chaque visage, la **courbe de ses années** (la forme dit le récit) et une ligne courte (« 2018, son année »). **Par genre** vient juste sous « Tes piliers » (pastilles, les 9 plus écoutés — ramenés à 3 ou 6 s'il en manque —, tous visibles, sans dépliage, v2.41.0) ; en bas, « Tous les artistes (N) › » → la loupe, qui montre les artistes trouvés au-dessus des albums. Toucher un visage ouvre la fiche artiste (PM-26) | Années blanches exclues ; rien d'inventé : chaque récit est une règle vérifiable sur les écoutes ; le genre d'un artiste est celui qu'Axel lui a donné, sinon celui de ses albums les plus écoutés (curation live) | ✅ v2.40.0 |
| **PM-38** | Marquer mes CD | Axel (l'invité voit, PM-28) | Fiche album : toucher la **pochette** ou la pastille **« Dans tes CD »** ; Bibliothèque : bac **« Mes CD »** › **« Trier mes CD »** | Album en CD : à l'ouverture de la fiche, le disque sort de la pochette (l'animation existante prend un sens) et la pastille « Dans tes CD » est allumée. Sinon le disque reste rangé, invisible, et la pastille est grisée. Toucher la pochette ou la pastille ajoute ou retire le CD (le disque sort ou rentre, vibration, « Annuler »). Dans la Bibliothèque, une petite galette dépasse de la vignette des albums en CD ; le bac **« Mes CD »**, tout à gauche (la Bibliothèque s'ouvre toujours sur Adorés), les rassemble, rangés par note. **« Trier mes CD »** : on parcourt un bac et chaque toucher sur une tranche coche ou décoche le CD (une coche remplace le nombre d'écoutes), sans ouvrir la fiche ; un bandeau compte les CD du bac ; « Terminé » en sort | Seuls les albums de la bibliothèque (écoutés via Last.fm) se marquent ; posséder n'est pas noter (aucun effet sur la note ni sur les dérivés). Invité : voit les galettes, le bac et la pastille d'un album en CD, ne marque rien (IM-8) | ✅ v2.43.0 |

### 5.4 Dialogue avec Orphée

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-12** | Dialoguer | Axel ↔ Orphée | Message dans le chat | Réponse ; contexte de bibliothèque injecté ; Orphée peut fouiller via ses outils | Outils **en lecture seule** ; garde-fou de recherches ([ADR-009](./ADR.md#adr-009)) | ✅ |
| **PM-13** | Obtenir le contexte culturel d'un album | Axel ↔ Orphée | Mention d'un album / commande dédiée | Récit narratif (histoire, contexte créatif, réception) | **Connaissance interne seulement** ; pas d'invention. La recherche web est **prévue mais non active** ([ADR-011](./ADR.md#adr-011)) | 🟡 |
| **PM-14** | Recevoir suggestions / focus / filtre | Orphée → app | Réponse d'Orphée | Suggestions cliquables (chips) ; focus / filtre d'écran | Les suggestions sont actives ; focus/filtre sont prévus | 🟡 |
| **PM-15** | Mémoriser (notes mémoire, préférences) | Orphée *(au nom d'Axel)* | Au fil du dialogue | *(aucun en v0.1 — non persisté)* | Cible : mémoire de l'agent, distincte de la curation | ⛔ |

### 5.5 Accès

| ID | Processus | Acteur | Déclencheur | Effet | Règle | État |
|---|---|---|---|---|---|---|
| **PM-17** | S'authentifier | Axel | Google Sign-In | Session ouverte ; accès à son espace | Auth obligatoire ; **un seul propriétaire** : tout autre compte Google est refusé, par les règles et par chaque fonction serveur ([ADR-041](./ADR.md#adr-041)). L'invité entre sans compte, par le lien d'un partage (PM-28) | ✅ (propriétaire unique v2.12.1) |
| **PM-30** | Exporter pour analyse | Axel | Réglages › Synchronisation › « Exporter pour analyse » | Un fichier JSON léger : ses albums (artiste, titre, genre, note) et ses écoutes (date + album) | Axel seul ; ni descriptions, ni conversation, ni récits ; les **titres de morceaux** n'y figurent que pour le **diagnostic du rattachement** (PM-29, propositions et preuves) et la **revue Qualité** (décisions, titres passés — v2.27.0) ; lecture seule | ✅ v2.20.0 (diagnostic v2.21.2) |

---

## 6. Invariants métier transverses

- **Le Système possède les faits, l'Utilisateur possède la curation, l'Agent
  ne décide ni n'altère jamais les faits.**
- **Orphée agit toujours comme proxy d'Axel** sur la curation, jamais de sa
  propre initiative.
- **L'app fait foi** pour les notations ; la source d'ingestion n'est jamais
  réécrite.

Ces invariants sont déclinés formellement dans
[`MODELE.md` § Invariants](./MODELE.md#invariants-de-modèle) et tracés en
décisions dans [`ADR.md`](./ADR.md).
