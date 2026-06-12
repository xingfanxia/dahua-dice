'use client';

import { useTranslations } from 'next-intl';
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
  const hue = avatarHue(seed);

  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
              className={`flex aspect-square items-center justify-center rounded-xl border-2 text-xl transition-transform disabled:opacity-40 ${
                selected ? 'scale-105 border-red-600' : 'border-transparent'
              } ${o.id === DEFAULT_AVATAR ? '' : 'bg-gray-100 dark:bg-gray-700'}`}
              style={
                o.id === DEFAULT_AVATAR ? { backgroundColor: `oklch(0.55 0.12 ${hue})` } : undefined
              }
            >
              {o.id === DEFAULT_AVATAR ? (
                <span className="num text-base font-semibold text-white">{seat}</span>
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
