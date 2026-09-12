// Photos prises depuis l'application. Elles sont conservées en IndexedDB :
// une photo de téléphone pèse plusieurs centaines de kilo-octets, bien au-delà
// de ce que localStorage peut absorber. Les photos livrées avec le classeur
// restent, elles, de simples fichiers sous data/photos/.
//
// Certains navigateurs refusent IndexedDB à une page affichée dans un cadre
// d'un autre site, ou en navigation privée. Plutôt que de bloquer l'ajout
// d'un vin, on retombe alors sur une réserve en mémoire : les photos tiennent
// le temps de la session et l'application reste utilisable. `enMemoire()` dit
// si c'est le cas, pour prévenir honnêtement.

const BASE = 'cave-a-vin';
const MAGASIN = 'photos';
const COTE_MAX = 1400;
const QUALITE = 0.82;

let connexion = null;
let repliMemoire = false;
const memoire = new Map();

/** Lire `requete.error` lève quand la requête n'est pas terminée. */
function erreurDe(requete, defaut) {
  try {
    return requete.error || new Error(defaut);
  } catch {
    return new Error(defaut);
  }
}

export const enMemoire = () => repliMemoire;

function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise((resoudre, rejeter) => {
    if (!('indexedDB' in globalThis) || !indexedDB) {
      rejeter(new Error('stockage des photos indisponible'));
      return;
    }
    let requete;
    try {
      requete = indexedDB.open(BASE, 1);
    } catch (erreur) {
      // Safari lève ici quand le stockage est refusé à la page.
      rejeter(erreur);
      return;
    }
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASIN)) base.createObjectStore(MAGASIN);
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(erreurDe(requete, 'stockage refusé'));
    requete.onblocked = () => rejeter(new Error('stockage occupé'));
  });
  connexion.catch(() => { connexion = null; });
  return connexion;
}

function transaction(mode, action) {
  return ouvrir().then((base) => new Promise((resoudre, rejeter) => {
    let requete;
    try {
      const tx = base.transaction(MAGASIN, mode);
      requete = action(tx.objectStore(MAGASIN));
    } catch (erreur) {
      rejeter(erreur);
      return;
    }
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(erreurDe(requete, 'écriture refusée'));
  }));
}

/** Passe en réserve mémoire dès qu'IndexedDB se dérobe, une fois pour toutes. */
async function avecRepli(action, actionMemoire) {
  if (repliMemoire) return actionMemoire();
  try {
    return await action();
  } catch (erreur) {
    console.info('Photos conservées en mémoire seulement', erreur);
    repliMemoire = true;
    return actionMemoire();
  }
}

export const lire = (cle) => avecRepli(
  () => transaction('readonly', (m) => m.get(cle)),
  () => memoire.get(cle),
);
export const ecrire = (cle, blob) => avecRepli(
  () => transaction('readwrite', (m) => m.put(blob, cle)),
  () => { memoire.set(cle, blob); },
);
export const supprimer = (cle) => avecRepli(
  () => transaction('readwrite', (m) => m.delete(cle)),
  () => { memoire.delete(cle); },
);
export const clefs = () => avecRepli(
  () => transaction('readonly', (m) => m.getAllKeys()),
  () => [...memoire.keys()],
);

/** Réduit une image choisie ou photographiée avant de la stocker. */
export async function redimensionner(fichier) {
  const bitmap = await creerBitmap(fichier);
  const source = Math.max(bitmap.width || 0, bitmap.height || 0);
  if (!source) return fichier;

  const facteur = Math.min(1, COTE_MAX / source);
  const largeur = Math.max(1, Math.round(bitmap.width * facteur));
  const hauteur = Math.max(1, Math.round(bitmap.height * facteur));

  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext('2d');
  if (!contexte) return fichier;
  contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
  if (bitmap.close) bitmap.close();

  // toBlob rend null quand la conversion échoue : la photo d'origine fait
  // alors très bien l'affaire.
  const blob = await new Promise((r) => {
    try {
      toile.toBlob(r, 'image/jpeg', QUALITE);
    } catch {
      r(null);
    }
  });
  return blob || fichier;
}

function creerBitmap(fichier) {
  if ('createImageBitmap' in globalThis) return createImageBitmap(fichier);
  return new Promise((resoudre, rejeter) => {
    const image = new Image();
    const url = URL.createObjectURL(fichier);
    image.onload = () => { URL.revokeObjectURL(url); resoudre(image); };
    image.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('Image illisible')); };
    image.src = url;
  });
}

// Les URL d'objet sont mises en cache : une même photo est affichée dans la
// liste, dans la fiche et dans le journal, sans recréer l'URL à chaque rendu.
const urls = new Map();

export async function url(cle) {
  if (!cle) return '';
  if (urls.has(cle)) return urls.get(cle);
  const blob = await lire(cle).catch(() => null);
  if (!blob) return '';
  const objet = URL.createObjectURL(blob);
  urls.set(cle, objet);
  return objet;
}

export function oublier(cle) {
  const objet = urls.get(cle);
  if (objet) URL.revokeObjectURL(objet);
  urls.delete(cle);
}

export async function enregistrer(fichier) {
  // Une photo d'iPhone peut être en HEIC, très grande, ou refuser de se
  // décoder : on garde alors le fichier tel quel plutôt que d'abandonner.
  const blob = await redimensionner(fichier).catch((erreur) => {
    console.info('Photo conservée sans réduction', erreur);
    return fichier;
  });
  const cle = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await ecrire(cle, blob);
  return cle;
}

/** Convertit toutes les photos locales en data URL, pour la sauvegarde JSON. */
export async function exporter() {
  const liste = await clefs().catch(() => []);
  const paquet = {};
  for (const cle of liste) {
    const blob = await lire(cle);
    if (blob) paquet[cle] = await versDataUrl(blob);
  }
  return paquet;
}

/** Restaure les photos d'une sauvegarde JSON. */
export async function importer(paquet = {}) {
  for (const [cle, dataUrl] of Object.entries(paquet)) {
    const blob = await depuisDataUrl(dataUrl);
    if (blob) await ecrire(cle, blob);
  }
}

export async function vider() {
  const liste = await clefs().catch(() => []);
  for (const cle of liste) {
    oublier(cle);
    await supprimer(cle);
  }
  memoire.clear();
}

function versDataUrl(blob) {
  return new Promise((resoudre) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(lecteur.result);
    lecteur.onerror = () => resoudre('');
    lecteur.readAsDataURL(blob);
  });
}

async function depuisDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  return fetch(dataUrl).then((r) => r.blob()).catch(() => null);
}
