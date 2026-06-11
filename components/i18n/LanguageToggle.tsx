'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
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
  const { tokens } = useTheme();

  async function pick(code: Locale) {
    if (code === locale) return;
    await setLocale(code);
    router.refresh();
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2 m-0 min-w-0 border-0 p-0">
      {label ? <legend className="sr-only">{label}</legend> : null}
      {LANGS.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => pick(l.code)}
            aria-pressed={active}
            className="rounded-full border px-3 py-1.5 font-ui text-sm transition-colors"
            style={{
              borderColor: active ? `${tokens.colors.text}33` : `${tokens.colors.textMuted}33`,
              backgroundColor: active ? `${tokens.colors.text}10` : 'transparent',
              color: active ? tokens.colors.text : tokens.colors.textMuted,
            }}
          >
            {l.label}
          </button>
        );
      })}
    </fieldset>
  );
}
