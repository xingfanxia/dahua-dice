'use client';

import { Dice2D, type DicePhase } from './Dice2D';

export type { DicePhase };

/**
 * DiceScene — the player's dice display. Backed by a 2D DOM/CSS renderer
 * (no WebGL / Three.js), so it needs no dynamic import. The import path
 * '@/components/dice/DiceScene' and the named export stay stable for callers.
 */
export function DiceScene({
  diceCount,
  phase,
  hand,
  sides,
  onCollision,
  onAllSettled,
}: {
  diceCount: number;
  phase: DicePhase;
  /** The caller's own dice faces, if known. When omitted, dice render face-down. */
  hand?: number[] | null;
  /** Faces per die (defaults to 6; pass 8 for the 8-sided variant). */
  sides?: number;
  onCollision?: (force: number) => void;
  onAllSettled?: (faces: number[]) => void;
}) {
  return (
    <Dice2D
      diceCount={diceCount}
      phase={phase}
      hand={hand}
      sides={sides}
      onCollision={onCollision}
      onAllSettled={onAllSettled}
    />
  );
}
