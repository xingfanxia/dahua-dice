import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Live 8-sided dice coverage. The engine, Zod schema and BidPanel always supported
 * diceSides 6|8, but the multiplayer customization drawer never exposed the control
 * (only solo mode did) — so 8-sided multiplayer was unreachable via the UI and
 * never tested. This enables it in the drawer and verifies the BidPanel renders the
 * extra faces (7/8) and that an 8-faced bid resolves end-to-end to the reveal.
 */
test.describe('8-sided dice (live)', () => {
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

  test('owner sets 8-sided dice; an 8-faced bid resolves to reveal', async () => {
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');

    // Owner opens the drawer and switches to 8-sided dice.
    await alice.getByRole('button', { name: '设置' }).click();
    const eightSides = alice.getByRole('button', { name: '8', exact: true });
    await expect(eightSides).toBeVisible({ timeout: 10_000 });
    await eightSides.click();
    await expect(eightSides).toHaveAttribute('aria-pressed', 'true');
    await Promise.all([
      alice.waitForResponse(
        (r) => r.url().includes('/api/action') && r.request().method() === 'POST',
      ),
      alice.getByRole('button', { name: '保存' }).click(),
    ]);

    await startGame(alice);

    // Alice opens — her BidPanel now renders 8 face buttons; faces 7 and 8 only
    // exist when diceSides propagated engine → Lua → state → UI.
    await expect(alice.getByRole('button', { name: /^叫 \d/ })).toBeVisible({ timeout: 15_000 });
    await expect(alice.getByRole('button', { name: '7', exact: true })).toBeVisible();
    const faceEight = alice.getByRole('button', { name: '8', exact: true });
    await expect(faceEight).toBeVisible();

    // Bid on face 8 (only possible with the 8-sided variant), then Bob challenges.
    await faceEight.click();
    await expect(faceEight).toHaveAttribute('aria-pressed', 'true');
    await alice.getByRole('button', { name: /^叫 \d/ }).click();

    const challenge = bob.getByRole('button', { name: '开', exact: true });
    await expect(challenge).toBeVisible({ timeout: 15_000 });
    await challenge.click();
    await bob.getByRole('button', { name: '确认开!' }).click();

    // Resolves to reveal on both screens — an 8-faced round played end-to-end.
    await expect(alice.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 15_000 });
    await expect(bob.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 15_000 });
  });
});
