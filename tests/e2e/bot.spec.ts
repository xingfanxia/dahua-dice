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

  test('party settlement: reach a reveal, then 结束本场 returns to setup', async ({ page }) => {
    await page.goto('/bot');
    // Pick the party settlement mode (no elimination → the engine never auto-ends, so
    // the manual 结束本场 exit is the only way out — this is the UX-2 delta).
    await page.getByRole('button', { name: /聚会版/ }).click();
    await page.getByRole('button', { name: '开始对战' }).click();

    // Human opens the bidding.
    const firstBid = page.getByRole('button', { name: /叫/ });
    await expect(firstBid).toBeVisible({ timeout: 15000 });
    await firstBid.click();

    // Drive to a reveal: whenever the 开 button (+ confirm) is offered, take it; the
    // bot may also call on its own, landing directly on the reveal.
    await expect
      .poll(
        async () => {
          if (
            await page
              .getByRole('heading', { name: '揭晓!' })
              .isVisible()
              .catch(() => false)
          )
            return true;
          const open = page.getByRole('button', { name: '开', exact: true });
          if (await open.isVisible().catch(() => false)) {
            await open.click().catch(() => {});
            const confirm = page.getByRole('button', { name: '确认开!' });
            if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
          }
          return false;
        },
        { timeout: 25000 },
      )
      .toBe(true);

    // Party never ends → the exit button is shown and returns to the setup screen.
    const endGame = page.getByRole('button', { name: '结束本场' });
    await expect(endGame).toBeVisible({ timeout: 15000 });
    await endGame.click();
    await expect(page.getByRole('button', { name: '开始对战' })).toBeVisible({ timeout: 15000 });
  });
});
