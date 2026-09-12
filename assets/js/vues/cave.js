// Vue principale : la cave, avec recherche, filtres et tri.
//
// La barre de recherche est construite une seule fois et conservée d'un rendu
// à l'autre : sans cela, la frappe perdrait le focus à chaque caractère.

import { bouton, el, icone, pluriel, selection, vider } from '../dom.js';
import { carteVin, etatVide } from '../composants.js';
import {
  COULEURS, EMPLACEMENTS, FILTRES_PAR_DEFAUT, TRIS,
  filtrerVins, filtresActifs, valeursDistinctes,
} from '../model.js';
import { dialogueBoire } from '../formulaires.js';
import * as store from '../store.js';

// Les filtres survivent à l'ouverture d'une fiche : on les garde hors du rendu.
let filtres = { ...FILTRES_PAR_DEFAUT };
let panneauOuvert = false;
let coquille = null;

export function reinitialiserFiltres() {
  filtres = { ...FILTRES_PAR_DEFAUT };
  if (coquille) coquille.recherche.value = '';
}

export function appliquerFiltres(modifications) {
  filtres = { ...filtres, ...modifications };
  if (coquille && 'recherche' in modifications) {
    coquille.recherche.value = modifications.recherche;
  }
}

export function rendre(conteneur, { naviguer }) {
  if (!coquille || !coquille.racine.isConnected) coquille = construireCoquille();
  if (conteneur.firstChild !== coquille.racine) {
    vider(conteneur).append(coquille.racine);
  }
  coquille.naviguer = naviguer;
  rafraichir();
}

function construireCoquille() {
  const recherche = el('input', {
    type: 'search',
    class: 'recherche',
    placeholder: 'Rechercher un vin, un producteur, une région…',
    'aria-label': 'Rechercher dans la cave',
  });
  let minuteur = null;
  recherche.addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      filtres.recherche = recherche.value;
      rafraichir();
    }, 160);
  });

  const basculer = el('button', {
    type: 'button',
    class: 'bouton bouton-filtres',
    onclick: () => { panneauOuvert = !panneauOuvert; rafraichir(); },
  });
  basculer.append(icone('filtre'), el('span', { text: 'Filtres' }));
  const compteurFiltres = el('span', { class: 'pastille-nombre' });
  basculer.append(compteurFiltres);

  const panneau = el('div', { class: 'panneau-filtres', hidden: true });
  const compte = el('p', { class: 'compte' });
  const tri = selection(
    TRIS.map((t) => ({ valeur: t.cle, libelle: t.libelle })),
    filtres.tri,
    { class: 'tri', 'aria-label': 'Trier les résultats' },
  );
  tri.addEventListener('change', () => { filtres.tri = tri.value; rafraichir(); });

  const liste = el('div', { class: 'zone-liste' });
  const racine = el('div', { class: 'vue-cave' }, [
    el('div', { class: 'barre-recherche' }, [recherche, basculer]),
    panneau,
    el('div', { class: 'barre-resultats' }, [compte, tri]),
    liste,
  ]);

  return { racine, recherche, basculer, compteurFiltres, panneau, compte, tri, liste, naviguer: null };
}

function rafraichir() {
  const { naviguer } = coquille;
  const vins = store.vins();
  const resultats = filtrerVins(vins, filtres);
  const bouteilles = resultats.reduce((total, v) => total + v.quantite, 0);

  const nombreFiltres = filtresActifs(filtres);
  coquille.basculer.classList.toggle('actif', nombreFiltres > 0);
  coquille.basculer.setAttribute('aria-expanded', String(panneauOuvert));
  coquille.compteurFiltres.textContent = nombreFiltres ? String(nombreFiltres) : '';
  coquille.compteurFiltres.hidden = nombreFiltres === 0;

  coquille.panneau.hidden = !panneauOuvert;
  if (panneauOuvert) remplirPanneau(coquille.panneau, vins);

  coquille.tri.value = filtres.tri;
  coquille.compte.textContent =
    `${pluriel(resultats.length, 'vin', 'vins')} · ${pluriel(bouteilles, 'bouteille', 'bouteilles')}`;

  vider(coquille.liste);
  if (!resultats.length) {
    coquille.liste.append(etatVide(
      'Aucun vin ne correspond',
      'Essayez une autre recherche ou retirez un filtre.',
      bouton('Tout afficher', {
        classe: 'bouton bouton-primaire',
        onclick: () => { reinitialiserFiltres(); rafraichir(); },
      }),
    ));
    return;
  }
  coquille.liste.append(el('div', { class: 'grille-cartes' }, resultats.map((vin) => carteVin(vin, {
    onOuvrir: (v) => naviguer(`/vin/${v.id}`),
    onBoire: (v) => dialogueBoire(v, { onFait: rafraichir }),
  }))));
}

function remplirPanneau(panneau, vins) {
  const majFiltre = (cle) => (evenement) => {
    filtres[cle] = evenement.target.value;
    rafraichir();
  };

  const optionsCouleur = [{ valeur: '', libelle: 'Toutes les couleurs' }]
    .concat(COULEURS
      .filter((c) => vins.some((v) => v.couleur === c.cle))
      .map((c) => ({ valeur: c.cle, libelle: c.libelle })));
  const optionsEmplacement = [{ valeur: '', libelle: 'Tous les emplacements' }]
    .concat(EMPLACEMENTS.map((e) => ({ valeur: e.cle, libelle: e.libelle })));
  const optionsRegion = [{ valeur: '', libelle: 'Toutes les régions' }]
    .concat(valeursDistinctes(vins, 'region').map((r) => ({ valeur: r, libelle: r })));
  const optionsProvenance = [{ valeur: '', libelle: 'Toutes les provenances' }]
    .concat(valeursDistinctes(vins, 'provenance').map((p) => ({ valeur: p, libelle: p })));
  const optionsStatut = [
    { valeur: 'en-cave', libelle: 'En cave' },
    { valeur: 'termine', libelle: 'Terminés' },
    { valeur: '', libelle: 'Tous' },
  ];

  const caseAnomalies = el('input', {
    type: 'checkbox', checked: filtres.anomalies,
    onchange: (e) => { filtres.anomalies = e.target.checked; rafraichir(); },
  });

  vider(panneau).append(
    el('div', { class: 'grille-filtres' }, [
      selection(optionsStatut, filtres.statut, { 'aria-label': 'Statut', onchange: majFiltre('statut') }),
      selection(optionsCouleur, filtres.couleur, { 'aria-label': 'Couleur', onchange: majFiltre('couleur') }),
      selection(optionsEmplacement, filtres.emplacement, { 'aria-label': 'Emplacement', onchange: majFiltre('emplacement') }),
      selection(optionsRegion, filtres.region, { 'aria-label': 'Région', onchange: majFiltre('region') }),
      selection(optionsProvenance, filtres.provenance, { 'aria-label': 'Provenance', onchange: majFiltre('provenance') }),
    ]),
    el('div', { class: 'ligne-filtres' }, [
      el('label', { class: 'case' }, [caseAnomalies, el('span', { text: 'À vérifier seulement' })]),
      bouton('Réinitialiser', {
        classe: 'bouton-lien',
        onclick: () => { reinitialiserFiltres(); rafraichir(); },
      }),
    ]),
  );
}
