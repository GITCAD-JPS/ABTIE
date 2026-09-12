// Photos prises depuis l'application. Elles sont conservées en IndexedDB :
// une photo de téléphone pèse plusieurs centaines de kilo-octets, bien au-delà
// de ce que localStorage peut absorber. Les photos livrées avec le classeur
// restent, elles, de simples fichiers sous data/photos/.

const BASE = 'cave-a-vin';
const MAGASIN = 'photos';
const COTE_MAX = 1400;
const QUALITE = 0.82;

let connexion = null;

function ouvrir() {
  if (connexion) return connexion;
  connexion = new Promise((resoudre, rejeter) => {
    if (!('indexedDB' in globalThis)) {
      rejeter(new Error("Ce navigateur ne gère pas le stockage des photos"));
      return;
    }
    const requete = indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains(MAGASIN)) base.createObjectStore(MAGASIN);
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
  connexion.catch(() => { connexion = null; });
  return connexion;
}

function transaction(mode, action) {
  return ouvrir().then((base) => new Promise((resoudre, rejeter) => {
    const tx = base.transaction(MAGASIN, mode);
    const requete = action(tx.objectStore(MAGASIN));
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  }));
}

export const lire = (cle) => transaction('readonly', (magasin) => magasin.get(cle));
export const ecrire = (cle, blob) => transaction('readwrite', (m) => m.put(blob, cle));
export const supprimer = (cle) => transaction('readwrite', (m) => m.delete(cle));
export const clefs = () => transaction('readonly', (m) => m.getAllKeys());

/** Réduit une image choisie ou photographiée avant de la stocker. */
export async function redimensionner(fichier) {
  const bitmap = await creerBitmap(fichier);
  const facteur = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * facteur);
  const hauteur = Math.round(bitmap.height * facteur);

  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  toile.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((r) => toile.toBlob(r, 'image/jpeg', QUALITE));
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
  const blob = await redimensionner(fichier);
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
