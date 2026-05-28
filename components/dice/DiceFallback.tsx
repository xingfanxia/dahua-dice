'use client';

import { useTheme } from '@/components/theme/ThemeProvider';

/** Pip coordinates (0-100 viewBox) per face — standard die layout. */
const PIPS: Record<number, [number, number][]> = {
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

/**
 * 2D SVG dice — graceful degradation when WebGL2 is unavailable (spec §11).
 * Decorative, like the 3D canvas: the authoritative hand is delivered via /api/hand.
 */
export function DiceFallback({ diceCount }: { diceCount: number }) {
  const { tokens } = useTheme();
  const faces = Array.from({ length: Math.max(1, diceCount) }, (_, i) => (i % 6) + 1);
  return (
    <div
      className="w-full h-full flex flex-wrap items-center justify-center gap-3 p-4"
      style={{ backgroundColor: tokens.colors.surface }}
      role="img"
      aria-label={`${diceCount}`}
    >
      {faces.map((face, i) => (
        <svg
          // biome-ignore lint/suspicious/noArrayIndexKey: positional decorative dice
          key={i}
          viewBox="0 0 100 100"
          width="44"
          height="44"
          aria-hidden="true"
        >
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="18"
            fill={tokens.colors.bg}
            stroke={`${tokens.colors.textMuted}55`}
            strokeWidth="2"
          />
          {PIPS[face].map(([cx, cy], j) => (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed pip layout
              key={j}
              cx={cx}
              cy={cy}
              r="8"
              fill={tokens.colors.primary}
            />
          ))}
        </svg>
      ))}
    </div>
  );
}
