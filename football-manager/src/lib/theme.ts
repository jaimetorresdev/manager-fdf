export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'fdf_theme';

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Colour by rating (0-99) — classic manager scale: red → amber → teal → green. */
export function ratingColor(pct: number): string {
  if (pct >= 88) return 'var(--green-primary)';
  if (pct >= 70) return 'var(--teal-accent)';
  if (pct >= 45) return 'var(--gold-accent)';
  return 'var(--red-danger)';
}
