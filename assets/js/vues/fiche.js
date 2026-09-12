// Fiche détaillée d'un vin.

import { bouton, confirmer, dialogue, el, etoiles, icone, message, pluriel, vider } from '../dom.js';
import {
  badgesAnomalies, etatVide, section, sousTitre, pastilleCouleur, vignette,
} from '../composants.js';
import { EMPLACEMENTS, libelleCouleur, trierDegustations } from '../model.js';
import {
  dialogueAjouterBouteilles, dialogueBoire, dialogueDeplacer, formulaireVin,
} from '../formulaires.js';
import * as store from '../store.js';

export function rendre(conteneur, { naviguer, params }) {
  const vin = store.trouverVin(params.id);
  vider(conteneur);

  if (!vin) {
    conteneur.append(etatVide(
      'Fiche introuvable',
      "Ce vin n'est plus dans la cave.",
      bouton('Retour à la cave', { classe: 'bouton bouton-primaire', onclick: () => naviguer('/cave') }),
    ));
    return;
  }

  const rafraichir = () => naviguer(null);

  conteneur.append(
    el('div', { class: 'fiche' }, [
      enteteFiche(vin, naviguer),
      stock(vin, rafraichir),
      actions(vin, naviguer, rafraichir),
      caracteristiques(vin),
      vin.note ? section('Note personnelle', el('p', { class: 'texte-note', text: vin.note })) : null,
      historique(vin, naviguer),
    ]),
  );
}

function enteteFiche(vin, naviguer) {
  const photo = el('button', {
    type: 'button',
    class: 'photo-bouton',
    title: "Agrandir l'étiquette",
    'aria-label': `Agrandir l'étiquette de ${vin.nom}`,
    onclick: () => agrandirPhoto(vin),
  }, [vignette(vin, { taille: 'grande' })]);

  const titre = el('div', { class: 'fiche-titre' }, [
    el('h1', { text: vin.nom }),
    el('p', { class: 'fiche-soustitre', text: sousTitre(vin) || '—' }),
    el('div', { class: 'carte-meta' }, [
      pastilleCouleur(vin.couleur),
      vin.statut === 'termine'
        ? el('span', { class: 'etiquette etiquette-termine', text: 'Terminé' })
        : null,
      vin.notation !== null ? etoiles(vin.notation) : null,
    ]),
    badgesAnomalies(vin),
  ]);

  return el('header', { class: 'fiche-entete' }, [
    bouton('Retour', {
      icone: 'retour', classe: 'bouton bouton-retour', onclick: () => naviguer('/cave'),
    }),
    el('div', { class: 'fiche-entete-corps' }, [photo, titre]),
  ]);
}

function stock(vin, rafraichir) {
  const lignes = EMPLACEMENTS.map(({ cle, libelle }) => {
    const nombre = vin.emplacements[cle] || 0;
    const moins = el('button', {
      type: 'button', class: 'bouton-icone', 'aria-label': `Retirer une bouteille de ${libelle}`,
      disabled: nombre === 0,
      onclick: () => { store.retirerBouteilles(vin.id, cle, 1); rafraichir(); },
    });
    moins.append(icone('moins'));
    const plus = el('button', {
      type: 'button', class: 'bouton-icone', 'aria-label': `Ajouter une bouteille en ${libelle}`,
      onclick: () => { store.ajouterBouteilles(vin.id, cle, 1); rafraichir(); },
    });
    plus.append(icone('plus'));
    return el('li', { class: nombre ? 'stock-ligne' : 'stock-ligne vide' }, [
      el('span', { class: 'stock-libelle', text: libelle }),
      el('span', { class: 'stock-controles' }, [moins, el('span', { class: 'stock-nombre', text: String(nombre) }), plus]),
    ]);
  });

  const rangees = vin.bouteillesRangees;
  const ecart = vin.quantite !== rangees;

  return section('Stock', [
    el('div', { class: 'stock-total' }, [
      el('span', { class: 'stock-total-valeur', text: String(vin.quantite) }),
      el('span', { class: 'stock-total-libelle', text: vin.quantite > 1 ? 'bouteilles' : 'bouteille' }),
      vin.volume ? el('span', { class: 'discret', text: vin.volume }) : null,
    ]),
    el('ul', { class: 'stock-liste' }, lignes),
    ecart
      ? el('p', {
        class: 'avertissement',
        text: `${pluriel(rangees, 'bouteille rangée', 'bouteilles rangées')} sur ${vin.quantite} : `
          + 'complétez les emplacements ou corrigez la quantité dans la fiche.',
      })
      : null,
    vin.emplacementPrecis
      ? el('p', { class: 'discret', text: `Emplacement précis : ${vin.emplacementPrecis}` })
      : null,
  ]);
}

