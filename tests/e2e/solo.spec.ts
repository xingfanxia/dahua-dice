import { expect, test } from '@playwright/test';

/**
 * Offline / solo dice-cup mode (/solo): no room, no network — the page rolls
 * dice locally and shows the player's own hand. Covers the entry from home, a
 * roll producing visible dice, the cover/peek toggle, and the dice-count control.
 *
 * All interactions wait for network-idle (chunks loaded → React hydrated) and
 * retry the gesture, so a pre-hydration click on a controlled handler can't flake.
 */
test.describe('solo / offline dice cup', () => {
  test('reach /solo from home, roll, peek and cover', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Home → /solo. Retry the click until navigation lands (the handler may not be
    // wired the very first frame after a cold compile).
    await expect(async () => {
      await page.getByRole('button', { name: /线下|Solo/ }).click();
      await expect(page).toHaveURL(/\/solo$/, { timeout: 2000 });
    }).toPass({ timeout: 15000 });

    await page.waitForLoadState('networkidle');

    // Before rolling: a prompt, no settled dice.
    await expect(page.getByText(/点「摇骰子」开始|Tap Roll to start/)).toBeVisible();

    // Roll → the screen-reader hand line appears with the dealt dice.
    const rollBtn = page.getByRole('button', { name: /^摇骰子$|^Roll$/ });
    await expect(rollBtn).toBeVisible();
    const handLine = page.getByText(/你的骰子:|Your dice:/);
    await expect(async () => {
      await rollBtn.click();
      await expect(handLine).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15000 });

    const text = await handLine.textContent();
    const faces = (text?.match(/\d+/g) ?? []).map(Number);
    expect(faces.length).toBe(5); // default dice count
    for (const f of faces) expect(f).toBeGreaterThanOrEqual(1);

    // Cover hides the hand; peek reveals it again.
    await page.getByRole('button', { name: /^盖住$|^Cover$/ }).click();
    await expect(page.getByText(/已盖住|Covered/)).toBeVisible();
    await expect(page.getByText(/你的骰子:|Your dice:/)).toHaveCount(0);

    await page.getByRole('button', { name: /^查看$|^Peek$/ }).click();
    await expect(page.getByText(/你的骰子:|Your dice:/)).toBeVisible();
  });

  test('dice count control changes the rolled hand size', async ({ page }) => {
    await page.goto('/solo');
    await page.waitForLoadState('networkidle');

    // Default is 5; decrement to 3. Click at most once per iteration and only
    // while still above 3, so a pre-hydration no-op is absorbed without ever
    // overshooting below the target.
    const dec = page.getByRole('button', { name: '−' });
    const countDisplay = page.locator('span.num').first();
    await expect(async () => {
      if ((await countDisplay.textContent())?.trim() !== '3') await dec.click();
      await expect(countDisplay).toHaveText('3', { timeout: 500 });
    }).toPass({ timeout: 15000 });

    await page.getByRole('button', { name: /^摇骰子$|^Roll$/ }).click();
    const handLine = page.getByText(/你的骰子:|Your dice:/);
    await expect(handLine).toBeVisible({ timeout: 10_000 });
    const faces = ((await handLine.textContent())?.match(/\d+/g) ?? []).map(Number);
    expect(faces.length).toBe(3);
  });
});
