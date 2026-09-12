#!/usr/bin/env python3
"""Convertit le classeur Excel de la cave en jeu de données initial de l'application.

Le classeur contient deux feuilles :
  - « Cave à vins »          : les bouteilles en cave et celles déjà terminées
  - « Vins bus (hors cave) » : les vins bus ailleurs, jamais entrés en cave

Les photos d'étiquettes ne sont pas dans des cellules : ce sont des images
ancrées sur la dernière colonne de chaque feuille. On lit les ancres du
fichier drawingN.xml pour retrouver la ligne à laquelle chaque image
appartient, puis on écrit les images sous data/photos/<id>.jpg.

Usage :
    python3 tools/xlsx_to_seed.py [chemin/du/classeur.xlsx]

Sorties :
    data/seed.json      jeu de données initial chargé par l'application
    data/photos/*.jpg   une photo par vin qui en possède une
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl est requis : pip install openpyxl")

RACINE = Path(__file__).resolve().parent.parent
CLASSEUR_DEFAUT = RACINE / "data" / "cave_a_vins.xlsx"
SORTIE_JSON = RACINE / "data" / "seed.json"
SORTIE_PHOTOS = RACINE / "data" / "photos"

NS = {
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"

FEUILLE_CAVE = "Cave à vins"
FEUILLE_HORS_CAVE = "Vins bus (hors cave)"

EMPLACEMENTS = [
    ("caveDroite", "Cave droite"),
    ("caveGauche", "Cave gauche"),
    ("armoire", "Armoire à vin"),
]

# --- déduction de la couleur -------------------------------------------------
# Le classeur ne contient pas de colonne « couleur ». On la déduit du cépage
# puis de l'appellation. Le résultat reste modifiable dans l'application : ces
# règles ne servent qu'à préremplir le champ.

CEPAGES_BLANCS = {
    "arneis", "chardonnay", "chasselas", "ermitage", "marsanne", "gewürztraminer",
    "gewurztraminer", "greco", "grillo", "heida", "savagnin blanc", "malvasia",
    "moscato", "moscato giallo", "goldmuskateller", "muscat blanc", "pecorino",
    "pinot gris", "ribolla gialla", "sauvignon blanc", "viognier", "nepis", "soreli",
    "glera", "petite arvine", "fendant", "johannisberg", "sylvaner", "riesling",
    "verdicchio", "vermentino", "fiano", "falanghina", "albariño", "sémillon",
    "semillon", "pinot blanc", "müller-thurgau", "muller-thurgau",
}
CEPAGES_ROUGES = {
    "barbera", "blaufränkisch", "blaufrankisch", "cabernet franc", "cabernet sauvignon",
    "ciliegiolo", "corvina", "rondinella", "grenache", "syrah", "humagne rouge",
    "merlot", "montepulciano", "nebbiolo", "negroamaro", "pinot noir", "primitivo",
    "sangiovese", "prugnolo gentile", "tempranillo", "teran", "malbec", "petit verdot",
    "mourvèdre", "mourvedre", "cinsault", "gamaret", "garanoir", "gamay", "dolcetto",
    "nerello", "aglianico", "pinotage", "carmenère", "carmenere", "touriga",
}
APPELLATIONS_PETILLANTES = ("champagne", "prosecco", "franciacorta", "crémant", "cremant",
                            "moscato d'asti", "spumante", "cava", "sekt")
# « Asti DOCG » seul désigne le mousseux piémontais, mais « Barbera d'Asti
# DOCG » est un rouge tranquille : l'appellation ne compte qu'en tête de la
# région.
REGION_ASTI_MOUSSEUX = re.compile(r"^asti\b")
APPELLATIONS_LIQUOREUSES = ("sauternes", "porto", "banyuls", "monbazillac", "tokaji",
                            "vin santo", "passito", "barsac")
APPELLATIONS_BLANCHES = ("chassagne-montrachet", "saint-véran", "saint-veran", "pouilly-fumé",
                         "pouilly-fume", "montagny", "rully", "greco di tufo", "soave",
                         "gavi", "dezaley", "sancerre", "chablis", "meursault",
                         "lavaux", "pully")
APPELLATIONS_ROUGES = ("valpolicella", "amarone", "barolo", "barbaresco", "brunello",
                       "bolgheri", "chianti", "vino nobile", "châteauneuf", "chateauneuf",
                       "crozes-hermitage", "margaux", "pauillac", "haut-médoc", "haut-medoc",
                       "volnay", "fixin", "ribera del duero", "douro", "etna rosso",
                       "rosso", "médoc", "medoc", "saint-émilion", "saint-emilion",
                       "pomerol", "salento", "primitivo di manduria", "bordeaux",
                       "toscana igt", "chambave", "barbera")
MOTS_ROSES = ("rosé", "rose", "rosato", "cerasuolo", "œil-de-perdrix", "oeil-de-perdrix")
# Mots présents dans le nom du vin qui annoncent la couleur sans ambiguïté.
NOMS_BLANCS = ("bianco", "blanc", "weiss", "white", "blanco")
NOMS_ROUGES = ("rosso", "rouge", "nero", "tinto", "red")

# Quelques vins échappent aux règles : la note du classeur précise la couleur
# réelle. On les corrige explicitement par nom de vin.
COULEURS_FORCEES = {
    # La note du classeur précise la couleur réelle.
    "magenta": "rouge",  # Cerasuolo d'Abruzzo vinifié en rouge par le domaine
    "blanc de noir gregor kuonen": "blanc",
    # Appellations bourguignonnes déclinées en rouge et en blanc : couleur lue
    # sur la photo d'étiquette du classeur (le vin y est visiblement blanc).
    "saint-romain – grand vin de bourgogne": "blanc",
    "pernand-vergelesses – grand vin de bourgogne": "blanc",
    "mercurey – les montelons": "blanc",
    # Assemblage languedocien rouge, non déductible de l'IGP seule.
    "la cuvée mythique": "rouge",
}


def normaliser(texte: str) -> str:
    """Minuscules sans accents, pour comparer des libellés."""
    sans_accent = unicodedata.normalize("NFD", texte)
    sans_accent = "".join(c for c in sans_accent if unicodedata.category(c) != "Mn")
    return sans_accent.lower().strip()


def contient_mot(texte: str, mot: str) -> bool:
    """Cherche un mot entier, pour éviter qu'« Asti » morde sur « Barbera d'Asti »."""
    return re.search(rf"\b{re.escape(normaliser(mot))}\b", texte) is not None


def deduire_couleur(nom: str, cepage: str, region: str) -> str:
    """Devine la couleur d'un vin à partir de son nom, son cépage et sa région."""
    forcee = COULEURS_FORCEES.get((nom or "").strip().lower())
    if forcee:
        return forcee

    tout = normaliser(" ".join(filter(None, [nom, cepage, region])))
    region_n = normaliser(region or "")
    cepage_n = normaliser(cepage or "")

    if any(contient_mot(tout, m) for m in APPELLATIONS_PETILLANTES):
        return "petillant"
    if REGION_ASTI_MOUSSEUX.match(region_n):
        return "petillant"
    if any(contient_mot(region_n, m) for m in APPELLATIONS_LIQUOREUSES):
        return "liquoreux"
    if any(contient_mot(tout, m) for m in MOTS_ROSES):
        return "rose"
    if "blanc de noir" in tout or "blanc de blancs" in tout:
        return "blanc"

    nom_n = normaliser(nom or "")
    if any(contient_mot(nom_n, m) for m in NOMS_BLANCS):
        return "blanc"
    if any(contient_mot(nom_n, m) for m in NOMS_ROUGES):
        return "rouge"

    if any(contient_mot(cepage_n, c) for c in CEPAGES_BLANCS):
        return "blanc"
    if any(contient_mot(cepage_n, c) for c in CEPAGES_ROUGES):
        return "rouge"
    # L'appellation est parfois dans le nom du vin plutôt que dans la colonne
    # région (« Chambave Supérieur » pour un Vallée d'Aoste DOC).
    appellation = f"{region_n} {nom_n}"
    if any(contient_mot(appellation, m) for m in APPELLATIONS_BLANCHES):
        return "blanc"
    if any(contient_mot(appellation, m) for m in APPELLATIONS_ROUGES):
        return "rouge"
    return "inconnu"


