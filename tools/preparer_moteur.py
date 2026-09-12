#!/usr/bin/env python3
"""Prépare le moteur de reconnaissance embarqué sous assets/vendor/tesseract.

Le moteur est embarqué plutôt que chargé depuis un CDN pour deux raisons : la
lecture d'étiquette fonctionne alors hors ligne, ce qui est le cas ordinaire
dans une cave, et elle ne dépend d'aucun hébergeur susceptible de bloquer ces
requêtes.

Deux traitements sont nécessaires et expliqués à l'endroit où ils s'appliquent :
un correctif sur l'ouvrier, et l'encodage des données de langue.

Usage :
    npm install tesseract.js@5.1.1 @tesseract.js-data/fra @tesseract.js-data/ita
    python3 tools/preparer_moteur.py [chemin/vers/node_modules]
"""

import base64
import json
import shutil
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CIBLE = RACINE / 'assets' / 'vendor' / 'tesseract'
LANGUES = ('fra', 'ita')

# Variante compacte des données de langue. Mesurée sur des étiquettes de cette
# cave, elle donne exactement le même texte que la variante standard, pour
# 2,3 Mo au lieu de 12,6.
VARIANTE = '4.0.0_best_int'

# tesseract.js sait recevoir les octets d'une langue plutôt qu'un chemin à
# télécharger, ce dont on a besoin ici. Mais au moment d'initialiser le moteur,
# il reprend ces octets comme nom de langue au lieu du code, et l'initialisation
# échoue. Le défaut est présent au moins de la version 5.1.1 à la 7.0.0.
CORRECTIF = ('.map((function(t){return"string"==typeof t?t:t.data})).join("+")',
             '.map((function(t){return"string"==typeof t?t:t.code})).join("+")')

FICHIERS = [
    ('tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'),
    ('tesseract.js/dist/worker.min.js', 'worker.min.js'),
    # Variante SIMD et son repli : Tesseract choisit selon le navigateur.
    ('tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'),
    ('tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'),
    # La licence Apache 2.0 est portée par le cœur, pas par le paquet principal.
    ('tesseract.js-core/LICENSE', 'LICENSE'),
]


def ko(chemin: Path) -> str:
    return f'{chemin.stat().st_size // 1024} Ko'


def main() -> None:
    modules = Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE.parent / 'node_modules'
    if not modules.is_dir():
        sys.exit(f'node_modules introuvable : {modules}')

    (CIBLE / 'langues').mkdir(parents=True, exist_ok=True)

    for source, nom in FICHIERS:
        origine = modules / source
        if not origine.exists():
            sys.exit(f'Fichier attendu absent : {origine}')
        shutil.copyfile(origine, CIBLE / nom)
        print(f'{nom:38} {ko(CIBLE / nom)}')

    appliquer_correctif(CIBLE / 'worker.min.js')

    for langue in LANGUES:
        origine = modules / f'@tesseract.js-data/{langue}/{VARIANTE}/{langue}.traineddata.gz'
        if not origine.exists():
            sys.exit(f'Données de langue absentes : {origine}')
        encoder(origine, CIBLE / 'langues' / f'{langue}.traineddata.gz.json')


def appliquer_correctif(fichier: Path) -> None:
    contenu = fichier.read_text(encoding='utf-8')
    avant, apres = CORRECTIF
    occurrences = contenu.count(avant)
    if occurrences != 1:
        sys.exit(f'Correctif inapplicable : {occurrences} occurrence(s) trouvée(s) au lieu '
                 f"d'une. La bibliothèque a changé, vérifier si le défaut est corrigé.")
    fichier.write_text(contenu.replace(avant, apres), encoding='utf-8')
    print(f'{"worker.min.js":38} correctif du nom de langue appliqué')


def encoder(source: Path, cible: Path) -> None:
    """Encode une langue en base64 dans du JSON.

    Un `.traineddata.gz` brut est un binaire que certains hébergeurs refusent
    de servir, n'acceptant que les types web usuels. L'encodage coûte un tiers
    de volume, se décode à la volée et ne change rien au contenu.
    """
    encode = base64.b64encode(source.read_bytes()).decode('ascii')
    cible.write_text(json.dumps(encode), encoding='utf-8')
    print(f'{cible.name:38} {ko(source)} → {ko(cible)}')


if __name__ == '__main__':
    main()
