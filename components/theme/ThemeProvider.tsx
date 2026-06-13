'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * dark/light dual mode (wxapp design language §5.1): follow-system by default,
 * manual override persisted to localStorage. The resolved theme toggles the
 * `dark` class on <html>, which drives every Tailwind dark: variant. The
 * pre-hydration inline script in app/layout.tsx applies the same logic before
 * first paint so there is no flash; this provider takes over after mount.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  resolved: 'light',
  setMode: () => {},
});

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server renders with 'auto'/'light'; the real values land on mount. The html
  // class itself is already correct pre-hydration via the inline script.
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [system, setSystem] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') setModeState(stored);
    setSystem(systemTheme());
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'auto' ? system : mode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // storage unavailable (private mode) — the toggle still works, just unpersisted
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeContext);
