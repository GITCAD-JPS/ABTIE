// Thème clair, sombre ou celui du système.

const COULEURS_BARRE = { clair: '#faf7f3', sombre: '#17110f' };

export function appliquerTheme(theme = 'auto') {
  const racine = document.documentElement;
  if (theme === 'clair' || theme === 'sombre') racine.dataset.theme = theme;
  else delete racine.dataset.theme;

  const sombre = theme === 'sombre'
    || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const balise = document.querySelector('meta[name="theme-color"]');
  if (balise) balise.setAttribute('content', sombre ? COULEURS_BARRE.sombre : COULEURS_BARRE.clair);
}

/** Suit le réglage du système tant que l'utilisateur laisse le thème sur « auto ». */
export function suivreSysteme(lireTheme) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (lireTheme() === 'auto') appliquerTheme('auto');
  });
}
