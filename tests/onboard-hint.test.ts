import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardHint } from '@/components/game/OnboardHint';

// Passthrough i18n (t + t.rich return the key) so we assert WHICH state renders.
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    (t as unknown as { rich: (k: string) => string }).rich = (key: string) => key;
    return t;
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('OnboardHint', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const render = () =>
    act(() => {
      root.render(createElement(OnboardHint));
    });
  const text = () => container.textContent ?? '';
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === label) ?? null;
  const click = (el: Element | null) =>
    act(() => {
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

  it('shows the full memo on first visit (nothing in storage)', () => {
    render();
    expect(text()).toContain('onboard.title');
    expect(text()).toContain('onboard.line1');
    expect(text()).toContain('onboard.line2');
    expect(text()).not.toContain('onboard.reopen');
  });

  it('dismiss collapses to a re-open link and remembers it', () => {
    render();
    click(button('onboard.dismiss'));
    expect(text()).toContain('onboard.reopen');
    expect(text()).not.toContain('onboard.line1');
    expect(localStorage.getItem('dd_onboard_seen')).toBe('1');
  });

  it('starts collapsed when previously dismissed, and re-opens on click', () => {
    localStorage.setItem('dd_onboard_seen', '1');
    render();
    expect(text()).toContain('onboard.reopen');
    expect(text()).not.toContain('onboard.line1');
    click(button('onboard.reopen'));
    expect(text()).toContain('onboard.line1');
  });
});
