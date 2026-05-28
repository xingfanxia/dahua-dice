export type AvatarOption = { id: string; glyph: string };

/**
 * Identity glyphs a player can pick to represent themselves at the table.
 * The default 'numeric' renders the player's seat number instead of a glyph.
 */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'fox', glyph: '🦊' },
  { id: 'tiger', glyph: '🐯' },
  { id: 'dragon', glyph: '🐲' },
  { id: 'panda', glyph: '🐼' },
  { id: 'owl', glyph: '🦉' },
  { id: 'frog', glyph: '🐸' },
  { id: 'rooster', glyph: '🐓' },
  { id: 'rabbit', glyph: '🐰' },
  { id: 'cat', glyph: '🐱' },
  { id: 'wolf', glyph: '🐺' },
  { id: 'lion', glyph: '🦁' },
  { id: 'monkey', glyph: '🐵' },
];

export const DEFAULT_AVATAR = 'numeric';

const GLYPH_BY_ID = new Map(AVATAR_OPTIONS.map((a) => [a.id, a.glyph]));

export function isAvatarId(id: string): boolean {
  return id === DEFAULT_AVATAR || GLYPH_BY_ID.has(id);
}

/** Sanitize an untrusted avatar id to a known value (system boundary). */
export function normalizeAvatar(id: string | undefined | null): string {
  return id && isAvatarId(id) ? id : DEFAULT_AVATAR;
}

export function avatarGlyph(id: string): string | null {
  return GLYPH_BY_ID.get(id) ?? null;
}

/** Stable hue (0-359) derived from a seed, used to tint a player's badge. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}
