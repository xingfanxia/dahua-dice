import { randomBytes, randomUUID } from 'node:crypto';

export function generatePlayerId(): string {
  return randomUUID();
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export type NickValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_chars' };

const NICK_MAX_LEN = 20;
// Reject control chars (0x00-0x1F) and HTML-injection-prone chars (<>"'`&).
// React JSX escaping makes XSS unlikely in display paths, but blocking these
// at the API boundary keeps nicknames safe for any future attr/title/aria use.
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately rejecting control chars
const FORBIDDEN_RE = /[\x00-\x1F<>"'`&]/;

export function validateNickname(input: unknown): NickValidation {
  if (typeof input !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > NICK_MAX_LEN) return { ok: false, reason: 'too_long' };
  if (FORBIDDEN_RE.test(trimmed)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value: trimmed };
}
