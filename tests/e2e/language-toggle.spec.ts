import { expect, test } from '@playwright/test';

/**
 * Language toggle. The app defaults to zh-CN (Chinese-first); English is opt-in via
 * the toggle, which persists the choice in the `locale` cookie (set by a server
 * action) and re-renders. Verifies the default is Chinese, switching to English
 * actually changes the UI strings, and it persists across a reload + switches back.
 */
test.describe('language toggle', () => {
  test('defaults to zh-CN; toggle switches to English and back', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Default: Chinese.
    await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create room' })).toHaveCount(0);

    // Switch to English via the toggle.
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '创建房间' })).toHaveCount(0);

    // Persists across a reload (cookie-backed).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();

    // Switch back to Chinese.
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible({ timeout: 10_000 });
  });
});
