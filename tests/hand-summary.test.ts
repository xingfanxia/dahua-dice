import { describe, expect, it } from 'vitest';
import { summarizeHand } from '@/lib/game/hand-summary';

describe('summarizeHand', () => {
  it('counts faces ascending', () => {
    expect(summarizeHand([3, 3, 5, 2, 5])).toEqual(['2 ×1', '3 ×2', '5 ×2']);
  });

  it('counts 1s as their own row (no wild annotation — wxapp parity)', () => {
    expect(summarizeHand([1, 3, 3, 6, 1])).toEqual(['1 ×2', '3 ×2', '6 ×1']);
  });

  it('handles a single-face hand', () => {
    expect(summarizeHand([4, 4, 4])).toEqual(['4 ×3']);
  });

  it('handles the empty hand (spectator) without rows', () => {
    expect(summarizeHand([])).toEqual([]);
  });
});
