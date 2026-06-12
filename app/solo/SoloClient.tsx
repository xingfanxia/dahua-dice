'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type DicePhase, DiceScene } from '@/components/dice/DiceScene';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { useShakeDetector } from '@/components/shake/useShakeDetector';
import { ThemeModeToggle } from '@/components/theme/ThemeModeToggle';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import { summarizeHand } from '@/lib/game/hand-summary';
import { rollDiceClient } from '@/lib/solo/roll';

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // wxapp solo grid
const ROLL_COOLDOWN_MS = 700; // ignore shake re-triggers right after a roll

export function SoloClient() {
  const t = useTranslations();
  const router = useRouter();
  const audio = useDiceAudio();

  const [diceCount, setDiceCount] = useState(5);
  const [hand, setHand] = useState<number[] | null>(null);
  const [phase, setPhase] = useState<DicePhase>('idle');
  const [covered, setCovered] = useState(false);

  const rollingRef = useRef(false);
  const lastRollAt = useRef(0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Arm Howler autoUnlock on the first user gesture (iOS Safari).
    unlockAudio();
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  const roll = useCallback(() => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    lastRollAt.current = Date.now();
    // Fixed 6 faces (wxapp parity — the 8-sided option was cut from the UI;
    // rollDiceClient itself still supports 8 for engine compatibility).
    const next = rollDiceClient(diceCount, 6);
    setCovered(false);
    // Clear first so Dice2D sees a null→faces transition and re-tumbles even when
    // the new hand happens to equal the previous one (mirrors the room's per-round
    // reset). Commit the real hand a tick later so the settle animation plays.
    setHand(null);
    setPhase('rolling');
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      setHand(next);
      setPhase('settled');
      rollingRef.current = false;
    }, 60);
  }, [diceCount]);

  // Shake-to-roll. The detector already debounces a single shake, but a vigorous
  // shake can fire twice — the cooldown stops a double roll, and rollingRef stops
  // a roll landing mid-animation.
  const { permission, requestPermission } = useShakeDetector((intensity) => {
    if (Date.now() - lastRollAt.current < ROLL_COOLDOWN_MS) return;
    audio.shake(intensity);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(Math.floor(50 + intensity * 150));
    }
    roll();
  });

  const hasHand = !!hand && hand.length > 0;
  const summaryRows = hasHand ? summarizeHand(hand as number[]) : [];

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

        {/* Dice cup */}
        {covered && hasHand ? (
          <button
            type="button"
            onClick={() => setCovered(false)}
            className="flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl bg-white dark:bg-gray-800"
            aria-label={t('solo.coveredHint')}
          >
            <span className="text-5xl" aria-hidden>
              🥤
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('solo.coveredHint')}
            </span>
          </button>
        ) : hasHand || phase === 'rolling' ? (
          <div className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white py-4 dark:bg-gray-800">
            <DiceScene
              diceCount={diceCount}
              phase={phase}
              hand={covered ? null : hand}
              onCollision={(force) => audio.collide('dice', force)}
              onAllSettled={() => audio.settle()}
            />
            {summaryRows.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-1">
                {summaryRows.map((row) => (
                  <span
                    key={row}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-base font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {row}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 text-center dark:border-gray-600">
            <span className="text-5xl" aria-hidden>
              🎲
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('solo.tapToRoll')}</span>
          </div>
        )}

        {/* Own hand for screen readers */}
        {hasHand && !covered && (
          <p className="sr-only" aria-live="polite">
            {`${t('solo.yourDice')}: ${(hand as number[]).join(', ')}`}
          </p>
        )}

        {/* Roll + cover */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={roll}
            className="flex-1 rounded-2xl bg-red-600 py-4 text-base font-medium text-white transition-opacity active:scale-[0.99]"
          >
            {hasHand ? t('solo.reroll') : t('solo.roll')}
          </button>
          {hasHand && (
            <button
              type="button"
              onClick={() => setCovered((c) => !c)}
              className="min-w-[88px] rounded-2xl bg-white py-4 font-medium text-gray-700 transition-colors dark:bg-gray-800 dark:text-gray-300"
              aria-pressed={covered}
            >
              {covered ? t('solo.peek') : t('solo.cover')}
            </button>
          )}
        </div>

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

        {/* shake hint / enable */}
        {permission === 'granted' ? (
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            {t('solo.shakeHint')}
          </p>
        ) : permission === 'unknown' ? (
          <button
            type="button"
            onClick={() => requestPermission()}
            className="min-h-[44px] text-center text-xs text-gray-500 underline dark:text-gray-400"
          >
            {t('solo.enableShake')}
          </button>
        ) : null}

        {/* footer */}
        <footer className="mt-auto flex justify-center pt-6">
          <LanguageToggle label={t('common.language')} />
        </footer>
      </div>
    </main>
  );
}
