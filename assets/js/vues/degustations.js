// Journal des dégustations : les bouteilles bues à la maison et celles
// goûtées ailleurs, réunies sur une même ligne du temps.

import { bouton, confirmer, dialogue, el, message, pluriel, selection, vider } from '../dom.js';
import { etatVide, ligneDegustation } from '../composants.js';
import { sansAccent, trierDegustations } from '../model.js';
import { formulaireDegustation } from '../formulaires.js';
import * as store from '../store.js';

const FILTRES = [
  { valeur: '', libelle: 'Toutes les dégustations' },
  { valeur: 'cave', libelle: 'Issues de la cave' },
  { valeur: 'hors-cave', libelle: 'Hors cave' },
  { valeur: 'notees', libelle: 'Notées' },
];

let filtre = '';
let recherche = '';

export function rendre(conteneur, { naviguer }) {
  const toutes = trierDegustations(store.degustations());
  const resultats = filtrer(toutes);

  vider(conteneur);
  conteneur.append(el('div', { class: 'vue-degustations' }, [
    el('header', { class: 'entete-vue' }, [
      el('div', {}, [
        el('h1', { text: 'Dégustations' }),
        el('p', { class: 'discret', text: `${pluriel(toutes.length, 'entrée', 'entrées')} au journal` }),
      ]),
      bouton('Ajouter', {
        icone: 'plus',
        classe: 'bouton bouton-primaire',
        onclick: () => ouvrirFormulaire(null, naviguer),
      }),
    ]),
    barreOutils(naviguer),
    resultats.length
      ? el('div', { class: 'liste-degustations' }, resultats.map((d) => ligneDegustation(d, {
        onOuvrir: (id) => naviguer(`/vin/${id}`),
        onModifier: (entree) => ouvrirFormulaire(entree, naviguer),
      })))
      : etatVide('Aucune dégustation', 'Modifiez la recherche ou ajoutez une entrée au journal.'),
  ]));
}

function barreOutils(naviguer) {
  const champRecherche = el('input', {
    type: 'search',
    class: 'recherche',
    placeholder: 'Rechercher dans le journal…',
    value: recherche,
    'aria-label': 'Rechercher dans le journal',
  });
  let minuteur = null;
  champRecherche.addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      recherche = champRecherche.value;
      naviguer(null);
      document.querySelector('.vue-degustations .recherche')?.focus();
    }, 200);
  });

  return el('div', { class: 'barre-recherche' }, [
    champRecherche,
    selection(FILTRES, filtre, {
      'aria-label': 'Filtrer le journal',
      onchange: (e) => { filtre = e.target.value; naviguer(null); },
    }),
  ]);
}

function filtrer(degustations) {
  const mots = sansAccent(recherche).split(/\s+/).filter(Boolean);
  return degustations.filter((d) => {
    if (filtre === 'cave' && !d.vinId) return false;
    if (filtre === 'hors-cave' && d.vinId) return false;
    if (filtre === 'notees' && d.notation === null) return false;
    if (!mots.length) return true;
    const cible = sansAccent([
      d.nom, d.producteur, d.region, d.cepage, d.contexte, d.lieu, d.commentaire, d.date,
    ].filter(Boolean).join(' '));
    return mots.every((m) => cible.includes(m));
  });
}

function ouvrirFormulaire(degustation, naviguer) {
  const titre = degustation ? `Modifier — ${degustation.nom}` : 'Nouvelle dégustation';
  dialogue(titre, (fermer) => {
    const formulaire = formulaireDegustation(degustation, {
      onEnregistre: () => { fermer(); naviguer(null); },
    });
    if (degustation) {
      formulaire.querySelector('.formulaire-actions').prepend(bouton('Supprimer', {
        classe: 'bouton bouton-danger-discret',
        onclick: async () => {
          const accord = await confirmer(
            'Supprimer cette dégustation',
            `L'entrée « ${degustation.nom} » sera retirée du journal.`,
            { libelleAction: 'Supprimer', danger: true },
          );
          if (!accord) return;
          store.supprimerDegustation(degustation.id);
          message('Dégustation supprimée');
          fermer();
          naviguer(null);
        },
      }));
    }
    return formulaire;
  }, { largeur: '44rem' });
}
