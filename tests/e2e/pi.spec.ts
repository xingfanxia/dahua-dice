import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Live 劈 (Pi / split) coverage. 劈 lets you skip your immediate predecessor and
 * challenge a NON-adjacent earlier bidder from the round chain — so it needs 3+
 * players and a chain of ≥2 bids before your turn. `extensions.spec.ts` only
 * covers 通杀; the 劈 / 反劈 toggles (which the 2026-05-28 audit found were once
 * dead no-ops) had no live coverage of the engine → Lua → target-picker → reveal
 * path. resolvePi is unit-tested, but nothing exercised it through the real UI.
 *
 * Flow: P1 bids, P2 bids (standing owner), then P3 — whose only legal 劈 target is
 * P1 (skipping predecessor P2) — splits P1 and the round resolves to reveal.
 */
test.describe('劈 (Pi, live)', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let ctxC: BrowserContext;
  let alice: Page;
  let bob: Page;
  let carol: Page;

  test.beforeEach(async ({ browser }) => {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    ctxC = await browser.newContext();
    alice = await ctxA.newPage();
    bob = await ctxB.newPage();
    carol = await ctxC.newPage();
  });

  test.afterEach(async () => {
    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });

  test('a third player splits a non-adjacent bidder to reveal', async () => {
    test.setTimeout(120_000);
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');
    await joinViaInvite(carol, code, 'Carol');

    // Owner enables 劈 in the customization drawer and saves (waiting for the
    // updateRules commit so the game doesn't start with the old rules).
    await alice.getByRole('button', { name: '设置' }).click();
    const piToggle = alice.getByRole('switch', { name: '劈 (Pi)' });
    await expect(piToggle).toBeVisible({ timeout: 10_000 });
    await piToggle.click();
    await Promise.all([
      alice.waitForResponse(
        (r) => r.url().includes('/api/action') && r.request().method() === 'POST',
      ),
      alice.getByRole('button', { name: '保存' }).click(),
    ]);

    await startGame(alice);

    const bidBtn = (p: Page) => p.getByRole('button', { name: /^叫 \d/ });

    // Build a 2-bid chain: P1 opens, P2 raises. Each clicks the default (valid) bid.
    // Whoever holds the turn acts, so this is robust to seat order.
    const order = [alice, bob, carol];
    for (let i = 0; i < 2; i++) {
      let bidder: Page | null = null;
      await expect
        .poll(
          async () => {
            for (const p of order) {
              // isEnabled (not isVisible): the just-acted player's submit button is
              // briefly visible-but-disabled during the busy/turn-handoff window —
              // only the genuine current bidder has an ENABLED (valid-default) button.
              if (
                await bidBtn(p)
                  .isEnabled()
                  .catch(() => false)
              ) {
                bidder = p;
                return true;
              }
            }
            return false;
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      if (!bidder) throw new Error('no bidder');
      await bidBtn(bidder).click();
    }

    // The third player now has the turn and a 劈 button (a non-adjacent chain bidder
    // exists). Its presence proves the rule propagated engine → Lua → UI.
    let splitter: Page | null = null;
    await expect
      .poll(
        async () => {
          for (const p of order) {
            if (
              await p
                .getByRole('button', { name: '劈' })
                .isVisible()
                .catch(() => false)
            ) {
              splitter = p;
              return true;
            }
          }
          return false;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    if (!splitter) throw new Error('no splitter saw the 劈 button');

    // Open the target picker and split the non-adjacent bidder (the only legal
    // target — the predecessor and self are filtered out).
    const splitterPage = splitter as Page;
    await splitterPage.getByRole('button', { name: '劈' }).click();
    // The picker container holds the prompt + one button per legal target; click
    // the first (scoped to the picker so PlayerRing names can't be hit by mistake).
    const picker = splitterPage.locator('div').filter({ hasText: '劈谁？（跳过上家）' }).last();
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await picker.getByRole('button').first().click();

    // 劈 resolves straight to the reveal on every screen; the reveal hero/ruling name
    // the 劈 action (game.reveal.split / .rulingPi*), so "劈" appears in the result.
    for (const p of order) {
      await expect(p.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 15_000 });
    }
    await expect(splitterPage.getByText(/劈/).first()).toBeVisible({ timeout: 10_000 });
  });
});
