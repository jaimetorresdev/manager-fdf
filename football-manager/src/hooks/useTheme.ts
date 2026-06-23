import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, THEME_STORAGE_KEY, type Theme } from '../lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return {
    theme,
    isLight: theme === 'light',
    toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light'),
  };
}
