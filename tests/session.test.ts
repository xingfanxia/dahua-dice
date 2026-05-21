import { describe, expect, it } from 'vitest';
import { generatePlayerId, generateToken, validateNickname } from '@/lib/auth/session';

describe('generatePlayerId', () => {
  it('returns a valid UUID v4', () => {
    const id = generatePlayerId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('returns unique values across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, generatePlayerId));
    expect(ids.size).toBe(50);
  });
});

describe('generateToken', () => {
  it('returns a 43-char url-safe base64 string (32 bytes)', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns unique values', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
  });
});

describe('validateNickname', () => {
  it('accepts a normal Latin nickname', () => {
    expect(validateNickname('AX')).toEqual({ ok: true, value: 'AX' });
  });

  it('accepts a Chinese nickname', () => {
    expect(validateNickname('星')).toEqual({ ok: true, value: '星' });
  });

  it('rejects empty string', () => {
    expect(validateNickname('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects whitespace-only', () => {
    expect(validateNickname('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects > 20 chars', () => {
    expect(validateNickname('a'.repeat(21))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('accepts exactly 20 chars', () => {
    expect(validateNickname('a'.repeat(20))).toEqual({ ok: true, value: 'a'.repeat(20) });
  });

  it('rejects NUL', () => {
    expect(validateNickname('hello\x00world')).toEqual({
      ok: false,
      reason: 'invalid_chars',
    });
  });

  it('rejects newline', () => {
    expect(validateNickname('hello\nworld')).toEqual({
      ok: false,
      reason: 'invalid_chars',
    });
  });

  it('trims whitespace', () => {
    expect(validateNickname('  AX  ')).toEqual({ ok: true, value: 'AX' });
  });

  it('rejects non-string input', () => {
    expect(validateNickname(null as unknown as string).ok).toBe(false);
    expect(validateNickname(undefined as unknown as string).ok).toBe(false);
    expect(validateNickname(123 as unknown as string).ok).toBe(false);
  });
});
