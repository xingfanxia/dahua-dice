import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite } from './helpers';

/**
 * Regression: the drawer's open-resync effect must NOT clobber the owner's
 * in-progress unsaved edits when a peer action bumps the room version. refetch()
 * swaps in a fresh state object on any version bump (a player joining / changing
 * avatar), giving a new `rules` prop reference; an effect keyed on `[open, rules]`
 * without an open-transition guard would re-run and reset the owner's toggles.
 */
test.describe('customization drawer resync', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let alice: Page;
  let bob: Page;

  test.beforeEach(async ({ browser }) => {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    alice = await ctxA.newPage();
    bob = await ctxB.newPage();
  });

  test.afterEach(async () => {
    await ctxA.close();
    await ctxB.close();
  });

  test('an unsaved rule edit survives a peer joining the lobby', async () => {
    const code = await createRoom(alice, 'Alice');

    // Owner opens settings and toggles 通杀 ON — WITHOUT saving.
    await alice.getByRole('button', { name: '设置' }).click();
    const tongsha = alice.getByRole('switch', { name: '通杀 (Tongsha)' });
    await expect(tongsha).toBeVisible({ timeout: 10_000 });
    await tongsha.click();
    await expect(tongsha).toHaveAttribute('aria-checked', 'true');

    // A second player joins → joinRoom bumps state.version + publishes an event,
    // so the owner's refetch() swaps in a fresh state (new rules reference).
    await joinViaInvite(bob, code, 'Bob');
    await expect(alice.getByText('Bob')).toBeVisible({ timeout: 15_000 });

    // The unsaved toggle must still be ON (the resync only fires on the open
    // transition, not on the version bump). With the bug it would have reset to OFF.
    await expect(tongsha).toHaveAttribute('aria-checked', 'true');

    // And the edit still saves correctly afterwards (the POST is accepted).
    const save = await Promise.all([
      alice.waitForResponse(
        (r) => r.url().includes('/api/action') && r.request().method() === 'POST',
      ),
      alice.getByRole('button', { name: '保存' }).click(),
    ]);
    expect((await save[0].json()).ok).toBe(true);
    // (Save-persists-and-applies is covered separately by extensions.spec — the
    // owner's own state.rules refreshes asynchronously via SSE/poll after save.)
  });
});
