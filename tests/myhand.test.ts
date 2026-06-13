import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyHand } from '@/components/dice/MyHand';

// The gesture state machine is what's under test — stub i18n, audio, and the gyro
// detector so we drive MyHand purely through taps + the fake clock. settleSpy is the
// always-on CC0 throw cue; we assert it fires once per first-reveal and stays silent
// on a re-peek. (hoisted so the mock factory can reference it.)
const { settleSpy } = vi.hoisted(() => ({ settleSpy: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/audio/useDiceAudio', () => ({
  useDiceAudio: () => ({ shake: vi.fn(), settle: settleSpy, collide: vi.fn() }),
}));
vi.mock('@/components/shake/useShakeDetector', () => ({
  useShakeDetector: () => ({ permission: 'granted' as const, requestPermission: vi.fn() }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MyHand gesture model', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    settleSpy.mockClear();
    // Animations ON (reduced-motion OFF) so the tumble path runs.
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

  const render = (hand: number[] | null, round: number) =>
    act(() => {
      root.render(createElement(MyHand, { hand, round }));
    });
  const tap = () =>
    act(() => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  // Covered ⟺ the cubes render the `?` blank face; revealed ⟺ no `?`.
  const covered = () => container.querySelectorAll('.dice2d-q').length > 0;
  const text = () => container.textContent ?? '';

  it('deals covered — no auto-roll, values hidden until a tap', () => {
    render([2, 5, 3], 1);
    expect(covered()).toBe(true);
    expect(text()).toContain('tapOrShakeReveal');
  });

  it('first tap tumbles, settles to revealed, and plays the throw cue ONCE', () => {
    render([2, 5, 3], 1);
    tap();
    expect(settleSpy).toHaveBeenCalledTimes(1); // cue fires at the START of the throw
    act(() => vi.advanceTimersByTime(3000));
    expect(covered()).toBe(false);
    expect(text()).toContain('tapToCover'); // settled, not stuck on rollingDice
  });

  it('re-peek after covering flips instantly and stays SILENT (no second cue)', () => {
    render([2, 5, 3], 1);
    tap();
    act(() => vi.advanceTimersByTime(3000)); // revealed → rolledOnce
    expect(settleSpy).toHaveBeenCalledTimes(1);
    tap(); // cover
    expect(covered()).toBe(true);
    tap(); // re-peek
    act(() => vi.advanceTimersByTime(50)); // far under TUMBLE_MS
    expect(covered()).toBe(false); // revealed via quick flip
    expect(settleSpy).toHaveBeenCalledTimes(1); // re-peek does NOT replay the cue
  });

  // Round-2 freeze analog (#3): a new round with the SAME faces must re-cover
  // cleanly and still tumble again on tap — never strand mid-spin.
  it('re-covers on a new round even when faces repeat, and can re-roll', () => {
    render([2, 5, 3], 1);
    tap();
    act(() => vi.advanceTimersByTime(3000)); // round 1 revealed
    render([2, 5, 3], 2); // round 2 — identical faces
    expect(covered()).toBe(true); // re-covered, not stuck revealed/rolling
    tap();
    act(() => vi.advanceTimersByTime(3000));
    expect(covered()).toBe(false); // tumbles + settles again (rolledOnce reset)
  });

  it('reduced motion reveals without a tumble but STILL plays the throw cue', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render([4, 1, 6], 1);
    tap();
    act(() => vi.advanceTimersByTime(50)); // no tumble window needed
    expect(covered()).toBe(false);
    expect(text()).toContain('tapToCover');
    expect(settleSpy).toHaveBeenCalledTimes(1); // reduced motion suppresses MOTION, not sound
  });
});
