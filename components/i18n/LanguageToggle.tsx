'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale-action';

/**
 * Language switcher. zh-CN is the default; this lets the user opt into English.
 * Persists the choice via a Server Action (sets the `locale` cookie that
 * lib/i18n.ts reads) then refreshes so the server re-renders in the new locale.
 * Language names are shown in their own script (中文 / English) — the convention for
 * switchers, and intentionally not translated.
 */
const LANGS: { code: Locale; label: string }[] = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
];

export function LanguageToggle({ label }: { label?: string }) {
  const router = useRouter();
  const locale = useLocale();

  async function pick(code: Locale) {
    if (code === locale) return;
    try {
      await setLocale(code);
      router.refresh();
    } catch (err) {
      // Loud, not a silent unhandled rejection (repo standard). The action only
      // fails on a transport error; the UI simply stays in the current language.
      console.error('[i18n] setLocale failed', err);
    }
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      {label ? <legend className="sr-only">{label}</legend> : null}
      {LANGS.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => pick(l.code)}
            aria-pressed={active}
            className={`min-h-[44px] rounded-full px-4 text-sm transition-colors ${
              active
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </fieldset>
  );
}
