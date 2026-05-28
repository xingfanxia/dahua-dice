import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Exercises the full 中式扩展 stack end-to-end: owner toggles 通杀 in the
 * customization drawer → game starts → a bid → 通杀 resolves to reveal. This is
 * the integration coverage for the Node-compute (round.ts) → commit-Lua path that
 * the unit tests can't reach.
 */
test.describe('中式扩展 (extensions)', () => {
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

  test('owner enables 通杀, the next player sweeps to reveal', async () => {
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');

    // Owner opens the customization drawer and enables 通杀.
    await alice.getByRole('button', { name: '设置' }).click();
    const tongshaToggle = alice.getByRole('switch', { name: '通杀 (Tongsha)' });
    await expect(tongshaToggle).toBeVisible({ timeout: 10000 });
    await tongshaToggle.click();
    // Wait for the updateRules POST to commit before starting (avoids a race
    // where the game would start with the old rules).
    await Promise.all([
      alice.waitForResponse(
        (r) => r.url().includes('/api/action') && r.request().method() === 'POST',
      ),
      alice.getByRole('button', { name: '保存' }).click(),
    ]);

    await startGame(alice);

    // Alice opens the bidding.
    const aliceBid = alice.getByRole('button', { name: /叫/ });
    await expect(aliceBid).toBeVisible({ timeout: 15000 });
    await aliceBid.click();

    // Bob now has a chain bid to sweep — the 通杀 button is available (proves the
    // rule propagated) and resolves straight to the reveal.
    const bobTongsha = bob.getByRole('button', { name: '通杀' });
    await expect(bobTongsha).toBeVisible({ timeout: 15000 });
    await bobTongsha.click();

    await expect(alice.getByText('揭晓!')).toBeVisible({ timeout: 15000 });
    await expect(bob.getByText('揭晓!')).toBeVisible({ timeout: 15000 });
  });
});
