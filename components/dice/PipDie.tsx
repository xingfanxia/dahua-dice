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
  className = '',
}: {
  face: number;
  size?: number;
  /** Amber accent — the dice that count toward the verified bid on reveal. */
  highlighted?: boolean;
  className?: string;
}) {
  const pips = PIP_LAYOUT[face];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[24%] bg-white align-middle shadow-sm dark:bg-gray-100 ${
        highlighted ? 'ring-2 ring-amber-500' : 'ring-1 ring-black/10'
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {pips ? (
        <svg viewBox="0 0 100 100" className="h-[76%] w-[76%]" aria-hidden="true">
          {pips.map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={11}
              className={highlighted ? 'fill-amber-500' : 'fill-gray-900'}
            />
          ))}
        </svg>
      ) : (
        // 7/8 (8-sided variant): no canonical pip layout — render the number.
        <span className="num text-[58%] font-bold text-gray-900">{face}</span>
      )}
    </span>
  );
}
