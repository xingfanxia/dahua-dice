import { expect, test } from '@playwright/test';

/**
 * Offline / solo dice-cup mode (/solo): no room, no network — the page rolls a
 * NEW hand locally on the button, and the hand sits covered until you tap / shake
 * to reveal it (the unified MyHand gesture). Covers the entry from home, a roll
 * producing a covered hand, tap-to-reveal / tap-to-cover, and the dice-count grid.
 *
 * All interactions wait for network-idle (chunks loaded → React hydrated) and
 * retry the gesture, so a pre-hydration click on a controlled handler can't flake.
 */
test.describe('solo / offline dice cup', () => {
  test('reach /solo from home, roll, reveal and cover', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Home → /solo. Retry the click until navigation lands (the handler may not be
    // wired the very first frame after a cold compile).
    await expect(async () => {
      await page.getByRole('button', { name: /线下|Solo/ }).click();
      await expect(page).toHaveURL(/\/solo$/, { timeout: 2000 });
    }).toPass({ timeout: 15000 });

    await page.waitForLoadState('networkidle');

    // Before rolling: a prompt, no dice.
    await expect(page.getByText(/点「摇骰子」开始|Tap Roll to start/)).toBeVisible();

    // Roll → the hand appears COVERED (the tap/shake reveal prompt) with 5 cubes.
    const rollBtn = page.getByRole('button', { name: /^摇骰子$|^Roll$/ });
    await expect(rollBtn).toBeVisible();
    // The hand card is the only button wrapping the dice tray (language-agnostic).
    const handCard = page.locator('button:has(.dice2d-tray)');
    await expect(async () => {
      await rollBtn.click();
      await expect(handCard).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15000 });
    await expect.poll(() => page.locator('.dice2d-cube').count()).toBe(5); // default count
    await expect(handCard).toHaveAttribute('aria-label', /暗置|face down/i); // covered, values hidden

    // Tap the covered hand → reveal (aria-label flips to the dealt faces).
    await handCard.click();
    await expect(handCard).toHaveAttribute('aria-label', /你的骰子|Your dice/i);
    await expect(page.getByText(/点一下盖住|tap to cover/i)).toBeVisible();

    // Tap again → cover (back to face-down).
    await handCard.click();
    await expect(handCard).toHaveAttribute('aria-label', /暗置|face down/i);
  });

  test('dice count control changes the rolled hand size', async ({ page }) => {
    await page.goto('/solo');
    await page.waitForLoadState('networkidle');

    // Default is 5; pick 3 on the count grid (wxapp-style 1-10 grid). Retry the
    // click until aria-pressed reflects it, absorbing a pre-hydration no-op.
    const three = page.getByRole('button', { name: '3', exact: true });
    await expect(async () => {
      await three.click();
      await expect(three).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
    }).toPass({ timeout: 15000 });

    await page.getByRole('button', { name: /^摇骰子$|^Roll$/ }).click();
    // 3 cubes render for the hand (covered or revealed — the count is what matters).
    await expect.poll(() => page.locator('.dice2d-cube').count(), { timeout: 10_000 }).toBe(3);
  });
});
