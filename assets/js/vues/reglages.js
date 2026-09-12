// Réglages : apparence, sauvegardes et remise à zéro.

import { bouton, confirmer, el, message, selection, vider } from '../dom.js';
import { section } from '../composants.js';
import * as exporter from '../export.js';
import * as store from '../store.js';
import { appliquerTheme } from '../theme.js';

const THEMES = [
  { valeur: 'auto', libelle: 'Suivre le système' },
  { valeur: 'clair', libelle: 'Clair' },
  { valeur: 'sombre', libelle: 'Sombre' },
];

export function rendre(conteneur, { naviguer }) {
  const prefs = store.preferences();
  const etat = store.donnees();
  vider(conteneur);

  const entreeImport = el('input', {
    type: 'file', accept: 'application/json,.json', class: 'visuellement-cache',
    id: 'import-sauvegarde',
  });
  entreeImport.addEventListener('change', async () => {
    const fichier = entreeImport.files?.[0];
    entreeImport.value = '';
    if (!fichier) return;
    const accord = await confirmer(
      'Restaurer une sauvegarde',
      'Le contenu actuel de la cave sera remplacé par celui du fichier.',
      { libelleAction: 'Restaurer', danger: true },
    );
    if (!accord) return;
    try {
      const paquet = await exporter.lireFichierJson(fichier);
      const bilan = await store.importerJson(paquet);
      message(`Sauvegarde restaurée : ${bilan.vins} vins, ${bilan.degustations} dégustations`);
      naviguer('/cave');
    } catch (erreur) {
      console.error(erreur);
      message(erreur.message || 'Restauration impossible', 'erreur');
    }
  });

  const declencheurImport = el('label', { class: 'bouton', for: 'import-sauvegarde', tabindex: '0' },
    [el('span', { text: 'Restaurer une sauvegarde' })]);
  declencheurImport.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') entreeImport.click();
  });

  const racine = el('div', { class: 'vue-reglages' }, [
    el('header', { class: 'entete-vue' }, [el('h1', { text: 'Réglages' })]),

    section('Apparence', el('div', { class: 'grille-deux' }, [
      el('label', { class: 'champ' }, [
        el('span', { class: 'champ-etiquette', text: 'Thème' }),
        selection(THEMES, prefs.theme, {
          onchange: (e) => {
            store.enregistrerPreferences({ theme: e.target.value });
            appliquerTheme(e.target.value);
          },
        }),
      ]),
    ])),

    section('Synchronisation', [etatSynchronisation()]),

    section('Sauvegarde', [
      el('p', {
        class: 'discret',
        text: store.partageBranche()
          ? 'La cave est partagée entre les appareils qui y ont accès. Une sauvegarde '
            + 'reste utile pour garder une copie hors de l’application.'
          : 'La cave est enregistrée dans ce navigateur. Exportez une sauvegarde avant '
            + 'de changer d’appareil ou de vider les données du navigateur.',
      }),
      el('div', { class: 'rangee-boutons' }, [
        bouton('Sauvegarde complète (JSON)', {
          classe: 'bouton bouton-primaire',
          onclick: () => remettre(exporter.sauvegardeComplete, 'Sauvegarde enregistrée'),
        }),
        declencheurImport,
        entreeImport,
      ]),
      el('div', { class: 'rangee-boutons' }, [
        bouton('Exporter les vins (CSV)', {
          onclick: () => remettre(exporter.exportVinsCsv, 'Liste des vins enregistrée'),
        }),
        bouton('Exporter les dégustations (CSV)', {
          onclick: () => remettre(exporter.exportDegustationsCsv, 'Journal enregistré'),
        }),
      ]),
      el('p', { class: 'discret', text: etat.majLe ? `Dernière modification : ${dateLisible(etat.majLe)}` : '' }),
    ]),

    section('Données du classeur', [
      el('p', {
        class: 'discret',
        text: 'La cave a été initialisée à partir du classeur Excel. La remise à zéro '
          + 'restaure exactement ce contenu et efface les photos prises depuis l’application.',
      }),
      el('div', { class: 'rangee-boutons' }, [
        bouton('Repartir du classeur', {
          classe: 'bouton bouton-danger-discret',
          onclick: async () => {
            const accord = await confirmer(
              'Repartir du classeur',
              'Toutes les modifications faites dans l’application seront perdues.',
              { libelleAction: 'Remettre à zéro', danger: true },
            );
            if (!accord) return;
            try {
              await store.reinitialiser();
              message('Cave réinitialisée');
              naviguer('/cave');
            } catch (erreur) {
              console.error(erreur);
              message('Réinitialisation impossible', 'erreur');
            }
          },
        }),
      ]),
    ]),

    section('À propos', el('dl', { class: 'definitions' }, [
      el('dt', { text: 'Vins en fiche' }),
      el('dd', { text: String(store.vins().length) }),
      el('dt', { text: 'Dégustations' }),
      el('dd', { text: String(store.degustations().length) }),
      el('dt', { text: 'Stockage' }),
      el('dd', {
        text: store.partageBranche()
          ? 'Ce navigateur, et un espace partagé rattaché à votre compte, ouvert '
            + 'aux appareils que vous avez autorisés'
          : 'Ce navigateur seulement, aucune donnée envoyée en ligne',
      }),
    ])),
  ]);

  conteneur.append(racine);
  suivreSynchro(racine, naviguer);
}

