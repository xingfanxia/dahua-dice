/**
 * Shared inline die — a small rounded-square with real d6 pips, replacing the
 * literal Unicode emoji glyphs (⚀⚁⚂…) that used to render the dice in the bid
 * panel, bid chain and reveal screen (issue #9: "看起来像 emoji"). One primitive
 * so every inline die matches the 3D tray cube. Light/dark via Tailwind only.
 */

/** Standard d6 pip positions in a 0..100 coordinate space (shared with the cube). */
export const PIP_LAYOUT: Record<number, [number, number][]> = {
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

export function PipDie({
  face,
  size = 24,
  highlighted = false,
  tone = 'amber',
  dimmed = false,
  className = '',
}: {
  face: number;
  size?: number;
  /** Accent ring — the dice that count toward the verified bid on reveal. */
  highlighted?: boolean;
  /** Highlight color: amber = a wild 1 standing in (飞), emerald = a real face match. */
  tone?: 'amber' | 'emerald';
  /** Fade a non-counting die on the reveal screen so the matches stand out. */
  dimmed?: boolean;
  className?: string;
}) {
  const pips = PIP_LAYOUT[face];
  const ring = highlighted
    ? tone === 'emerald'
      ? 'ring-2 ring-emerald-500'
      : 'ring-2 ring-amber-500'
    : 'ring-1 ring-black/10';
  const pipFill = highlighted
    ? tone === 'emerald'
      ? 'fill-emerald-600'
      : 'fill-amber-500'
    : 'fill-gray-900';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[24%] bg-white align-middle shadow-sm dark:bg-gray-100 ${ring} ${
        dimmed ? 'opacity-40' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {pips ? (
        <svg viewBox="0 0 100 100" className="h-[76%] w-[76%]" aria-hidden="true">
          {pips.map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={11} className={pipFill} />
          ))}
        </svg>
      ) : (
        // 7/8 (8-sided variant): no canonical pip layout — render the number.
        <span className="num text-[58%] font-bold text-gray-900">{face}</span>
      )}
    </span>
  );
}
