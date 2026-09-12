// Synchronisation de la cave entre plusieurs appareils.
//
// L'application reste locale d'abord : elle lit et écrit dans le navigateur,
// s'affiche instantanément et fonctionne sans réseau. Quand la page tourne
// chez un hébergeur qui offre un stockage partagé, ce module s'y branche en
// plus, et les appareils se retrouvent.
//
// Chaque vin et chaque dégustation est un document distinct. C'est ce qui
// permet à deux téléphones de modifier la cave en même temps sans s'écraser :
// seuls des changements portant sur la même fiche entrent en conflit, et le
// dernier écrit l'emporte. Un document unique pour toute la cave aurait fait
// perdre le travail de l'un dès que l'autre touchait à quoi que ce soit.

const COLLECTIONS = { vins: 'vins', degustations: 'degustations' };
const DELAI_REPRISE = 5000;

let base = null;
let abonnements = [];
let rappels = {};
let etatCourant = 'local';
const enAttente = [];
let repriseProgrammee = null;

/** 'local' sans stockage partagé, 'connecte' quand il répond, 'attente' sinon. */
export const etat = () => etatCourant;
export const synchroActive = () => Boolean(base);

function changerEtat(valeur) {
  if (etatCourant === valeur) return;
  etatCourant = valeur;
  rappels.onEtat?.(valeur);
}

/**
 * Se branche au stockage partagé s'il existe.
 * `donneesLocales()` fournit l'état courant, utilisé pour amorcer un stockage
 * encore vide. Les rappels reçoivent ensuite ce que disent les autres
 * appareils.
 */
export async function initialiser({ donneesLocales, onDonnees, onEtat }) {
  rappels = { onDonnees, onEtat };

  const use = globalThis.claude?.use;
  if (typeof use !== 'function') return false;

  try {
    base = await use('db');
  } catch (erreur) {
    console.info('Stockage partagé indisponible', erreur);
    base = null;
  }
  if (!base) return false;

  try {
    await amorcer(donneesLocales());
    abonner();
    changerEtat('connecte');
  } catch (erreur) {
    console.info('Stockage partagé injoignable', erreur);
    changerEtat('attente');
    programmerReprise();
  }

  addEventListener('online', () => rejouer());
  return true;
}

/**
 * Amorce le stockage partagé avec la cave locale s'il est encore vide.
 * Sans cette étape, le premier appareil à se connecter verrait une cave vide
 * et effacerait la sienne en se synchronisant.
 */
async function amorcer(locales) {
  const existant = await base.collection(COLLECTIONS.vins).limit(1).get();
  if (!existant.empty) return;

  const ecritures = [
    ...locales.vins.map((vin) => ecrire(COLLECTIONS.vins, vin)),
    ...locales.degustations.map((d) => ecrire(COLLECTIONS.degustations, d)),
  ];
  await Promise.all(ecritures);
}

function abonner() {
  arreter();
  abonnements = [
    souscrire(COLLECTIONS.vins, 'vins'),
    souscrire(COLLECTIONS.degustations, 'degustations'),
  ];
}

function souscrire(collection, cle) {
  return base.collection(collection).onSnapshot(
    (instantane) => {
      changerEtat('connecte');
      const fiches = instantane.docs
        .map((document_) => document_.data())
        .filter(Boolean);
      rappels.onDonnees?.(cle, fiches);
    },
    (erreur) => {
      console.info(`Écoute de ${collection} interrompue`, erreur);
      changerEtat('attente');
      programmerReprise();
    },
  );
}

export function arreter() {
  for (const desabonner of abonnements) {
    try {
      desabonner();
    } catch { /* déjà arrêté */ }
  }
  abonnements = [];
}

// --- écritures --------------------------------------------------------------

function ecrire(collection, fiche) {
  return base.doc(`${collection}/${fiche.id}`).set({ ...fiche, majLe: new Date().toISOString() });
}

/**
 * Pousse une modification, ou la met de côté si le stockage ne répond pas.
 * Une fiche mise de côté écrase la précédente : seul son dernier état compte.
 */
function pousser(collection, fiche, suppression = false) {
  if (!base) return;
  const operation = { collection, fiche, suppression };
  const promesse = suppression
    ? base.doc(`${collection}/${fiche.id}`).delete()
    : ecrire(collection, fiche);

  promesse.then(() => changerEtat('connecte')).catch((erreur) => {
    console.info('Modification mise de côté', erreur);
    const index = enAttente.findIndex(
      (o) => o.collection === collection && o.fiche.id === fiche.id,
    );
    if (index === -1) enAttente.push(operation);
    else enAttente[index] = operation;
    changerEtat('attente');
    programmerReprise();
  });
}

function programmerReprise() {
  if (repriseProgrammee) return;
  repriseProgrammee = setTimeout(() => {
    repriseProgrammee = null;
    rejouer();
  }, DELAI_REPRISE);
}

/** Rejoue ce qui attend. Ce qui échoue encore retourne dans la file. */
function rejouer() {
  if (!base || !enAttente.length) return;
  const aRejouer = enAttente.splice(0, enAttente.length);
  for (const { collection, fiche, suppression } of aRejouer) {
    pousser(collection, fiche, suppression);
  }
  if (!abonnements.length) {
    try {
      abonner();
    } catch { /* la prochaine reprise réessaiera */ }
  }
}

export const ecrireVin = (vin) => pousser(COLLECTIONS.vins, vin);
export const effacerVin = (id) => pousser(COLLECTIONS.vins, { id }, true);
export const ecrireDegustation = (d) => pousser(COLLECTIONS.degustations, d);
export const effacerDegustation = (id) => pousser(COLLECTIONS.degustations, { id }, true);

/** Remplace tout le contenu partagé, après une restauration ou une remise à zéro. */
export async function remplacerTout({ vins, degustations }) {
  if (!base) return;
  const [ancienVins, ancienDegustations] = await Promise.all([
    base.collection(COLLECTIONS.vins).get(),
    base.collection(COLLECTIONS.degustations).get(),
  ]);
  const gardes = new Set([
    ...vins.map((v) => `${COLLECTIONS.vins}/${v.id}`),
    ...degustations.map((d) => `${COLLECTIONS.degustations}/${d.id}`),
  ]);

  const suppressions = [...ancienVins.docs, ...ancienDegustations.docs]
    .map((document_, index) => ({
      chemin: `${index < ancienVins.docs.length ? COLLECTIONS.vins : COLLECTIONS.degustations}`
        + `/${document_.id}`,
    }))
    .filter(({ chemin }) => !gardes.has(chemin))
    .map(({ chemin }) => base.doc(chemin).delete().catch(() => {}));

  await Promise.all([
    ...suppressions,
    ...vins.map((vin) => ecrire(COLLECTIONS.vins, vin).catch(() => {})),
    ...degustations.map((d) => ecrire(COLLECTIONS.degustations, d).catch(() => {})),
  ]);
}