# --- lecture des images ancrées ---------------------------------------------

def lire_ancres(chemin_xlsx: Path) -> dict[int, dict[int, bytes]]:
    """Retourne {index de feuille (1-based): {numéro de ligne: octets de l'image}}."""
    resultat: dict[int, dict[int, bytes]] = {}
    with zipfile.ZipFile(chemin_xlsx) as z:
        noms = set(z.namelist())
        for index in (1, 2):
            dessin = f"xl/drawings/drawing{index}.xml"
            liens = f"xl/drawings/_rels/drawing{index}.xml.rels"
            if dessin not in noms or liens not in noms:
                continue
            cibles = {
                rel.get("Id"): rel.get("Target").lstrip("/")
                for rel in ET.fromstring(z.read(liens))
            }
            par_ligne: dict[int, bytes] = {}
            for ancre in ET.fromstring(z.read(dessin)):
                depuis = ancre.find("xdr:from", NS)
                blip = ancre.find(".//a:blip", NS)
                if depuis is None or blip is None:
                    continue
                ligne = int(depuis.find("xdr:row", NS).text) + 1
                cible = cibles.get(blip.get(EMBED))
                if cible:
                    par_ligne[ligne] = z.read(cible)
            resultat[index] = par_ligne
    return resultat


# --- lecture des cellules ----------------------------------------------------

