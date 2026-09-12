# Cave à vin

Application web pour tenir l'inventaire de la cave : les bouteilles, leurs
emplacements, les photos d'étiquettes et le journal des dégustations.

Elle remplace le classeur `data/cave_a_vins.xlsx`, dont elle reprend le
contenu au premier lancement : 119 vins, 188 bouteilles en cave, 102 photos
d'étiquettes et 21 dégustations.

## Ce qu'elle fait

**La cave**
- Recherche instantanée sur le nom, le producteur, la région, le cépage, la provenance et les notes
- Filtres par couleur, emplacement, région, provenance et statut
- Tri par nom, producteur, région, millésime, quantité ou note
- Chaque vin affiche sa photo d'étiquette, sa couleur, sa répartition entre les trois emplacements et ce qui reste à vérifier

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
- Fonctionne hors ligne, installable sur l'écran d'accueil du téléphone
- Thème clair, sombre ou celui du système
- Sauvegarde complète en JSON, export des vins et des dégustations en CSV lisible par Excel
- Aucune donnée n'est envoyée en ligne : tout reste dans le navigateur

## Utiliser l'application

L'application est un site statique, sans installation ni compilation. Il faut
seulement la servir par un serveur web, car le navigateur refuse de charger
des modules JavaScript depuis un fichier ouvert directement.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans un navigateur.

### Publier sur GitHub Pages

Dans les réglages du dépôt, section Pages, choisir la branche à publier et le
dossier racine. Le fichier `.nojekyll` est déjà présent pour que les dossiers
soient servis tels quels. L'adresse obtenue peut ensuite être ajoutée à
l'écran d'accueil du téléphone, ce qui installe l'application comme une
application native.

## Où sont les données

Au premier lancement, l'application lit `data/seed.json` et le recopie dans le
navigateur. Ensuite, tout est lu et écrit localement :

| Emplacement | Contenu |
| --- | --- |
| `localStorage` | Les fiches des vins, le journal des dégustations, les préférences |
| `IndexedDB` | Les photos prises depuis l'application |
| `data/photos/` | Les 102 photos d'étiquettes issues du classeur |
| `data/seed.json` | Le point de départ, jamais modifié par l'application |

Comme les données vivent dans un seul navigateur, elles ne suivent pas d'un
appareil à l'autre. Le bouton « Sauvegarde complète » des réglages télécharge
un fichier JSON contenant les fiches et les photos ajoutées, que « Restaurer
une sauvegarde » relit sur un autre appareil.

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
index.html                 coquille de la page et jeu d'icônes SVG
manifest.webmanifest       description de l'application installable
sw.js                      service worker : mise en cache pour l'hors ligne
assets/css/styles.css      feuille de style unique, mobile d'abord
assets/js/
  app.js                   routage par ancre, navigation, démarrage
  model.js                 normalisation, champs dérivés, filtres, statistiques
  store.js                 état, persistance, actions métier
  photos.js                photos prises dans l'application (IndexedDB)
  export.js                sauvegarde JSON, exports CSV
  formulaires.js           formulaires et boîtes de dialogue de saisie
  composants.js            fragments d'interface partagés
  dom.js                   aides pour construire le DOM
  theme.js                 thème clair, sombre ou système
  vues/                    une vue par onglet, plus la fiche d'un vin
data/                      classeur d'origine, jeu de données initial, photos
tools/xlsx_to_seed.py      import du classeur vers data/
```

Le code n'utilise aucune bibliothèque ni étape de compilation : des modules
JavaScript natifs, servis tels quels. Modifier un fichier et recharger la page
suffit. Après une modification, il faut incrémenter `VERSION` dans `sw.js`
pour que les navigateurs déjà visités récupèrent la nouvelle version.
