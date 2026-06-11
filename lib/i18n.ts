import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export type Locale = 'zh-CN' | 'en';
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en'];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const stored = cookieStore.get('locale')?.value as Locale | undefined;
  let locale: Locale | null = stored && SUPPORTED_LOCALES.includes(stored) ? stored : null;
  // Without an explicit cookie, fall back to the browser's Accept-Language so the
  // English bundle is actually reachable (nothing ever writes the locale cookie /
  // ships a switcher, so en was previously dead). Default stays zh-CN.
  if (!locale) {
    const accept = (await headers()).get('accept-language')?.toLowerCase() ?? '';
    locale = accept.startsWith('en') ? 'en' : DEFAULT_LOCALE;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
