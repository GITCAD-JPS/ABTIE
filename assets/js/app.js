// Point d'entrée : routage par ancre, barre de navigation, montage des vues.

import { $, dialogue, el, icone, message, vider } from './dom.js';
import { formulaireVin, installerSuggestions } from './formulaires.js';
import * as store from './store.js';
import { appliquerTheme, suivreSysteme } from './theme.js';

import * as vueCave from './vues/cave.js';
import * as vueFiche from './vues/fiche.js';
import * as vueDegustations from './vues/degustations.js';
import * as vueStatistiques from './vues/statistiques.js';
import * as vueReglages from './vues/reglages.js';

const ONGLETS = [
  { chemin: '/cave', libelle: 'Cave', icone: 'cave' },
  { chemin: '/degustations', libelle: 'Journal', icone: 'verre' },
  { chemin: '/statistiques', libelle: 'Statistiques', icone: 'graphique' },
  { chemin: '/reglages', libelle: 'Réglages', icone: 'reglages' },
];

const ROUTES = [
  { motif: /^\/cave$/, vue: vueCave, titre: 'Cave' },
  { motif: /^\/vin\/([^/]+)$/, vue: vueFiche, titre: 'Fiche', params: ['id'] },
  { motif: /^\/degustations$/, vue: vueDegustations, titre: 'Dégustations' },
  { motif: /^\/statistiques$/, vue: vueStatistiques, titre: 'Statistiques' },
  { motif: /^\/reglages$/, vue: vueReglages, titre: 'Réglages' },
];

const principal = $('#principal');
let routeCourante = null;

function cheminCourant() {
  const ancre = location.hash.replace(/^#/, '');
  return ancre.startsWith('/') ? ancre : '/cave';
}

function resoudre(chemin) {
  for (const route of ROUTES) {
    const trouve = chemin.match(route.motif);
    if (!trouve) continue;
    const params = {};
    (route.params || []).forEach((nom, index) => { params[nom] = decodeURIComponent(trouve[index + 1]); });
    return { ...route, params };
  }
  return null;
}

/**
 * Navigue vers un chemin. `naviguer(null)` redessine la vue courante, ce dont
 * les vues se servent après une modification des données.
 */
function naviguer(chemin) {
  if (chemin === null) {
    rendre();
    return;
  }
  if (cheminCourant() === chemin) {
    rendre();
    return;
  }
  location.hash = chemin;
}

function rendre() {
  const chemin = cheminCourant();
  const route = resoudre(chemin);

  if (!route) {
    location.replace('#/cave');
    return;
  }
  const changementDeVue = routeCourante?.vue !== route.vue;
  routeCourante = route;
  document.title = `${route.titre} — Cave à vin`;

  if (changementDeVue) vider(principal);
  route.vue.rendre(principal, { naviguer, params: route.params });
  majOnglets(chemin);
  if (changementDeVue) principal.scrollTo({ top: 0 });
}

function majOnglets(chemin) {
  for (const lien of document.querySelectorAll('.onglet')) {
    const actif = chemin === lien.dataset.chemin
      || (lien.dataset.chemin === '/cave' && chemin.startsWith('/vin/'));
    lien.classList.toggle('actif', actif);
    if (actif) lien.setAttribute('aria-current', 'page');
    else lien.removeAttribute('aria-current');
  }
}

function construireNavigation() {
  const barre = $('#navigation');
  vider(barre);
  for (const onglet of ONGLETS) {
    const lien = el('a', {
      class: 'onglet',
      href: `#${onglet.chemin}`,
      dataset: { chemin: onglet.chemin },
    }, [icone(onglet.icone), el('span', { text: onglet.libelle })]);
    barre.append(lien);
  }
}

function ouvrirNouveauVin() {
  dialogue('Ajouter un vin', (fermer) => formulaireVin(null, {
    onEnregistre: (vin) => {
      fermer();
      if (vin) naviguer(`/vin/${vin.id}`);
    },
  }), { largeur: '44rem' });
}

async function demarrer() {
  construireNavigation();
  $('#ajouter-vin').addEventListener('click', ouvrirNouveauVin);
  window.addEventListener('hashchange', rendre);

  try {
    await store.charger();
  } catch (erreur) {
    console.error(erreur);
    vider(principal).append(el('div', { class: 'etat-vide' }, [
      el('h3', { text: 'Chargement impossible' }),
      el('p', {
        text: "Les données de la cave n'ont pas pu être lues. Ouvrez l'application "
          + 'depuis un serveur web plutôt que directement depuis le fichier.',
      }),
      el('p', { class: 'discret', text: String(erreur.message || erreur) }),
    ]));
    return;
  }

  appliquerTheme(store.preferences().theme);
  suivreSysteme(() => store.preferences().theme);
  installerSuggestions();
  store.abonner(installerSuggestions);

  document.body.classList.remove('chargement');
  rendre();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((erreur) => {
      console.info('Mode hors ligne indisponible', erreur);
    });
  }
}

window.addEventListener('error', (evenement) => {
  console.error(evenement.error || evenement.message);
  message('Une erreur est survenue', 'erreur');
});

demarrer();
