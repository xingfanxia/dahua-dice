'use client';

import { useTranslations } from 'next-intl';
import { type ThemeMode, useThemeMode } from './ThemeProvider';

/**
 * Theme-mode pill (wxapp home top-right interaction): one tap cycles
 * 跟随系统 → 深色 → 浅色. Web keeps the ≥44px touch target + aria-label.
 */
const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'dark', dark: 'light', light: 'auto' };

export function ThemeModeToggle() {
  const t = useTranslations('common');
  const { mode, setMode } = useThemeMode();
  const label =
    mode === 'auto' ? t('themeAuto') : mode === 'dark' ? t('themeDark') : t('themeLight');
  const icon = mode === 'auto' ? '🌗' : mode === 'dark' ? '🌙' : '☀️';
  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      className="min-h-[44px] rounded-full bg-white px-4 text-sm text-gray-600 transition-colors dark:bg-gray-800 dark:text-gray-300"
      aria-label={`${t('theme')}: ${label}`}
    >
      <span aria-hidden>{icon}</span> {label}
    </button>
  );
}
