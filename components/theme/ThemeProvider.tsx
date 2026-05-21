'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { applyThemeToRoot, DEFAULT_THEME, THEMES, type ThemeKey, type ThemeTokens } from './tokens';

type ThemeContextValue = {
  theme: ThemeKey;
  tokens: ThemeTokens;
  setTheme: (t: ThemeKey) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  tokens: THEMES[DEFAULT_THEME],
  setTheme: () => {},
});

const STORAGE_KEY = 'dahua-theme';

export function ThemeProvider({
  children,
  initial = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  initial?: ThemeKey;
}) {
  const [theme, setThemeState] = useState<ThemeKey>(initial);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
    if (stored && THEMES[stored]) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  const setTheme = (t: ThemeKey) => {
    setThemeState(t);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, t);
  };

  return (
    <ThemeContext.Provider value={{ theme, tokens: THEMES[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
