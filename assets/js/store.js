// État de l'application : chargement, persistance et actions métier.
// Les données vivent dans localStorage, le jeu initial vient de data/seed.json.

import {
  EMPLACEMENTS, aujourdhui, entier, identifiant,
  normaliserDegustation, normaliserVin,
} from './model.js';
import * as photos from './photos.js';

const CLE_DONNEES = 'cave-a-vin.donnees.v1';
const CLE_PREFERENCES = 'cave-a-vin.preferences.v1';
const CHEMIN_SEED = 'data/seed.json';
export const VERSION_DONNEES = 1;

const etat = {
  vins: [],
  degustations: [],
  preferences: { theme: 'auto', affichage: 'grille', lectureAuto: false },
  charge: false,
  majLe: '',
};

const abonnes = new Set();

export function abonner(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function notifier() {
  for (const rappel of abonnes) rappel(etat);
}

export const donnees = () => etat;
export const vins = () => etat.vins;
export const degustations = () => etat.degustations;
export const preferences = () => etat.preferences;
export const trouverVin = (id) => etat.vins.find((v) => v.id === id) || null;
export const trouverDegustation = (id) => etat.degustations.find((d) => d.id === id) || null;
export const degustationsDuVin = (id) => etat.degustations.filter((d) => d.vinId === id);

// --- persistance ------------------------------------------------------------

function lireLocal(cle) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

let stockageRefuse = false;

/** Le navigateur refuse-t-il de garder la cave d'une visite à l'autre ? */
export const stockageDurable = () => !stockageRefuse;

function ecrireLocal(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch (erreur) {
    // Navigation privée, cadre d'un autre site, quota atteint : la cave
    // continue de fonctionner mais ne survivra pas à la fermeture.
    console.error('Écriture impossible dans le stockage local', erreur);
    stockageRefuse = true;
    return false;
  }
}

function enregistrer() {
  etat.majLe = new Date().toISOString();
  const ok = ecrireLocal(CLE_DONNEES, {
    version: VERSION_DONNEES,
    majLe: etat.majLe,
    vins: etat.vins,
    degustations: etat.degustations,
  });
  notifier();
  return ok;
}

export function enregistrerPreferences(modifications) {
  etat.preferences = { ...etat.preferences, ...modifications };
  ecrireLocal(CLE_PREFERENCES, etat.preferences);
  notifier();
}

function adopter(paquet) {
  etat.vins = (paquet.vins || []).map(normaliserVin);
  etat.degustations = (paquet.degustations || []).map(normaliserDegustation);
  etat.majLe = paquet.majLe || '';
}

export async function charger() {
  etat.preferences = { ...etat.preferences, ...(lireLocal(CLE_PREFERENCES) || {}) };
  const local = lireLocal(CLE_DONNEES);
  if (local && Array.isArray(local.vins) && local.vins.length) {
    adopter(local);
  } else {
    const reponse = await fetch(CHEMIN_SEED, { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`Jeu de données initial illisible (${reponse.status})`);
    adopter(await reponse.json());
    enregistrer();
  }
  etat.charge = true;
  notifier();
  return etat;
}

export async function reinitialiser() {
  const reponse = await fetch(CHEMIN_SEED, { cache: 'no-cache' });
  if (!reponse.ok) throw new Error(`Jeu de données initial illisible (${reponse.status})`);
  adopter(await reponse.json());
  await photos.vider().catch(() => {});
  enregistrer();
}

// --- actions sur les vins ---------------------------------------------------

export function ajouterVin(champs) {
  const vin = normaliserVin({ ...champs, id: identifiant('v') });
  etat.vins.unshift(vin);
  enregistrer();
  return vin;
}

export function modifierVin(id, champs) {
  const index = etat.vins.findIndex((v) => v.id === id);
  if (index === -1) return null;
  const vin = normaliserVin({ ...etat.vins[index], ...champs, id });
  etat.vins[index] = vin;
  enregistrer();
  return vin;
}

export function supprimerVin(id) {
  const vin = trouverVin(id);
  if (!vin) return false;
  // Les dégustations reprennent la photo du vin : on ne l'efface que si plus
  // personne ne s'en sert.
  if (vin.photoLocale && !photoPartagee(vin.photoLocale, null, id)) {
    photos.supprimer(vin.photoLocale).catch(() => {});
  }
  etat.vins = etat.vins.filter((v) => v.id !== id);
  // Les dégustations gardent leur trace mais perdent le lien vers la fiche.
  etat.degustations = etat.degustations.map((d) => (
    d.vinId === id ? { ...d, vinId: '' } : d
  ));
  enregistrer();
  return true;
}

/** Ajoute des bouteilles à un emplacement donné. */
export function ajouterBouteilles(id, emplacement, nombre = 1) {
  const vin = trouverVin(id);
  if (!vin) return null;
  const ajout = entier(nombre, 0);
  if (ajout === 0) return vin;
  const emplacements = { ...vin.emplacements };
  if (emplacement) emplacements[emplacement] = (emplacements[emplacement] || 0) + ajout;
  return modifierVin(id, {
    emplacements,
    quantite: vin.quantite + ajout,
    statut: 'en-cave',
  });
}

/** Retire une bouteille d'un emplacement, sans l'enregistrer comme dégustation. */
export function retirerBouteilles(id, emplacement, nombre = 1) {
  const vin = trouverVin(id);
  if (!vin) return null;
  const retrait = Math.min(entier(nombre, 0), vin.quantite);
  if (retrait === 0) return vin;
  const emplacements = { ...vin.emplacements };
  if (emplacement && emplacements[emplacement] > 0) {
    emplacements[emplacement] = Math.max(0, emplacements[emplacement] - retrait);
  }
  const quantite = vin.quantite - retrait;
  return modifierVin(id, {
    emplacements,
    quantite,
    statut: quantite === 0 ? 'termine' : 'en-cave',
  });
}

/**
 * Ouvre une bouteille : elle quitte le stock et rejoint le journal des
 * dégustations. Quand la dernière part, la fiche passe en « terminé ».
 */
export function boireBouteille(id, details = {}) {
  const vin = trouverVin(id);
  if (!vin) return null;

  const emplacement = details.emplacement
    || EMPLACEMENTS.find((e) => vin.emplacements[e.cle] > 0)?.cle
    || '';
  const emplacements = { ...vin.emplacements };
  if (emplacement && emplacements[emplacement] > 0) {
    emplacements[emplacement] = emplacements[emplacement] - 1;
  }
  const quantite = Math.max(0, vin.quantite - 1);

  const degustation = normaliserDegustation({
    id: identifiant('t'),
    nom: vin.nom,
    producteur: vin.producteur,
    region: vin.region,
    cepage: vin.cepage,
    couleur: vin.couleur,
    millesime: vin.millesime,
    contexte: details.contexte || 'À la maison',
    lieu: details.lieu || '',
    date: details.date || aujourdhui(),
    notation: details.notation ?? null,
    commentaire: details.commentaire || '',
    // Une photo prise au moment de boire l'emporte sur l'étiquette de la fiche.
    photo: details.photoLocale ? '' : vin.photo,
    photoLocale: details.photoLocale || vin.photoLocale,
    vinId: vin.id,
  });
  etat.degustations.unshift(degustation);

  modifierVin(id, {
    emplacements,
    quantite,
    statut: quantite === 0 ? 'termine' : 'en-cave',
    notation: details.notation ?? vin.notation,
  });
  return degustation;
}

/** Déplace des bouteilles d'un emplacement vers un autre. */
export function deplacerBouteilles(id, depuis, vers, nombre = 1) {
  const vin = trouverVin(id);
  if (!vin || depuis === vers) return vin;
  const disponible = vin.emplacements[depuis] || 0;
  const deplace = Math.min(entier(nombre, 0), disponible);
  if (deplace === 0) return vin;
  const emplacements = { ...vin.emplacements };
  emplacements[depuis] = disponible - deplace;
  emplacements[vers] = (emplacements[vers] || 0) + deplace;
  return modifierVin(id, { emplacements });
}

// --- actions sur les dégustations -------------------------------------------

export function ajouterDegustation(champs) {
  const degustation = normaliserDegustation({ ...champs, id: identifiant('t') });
  etat.degustations.unshift(degustation);
  enregistrer();
  return degustation;
}

export function modifierDegustation(id, champs) {
  const index = etat.degustations.findIndex((d) => d.id === id);
  if (index === -1) return null;
  const degustation = normaliserDegustation({ ...etat.degustations[index], ...champs, id });
  etat.degustations[index] = degustation;
  enregistrer();
  return degustation;
}

export function supprimerDegustation(id) {
  const degustation = trouverDegustation(id);
  if (!degustation) return false;
  // La photo locale n'est effacée que si aucune autre fiche ne l'utilise.
  if (degustation.photoLocale && !photoPartagee(degustation.photoLocale, id, null)) {
    photos.supprimer(degustation.photoLocale).catch(() => {});
  }
  etat.degustations = etat.degustations.filter((d) => d.id !== id);
  enregistrer();
  return true;
}

/** La photo `cle` sert-elle encore, en ignorant les fiches en cours de suppression ? */
function photoPartagee(cle, saufDegustation, saufVin) {
  return etat.vins.some((v) => v.photoLocale === cle && v.id !== saufVin)
    || etat.degustations.some((d) => d.photoLocale === cle && d.id !== saufDegustation);
}

// --- sauvegarde et restauration ---------------------------------------------

export async function exporterJson({ avecPhotos = true } = {}) {
  return {
    application: 'cave-a-vin',
    version: VERSION_DONNEES,
    exporteLe: new Date().toISOString(),
    vins: etat.vins,
    degustations: etat.degustations,
    photos: avecPhotos ? await photos.exporter() : {},
  };
}

export async function importerJson(paquet) {
  if (!paquet || !Array.isArray(paquet.vins)) {
    throw new Error("Ce fichier ne contient pas de sauvegarde de la cave");
  }
  if (paquet.photos) await photos.importer(paquet.photos).catch(() => {});
  adopter(paquet);
  enregistrer();
  return { vins: etat.vins.length, degustations: etat.degustations.length };
}
