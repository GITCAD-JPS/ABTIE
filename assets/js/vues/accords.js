// Accords mets et vins : choisir un plat, voir quelles bouteilles de la cave
// lui vont, les meilleures d'abord.

import { bouton, el, etoiles, pluriel, vider } from '../dom.js';
import { etatVide, pastilleCouleur, sousTitre, vignette } from '../composants.js';
import { LIBELLE_PLAT, PLATS, vinsPourPlat } from '../accords.js';
import { dialogueBoire } from '../formulaires.js';
import * as store from '../store.js';

// Le plat choisi survit à l'aller-retour vers une fiche.
let platChoisi = '';
let toutAfficher = false;

// En dessous de ce score, l'accord est défendable mais banal : on ne l'impose
// pas dans une liste consultée debout devant la cave.
const SCORE_NOTABLE = 3;

export function rendre(conteneur, { naviguer }) {
  const vins = store.vins();
  vider(conteneur);

  conteneur.append(el('div', { class: 'vue-accords' }, [
    el('header', { class: 'entete-vue' }, [
      el('div', {}, [
        el('h1', { text: 'Accords mets et vins' }),
        el('p', { class: 'discret', text: 'Que boire avec quoi, parmi vos bouteilles en cave' }),
      ]),
    ]),
    choixDuPlat(naviguer),
    platChoisi ? resultats(vins, naviguer) : invite(),
  ]));
}

function choixDuPlat(naviguer) {
  return el('div', { class: 'choix-plats' }, PLATS.map((plat) => el('button', {
    type: 'button',
    class: `puce${platChoisi === plat.cle ? ' active' : ''}`,
    'aria-pressed': String(platChoisi === plat.cle),
    text: plat.libelle,
    onclick: () => {
      platChoisi = platChoisi === plat.cle ? '' : plat.cle;
      toutAfficher = false;
      naviguer(null);
    },
  })));
}

function invite() {
  return etatVide(
    'Choisissez un plat',
    'Les bouteilles de la cave qui lui conviennent apparaîtront classées, '
    + 'avec leur température de service.',
  );
}

function resultats(vins, naviguer) {
  const trouves = vinsPourPlat(vins, platChoisi);
  const libelle = LIBELLE_PLAT.get(platChoisi) || platChoisi;

  if (!trouves.length) {
    return etatVide(
      `Rien d'évident pour « ${libelle} »`,
      "Aucune bouteille en cave ne ressort pour ce plat. Le cépage ou l'appellation "
      + 'manquent peut-être sur certaines fiches.',
    );
  }

  const notables = trouves.filter((e) => e.score >= SCORE_NOTABLE);
  const larges = trouves.filter((e) => e.score < SCORE_NOTABLE);
  const montres = toutAfficher || !notables.length ? trouves : notables;
  const bouteilles = montres.reduce((total, e) => total + e.vin.quantite, 0);

  return el('section', { class: 'bloc' }, [
    el('div', { class: 'bloc-entete' }, [
      el('h2', { text: libelle }),
      el('span', {
        class: 'compte',
        text: `${pluriel(montres.length, 'vin', 'vins')} · ${pluriel(bouteilles, 'bouteille', 'bouteilles')}`,
      }),
    ]),
    el('div', { class: 'liste-accords' }, montres.map((entree) => ligneAccord(entree, naviguer))),
    larges.length && !toutAfficher && notables.length
      ? bouton(`Voir ${pluriel(larges.length, 'accord plus large', 'accords plus larges')}`, {
        classe: 'bouton bouton-large',
        onclick: () => { toutAfficher = true; naviguer(null); },
      })
      : null,
  ]);
}

function ligneAccord({ vin, score, raison, personnel, profil }, naviguer) {
  const ouvrir = el('button', {
    type: 'button',
    class: 'accord-ouvrir',
    'aria-label': `Ouvrir la fiche de ${vin.nom}`,
    onclick: () => naviguer(`/vin/${vin.id}`),
  }, [
    vignette(vin, { taille: 'petite' }),
    el('div', { class: 'accord-texte' }, [
      el('div', { class: 'accord-titre' }, [
        el('h3', { text: vin.nom }),
        etoilesAffinite(score),
      ]),
      el('p', { class: 'carte-soustitre', text: sousTitre(vin) || '—' }),
      el('p', {
        class: personnel ? 'accord-raison accord-raison-perso' : 'accord-raison',
        text: personnel ? `Votre note : ${raison}` : raison,
      }),
      el('div', { class: 'carte-meta' }, [
        pastilleCouleur(vin.couleur),
        profil.temperature
          ? el('span', { class: 'etiquette', text: `à servir ${profil.temperature}` })
          : null,
        el('span', { class: 'discret', text: pluriel(vin.quantite, 'bouteille', 'bouteilles') }),
        vin.notation !== null ? etoiles(vin.notation) : null,
      ]),
    ]),
  ]);

  return el('article', { class: 'accord' }, [
    ouvrir,
    bouton('Ouvrir celle-ci', {
      icone: 'verre',
      classe: 'bouton',
      onclick: () => dialogueBoire(vin, { onFait: () => naviguer(null) }),
    }),
  ]);
}

/** Affinité de 1 à 4, rendue par des verres pleins. */
function etoilesAffinite(score) {
  const niveaux = ['', 'correct', 'bon', 'très bon', 'idéal'];
  return el('span', {
    class: `affinite affinite-${score}`,
    title: `Accord ${niveaux[score] || ''}`,
    text: '●'.repeat(score).padEnd(4, '○'),
  });
}
