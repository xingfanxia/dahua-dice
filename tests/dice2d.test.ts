import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dice2D } from '@/components/dice/Dice2D';

// The translation namespace is irrelevant to the animation state machine under
// test — stub it to a passthrough so we don't need an IntlProvider wrapper.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// React's act() requires this flag in a non-DOM-bundler environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Dice2D round-advance', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic: animations on (reduced-motion OFF) so the tumble path runs.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const render = (hand: number[] | null) =>
    act(() => {
      root.render(createElement(Dice2D, { diceCount: 3, phase: 'settled' as const, hand }));
    });

  const stillTumbling = () => container.querySelectorAll('[data-tumbling="true"]').length;

  // Regression for the round-2 freeze: after round 1 settles, the round-advance
  // does a transient hand=null render (which starts a tumble toward placeholders)
  // immediately followed by the new hand. When round 2 happens to deal the SAME
  // faces as round 1, the second render's effect saw the cleanup cancel render A's
  // settle timers and then early-returned on the already-seen rollKey — leaving the
  // dice stuck in perpetual tumble (issue #3, "第二轮扔骰子卡住").
  it('settles (never strands a tumble) when round 2 deals the same faces as round 1', () => {
    render([2, 5, 3]);
    act(() => vi.advanceTimersByTime(3000));
    expect(stillTumbling()).toBe(0); // round 1 settled

    // Round advance: null (render A) then identical faces (render B), no timer flush between.
    render(null);
    render([2, 5, 3]);

    act(() => vi.advanceTimersByTime(3000));
    expect(stillTumbling()).toBe(0); // round 2 must also end settled, not spinning
  });

  // A different-faces round 2 must still produce a real (and completing) tumble.
  it('re-tumbles and settles when round 2 deals different faces', () => {
    render([2, 5, 3]);
    act(() => vi.advanceTimersByTime(3000));
    expect(stillTumbling()).toBe(0);

    render(null);
    render([4, 1, 6]);
    act(() => vi.advanceTimersByTime(3000));
    expect(stillTumbling()).toBe(0);
  });
});
