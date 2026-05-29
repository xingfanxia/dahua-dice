'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import './dice2d.css';

/**
 * 2D animated dice renderer. DOM/CSS only — no WebGL, no Three.js.
 * Renders the player's own dice as rounded squares with standard d6 pips,
 * tumbling on a new roll then settling on their final faces. Themed entirely
 * via CSS custom properties (--theme-dice-face / --theme-dice-dot / etc.),
 * so oklch values are used directly with no color conversion.
 */

export type DicePhase = 'idle' | 'rolling' | 'settled' | 'revealed';

/** Standard d6 pip positions in a 0..100 coordinate space. */
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [30, 30],
    [50, 50],
    [70, 70],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 30],
    [70, 30],
    [30, 50],
    [70, 50],
    [30, 70],
    [70, 70],
  ],
};

const TUMBLE_MS = 900; // total tumble duration before the first die settles
const STAGGER_MS = 120; // delay between successive dice settling
const CYCLE_MS = 80; // how often a tumbling die's face flickers
const POP_MS = 220; // settle scale-pop window
const DIE_PX = 60; // rendered die size

const randomFace = (sides: number) => 1 + Math.floor(Math.random() * sides);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** A single die face: rounded square + pips (or centered number for 7/8). */
function DieFace({ face, sides, popping }: { face: number; sides: number; popping: boolean }) {
  const pips = PIP_LAYOUT[face];
  return (
    <div
      className="dice2d-die"
      data-popping={popping ? 'true' : undefined}
      style={{ width: DIE_PX, height: DIE_PX }}
    >
      {pips ? (
        <svg viewBox="0 0 100 100" className="dice2d-pips" aria-hidden="true">
          <title>{face}</title>
          {pips.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={9} fill="var(--theme-dice-dot)" />
          ))}
        </svg>
      ) : (
        // 7/8 (8-sided variant): no canonical pip layout — render the number.
        <span className="dice2d-num" aria-hidden="true">
          {face > sides ? sides : face}
        </span>
      )}
    </div>
  );
}

