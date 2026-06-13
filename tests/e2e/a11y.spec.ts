import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa'];

async function scan(page: Parameters<typeof createRoom>[0]) {
  // Wait for the <title> to settle — on client-side nav (home → room) it is
  // briefly empty before the route metadata applies, which would flake the
  // document-title rule. Then scan.
  await expect(page).toHaveTitle(/.+/);
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

test.describe('accessibility (axe)', () => {
  test('home page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('home with filled join code has no WCAG A/AA violations', async ({ page }) => {
    // The invite-code row is always visible (wxapp-aligned layout); scan with a
    // filled code so the enabled 进入 button state is covered too.
    await page.goto('/');
    await page.getByPlaceholder(/邀请码|invite code/).fill('ABCDEF');
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });

  test('solo dice-cup has no WCAG A/AA violations (idle + covered + revealed)', async ({
    page,
  }) => {
    await page.goto('/solo');
    await page.waitForLoadState('networkidle');
    expect((await scan(page)).violations).toEqual([]);
    // Roll → the hand renders COVERED (MyHand). Scan that state (dice tray + reveal
    // prompt only exist once a hand is dealt).
    await page.getByRole('button', { name: /^摇骰子$|^Roll$/ }).click();
    const handCard = page.locator('button:has(.dice2d-tray)');
    await expect(handCard).toBeVisible({ timeout: 10_000 });
    expect((await scan(page)).violations).toEqual([]);
    // Tap to reveal, then scan the revealed state (summary chips + cover prompt).
    await handCard.click();
    await expect(handCard).toHaveAttribute('aria-label', /你的骰子|Your dice/i);
    expect((await scan(page)).violations).toEqual([]);
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