def texte(valeur) -> str:
    if valeur is None:
        return ""
    return str(valeur).strip()


def nombre(valeur, defaut=None):
    if valeur is None or valeur == "":
        return defaut
    try:
        f = float(valeur)
    except (TypeError, ValueError):
        return defaut
    return int(f) if f.is_integer() else f


def separer_emplacement(note: str) -> tuple[str, str]:
    """Isole le segment « Emplacement précis : … » du reste de la note."""
    if not note:
        return "", ""
    details: list[str] = []
    restes: list[str] = []
    for segment in [s.strip() for s in note.split("|")]:
        if not segment:
            continue
        trouve = re.search(r"Emplacement pr[ée]cis\s*:", segment, flags=re.IGNORECASE)
        if trouve:
            avant = segment[: trouve.start()].strip()
            if avant:
                restes.append(avant)
            details.append(segment[trouve.end():].strip().rstrip("."))
        else:
            restes.append(segment)
    return " · ".join(details), "\n".join(restes)


def lire_cave(feuille, images: dict[int, bytes]) -> list[dict]:
    vins = []
    for ligne in range(2, feuille.max_row + 1):
        def cel(col: str):
            return feuille[f"{col}{ligne}"].value

        nom = texte(cel("A"))
        if not nom and ligne not in images:
            continue

        identifiant = f"c{ligne - 1:03d}"
        emplacements = {
            cle: nombre(cel(col), 0) or 0
            for (cle, _), col in zip(EMPLACEMENTS, ("L", "M", "N"))
        }
        emplacement_precis, note = separer_emplacement(texte(cel("P")))
        region = texte(cel("C"))
        cepage = texte(cel("D"))
        statut = "termine" if normaliser(texte(cel("O"))) == "termine" else "en-cave"

        vins.append({
            "id": identifiant,
            "nom": nom,
            "producteur": texte(cel("B")),
            "region": region,
            "cepage": cepage,
            "couleur": deduire_couleur(nom, cepage, region),
            "millesime": nombre(cel("E")),
            "volume": texte(cel("F")) or "75 cl",
            "degre": nombre(cel("G")),
            "quantite": nombre(cel("H"), 0) or 0,
            "provenance": texte(cel("I")),
            "source": texte(cel("J")),
            "dateReception": texte(cel("K")),
            "emplacements": emplacements,
            "emplacementPrecis": emplacement_precis,
            "statut": statut,
            "note": note,
            "notation": nombre(cel("Q")),
            "dateDegustation": texte(cel("R")),
            "photo": f"data/photos/{identifiant}.jpg" if ligne in images else "",
        })
    return vins


