import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export type Locale = 'zh-CN' | 'en';
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en'];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const stored = cookieStore.get('locale')?.value as Locale | undefined;
  const locale: Locale = stored && SUPPORTED_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
