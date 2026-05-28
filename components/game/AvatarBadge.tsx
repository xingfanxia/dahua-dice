'use client';

import { avatarGlyph, avatarHue } from '@/lib/avatars';

/**
 * A player's identity marker — a tinted circle showing either their chosen
 * emoji glyph or, for the default 'numeric' avatar, their seat number.
 * Decorative: the adjacent nickname carries the accessible identity.
 */
export function AvatarBadge({
  avatar,
  seed,
  seat,
  size = 32,
}: {
  avatar: string;
  seed: string;
  seat: number;
  size?: number;
}) {
  const glyph = avatarGlyph(avatar);
  const hue = avatarHue(seed);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: `oklch(0.55 0.12 ${hue})`,
        fontSize: size * 0.52,
        lineHeight: 1,
      }}
    >
      {glyph ?? (
        <span className="num font-semibold" style={{ color: 'white', fontSize: size * 0.42 }}>
          {seat}
        </span>
      )}
    </span>
  );
}