def lire_hors_cave(feuille, images: dict[int, bytes]) -> list[dict]:
    degustations = []
    for ligne in range(2, feuille.max_row + 1):
        def cel(col: str):
            return feuille[f"{col}{ligne}"].value

        nom = texte(cel("A"))
        if not nom and ligne not in images:
            continue

        identifiant = f"d{ligne - 1:03d}"
        region = texte(cel("C"))
        cepage = texte(cel("D"))
        degustations.append({
            "id": identifiant,
            "nom": nom,
            "producteur": texte(cel("B")),
            "region": region,
            "cepage": cepage,
            "couleur": deduire_couleur(nom, cepage, region),
            "millesime": nombre(cel("E")),
            "contexte": texte(cel("F")),
            "lieu": texte(cel("G")),
            "date": texte(cel("H")),
            "notation": nombre(cel("I")),
            "commentaire": texte(cel("J")),
            "photo": f"data/photos/{identifiant}.jpg" if ligne in images else "",
            "vinId": "",
        })
    return degustations


def degustations_depuis_cave(vins: list[dict]) -> list[dict]:
    """Crée une entrée de journal pour chaque vin terminé du classeur.

    Le classeur ne garde qu'une ligne par vin bu : on la transforme en
    évènement daté, pour que le journal de dégustation réunisse au même
    endroit les vins de la cave et ceux bus ailleurs.
    """
    entrees = []
    for index, vin in enumerate(v for v in vins if v["statut"] == "termine"):
        entrees.append({
            "id": f"t{index + 1:03d}",
            "nom": vin["nom"],
            "producteur": vin["producteur"],
            "region": vin["region"],
            "cepage": vin["cepage"],
            "couleur": vin["couleur"],
            "millesime": vin["millesime"],
            "contexte": "À la maison",
            "lieu": "",
            "date": vin["dateDegustation"],
            "notation": vin["notation"],
            "commentaire": vin["note"],
            "photo": vin["photo"],
            "vinId": vin["id"],
        })
    return entrees


def ecrire_photos(vins, degustations, ancres) -> int:
    if SORTIE_PHOTOS.exists():
        shutil.rmtree(SORTIE_PHOTOS)
    SORTIE_PHOTOS.mkdir(parents=True, exist_ok=True)

    ecrites = 0
    for fiches, index in ((vins, 1), (degustations, 2)):
        images = ancres.get(index, {})
        for fiche in fiches:
            ligne = int(fiche["id"][1:]) + 1
            octets = images.get(ligne)
            if not octets:
                continue
            (RACINE / fiche["photo"]).write_bytes(octets)
            ecrites += 1
    return ecrites


def main() -> None:
    chemin = Path(sys.argv[1]) if len(sys.argv) > 1 else CLASSEUR_DEFAUT
    if not chemin.exists():
        sys.exit(f"Classeur introuvable : {chemin}")

    classeur = openpyxl.load_workbook(chemin, data_only=True)
    ancres = lire_ancres(chemin)

    vins = lire_cave(classeur[FEUILLE_CAVE], ancres.get(1, {}))
    hors_cave = lire_hors_cave(classeur[FEUILLE_HORS_CAVE], ancres.get(2, {}))
    photos = ecrire_photos(vins, hors_cave, ancres)
    degustations = degustations_depuis_cave(vins) + hors_cave

    seed = {
        "version": 1,
        "source": chemin.name,
        "vins": vins,
        "degustations": degustations,
    }
    SORTIE_JSON.parent.mkdir(parents=True, exist_ok=True)
    SORTIE_JSON.write_text(
        json.dumps(seed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    inconnues = [v["nom"] for v in vins if v["couleur"] == "inconnu"]
    bouteilles = sum(v["quantite"] for v in vins if v["statut"] == "en-cave")
    print(f"{len(vins)} vins ({bouteilles} bouteilles en cave), "
          f"{len(degustations)} dégustations ({len(hors_cave)} hors cave), "
          f"{photos} photos")
    print(f"écrit : {SORTIE_JSON.relative_to(RACINE)} "
          f"({os.path.getsize(SORTIE_JSON) // 1024} Ko)")
    if inconnues:
        print(f"couleur non déduite pour {len(inconnues)} vins : "
              + ", ".join(inconnues[:10]) + (" …" if len(inconnues) > 10 else ""))


if __name__ == "__main__":
    main()