/**
 * Redessine la page quand la synchronisation change d'état.
 *
 * Le partage se branche une seconde après l'affichage. Sans cela, quelqu'un
 * qui ouvre les réglages au démarrage lirait « Cet appareil seulement » alors
 * que la cave vient justement de se connecter : c'est l'écran qu'on consulte
 * pour comprendre, il ne peut pas être celui qui trompe.
 */
function suivreSynchro(racine, naviguer) {
  let dernier = store.etatSynchro();
  const desabonner = store.abonner(() => {
    if (!racine.isConnected) { desabonner(); return; }
    if (store.etatSynchro() === dernier) return;
    dernier = store.etatSynchro();
    desabonner();
    naviguer(null);
  });
}

/**
 * Remet un fichier et ne dit « c'est fait » que si ça l'est.
 *
 * Selon l'endroit où tourne l'application, l'enregistrement passe par le
 * navigateur ou par l'hébergeur, qui demande alors confirmation. Un refus se
 * passe de commentaire, la personne vient de le formuler.
 */
async function remettre(action, reussite) {
  try {
    if (await action() === 'enregistre') message(reussite);
  } catch (erreur) {
    console.error(erreur);
    message(`Enregistrement impossible : ${erreur.message}`, 'erreur');
  }
}

const ETATS_SYNCHRO = {
  connecte: {
    titre: 'Active',
    texte: 'La cave est partagée entre vos appareils et ceux des personnes à qui '
      + 'vous avez donné le droit de modifier. Une bouteille ouverte sur l’un '
      + 'apparaît sur les autres en quelques secondes.',
  },
  attente: {
    titre: 'En attente',
    texte: 'Le partage ne répond pas pour le moment. Vos modifications sont '
      + 'conservées ici et seront envoyées dès que possible.',
  },
  horsCompte: {
    titre: 'Connexion requise',
    texte: 'Le partage passe par un compte, et cet appareil n’y est pas '
      + 'connecté. La cave reste donc dans ce navigateur. Connectez-vous '
      + 'depuis le bandeau en haut de la page, puis rouvrez le lien.',
  },
  local: {
    titre: 'Cet appareil seulement',
    texte: 'Cette version de l’application ne partage rien : la cave vit dans '
      + 'ce navigateur. Passez par une sauvegarde pour la transporter.',
  },
};

function etatSynchronisation() {
  const etat = store.etatSynchro();
  const { titre, texte } = ETATS_SYNCHRO[etat] || ETATS_SYNCHRO.local;
  return el('div', { class: 'synchro' }, [
    el('span', { class: `pastille-synchro ${etat}`, text: titre }),
    el('p', { class: 'discret', text: texte }),
  ]);
}

function dateLisible(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'short' });
}
