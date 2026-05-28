import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa'];

function scan(page: Parameters<typeof createRoom>[0]) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

test.describe('accessibility (axe)', () => {
  test('home page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('home join mode has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '加入房间' }).click();
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('lobby has no WCAG A/AA violations', async ({ page }) => {
    await createRoom(page, 'Alice');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('bidding screen has no WCAG A/AA violations', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const alice = await ctxA.newPage();
    const bob = await ctxB.newPage();
    try {
      const code = await createRoom(alice, 'Alice');
      await joinViaInvite(bob, code, 'Bob');
      await startGame(alice);
      // Wait for Alice's bid panel to render before scanning the game screen.
      await expect(alice.getByRole('button', { name: /叫/ })).toBeVisible({ timeout: 15000 });
      const results = await scan(alice);
      expect(results.violations).toEqual([]);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
