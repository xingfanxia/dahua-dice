'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import { AVATAR_OPTIONS, avatarHue, DEFAULT_AVATAR } from '@/lib/avatars';

/**
 * Lets a player pick their own identity glyph in the lobby. Not owner-gated —
 * each player chooses for themselves. Calls onSelect with the avatar id.
 */
export function AvatarPicker({
  value,
  seat,
  seed,
  onSelect,
  disabled = false,
}: {
  value: string;
  seat: number;
  seed: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const hue = avatarHue(seed);

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
      <legend
        className="text-xs uppercase tracking-wide mb-2"
        style={{ color: tokens.colors.textMuted }}
      >
        {t('lobby.avatarHeader')}
      </legend>
      <div className="grid grid-cols-6 gap-2">
        {[{ id: DEFAULT_AVATAR, glyph: '' }, ...AVATAR_OPTIONS].map((o) => {
          const selected = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              aria-label={t(`avatars.${o.id}`)}
              disabled={disabled}
              onClick={() => onSelect(o.id)}
              className="flex aspect-square items-center justify-center rounded-xl text-xl transition-transform disabled:opacity-40"
              style={{
                backgroundColor:
                  o.id === DEFAULT_AVATAR ? `oklch(0.55 0.12 ${hue})` : tokens.colors.surface,
                border: `2px solid ${selected ? tokens.colors.primary : 'transparent'}`,
                transform: selected ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {o.id === DEFAULT_AVATAR ? (
                <span className="num font-semibold text-base" style={{ color: 'white' }}>
                  {seat}
                </span>
              ) : (
                o.glyph
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
