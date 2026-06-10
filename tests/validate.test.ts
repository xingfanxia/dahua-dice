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

  it('clamps to total table dice (late-game 1v1 must keep a legal opener)', () => {
    // 2 alive with 1 die each: floor would be 3 > table 2 → clamp to 2
    expect(getStartingBidThreshold(2, false, DEFAULT_RULES, 2)).toBe(2);
    // 3 alive all at 1 die: floor 5 > table 3 → clamp to 3
    expect(getStartingBidThreshold(3, false, DEFAULT_RULES, 3)).toBe(3);
    // plenty of dice → unclamped
    expect(getStartingBidThreshold(2, false, DEFAULT_RULES, 10)).toBe(3);
  });
});

describe('isValidBid (late-game opener paralysis regression)', () => {
  // THE softlock: 1v1 with one die each — ceil(1.5×2)=3 demanded but only 2 dice
  // exist; with no standing bid there is nothing to challenge either, so the
  // opener used to have ZERO legal actions and the game froze.
  it('1v1 with 1 die each: opening 2×face is legal', () => {
    expect(
      isValidBid(null, { count: 2, face: 4, isZhai: false }, DEFAULT_RULES, 2, { totalDice: 2 }).ok,
    ).toBe(true);
  });

  it('1v1 with 1 die each: opening 1×face is still below the (clamped) floor', () => {
    const r = isValidBid(null, { count: 1, face: 4, isZhai: false }, DEFAULT_RULES, 2, {
      totalDice: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('below_starting');
  });

  it('uneven 1v1 (1 vs 5 dice, table 6): floor stays unclamped at 3', () => {
    expect(
      isValidBid(null, { count: 2, face: 4, isZhai: false }, DEFAULT_RULES, 2, { totalDice: 6 }).ok,
    ).toBe(false);
    expect(
      isValidBid(null, { count: 3, face: 4, isZhai: false }, DEFAULT_RULES, 2, { totalDice: 6 }).ok,
    ).toBe(true);
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

  it('enters zhai (from 飞): follows the normal raise rule (research §2.3 转斋)', () => {
    const prev = { count: 6, face: 4, isZhai: false } as const;
    // count-up into zhai → ok
    expect(isValidBid(prev, { count: 7, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
    // same count + face-up into zhai → ok
    expect(isValidBid(prev, { count: 6, face: 5, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
    // same count + same face → not a raise → reject
    expect(isValidBid(prev, { count: 6, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(false);
    // count-down into zhai → reject (no special halve-pool allowance)
    expect(isValidBid(prev, { count: 4, face: 4, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(false);
  });

  it('rejects zhai when rules.allowZhai = false', () => {
    const rules: GameRules = { ...DEFAULT_RULES, allowZhai: false };
    expect(isValidBid(null, { count: 4, face: 4, isZhai: true }, rules, 4).ok).toBe(false);
  });
});

describe('isValidBid (叫1必斋 — research §2.3)', () => {
  it('rejects a non-zhai face-1 opener with the right reason', () => {
    const r = isValidBid(null, { count: 4, face: 1, isZhai: false }, DEFAULT_RULES, 4);
    expect(r.ok).toBe(false);
    expect(r.ok ? undefined : r.reason).toBe('face_one_must_zhai');
  });

  it('accepts a zhai face-1 opener at the zhai threshold', () => {
    expect(isValidBid(null, { count: 4, face: 1, isZhai: true }, DEFAULT_RULES, 4).ok).toBe(true);
  });

  it('rejects a non-zhai face-1 raise', () => {
    const prev = { count: 3, face: 4, isZhai: false } as const;
    expect(isValidBid(prev, { count: 4, face: 1, isZhai: false }, DEFAULT_RULES, 4).ok).toBe(false);
  });
});
