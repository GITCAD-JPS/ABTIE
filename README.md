# Cave à vin

**→ [Ouvrir l'application](https://gitcad-jps.github.io/ABTIE/)**

Application web pour tenir l'inventaire de la cave : les bouteilles, leurs
emplacements, les photos d'étiquettes et le journal des dégustations.

Elle remplace le classeur `data/cave_a_vins.xlsx`, dont elle reprend le
contenu au premier lancement : 119 vins, 188 bouteilles en cave, 102 photos
d'étiquettes et 21 dégustations.

## Ce qu'elle fait

**Depuis le téléphone, en deux gestes**
- Ajouter un vin en photographiant l'étiquette
- Signaler une bouteille bue en la photographiant, l'application cherche laquelle c'est dans la cave

**La cave**
- Recherche instantanée sur le nom, le producteur, la région, le cépage, la provenance et les notes
- Filtres d'un geste toujours visibles par couleur et par emplacement, panneau complet pour le reste
- Tri par nom, producteur, région, millésime, quantité ou note
- Chaque vin affiche sa photo d'étiquette, sa couleur, sa répartition entre les trois emplacements et ce qui reste à vérifier

**Les accords mets et vins**
- Choisir un plat parmi seize familles, obtenir les bouteilles en cave qui lui conviennent, classées
- Température de service et raison de l'accord pour chaque bouteille
- Les accords tirés de vos propres notes passent devant les suggestions génériques
- Sur la fiche d'un vin, la liste des plats qui lui vont

**Une fiche par vin**
- Stock détaillé par emplacement, avec un plus et un moins pour corriger sur place
- Ouvrir une bouteille : le stock baisse, la dégustation est datée, notée et commentée, et la fiche passe en terminé sur la dernière bouteille
- Ajouter des bouteilles, les déplacer d'un emplacement à l'autre, modifier ou supprimer la fiche
- Photo d'étiquette agrandissable, historique des dégustations du vin

**Le journal des dégustations**
- Les bouteilles bues à la maison et les vins goûtés ailleurs sur une même ligne du temps
- Recherche et filtres, ajout et modification d'une entrée

**Les statistiques**
- Bouteilles, références, vins terminés, dégustations et note moyenne
- Répartition par couleur, emplacement, région, producteur, millésime et provenance
- Dégustations par mois et par contexte
- Raccourci vers les fiches dont la quantité, l'emplacement ou la couleur reste à confirmer

**Le reste**
- Fonctionne hors ligne, lecture d'étiquette comprise, installable sur l'écran d'accueil
- Thème clair, sombre ou celui du système
- Sauvegarde complète en JSON, export des vins et des dégustations en CSV lisible par Excel
- Aucune donnée n'est envoyée en ligne : tout reste dans le navigateur

## Utiliser l'application

L'application est publiée sur GitHub Pages par le workflow
`.github/workflows/pages.yml`, à chaque poussée sur `main` :

**https://gitcad-jps.github.io/ABTIE/**

Sur le téléphone, ouvrir cette adresse puis « Ajouter à l'écran d'accueil »
installe l'application comme une application native, avec son icône. Une fois
les photos mises en cache, elle reste consultable sans réseau, ce qui est
utile au sous-sol.

Les données restent dans le navigateur de chaque appareil et ne suivent donc
pas de l'un à l'autre : voir « Où sont les données » plus bas.

### Activer la publication, une fois pour toutes

Créer un site GitHub Pages exige les droits d'administration du dépôt, que
GitHub ne donne jamais au jeton automatique des workflows. Cette étape ne peut
donc pas être automatisée : dans **Settings → Pages → Source**, choisir
**GitHub Actions**. Le workflow prend ensuite le relais et republie seul.

### En local

Le site est entièrement statique, sans installation ni compilation, mais il
faut le servir par un serveur web : le navigateur refuse de charger des
modules JavaScript depuis un fichier ouvert directement.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans un navigateur.

## Lire une étiquette

Les deux parcours photo proposent de lire l'étiquette pour préremplir la fiche
ou reconnaître la bouteille. La reconnaissance tourne entièrement dans le
navigateur : aucune photo ne quitte l'appareil, et aucune requête ne part vers
un site tiers.

Le moteur, Tesseract, est **embarqué** sous `assets/vendor/tesseract` plutôt
que chargé depuis un CDN. Cela coûte une dizaine de méga-octets dans le dépôt,
en échange de deux choses qui comptent ici : la lecture fonctionne **hors
ligne**, ce qui est le cas ordinaire dans une cave, et elle ne dépend d'aucun
hébergeur susceptible de bloquer ces requêtes. Le détail des fichiers et leur
provenance sont dans `assets/vendor/tesseract/PROVENANCE.md`, et
`tools/preparer_moteur.py` régénère le tout depuis npm.

Le moteur n'est pas préchargé : la plupart des consultations ne lisent aucune
étiquette. Il est chargé à la première lecture, puis gardé en cache par le
service worker, y compris pour l'usage hors ligne.

Ce que donne la lecture, mesuré sur des étiquettes de cette cave :

| Qualité de la photo | Résultat |
| --- | --- |
| Étiquette nette et cadrée | Texte exact, millésime, degré et volume repris tels quels |
| Photo de biais, contrastée | Quelques lettres fautives, le bon vin ressort quand même en tête |
| Vignette de moins de 300 px | Inexploitable |

Autrement dit : une photo prise de près avec un téléphone fonctionne, une
vignette récupérée ailleurs non. Quand la lecture échoue, le parcours continue
sans elle : la photo est conservée et la recherche manuelle prend le relais.
Un délai maximum garantit que la main est rendue, et un bouton permet de
renoncer sans attendre.

## Plusieurs appareils

L'application est locale d'abord : elle lit et écrit dans le navigateur,
s'affiche instantanément et fonctionne sans réseau. Quand la page tourne chez
un hébergeur qui offre un stockage partagé, `assets/js/synchro.js` s'y branche
en plus et les appareils se retrouvent. Deux iPhones ouvrant la même adresse
voient alors la même cave, à quelques secondes près.

Chaque vin et chaque dégustation est un document distinct. C'est ce qui permet
à deux appareils de modifier la cave en même temps sans s'écraser : seuls des
changements portant sur la même fiche entrent en conflit, et le dernier écrit
l'emporte. Un document unique pour toute la cave aurait fait perdre le travail
de l'un dès que l'autre touchait à quoi que ce soit.

Chaque fiche porte la date à laquelle un appareil l'a modifiée, et non celle de
son envoi. C'est elle qui départage deux appareils : celui qui retrouve le
réseau après deux jours ne passe pas pour le plus à jour. Elle règle aussi
l'arrivée d'un appareil supplémentaire, qui part du même classeur, avec les
mêmes identifiants, et n'a donc rien à apporter : en se branchant, il n'envoie
que les fiches qu'il a réellement touchées depuis, et reçoit le reste. L'ordre
dans lequel les appareils se connectent n'a ainsi plus d'importance.

Les photos prises depuis l'application suivent le même chemin : déposées chez
l'hébergeur quand c'est possible, gardées dans le navigateur sinon. Le dépôt de
fichiers n'est ouvert qu'à qui peut modifier la page, et un appareil qui ne l'a
pas verrait donc ses vins arriver sans étiquette chez les autres. Dans ce cas
seulement, une copie réduite de la photo part avec la cave, dans une collection
à part pour ne pas alourdir les instantanés. Une quinzaine de kilo-octets
suffisent à reconnaître une étiquette, et l'originale reste dans le navigateur
qui l'a prise.

Une modification faite hors réseau est conservée et envoyée à la reprise. Les
réglages indiquent où en est la synchronisation, et distinguent quatre
situations : active, en attente de réseau, impossible ici faute de stockage
partagé, ou refusée à ce visiteur parce qu'il n'est pas connecté à son compte.
Ce dernier cas est le piège : l'application sait partager, c'est l'hébergeur
qui ferme la porte, et annoncer « cet appareil seulement » ferait chercher au
mauvais endroit. La page se redessine quand l'état change, le partage se
branchant une seconde après l'affichage.

Le partage ne se limite pas aux appareils d'une seule personne. Chez un
hébergeur qui distingue les niveaux d'accès, la cave n'est lisible et
modifiable que par celles et ceux à qui le droit de modifier a été donné.
Recevoir le lien ne suffit pas.

Sans stockage partagé, rien ne change : la cave reste dans le navigateur et se
transporte par une sauvegarde.

## Où sont les données

Au premier lancement, l'application lit `data/seed.json` et le recopie dans le
navigateur. Ensuite, tout est lu et écrit localement :

| Emplacement | Contenu |
| --- | --- |
| `localStorage` | Les fiches des vins, le journal des dégustations, les préférences |
| `IndexedDB` | Les photos prises depuis l'application |
| `data/photos/` | Les 102 photos d'étiquettes issues du classeur |
| `data/seed.json` | Le point de départ, jamais modifié par l'application |

Sans stockage partagé, les données vivent dans un seul navigateur et ne
suivent pas d'un appareil à l'autre. Le bouton « Sauvegarde complète » des
réglages télécharge un fichier JSON contenant les fiches et les photos
ajoutées, que « Restaurer une sauvegarde » relit sur un autre appareil. Cette
sauvegarde reste utile même avec la synchronisation, pour garder une copie
hors de l'application.

Un cadre d'artefact interdit à la page de déclencher un téléchargement : le
lien y reste inerte, sans la moindre erreur, et l'application annoncerait une
sauvegarde qui n'a pas eu lieu. `assets/js/export.js` passe donc par la remise
de fichier de l'hébergeur quand elle existe, et par le lien ordinaire partout
ailleurs. Dans les deux cas, le message de confirmation n'apparaît qu'une fois
le fichier réellement remis, et un refus ne dit rien du tout.

Vider les données de site du navigateur efface la cave. Une sauvegarde
régulière est la seule protection.

## Réimporter le classeur

Le script d'import relit le classeur Excel et régénère `data/seed.json` ainsi
que les photos. Il sert si le classeur est mis à jour, ou pour repartir de
zéro.

```bash
pip install openpyxl
python3 tools/xlsx_to_seed.py            # lit data/cave_a_vins.xlsx
python3 tools/xlsx_to_seed.py autre.xlsx # ou un autre classeur
```

Le script attend deux feuilles, « Cave à vins » et « Vins bus (hors cave) »,
avec les colonnes du classeur d'origine. Les photos d'étiquettes ne sont pas
dans des cellules mais ancrées à droite de chaque ligne : le script lit ces
ancres pour rattacher chaque image à son vin.

Deux traitements méritent d'être signalés, parce qu'ils ajoutent de
l'information que le classeur n'avait pas.

**La couleur** n'existe pas dans le classeur. Elle est déduite du cépage, de
l'appellation et du nom du vin. Cinq vins ne portent ni cépage ni appellation
exploitable et restent marqués « à préciser », visibles d'un coup dans
l'application. Trois bourgognes déclinés en rouge et en blanc ont été tranchés
d'après la photo de leur étiquette, ce que le code documente à l'endroit
concerné.

**L'emplacement précis** était mélangé aux notes de dégustation, sous la forme
« Emplacement précis : armoire à vin, 2ème rangée haute ». Le script l'isole
dans son propre champ et laisse le reste de la note intact.

Les incohérences du classeur, elles, ne sont pas corrigées : quand la quantité
ne correspond pas à la somme des emplacements, ou qu'un vin est en cave sans
bouteille, l'application le signale et laisse trancher. Personne d'autre que
le propriétaire de la cave ne sait laquelle des deux valeurs est la bonne.

## Organisation du code

```
.github/workflows/         publication automatique sur GitHub Pages
index.html                 coquille de la page et jeu d'icônes SVG
manifest.webmanifest       description de l'application installable
sw.js                      service worker : mise en cache pour l'hors ligne
assets/css/styles.css      feuille de style unique, mobile d'abord
assets/vendor/tesseract/   moteur de reconnaissance embarqué, hors ligne compris
assets/js/
  app.js                   routage par ancre, navigation, démarrage
  model.js                 normalisation, champs dérivés, filtres, statistiques
  store.js                 état, persistance, actions métier
  synchro.js               partage de la cave entre appareils, quand il existe
  accords.js               profils de cépages et appellations, accords mets et vins
  etiquette.js             lecture d'une photo d'étiquette, rapprochement avec la cave
  photos.js                photos prises dans l'application (IndexedDB)
  export.js                sauvegarde JSON, exports CSV
  formulaires.js           formulaires et boîtes de dialogue de saisie
  composants.js            fragments d'interface partagés
  dom.js                   aides pour construire le DOM
  theme.js                 thème clair, sombre ou système
  vues/                    une vue par onglet, la fiche d'un vin, les parcours photo
data/                      classeur d'origine, jeu de données initial, photos
tools/xlsx_to_seed.py      import du classeur vers data/
```

Le code n'utilise aucune bibliothèque ni étape de compilation : des modules
JavaScript natifs, servis tels quels. Modifier un fichier et recharger la page
suffit. Après une modification, il faut incrémenter `VERSION` dans `sw.js`
pour que les navigateurs déjà visités récupèrent la nouvelle version.
