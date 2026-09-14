// Coordonnées de la base partagée.
//
// Ce fichier est le seul à changer d'une installation à l'autre. Tant qu'il
// est vide, l'application fonctionne normalement mais sans partage, et le dit.
//
// Les deux valeurs sont publiques par nature : elles voyagent dans chaque page
// servie. Ce n'est pas ce qui protège la cave. La protection tient au code
// d'accès, qui fait partie du chemin des données et n'est écrit nulle part
// ici.

export const CONFIGURATION = {
  projet: '',
  cle: '',
  // Séparée pour qu'un banc d'essai puisse viser une base locale, et parce
  // qu'un service qui change d'adresse ne doit pas obliger à toucher au code.
  racine: 'https://firestore.googleapis.com/v1',
};
