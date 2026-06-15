'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'dd_onboard_seen';

/**
 * Core-rules memo (ported from the wxapp sibling 8f473b6) — shown on YOUR turn in
 * room + bot. Dismiss collapses it to a one-line re-open link and remembers the
 * choice in localStorage. SSR note: unlike the Taro original (which read storage
 * during render), the web reads localStorage in an effect and gates the first paint
 * on `hydrated`, so there's no hydration mismatch / flash of the memo.
 */
export function OnboardHint() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      setOpen(!localStorage.getItem(SEEN_KEY));
    } catch {
      setOpen(true);
    }
  }, []);

  if (!hydrated) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="py-0.5 text-center text-xs text-gray-500 dark:text-gray-400"
      >
        {t('onboard.reopen')}
      </button>
    );
  }

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode / storage blocked — just collapse for this session */
    }
    setOpen(false);
  };

  const bold = (chunks: React.ReactNode) => <strong className="font-bold">{chunks}</strong>;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950"
      role="note"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-amber-800 dark:text-amber-200">
          {t('onboard.title')}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-amber-700 dark:text-amber-300"
        >
          {t('onboard.dismiss')}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
        {t.rich('onboard.line1', { b: bold })}
      </p>
      <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
        {t.rich('onboard.line2', { b: bold })}
      </p>
    </div>
  );
}
