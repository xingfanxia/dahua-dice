import { describe, expect, it } from 'vitest';
import { generateInviteCode, isValidInviteCode } from '@/lib/room/invite-code';

describe('generateInviteCode', () => {
  it('returns 6 chars from A-HJ-NP-Z2-9 alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateInviteCode();
      expect(c).toMatch(/^[A-HJKM-NP-Z2-9]{6}$/);
    }
  });

  it('never includes 0/1/I/L/O (ambiguous chars)', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateInviteCode();
      expect(c).not.toMatch(/[01ILO]/);
    }
  });

  it('produces mostly-unique codes across 100 calls', () => {
    const set = new Set(Array.from({ length: 100 }, generateInviteCode));
    expect(set.size).toBeGreaterThanOrEqual(95);
  });
});

describe('isValidInviteCode', () => {
  it('accepts a valid code', () => {
    expect(isValidInviteCode('ABC234')).toBe(true);
  });

  it('rejects lowercase', () => {
    expect(isValidInviteCode('abc234')).toBe(false);
  });

  it('rejects ambiguous chars', () => {
    expect(isValidInviteCode('ABC012')).toBe(false);
    expect(isValidInviteCode('AILO23')).toBe(false);
    expect(isValidInviteCode('ABCLDE')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidInviteCode('ABC23')).toBe(false);
    expect(isValidInviteCode('ABC2345')).toBe(false);
  });
});
