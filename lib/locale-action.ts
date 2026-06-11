'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale, SUPPORTED_LOCALES } from '@/lib/i18n';

/**
 * Persist the user's language choice. A Server Action (not `document.cookie`) so it
 * works across all browsers — the Cookie Store API isn't in Safari/WebKit — and so
 * the value is validated server-side before it's written. lib/i18n.ts reads this
 * cookie on the next request; the caller follows with router.refresh() to re-render.
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
}
