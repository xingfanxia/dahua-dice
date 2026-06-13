'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { PIP_LAYOUT } from './PipDie';
import './dice2d.css';

/**
 * 3D dice renderer. DOM/CSS only — no WebGL, no Three.js (issue #9 upgrade from
 * the old flat sticker). Each die is a real CSS cube (6 pip faces, perspective)
 * that tumbles through space and settles onto its dealt face. The roll is driven
 * purely by a transform transition to an accumulated rotation, so the cube spins
 * forward a few turns and lands exactly on the final face — no keyframe→transform
 * snap. Light/dark styling lives in dice2d.css (html.dark selector).
 */

export type DicePhase = 'idle' | 'rolling' | 'settled' | 'revealed';

const TUMBLE_MS = 900; // total spin duration before the first die lands
const STAGGER_MS = 120; // delay between successive dice landing
const POP_MS = 220; // settle scale-pop window
const DIE_PX = 72; // rendered die size

// A mild constant 3/4 tilt so a die at rest still reads as a solid cube (you
// glimpse two side faces) while keeping the dealt face clearly readable.
const TILT = { x: -16, y: 14 };

// Rotation that brings each value's face to the front. Face values are fixed on
// the cube (opposite faces sum to 7): front 1 / back 6 / right 3 / left 4 / top 5
// / bottom 2 — see the .dice2d-face--* placement in dice2d.css.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 0, y: 180 },
};

type Rot = { x: number; y: number };

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Rest orientation for `face` nearest to `prev` (minimal movement, no extra spin). */
function alignToFace(prev: Rot, face: number): Rot {
  const base = FACE_ROT[face] ?? FACE_ROT[1];
  const tx = base.x + TILT.x;
  const ty = base.y + TILT.y;
  return {
    x: tx + 360 * Math.round((prev.x - tx) / 360),
    y: ty + 360 * Math.round((prev.y - ty) / 360),
  };
}

/** Forward-spinning target for `face`: a few full turns past `prev`, landing on it. */
function spinToFace(prev: Rot, face: number, i: number): Rot {
  const base = FACE_ROT[face] ?? FACE_ROT[1];
  const tx = base.x + TILT.x;
  const ty = base.y + TILT.y;
  const turnsX = Math.floor((prev.x - tx) / 360) + 2 + (i % 2);
  const turnsY = Math.floor((prev.y - ty) / 360) + 3 - (i % 2);
  return { x: tx + 360 * turnsX, y: ty + 360 * turnsY };
}

/** One cube face: the fixed pip layout for its value. */
function CubeFace({ value, pos }: { value: number; pos: string }) {
  const pips = PIP_LAYOUT[value];
  return (
    <div className={`dice2d-face dice2d-face--${pos}`}>
      {pips && (
        <svg viewBox="0 0 100 100" className="dice2d-pips" aria-hidden="true">
          {pips.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={10} className="dice2d-pip" />
          ))}
        </svg>
      )}
    </div>
  );
}

