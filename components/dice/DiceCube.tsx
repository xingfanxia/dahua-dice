'use client';

import { PIP_LAYOUT } from './PipDie';
import './dice2d.css';

/**
 * One CSS 3D cube die (DOM/CSS only — no WebGL). A real six-faced cube (opposite
 * faces sum to 7: front 1 / back 6 / right 3 / left 4 / top 5 / bottom 2) that the
 * caller rotates to bring a value to the front. This is the dumb per-die primitive:
 * it renders at the `rotX`/`rotY` it's handed and animates over `transitionMs`.
 * `MyHand` owns the gesture/orchestration (tumble vs flip, covered vs revealed),
 * mirroring the wxapp sibling's DiceCube/DiceRow split so the two stay in parity.
 */

export type Rot = { x: number; y: number };

// A mild constant 3/4 tilt so a die at rest still reads as a solid cube (you
// glimpse two side faces) while keeping the front face clearly readable.
const TILT: Rot = { x: -16, y: 14 };

// Rotation that brings each value's face to the front (faces fixed; sum to 7).
const FACE_ROT: Record<number, Rot> = {
  1: { x: 0, y: 0 },
  2: { x: 90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 0, y: 180 },
};

/** Rest orientation for `face` nearest to `prev` (minimal movement, no extra spin). */
export function alignToFace(prev: Rot, face: number): Rot {
  const base = FACE_ROT[face] ?? FACE_ROT[1];
  const tx = base.x + TILT.x;
  const ty = base.y + TILT.y;
  return {
    x: tx + 360 * Math.round((prev.x - tx) / 360),
    y: ty + 360 * Math.round((prev.y - ty) / 360),
  };
}

/** Forward-spinning target for `face`: a few full turns past `prev`, landing on it. */
export function spinToFace(prev: Rot, face: number, i: number): Rot {
  const base = FACE_ROT[face] ?? FACE_ROT[1];
  const tx = base.x + TILT.x;
  const ty = base.y + TILT.y;
  const turnsX = Math.floor((prev.x - tx) / 360) + 2 + (i % 2);
  const turnsY = Math.floor((prev.y - ty) / 360) + 3 - (i % 2);
  return { x: tx + 360 * turnsX, y: ty + 360 * turnsY };
}

// Six faces of the cube, in fixed value→placement order.
const FACES: { value: number; pos: string }[] = [
  { value: 1, pos: 'front' },
  { value: 6, pos: 'back' },
  { value: 3, pos: 'right' },
  { value: 4, pos: 'left' },
  { value: 5, pos: 'top' },
  { value: 2, pos: 'bottom' },
];

/** One cube face: pips for its value, or a `?` when covered (`blank`). */
function CubeFace({ value, pos, blank }: { value: number; pos: string; blank: boolean }) {
  const pips = PIP_LAYOUT[value];
  return (
    <div className={`dice2d-face dice2d-face--${pos}`}>
      {blank ? (
        <span className="dice2d-q" aria-hidden="true">
          ?
        </span>
      ) : (
        pips && (
          <svg viewBox="0 0 100 100" className="dice2d-pips" aria-hidden="true">
            {pips.map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={10} className="dice2d-pip" />
            ))}
          </svg>
        )
      )}
    </div>
  );
}

export function DiceCube({
  face,
  size = 72,
  rotX,
  rotY,
  transitionMs = 0,
  blank = false,
  popping = false,
}: {
  face: number;
  size?: number;
  /** Explicit rotation (driven by MyHand). Defaults to the face's rest orientation. */
  rotX?: number;
  rotY?: number;
  transitionMs?: number;
  blank?: boolean;
  popping?: boolean;
}) {
  const base = FACE_ROT[face] ?? FACE_ROT[1];
  const rx = rotX ?? base.x + TILT.x;
  const ry = rotY ?? base.y + TILT.y;
  return (
    <div
      className="dice2d-wrap"
      data-popping={popping ? 'true' : undefined}
      style={{ width: size, height: size }}
    >
      <div
        className="dice2d-cube"
        style={{
          width: size,
          height: size,
          ['--half' as string]: `${size / 2}px`,
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          transitionDuration: `${transitionMs}ms`,
        }}
      >
        {FACES.map((f) => (
          <CubeFace key={f.pos} value={f.value} pos={f.pos} blank={blank} />
        ))}
      </div>
    </div>
  );
}
