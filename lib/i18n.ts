import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export type Locale = 'zh-CN' | 'en';
export const LOCALE_COOKIE = 'locale';
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en'];

export default getRequestConfig(async () => {
  // zh-CN is the default (this is a Chinese game); English is opt-in via the
  // language toggle, which writes the `locale` cookie. We intentionally do NOT
  // auto-switch on Accept-Language — an English-locale browser would otherwise see
  // English by default, against the Chinese-first intent.
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value as Locale | undefined;
  const locale: Locale = stored && SUPPORTED_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
