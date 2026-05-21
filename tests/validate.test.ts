import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type GameRules } from '@/lib/game-engine/types';
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate';

describe('getStartingBidThreshold', () => {
  it('non-zhai = ceil(1.5 × alive)', () => {
    expect(getStartingBidThreshold(2, false, DEFAULT_RULES)).toBe(3);
    expect(getStartingBidThreshold(4, false, DEFAULT_RULES)).toBe(6);
    expect(getStartingBidThreshold(5, false, DEFAULT_RULES)).toBe(8);
    expect(getStartingBidThreshold(8, false, DEFAULT_RULES)).toBe(12);
  });

  it('zhai = alive', () => {
    expect(getStartingBidThreshold(2, true, DEFAULT_RULES)).toBe(2);
    expect(getStartingBidThreshold(5, true, DEFAULT_RULES)).toBe(5);
  });
});

describe('isValidBid (no prior bid)', () => {
  it('accepts a normal opener at threshold', () => {
    expect(isValidBid(null, { count: 6, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('rejects below threshold', () => {
    expect(isValidBid(null, { count: 5, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('accepts zhai opener at alive', () => {
    expect(isValidBid(null, { count: 4, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('rejects zhai below alive', () => {
    expect(isValidBid(null, { count: 3, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('rejects invalid face (>diceSides)', () => {
    expect(isValidBid(null, { count: 6, face: 7 as 7, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(
      false,
    );
  });

  it('rejects zero count', () => {
    expect(isValidBid(null, { count: 0, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });
});

describe('isValidBid (with prior bid, same regime)', () => {
  const prev = { count: 3, face: 4, isZhai: false } as const;

  it('accepts count-up same face', () => {
    expect(isValidBid(prev, { count: 4, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('accepts face-up same count', () => {
    expect(isValidBid(prev, { count: 3, face: 5, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('rejects count-down', () => {
    expect(isValidBid(prev, { count: 2, face: 5, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('rejects same count + same face', () => {
    expect(isValidBid(prev, { count: 3, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('rejects face-down same count', () => {
    expect(isValidBid(prev, { count: 3, face: 3, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });
});

describe('isValidBid (zhai transitions)', () => {
  it('breaks zhai (飞): count must >= 2 × prev.count', () => {
    const prev = { count: 3, face: 4, isZhai: true } as const;
    expect(isValidBid(prev, { count: 6, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(true);
    expect(isValidBid(prev, { count: 5, face: 4, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('stays in zhai (count up)', () => {
    const prev = { count: 3, face: 4, isZhai: true } as const;
    expect(isValidBid(prev, { count: 4, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('enters zhai (from non-zhai): must be > ceil(prev.count / 2)', () => {
    const prev = { count: 6, face: 4, isZhai: false } as const;
    // ceil(6/2) = 3, so > 3 = at least 4
    expect(isValidBid(prev, { count: 4, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
    expect(isValidBid(prev, { count: 3, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('rejects zhai when rules.allowZhai = false', () => {
    const rules: GameRules = { ...DEFAULT_RULES, allowZhai: false };
    expect(isValidBid(null, { count: 4, face: 4, isZhai: true }, rules, 4).ok).toBe(false);
  });
});
