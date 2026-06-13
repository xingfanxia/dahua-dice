'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { MyHand } from '@/components/dice/MyHand';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ThemeModeToggle } from '@/components/theme/ThemeModeToggle';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { rollDiceClient } from '@/lib/solo/roll';

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // wxapp solo grid

export function SoloClient() {
  const t = useTranslations();
  const router = useRouter();

  const [diceCount, setDiceCount] = useState(5);
  const [hand, setHand] = useState<number[] | null>(null);
  // Roll counter doubles as MyHand's `round` key: each press is a new hand that
  // re-covers and waits for a tap / shake (gesture lives entirely in MyHand).
  const [rolls, setRolls] = useState(0);

  useEffect(() => {
    // Arm Howler autoUnlock on the first user gesture (iOS Safari).
    unlockAudio();
  }, []);

  // Press = roll a NEW hand. Fixed 6 faces (wxapp parity — the 8-sided option was
  // cut from the UI; rollDiceClient still supports 8 for engine compatibility).
  const roll = useCallback(() => {
    setHand(rollDiceClient(diceCount, 6));
    setRolls((r) => r + 1);
  }, [diceCount]);

  return (
    <main className="flex min-h-[100dvh] flex-col bg-gray-50 dark:bg-gray-900">
      <div className="safe-bottom mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="min-h-[44px] min-w-[44px] rounded-lg text-sm text-gray-500 transition-colors dark:text-gray-400"
            aria-label={t('common.back')}
          >
            ← {t('common.back')}
          </button>
          <ThemeModeToggle />
        </header>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{t('solo.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('solo.subtitle')}</p>
        </div>

        {/* Dice cup: a new roll sits covered; tap / shake reveals it (MyHand). */}
        {hand ? (
          <MyHand hand={hand} round={rolls} />
        ) : (
          <div className="flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 text-center dark:border-gray-600">
            <span className="text-5xl" aria-hidden>
              🎲
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('solo.tapToRoll')}</span>
          </div>
        )}

        {/* Roll a fresh hand */}
        <button
          type="button"
          onClick={roll}
          className="rounded-2xl bg-red-600 py-4 text-base font-medium text-white transition-opacity active:scale-[0.99]"
        >
          {hand ? t('solo.reroll') : t('solo.roll')}
        </button>

        {/* dice count grid (wxapp solo: 1-10, fixed 6 faces) */}
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-4 dark:bg-gray-800">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('solo.diceCount')}
          </span>
          <div className="grid grid-cols-5 gap-2">
            {DICE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDiceCount(n)}
                aria-pressed={diceCount === n}
                className={`num min-h-[44px] rounded-xl text-base transition-colors ${
                  diceCount === n
                    ? 'bg-red-600 font-medium text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* footer */}
        <footer className="mt-auto flex justify-center pt-6">
          <LanguageToggle label={t('common.language')} />
        </footer>
      </div>
    </main>
  );
}
