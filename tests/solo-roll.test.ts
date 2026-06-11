import { describe, expect, it } from 'vitest';
import { rollDiceClient } from '@/lib/solo/roll';

describe('rollDiceClient (offline solo dice)', () => {
  it('returns exactly `count` dice', () => {
    for (const count of [1, 3, 5, 8]) {
      expect(rollDiceClient(count, 6)).toHaveLength(count);
    }
  });

  it('every face is an integer within [1, sides] for d6', () => {
    for (let i = 0; i < 500; i++) {
      for (const f of rollDiceClient(5, 6)) {
        expect(Number.isInteger(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(6);
      }
    }
  });

  it('respects an 8-sided die', () => {
    let sawSeven = false;
    let sawEight = false;
    for (let i = 0; i < 500; i++) {
      for (const f of rollDiceClient(5, 8)) {
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(8);
        if (f === 7) sawSeven = true;
        if (f === 8) sawEight = true;
      }
    }
    // Over 2500 d8 rolls, the high faces should appear (sanity that sides is honored).
    expect(sawSeven && sawEight).toBe(true);
  });

  it('covers the full d6 face range across many rolls', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      for (const f of rollDiceClient(5, 6)) seen.add(f);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles a zero count as an empty hand', () => {
    expect(rollDiceClient(0, 6)).toEqual([]);
  });

  it('is roughly uniform for d6 (rejection sampling, no modulo bias)', () => {
    const counts = new Array(7).fill(0);
    const N = 60_000;
    for (const f of rollDiceClient(N, 6)) counts[f]++;
    // Each face ~N/6 ≈ 10000; allow a generous ±12% band (flake-safe, still catches
    // a biased distribution).
    for (let face = 1; face <= 6; face++) {
      expect(counts[face]).toBeGreaterThan((N / 6) * 0.88);
      expect(counts[face]).toBeLessThan((N / 6) * 1.12);
    }
  });
});