function actions(vin, naviguer, rafraichir) {
  const boutons = [];
  if (vin.quantite > 0) {
    boutons.push(bouton('Ouvrir une bouteille', {
      icone: 'verre',
      classe: 'bouton bouton-primaire',
      onclick: () => dialogueBoire(vin, { onFait: rafraichir }),
    }));
  }
  boutons.push(
    bouton('Ajouter des bouteilles', {
      icone: 'plus',
      onclick: () => dialogueAjouterBouteilles(vin, { onFait: rafraichir }),
    }),
    bouton('Déplacer', {
      icone: 'deplacer',
      onclick: () => dialogueDeplacer(vin, { onFait: rafraichir }),
    }),
    bouton('Modifier', {
      icone: 'crayon',
      onclick: () => ouvrirEdition(vin, rafraichir),
    }),
    bouton('Supprimer', {
      icone: 'poubelle',
      classe: 'bouton bouton-danger-discret',
      onclick: async () => {
        const accord = await confirmer(
          'Supprimer cette fiche',
          `« ${vin.nom} » sera retiré de la cave. Les dégustations déjà enregistrées sont conservées.`,
          { libelleAction: 'Supprimer', danger: true },
        );
        if (!accord) return;
        store.supprimerVin(vin.id);
        message('Fiche supprimée');
        naviguer('/cave');
      },
    }),
  );
  return el('div', { class: 'fiche-actions' }, boutons);
}

function ouvrirEdition(vin, rafraichir) {
  dialogue(`Modifier — ${vin.nom}`, (fermer) => formulaireVin(vin, {
    onEnregistre: () => { fermer(); rafraichir(); },
  }), { largeur: '44rem' });
}

function caracteristiques(vin) {
  const entrees = [
    ['Producteur', vin.producteur],
    ['Région / Appellation', vin.region],
    ['Cépage', vin.cepage],
    ['Couleur', libelleCouleur(vin.couleur)],
    ['Millésime', vin.millesime],
    ['Volume', vin.volume],
    ['Degré', vin.degre !== null ? `${String(vin.degre).replace('.', ',')} %` : ''],
    ['Provenance', vin.provenance],
    ['Offert par / Acheté chez', vin.source],
    ['Date de réception', vin.dateReception],
  ].filter(([, valeur]) => valeur !== '' && valeur !== null && valeur !== undefined);

  return section('Caractéristiques', el('dl', { class: 'definitions' },
    entrees.flatMap(([cle, valeur]) => [
      el('dt', { text: cle }),
      el('dd', { text: String(valeur) }),
    ])));
}

function historique(vin, naviguer) {
  const liste = trierDegustations(store.degustationsDuVin(vin.id));
  if (!liste.length) {
    return section('Dégustations', el('p', {
      class: 'discret',
      text: "Aucune bouteille de ce vin n'a encore été enregistrée comme bue.",
    }));
  }
  return section('Dégustations', el('ul', { class: 'historique' }, liste.map((d) => el('li', {}, [
    el('span', { class: 'historique-date', text: d.date || 'Date inconnue' }),
    el('div', { class: 'historique-corps' }, [
      el('span', { text: [d.contexte, d.lieu].filter(Boolean).join(' · ') || 'Dégustation' }),
      d.notation !== null ? etoiles(d.notation) : null,
      d.commentaire ? el('p', { class: 'texte-note', text: d.commentaire }) : null,
    ]),
  ]))), bouton('Voir le journal', {
    classe: 'bouton-lien', onclick: () => naviguer('/degustations'),
  }));
}

function agrandirPhoto(vin) {
  dialogue(vin.nom, () => {
    const cadre = vignette(vin, { taille: 'plein' });
    return el('div', { class: 'photo-plein' }, [cadre]);
  }, { largeur: '40rem' });
}
