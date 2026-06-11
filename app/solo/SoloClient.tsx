'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type DicePhase, DiceScene } from '@/components/dice/DiceScene';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { useShakeDetector } from '@/components/shake/useShakeDetector';
import { useTheme } from '@/components/theme/ThemeProvider';
import { THEME_KEYS } from '@/components/theme/tokens';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import { rollDiceClient } from '@/lib/solo/roll';

const MIN_DICE = 1;
const MAX_DICE = 8;
const ROLL_COOLDOWN_MS = 700; // ignore shake re-triggers right after a roll

export function SoloClient() {
  const t = useTranslations();
  const router = useRouter();
  const { theme, setTheme, tokens } = useTheme();
  const audio = useDiceAudio();

  const [diceCount, setDiceCount] = useState(5);
  const [sides, setSides] = useState<6 | 8>(6);
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
    const next = rollDiceClient(diceCount, sides);
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
  }, [diceCount, sides]);

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

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      {/* ambient backdrop — same radial wash as home, themed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at 18% 12%, color-mix(in oklch, ${tokens.colors.accent} 18%, transparent), transparent 55%),
            radial-gradient(ellipse at 82% 92%, color-mix(in oklch, ${tokens.colors.primary} 14%, transparent), transparent 60%),
            ${tokens.colors.bg}`,
        }}
      />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+3vh)] pb-8 safe-bottom">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="min-h-[44px] min-w-[44px] rounded-lg text-sm transition-colors"
            style={{ color: tokens.colors.textMuted }}
            aria-label={t('common.back')}
          >
            ← {t('common.back')}
          </button>
          <div className="text-right">
            <h1 className="font-display text-2xl" style={{ color: tokens.colors.text }}>
              {t('solo.title')}
            </h1>
          </div>
        </header>
        <p className="mt-1 font-ui text-xs" style={{ color: tokens.colors.textMuted }}>
          {t('solo.subtitle')}
        </p>

        {/* Dice cup */}
        <div
          className="relative mt-6 flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl"
          style={{ backgroundColor: tokens.colors.surface }}
        >
          {covered && hasHand ? (
            <button
              type="button"
              onClick={() => setCovered(false)}
              className="flex h-full w-full flex-col items-center justify-center gap-3"
              aria-label={t('solo.coveredHint')}
            >
              <span className="text-6xl" aria-hidden>
                🥤
              </span>
              <span className="font-ui text-sm" style={{ color: tokens.colors.textMuted }}>
                {t('solo.coveredHint')}
              </span>
            </button>
          ) : hasHand || phase === 'rolling' ? (
            <DiceScene
              diceCount={diceCount}
              phase={phase}
              hand={covered ? null : hand}
              sides={sides}
              onCollision={(force) => audio.collide('dice', force)}
              onAllSettled={() => audio.settle()}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="text-6xl" aria-hidden>
                🎲
              </span>
              <span className="font-ui text-sm" style={{ color: tokens.colors.textMuted }}>
                {t('solo.tapToRoll')}
              </span>
            </div>
          )}
        </div>

        {/* Own hand for screen readers */}
        {hasHand && !covered && (
          <p className="sr-only" aria-live="polite">
            {`${t('solo.yourDice')}: ${(hand as number[]).join(', ')}`}
          </p>
        )}

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-4">
          {/* dice count */}
          <div className="flex items-center justify-between">
            <span
              className="font-ui text-xs uppercase tracking-wide"
              style={{ color: tokens.colors.textMuted }}
            >
              {t('solo.diceCount')}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDiceCount((c) => Math.max(MIN_DICE, c - 1))}
                disabled={diceCount <= MIN_DICE}
                className="h-11 w-11 rounded-full text-xl font-medium disabled:opacity-30"
                style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
                aria-label="−"
              >
                −
              </button>
              <span
                className="num min-w-[2ch] text-center text-2xl"
                style={{ color: tokens.colors.text }}
              >
                {diceCount}
              </span>
              <button
                type="button"
                onClick={() => setDiceCount((c) => Math.min(MAX_DICE, c + 1))}
                disabled={diceCount >= MAX_DICE}
                className="h-11 w-11 rounded-full text-xl font-medium disabled:opacity-30"
                style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
                aria-label="+"
              >
                +
              </button>
            </div>
          </div>

          {/* sides */}
          <div className="flex items-center justify-between">
            <span
              className="font-ui text-xs uppercase tracking-wide"
              style={{ color: tokens.colors.textMuted }}
            >
              {t('solo.sides')}
            </span>
            <div className="flex gap-2">
              {([6, 8] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSides(s)}
                  className="min-h-[44px] min-w-[56px] rounded-xl font-display text-lg transition-colors"
                  aria-pressed={sides === s}
                  style={{
                    backgroundColor: sides === s ? tokens.colors.primary : tokens.colors.bg,
                    color: sides === s ? tokens.colors.bg : tokens.colors.text,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Roll + cover */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={roll}
              className="flex-1 rounded-2xl py-4 font-medium transition-opacity active:scale-[0.99]"
              style={{ backgroundColor: tokens.colors.success, color: tokens.colors.bg }}
            >
              {hasHand ? t('solo.reroll') : t('solo.roll')}
            </button>
            {hasHand && (
              <button
                type="button"
                onClick={() => setCovered((c) => !c)}
                className="min-w-[88px] rounded-2xl py-4 font-medium transition-colors"
                style={{
                  backgroundColor: tokens.colors.bg,
                  color: tokens.colors.text,
                  border: `1px solid ${tokens.colors.textMuted}44`,
                }}
                aria-pressed={covered}
              >
                {covered ? t('solo.peek') : t('solo.cover')}
              </button>
            )}
          </div>

          {/* shake hint / enable */}
          {permission === 'granted' ? (
            <p className="text-center font-ui text-xs" style={{ color: tokens.colors.textMuted }}>
              {t('solo.shakeHint')}
            </p>
          ) : permission === 'unknown' ? (
            <button
              type="button"
              onClick={() => requestPermission()}
              className="text-center font-ui text-xs underline"
              style={{ color: tokens.colors.textMuted }}
            >
              {t('solo.enableShake')}
            </button>
          ) : null}
        </div>

        {/* footer theme chips — keep solo usable standalone */}
        <footer className="mt-auto pt-8">
          <div className="flex flex-wrap justify-center gap-2">
            {THEME_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTheme(k)}
                className="rounded-full border px-3 py-1.5 font-ui text-xs transition-colors"
                style={{
                  borderColor:
                    k === theme ? `${tokens.colors.text}44` : `${tokens.colors.textMuted}33`,
                  backgroundColor: k === theme ? `${tokens.colors.text}10` : 'transparent',
                  color: k === theme ? tokens.colors.text : tokens.colors.textMuted,
                }}
              >
                {t(`themes.${k}`)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <LanguageToggle label={t('common.language')} />
          </div>
        </footer>
      </div>
    </main>
  );
}
