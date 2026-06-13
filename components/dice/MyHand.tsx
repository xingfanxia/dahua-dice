'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShakeDetector } from '@/components/shake/useShakeDetector';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import { summarizeHand } from '@/lib/game/hand-summary';
import { alignToFace, DiceCube, type Rot, spinToFace } from './DiceCube';

/**
 * The player's own hand — the unified tap/shake gesture model ported from the
 * wxapp sibling (DiceRow, 2026-06-13). One model across solo / bot / room:
 *
 *   deal → dice sit STATIC + COVERED (values hidden, no auto-roll)
 *   tap / shake (gyro, armed only while covered) → reveal:
 *     · first reveal this hand = 3D tumble (摇骰) + sound + vibrate
 *     · re-peek after covering   = quick flip (FLIP_MS), no tumble, no sound
 *   tap (while revealed) → cover (quick flip back)
 *
 * The faces are decided by the engine / local roll (iron law #4 — animation is
 * pure decoration); tapping only "shakes out" already-rolled dice to look at
 * them, it NEVER re-rolls. `round`+faces is the reset key, so a same-round
 * re-fetch of an identical hand doesn't reset state (the #3 round-2 freeze guard).
 */

const TUMBLE_MS = 900; // first die's spin duration on reveal
const STAGGER_MS = 120; // delay between successive dice landing
const POP_MS = 220; // settle scale-pop window
const FLIP_MS = 280; // quick flip for cover / re-peek (single rotation, no tumble)
const DIE_PX = 72;
// Uniform covered orientation (= face-1 rest): every covered die looks identical,
// so a covered hand never leaks its values through orientation.
const COVERED_ROT = alignToFace({ x: 0, y: 0 }, 1);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function MyHand({ hand, round }: { hand: number[] | null; round: number }) {
  const t = useTranslations('game');
  const audio = useDiceAudio();

  const [revealed, setRevealed] = useState(false);
  const [rolling, setRolling] = useState<boolean[]>([]);
  const [popping, setPopping] = useState<boolean[]>([]);
  const [rot, setRot] = useState<Rot[]>([]);
  const [flip, setFlip] = useState(false);

  const lastKeyRef = useRef('');
  const busyRef = useRef(false);
  const rolledOnceRef = useRef(false); // already tumbled this hand? (re-peek = flip only)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    for (const tm of timers.current) clearTimeout(tm);
    timers.current = [];
  }, []);

  // New hand (round + actual faces as key) → reset to COVERED, do NOT auto-roll;
  // wait for the player to tap / shake. Same-round identical re-fetch keeps the key
  // and early-returns, so it doesn't reset state (the #3 round-2 freeze guard).
  // useLayoutEffect (not useEffect) so the covered reset COMMITS BEFORE paint: in
  // solo MyHand stays mounted across re-rolls, and a passive effect would let the
  // browser paint one revealed frame of the new hand before re-covering it.
  // Safe — MyHand never renders during SSR (hand is null until a game action).
  useLayoutEffect(() => {
    const faces = hand ?? [];
    const key = `${round}:${faces.join(',')}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    clearTimers();
    busyRef.current = false;
    rolledOnceRef.current = false;
    setFlip(false);
    setRevealed(false);
    setRolling(faces.map(() => false));
    setPopping(faces.map(() => false));
    setRot(faces.map(() => COVERED_ROT));
  }, [round, hand, clearTimers]);

  // Covered → reveal. The FIRST reveal of a hand plays the throw cue (the always-on
  // CC0 settle sample + a haptic) at the START of the gesture — matching wxapp's
  // playDiceSound timing, and firing even under reduced motion (reduced-motion
  // suppresses MOTION, not audio/haptics). Whether it then tumbles or instant-flips
  // depends on reduced motion; a re-peek after covering is a silent quick flip.
  const doReveal = useCallback(() => {
    const faces = hand ?? [];
    if (faces.length === 0 || revealed || busyRef.current) return;

    const firstReveal = !rolledOnceRef.current;
    if (firstReveal) {
      audio.settle();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(90);
    }

    // Re-peek (already tumbled this hand) or reduced motion → instant quick flip.
    if (rolledOnceRef.current || prefersReducedMotion()) {
      setFlip(true);
      setRevealed(true);
      setRot((prev) => faces.map((f, i) => alignToFace(prev[i] ?? COVERED_ROT, f)));
      rolledOnceRef.current = true;
      return;
    }

    // First reveal with motion → 3D tumble, staggered landing.
    busyRef.current = true;
    clearTimers();
    setFlip(false);
    setRolling(faces.map(() => true));
    setPopping(faces.map(() => false));
    setRot((prev) => faces.map((f, i) => spinToFace(prev[i] ?? COVERED_ROT, f, i)));

    faces.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => {
            setRolling((prev) => prev.map((v, j) => (j === i ? false : v)));
            setPopping((prev) => prev.map((v, j) => (j === i ? true : v)));
            timers.current.push(
              setTimeout(
                () => setPopping((prev) => prev.map((v, j) => (j === i ? false : v))),
                POP_MS,
              ),
            );
            if (i === faces.length - 1) {
              setRevealed(true);
              busyRef.current = false;
              rolledOnceRef.current = true;
            }
          },
          TUMBLE_MS + i * STAGGER_MS,
        ),
      );
    });
  }, [hand, revealed, audio, clearTimers]);

  // Revealed → cover (quick flip back to the uniform covered orientation).
  const cover = useCallback(() => {
    const faces = hand ?? [];
    clearTimers();
    busyRef.current = false;
    setFlip(true);
    setRevealed(false);
    setRolling(faces.map(() => false));
    setPopping(faces.map(() => false));
    setRot(faces.map(() => COVERED_ROT));
  }, [hand, clearTimers]);

  const anyRolling = rolling.some(Boolean);
  const blank = !revealed && !anyRolling;

  // Gyro reveal — armed ONLY while covered (so the reveal vibration can't re-trigger).
  const { permission, requestPermission } = useShakeDetector(
    () => doReveal(),
    !!hand && hand.length > 0 && blank,
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  const onActivate = useCallback(() => {
    // First user gesture also arms the gyro on iOS (requestPermission needs a tap).
    if (permission === 'unknown') void requestPermission();
    if (revealed) cover();
    else doReveal();
  }, [permission, requestPermission, revealed, cover, doReveal]);

  // Only promise "shake" once the gyro is actually armed — on iOS it's unarmed
  // (permission 'unknown') until the first tap, and 'unsupported' on desktops; in
  // both cases the hint shows tap-only so it never advertises a dead gesture.
  const canShake = permission === 'granted';

  if (!hand || hand.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('dealingDice')}</span>
      </div>
    );
  }

  const summaryRows = revealed && !anyRolling ? summarizeHand(hand) : [];

  return (
    <>
      <button
        type="button"
        className="flex w-full select-none flex-col items-center gap-2.5 rounded-2xl bg-white py-5 dark:bg-gray-800"
        aria-label={
          revealed
            ? t('yourDice', { faces: hand.join(', ') })
            : t('diceFaceDown', { count: hand.length })
        }
        onClick={onActivate}
      >
        <div className="dice2d-tray">
          {hand.map((face, i) => (
            <DiceCube
              // biome-ignore lint/suspicious/noArrayIndexKey: index is the die identity
              key={i}
              face={face}
              size={DIE_PX}
              rotX={rot[i]?.x}
              rotY={rot[i]?.y}
              transitionMs={rolling[i] ? TUMBLE_MS + i * STAGGER_MS : flip ? FLIP_MS : POP_MS}
              blank={blank}
              popping={popping[i] ?? false}
            />
          ))}
        </div>

        {summaryRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-3">
            {summaryRows.map((row) => (
              <span
                key={row}
                className="num rounded-lg bg-gray-100 px-2.5 py-1 text-base font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
              >
                {row}
              </span>
            ))}
          </div>
        )}

        {anyRolling ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('rollingDice')}</span>
        ) : revealed ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('tapToCover')}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
            <span aria-hidden>👆</span>
            {canShake ? t('tapOrShakeReveal') : t('tapReveal')}
          </span>
        )}
      </button>
      {/* Politely announce the dealt hand to screen readers ONLY once revealed — the
          covered state stays secret (the button's aria-label says "face down"). */}
      {revealed && !anyRolling && (
        <p className="sr-only" aria-live="polite">
          {t('yourDice', { faces: hand.join(', ') })}
        </p>
      )}
    </>
  );
}
