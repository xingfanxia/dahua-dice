'use client';

import dynamic from 'next/dynamic';

export type { DicePhase } from './DiceCanvas';

/**
 * Lazy-loaded wrapper for the 3D dice canvas. Prevents bundling Three.js into the
 * initial route load and avoids SSR (Three.js requires window/document).
 */
export const DiceScene = dynamic(
  () => import('./DiceCanvas').then((m) => ({ default: m.DiceCanvas })),
  { ssr: false, loading: () => <div className="w-full aspect-square bg-surface animate-pulse" /> },
);
