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

const COLLECTIONS = { vins: 'vins', degustations: 'degustations', apercus: 'apercus' };
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
 * Met le partage et la cave locale d'accord au moment de se brancher.
 *
 * Partage vide : on l'amorce avec la cave locale. Sans cette étape, le premier
 * appareil à se connecter verrait une cave vide et effacerait la sienne.
 *
 * Partage déjà garni : c'est le cas d'un deuxième appareil, et le piège est
 * qu'il part du même classeur, avec les mêmes identifiants. Reprendre le
 * partage tel quel effacerait ce qu'il a modifié depuis. N'envoyer que ce qu'il
 * a modifié plus récemment que le partage règle les deux sens : ses vraies
 * modifications remontent, le reste redescend par l'écoute.
 */
async function amorcer(locales) {
  const [distantsVins, distantesDegustations] = await Promise.all([
    base.collection(COLLECTIONS.vins).get(),
    base.collection(COLLECTIONS.degustations).get(),
  ]);
  const partageVide = distantsVins.empty && distantesDegustations.empty;

  await Promise.all([
    ...aEnvoyer(locales.vins, distantsVins, partageVide)
      .map((vin) => ecrire(COLLECTIONS.vins, vin)),
    ...aEnvoyer(locales.degustations, distantesDegustations, partageVide)
      .map((d) => ecrire(COLLECTIONS.degustations, d)),
  ]);
}

/**
 * Fiches locales que le partage ignore, ou qu'il connaît moins à jour.
 * Une fiche jamais modifiée n'a pas de date et ne l'emporte donc sur rien : les
 * cent dix-neuf fiches du classeur, identiques d'un appareil à l'autre, ne
 * repartent pas écraser celles que l'autre a retouchées.
 */
function aEnvoyer(locales, distantes, partageVide) {
  if (partageVide) return locales;
  const connues = new Map(distantes.docs.map((d) => [d.id, d.data()?.modifieLe || '']));
  return locales.filter((fiche) => (
    !connues.has(fiche.id) || (fiche.modifieLe || '') > connues.get(fiche.id)
  ));
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

// La fiche part telle quelle : son `modifieLe` dit quand elle a été modifiée,
// ce qui n'est pas forcément quand elle est envoyée. Un appareil qui retrouve
// le réseau après deux jours ne doit pas passer pour le plus à jour.
function ecrire(collection, fiche) {
  return base.doc(`${collection}/${fiche.id}`).set({ ...fiche });
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

// --- aperçus de photos ------------------------------------------------------
//
// Le dépôt de fichiers de l'hébergeur n'est ouvert qu'à qui peut modifier la
// page. Un appareil qui ne l'a pas garde sa photo dans son seul navigateur, et
// le vin arriverait sans image chez les autres. Une copie réduite passe alors
// par ici : elle tient dans un document, voyage avec la cave, et suffit à
// reconnaître une étiquette. Elle vit à part des fiches pour ne pas alourdir
// les instantanés, que l'application relit en entier à chaque changement.

const cheminApercu = (cle) => `${COLLECTIONS.apercus}/${cle}`;

export function ecrireApercu(cle, image) {
  if (!base) return Promise.resolve();
  return base.doc(cheminApercu(cle)).set({ id: cle, image });
}

export async function lireApercu(cle) {
  if (!base) return '';
  const document_ = await base.doc(cheminApercu(cle)).get();
  return document_?.exists ? String(document_.data()?.image || '') : '';
}

export function effacerApercu(cle) {
  if (!base) return Promise.resolve();
  return base.doc(cheminApercu(cle)).delete().catch(() => {});
}

export const ecrireVin = (vin) => pousser(COLLECTIONS.vins, vin);
export const effacerVin = (id) => pousser(COLLECTIONS.vins, { id }, true);
export const ecrireDegustation = (d) => pousser(COLLECTIONS.degustations, d);
export const effacerDegustation = (id) => pousser(COLLECTIONS.degustations, { id }, true);

/** Remplace tout le contenu partagé, après une restauration ou une remise à zéro. */
export async function remplacerTout({ vins, degustations }) {
  if (!base) return;
  const [ancienVins, ancienDegustations, anciensApercus] = await Promise.all([
    base.collection(COLLECTIONS.vins).get(),
    base.collection(COLLECTIONS.degustations).get(),
    base.collection(COLLECTIONS.apercus).get(),
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

  // Un aperçu que plus aucune fiche ne réclame n'a plus de raison d'occuper
  // une place dans la cave partagée.
  const photosGardees = new Set([...vins, ...degustations]
    .map((fiche) => fiche.photoLocale).filter(Boolean));
  const apercusPerimes = anciensApercus.docs
    .filter((document_) => !photosGardees.has(document_.id))
    .map((document_) => effacerApercu(document_.id));

  await Promise.all([
    ...suppressions,
    ...apercusPerimes,
    ...vins.map((vin) => ecrire(COLLECTIONS.vins, vin).catch(() => {})),
    ...degustations.map((d) => ecrire(COLLECTIONS.degustations, d).catch(() => {})),
  ]);
}