export function Dice2D({
  diceCount,
  phase,
  hand,
  onCollision,
  onAllSettled,
}: {
  diceCount: number;
  phase: DicePhase;
  hand?: number[] | null;
  /** Accepted for API compat; the cube models a d6 (8-sided is cut from the live UI). */
  sides?: number;
  onCollision?: (force: number) => void;
  onAllSettled?: (faces: number[]) => void;
}) {
  const hasHand = !!hand && hand.length > 0;
  const count = hasHand ? (hand as number[]).length : Math.max(0, diceCount);
  // Final faces to settle on: the real hand if known, else neutral 1s.
  const finalFaces: number[] = hasHand
    ? (hand as number[])
    : Array.from({ length: count }, () => 1);

  // Which dice are mid-roll (drives data-tumbling + the long transition duration).
  const [rolling, setRolling] = useState<boolean[]>(() => finalFaces.map(() => false));
  // Settle "pop" (scale overshoot).
  const [popping, setPopping] = useState<boolean[]>(() => finalFaces.map(() => false));
  // Per-die accumulated cube rotation (degrees). Starts aligned to the faces.
  const [rot, setRot] = useState<Rot[]>(() =>
    finalFaces.map((f) => alignToFace({ x: 0, y: 0 }, f)),
  );

  const onAllSettledRef = useRef(onAllSettled);
  const onCollisionRef = useRef(onCollision);
  const finalFacesRef = useRef(finalFaces);
  onAllSettledRef.current = onAllSettled;
  onCollisionRef.current = onCollision;
  finalFacesRef.current = finalFaces;

  // Signature identifying "a new roll": entering 'rolling', or the dealt hand changing.
  const rollKey = `${phase === 'rolling' ? 'rolling' : 'static'}|${(hand ?? []).join(',')}`;
  const seenRollKey = useRef<string | null>(null);

  useEffect(() => {
    const target = finalFacesRef.current;
    const n = target.length;
    const isRollTrigger = phase === 'rolling' || n > 0;

    // Snap to rest showing the final faces. Every non-animating exit path runs this
    // so a prior cut-off roll can never strand a die mid-tumble (issue #3 freeze).
    const settle = () => {
      setRolling(target.map(() => false));
      setPopping(target.map(() => false));
      setRot((prev) => target.map((f, i) => alignToFace(prev[i] ?? { x: 0, y: 0 }, f)));
    };

    if (!isRollTrigger) {
      seenRollKey.current = rollKey;
      settle();
      return;
    }
    if (seenRollKey.current === rollKey) {
      settle();
      return;
    }
    if (prefersReducedMotion()) {
      seenRollKey.current = rollKey;
      settle();
      onAllSettledRef.current?.(target);
      return;
    }

    // Animate: spin every cube forward to its final face, landing staggered.
    setRolling(target.map(() => true));
    setPopping(target.map(() => false));
    setRot((prev) => target.map((f, i) => spinToFace(prev[i] ?? { x: 0, y: 0 }, f, i)));

    const timers: ReturnType<typeof setTimeout>[] = [];
    // A couple of rattle pulses mid-roll for audio.
    timers.push(
      setTimeout(() => onCollisionRef.current?.(0.6), 120),
      setTimeout(() => onCollisionRef.current?.(0.9), 360),
    );

    let settledCount = 0;
    for (let i = 0; i < n; i++) {
      const settleAt = TUMBLE_MS + i * STAGGER_MS;
      timers.push(
        setTimeout(() => {
          setRolling((prev) => prev.map((v, j) => (j === i ? false : v)));
          setPopping((prev) => prev.map((v, j) => (j === i ? true : v)));
          timers.push(
            setTimeout(() => {
              setPopping((prev) => prev.map((v, j) => (j === i ? false : v)));
            }, POP_MS),
          );
          settledCount += 1;
          if (settledCount === n) {
            seenRollKey.current = rollKey; // consumed only once the roll completes
            onAllSettledRef.current?.(target);
          }
        }, settleAt),
      );
    }

    return () => {
      for (const tm of timers) clearTimeout(tm);
    };
  }, [rollKey, phase]);

  // Keep array lengths in sync when count changes outside a roll (a player loses a
  // die between rounds while the phase is static).
  useEffect(() => {
    if (phase === 'rolling') return;
    const faces = finalFacesRef.current;
    setRolling((prev) => (prev.length === count ? prev : faces.map(() => false)));
    setPopping((prev) => (prev.length === count ? prev : faces.map(() => false)));
    setRot((prev) =>
      prev.length === count ? prev : faces.map((f) => alignToFace({ x: 0, y: 0 }, f)),
    );
  }, [count, phase]);

  const t = useTranslations('game');
  const ariaLabel = hasHand
    ? t('yourDice', { faces: finalFaces.join(', ') })
    : t('diceFaceDown', { count });

  return (
    <div className="dice2d-root" role="img" aria-label={ariaLabel}>
      <div className="dice2d-tray">
        {Array.from({ length: count }).map((_, i) => {
          const isRolling = rolling[i] ?? false;
          const faceDownNow = !hasHand && !isRolling;
          const r = rot[i] ?? { x: TILT.x, y: TILT.y };
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: index is the die identity
              key={i}
              className="dice2d-wrap"
              data-tumbling={isRolling ? 'true' : undefined}
              data-popping={popping[i] ? 'true' : undefined}
              style={{ width: DIE_PX, height: DIE_PX }}
            >
              {faceDownNow ? (
                <div className="dice2d-down" style={{ width: DIE_PX, height: DIE_PX }}>
                  <span className="dice2d-q" aria-hidden="true">
                    ?
                  </span>
                </div>
              ) : (
                <div
                  className="dice2d-cube"
                  style={{
                    width: DIE_PX,
                    height: DIE_PX,
                    ['--half' as string]: `${DIE_PX / 2}px`,
                    transform: `rotateX(${r.x}deg) rotateY(${r.y}deg)`,
                    transitionDuration: isRolling
                      ? `${TUMBLE_MS + i * STAGGER_MS}ms`
                      : `${POP_MS}ms`,
                  }}
                >
                  <CubeFace value={1} pos="front" />
                  <CubeFace value={6} pos="back" />
                  <CubeFace value={3} pos="right" />
                  <CubeFace value={4} pos="left" />
                  <CubeFace value={5} pos="top" />
                  <CubeFace value={2} pos="bottom" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
