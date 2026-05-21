import { describe, expect, it } from 'vitest';
import { resolveChallenge } from '@/lib/game-engine/resolve';
import { DEFAULT_RULES, type GameRules } from '@/lib/game-engine/types';

describe('resolveChallenge', () => {
  // hands[0] (player 0): two 4s + two 1s + one 3
  // hands[1] (player 1): one 4 + one 1 (ace) + others
  // hands[2] (player 2): all 6s
  const hands = [
    [4, 4, 1, 1, 3],
    [4, 5, 5, 1, 3],
    [6, 6, 6, 6, 6],
  ];

  it('non-zhai, aceWild ON: actual = native 4s + ones', () => {
    // native 4s: 2 (p0) + 1 (p1) + 0 (p2) = 3
    // ones (wild): 2 (p0) + 1 (p1) + 0 (p2) = 3
    // actual = 6
    const r = resolveChallenge({ count: 5, face: 4, isZhai: false }, hands, DEFAULT_RULES, 1);
    expect(r.actualCount).toBe(6);
    expect(r.actualMeetsBid).toBe(true);
    expect(r.loserIdx).toBe(1); // challenger (player 1) loses
  });

  it('non-zhai, actual < bid → bidder loses', () => {
    // Same actual=6, bid 7 → 6 < 7 → bidder loses
    // bidder is challengerIdx - 1 = player 0
    const r = resolveChallenge({ count: 7, face: 4, isZhai: false }, hands, DEFAULT_RULES, 1);
    expect(r.actualCount).toBe(6);
    expect(r.actualMeetsBid).toBe(false);
    expect(r.loserIdx).toBe(0);
  });

  it('zhai round: ones NOT wild — actual = native face only', () => {
    // native 4s: 2 + 1 + 0 = 3
    const r = resolveChallenge({ count: 4, face: 4, isZhai: true }, hands, DEFAULT_RULES, 1);
    expect(r.actualCount).toBe(3);
    expect(r.actualMeetsBid).toBe(false);
    expect(r.loserIdx).toBe(0); // bidder loses
  });

  it('aceWild=false (rules-level): ones also not wild even in non-zhai bid', () => {
    const rules: GameRules = { ...DEFAULT_RULES, aceWild: false };
    const r = resolveChallenge({ count: 4, face: 4, isZhai: false }, hands, rules, 1);
    expect(r.actualCount).toBe(3); // only native 4s
    expect(r.loserIdx).toBe(0);
  });

  it('exact match: actual === bid → challenger loses (bidder safe)', () => {
    // actual = 6, bid 6 → actual >= bid → challenger loses
    const r = resolveChallenge({ count: 6, face: 4, isZhai: false }, hands, DEFAULT_RULES, 1);
    expect(r.actualMeetsBid).toBe(true);
    expect(r.loserIdx).toBe(1);
  });

  it('bidder explicit (not adjacent)', () => {
    // 3-player game; player 2 challenges player 0's bid (skipping player 1 if they passed)
    const r = resolveChallenge({ count: 5, face: 6, isZhai: false }, hands, DEFAULT_RULES, 2, 0);
    // native 6s: 0 + 0 + 5 = 5; ones (wild): 2+1+0 = 3 (but face is 6 so ones add as wild)
    // wait — ones add as wild count for the bid face. So count of 6 = 5 + 3 wild = 8 ≥ 5
    expect(r.actualCount).toBe(8);
    expect(r.actualMeetsBid).toBe(true);
    expect(r.loserIdx).toBe(2); // challenger (player 2) loses
  });

  it('challenger at idx 0: inferred bidder is last player (wrap-around)', () => {
    // 3 players, challenger=0, no explicit bidderIdx → bidder = 2 (wrap)
    const r = resolveChallenge({ count: 10, face: 4, isZhai: false }, hands, DEFAULT_RULES, 0);
    // actual = 6 (native 4s) + wild ones = 6, bid 10 → 6 < 10 → bidder loses
    expect(r.actualMeetsBid).toBe(false);
    expect(r.loserIdx).toBe(2);
  });
});
