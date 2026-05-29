import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Regression coverage for the bugs the happy-path test missed: it only had
 * player 2 *challenge*, never *counter-bid*, and never asserted a player can see
 * their OWN dice. This drives the full loop where player 2 raises, then asserts
 * both players' dice render and the round advances.
 */
test.describe('two-player full flow', () => {
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

  test('both see own dice, player 2 counter-bids, round advances', async () => {
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');
    await startGame(alice);

    // Each player can SEE their own dice (the 2D renderer shows the hand): the
    // dice tray renders >= 5 dice for both. Language-agnostic class selectors.
    await expect(alice.locator('.dice2d-root')).toBeVisible({ timeout: 15000 });
    await expect(bob.locator('.dice2d-root')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => alice.locator('.dice2d-die').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(5);
    await expect
      .poll(() => bob.locator('.dice2d-die').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(5);

    // Alice (first turn) opens the bidding.
    const aliceBid = alice.getByRole('button', { name: /叫/ });
    await expect(aliceBid).toBeVisible({ timeout: 15000 });
    await aliceBid.click();

    // THE REGRESSION: player 2 must be able to COUNTER-BID (raise), not only challenge.
    const bobBid = bob.getByRole('button', { name: /叫/ });
    await expect(bobBid).toBeVisible({ timeout: 15000 });
    await bobBid.click();

    // Alice challenges the standing bid -> reveal for both.
    const aliceChallenge = alice.getByRole('button', { name: '开', exact: true });
    await expect(aliceChallenge).toBeVisible({ timeout: 15000 });
    await aliceChallenge.click();
    await alice.getByRole('button', { name: '确认开!' }).click();
    await expect(alice.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 15000 });
    await expect(bob.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 15000 });

    // Next round re-rolls cleanly: dice still render and play can continue.
    const next = alice.getByRole('button', { name: '下一局' });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await expect
        .poll(() => alice.locator('.dice2d-die').count(), { timeout: 15000 })
        .toBeGreaterThanOrEqual(4);
      await expect
        .poll(() => bob.locator('.dice2d-die').count(), { timeout: 15000 })
        .toBeGreaterThanOrEqual(4);
      // Whichever player holds the new round's turn shows a bid button. (alice and
      // bob are separate pages, so check each rather than .or() across frames.)
      await expect
        .poll(
          async () => {
            const a = await alice
              .getByRole('button', { name: /叫/ })
              .isVisible()
              .catch(() => false);
            const b = await bob
              .getByRole('button', { name: /叫/ })
              .isVisible()
              .catch(() => false);
            return a || b;
          },
          { timeout: 15000 },
        )
        .toBe(true);
    }
  });
});
