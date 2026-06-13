import { expect, test } from '@playwright/test';

/**
 * Bot mode (#6) is a LOCAL single-device game — no room, no server. Smoke the
 * full loop: start a game, the dice render, the human bids, and the bot responds
 * (either counter-bids — so the human's 开 button appears — or calls to reveal).
 */
test.describe('bot (vs computer)', () => {
  test('start a local game, bid, and the bot responds', async ({ page }) => {
    await page.goto('/bot');

    // Pick a non-default dice count (6) on the setup screen, then start. This
    // proves the new dice-count picker wires through to the game.
    await page.getByRole('button', { name: '6', exact: true }).click();
    await page.getByRole('button', { name: '开始对战' }).click();

    // Game started: the player's 3D dice render, and the count follows the picker.
    await expect
      .poll(() => page.locator('.dice2d-cube').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(6);

    // It's the human's turn — open the bidding.
    const bid = page.getByRole('button', { name: /叫/ });
    await expect(bid).toBeVisible({ timeout: 15000 });
    await bid.click();

    // The bot thinks (~1s) then acts: it either counter-bids (the human's 开 button
    // reappears) or calls (reveal). Either proves the bot drove a move.
    await expect
      .poll(
        async () => {
          const reveal = await page
            .getByRole('heading', { name: '揭晓!' })
            .isVisible()
            .catch(() => false);
          const challenge = await page
            .getByRole('button', { name: '开', exact: true })
            .isVisible()
            .catch(() => false);
          return reveal || challenge;
        },
        { timeout: 15000 },
      )
      .toBe(true);
  });
});
