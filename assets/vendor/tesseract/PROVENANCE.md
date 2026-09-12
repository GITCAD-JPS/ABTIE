# Moteur de reconnaissance de texte

Fichiers repris tels quels de Tesseract.js, sous licence Apache 2.0 (voir
`LICENSE`). Ils sont embarqués plutôt que chargés depuis un CDN pour deux
raisons : la lecture d'étiquette fonctionne alors hors ligne, dans la cave,
et elle ne dépend plus d'un hébergeur qui pourrait bloquer ces requêtes.

| Fichier | Paquet npm | Version |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | `tesseract.js` | 5.1.1 |
| `tesseract-core-simd-lstm.wasm.js` | `tesseract.js-core` | 5.x, variante SIMD |
| `tesseract-core-lstm.wasm.js` | `tesseract.js-core` | 5.x, repli sans SIMD |
| `langues/fra.traineddata.gz.json` | `@tesseract.js-data/fra` | 1.0.0, variante `4.0.0_best_int` |
| `langues/ita.traineddata.gz.json` | `@tesseract.js-data/ita` | 1.0.0, variante `4.0.0_best_int` |

Les données de langue sont la variante compacte `best_int`. Mesurée sur des
étiquettes de cette cave, elle donne exactement le même texte que la variante
standard pour 2,3 Mo au lieu de 12,6.

Deux traitements sont appliqués, tous deux par `tools/preparer_moteur.py`.

**Les données de langue sont encodées en base64 dans du JSON.** Un
`.traineddata.gz` brut est un binaire que certains hébergeurs refusent de
servir, n'acceptant que les types web usuels. L'encodage coûte un tiers de
volume, se décode à la volée et ne change rien au contenu.

**`worker.min.js` porte un correctif d'une ligne.** tesseract.js sait recevoir
les octets d'une langue plutôt qu'un chemin, ce dont on a besoin ici, mais au
moment d'initialiser le moteur il reprend ces octets comme nom de langue au
lieu du code, et l'initialisation échoue. Le défaut est présent au moins de la
version 5.1.1 à la 7.0.0. Le script vérifie que le motif corrigé apparaît
exactement une fois et s'arrête sinon, pour qu'une mise à jour de la
bibliothèque ne passe pas inaperçue.

Pour mettre à jour :

```bash
npm install tesseract.js@5.1.1 @tesseract.js-data/fra @tesseract.js-data/ita
python3 tools/preparer_moteur.py chemin/vers/node_modules
```