export function Dice2D({
  diceCount,
  phase,
  hand,
  sides = 6,
  onCollision,
  onAllSettled,
}: {
  diceCount: number;
  phase: DicePhase;
  hand?: number[] | null;
  /** Faces per die (6 standard, 8 for the 8-sided variant). */
  sides?: number;
  onCollision?: (force: number) => void;
  onAllSettled?: (faces: number[]) => void;
}) {
  const hasHand = !!hand && hand.length > 0;
  // Number of dice shown: the hand if present, else the count.
  const count = hasHand ? (hand as number[]).length : Math.max(0, diceCount);
  // Final faces to settle on: the real hand if known, otherwise neutral 1s.
  const finalFaces: number[] = hasHand
    ? (hand as number[])
    : Array.from({ length: count }, () => 1);

  // Faces currently displayed. Flicker during a tumble; otherwise = finalFaces.
  const [displayFaces, setDisplayFaces] = useState<number[]>(finalFaces);
  // Which dice are mid-tumble (drives the CSS keyframe + face flicker).
  const [tumbling, setTumbling] = useState<boolean[]>(() => finalFaces.map(() => false));
  // Which dice are doing the settle "pop" (scale 1.12 -> 1).
  const [popping, setPopping] = useState<boolean[]>(() => finalFaces.map(() => false));

  // Latest callbacks/values without retriggering the animation effect.
  const onAllSettledRef = useRef(onAllSettled);
  const onCollisionRef = useRef(onCollision);
  const finalFacesRef = useRef(finalFaces);
  const sidesRef = useRef(sides);
  onAllSettledRef.current = onAllSettled;
  onCollisionRef.current = onCollision;
  finalFacesRef.current = finalFaces;
  sidesRef.current = sides;

  // Signature identifying "a new roll": changes when phase enters 'rolling' or
  // the dealt hand changes to a different set of faces.
  const rollKey = `${phase === 'rolling' ? 'rolling' : 'static'}|${(hand ?? []).join(',')}`;
  const seenRollKey = useRef<string | null>(null);

  // Deps are intentionally [rollKey, phase]: rollKey already encodes the hand
  // identity, and callbacks/sides/finalFaces are read live via refs so a new
  // closure for them never restarts an in-flight tumble.
  useEffect(() => {
    const target = finalFacesRef.current;
    const n = target.length;

    // Only animate for roll-bearing transitions: entering 'rolling', or a hand
    // arriving/changing. Static phases with a stable hand just render faces.
    const isRollTrigger = phase === 'rolling' || n > 0;
    if (!isRollTrigger) {
      seenRollKey.current = rollKey;
      setTumbling(target.map(() => false));
      setPopping(target.map(() => false));
      setDisplayFaces(target);
      return;
    }
    if (seenRollKey.current === rollKey) return;
    // Mark this rollKey "consumed" only on completion (reduced-motion branch and
    // the settle branch below), NOT here. Under React Strict Mode the effect runs
    // mount → cleanup → mount; setting it up front would let the cleaned-up first
    // pass suppress the real second pass, so a reconnect-mid-roll would never tumble.

    // Reduced motion: skip the tumble, show finals immediately, fire once.
    if (prefersReducedMotion()) {
      seenRollKey.current = rollKey;
      setTumbling(target.map(() => false));
      setPopping(target.map(() => false));
      setDisplayFaces(target);
      onAllSettledRef.current?.(target);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    // Mutable view of which dice are still tumbling (read inside the interval).
    const stillTumbling = target.map(() => true);

    setTumbling(target.map(() => true));
    setPopping(target.map(() => false));

    // Flicker random faces on dice that are still tumbling.
    const flicker = setInterval(() => {
      setDisplayFaces((prev) =>
        prev.map((f, i) => (stillTumbling[i] ? randomFace(sidesRef.current) : f)),
      );
    }, CYCLE_MS);

    // A couple of rattle pulses mid-tumble for audio.
    timers.push(
      setTimeout(() => onCollisionRef.current?.(0.6), 120),
      setTimeout(() => onCollisionRef.current?.(0.9), 360),
    );

    let settledCount = 0;
    for (let i = 0; i < n; i++) {
      const settleAt = TUMBLE_MS + i * STAGGER_MS;
      timers.push(
        setTimeout(() => {
          stillTumbling[i] = false;
          // Stop this die's tumble, lock its final face, trigger the pop.
          setTumbling((prev) => prev.map((v, j) => (j === i ? false : v)));
          setDisplayFaces((prev) => prev.map((f, j) => (j === i ? target[j] : f)));
          setPopping((prev) => prev.map((v, j) => (j === i ? true : v)));
          timers.push(
            setTimeout(() => {
              setPopping((prev) => prev.map((v, j) => (j === i ? false : v)));
            }, POP_MS),
          );
          settledCount += 1;
          if (settledCount === n) {
            seenRollKey.current = rollKey; // consumed only once the roll completes
            clearInterval(flicker);
            onAllSettledRef.current?.(target);
          }
        }, settleAt),
      );
    }

    return () => {
      clearInterval(flicker);
      for (const tm of timers) clearTimeout(tm);
    };
  }, [rollKey, phase]);

  // Keep array lengths in sync when count changes outside a roll (e.g. a player
  // loses a die between rounds while the phase is static).
  useEffect(() => {
    if (phase === 'rolling') return;
    setDisplayFaces((prev) => (prev.length === count ? prev : finalFacesRef.current));
    setTumbling((prev) => (prev.length === count ? prev : finalFacesRef.current.map(() => false)));
    setPopping((prev) => (prev.length === count ? prev : finalFacesRef.current.map(() => false)));
  }, [count, phase]);

  const t = useTranslations('game');
  const ariaLabel = hasHand
    ? t('yourDice', { faces: displayFaces.join(', ') })
    : t('diceFaceDown', { count });

  return (
    <div className="dice2d-root" role="img" aria-label={ariaLabel}>
      <div className="dice2d-tray">
        {Array.from({ length: count }).map((_, i) => {
          const isTumbling = tumbling[i] ?? false;
          const faceDownNow = !hasHand && !isTumbling;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: index is the die identity
              key={i}
              className="dice2d-wrap"
              data-tumbling={isTumbling ? 'true' : undefined}
            >
              {faceDownNow ? (
                <div
                  className="dice2d-die dice2d-die--down"
                  style={{ width: DIE_PX, height: DIE_PX }}
                >
                  <span className="dice2d-q" aria-hidden="true">
                    ?
                  </span>
                </div>
              ) : (
                <DieFace face={displayFaces[i] ?? 1} sides={sides} popping={popping[i] ?? false} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
