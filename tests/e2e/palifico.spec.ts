import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Live Palifico round coverage. The round.ts engine has thorough UNIT tests for
 * Palifico (1s-not-wild, count-lock, opener selection), but nothing exercised the
 * LIVE path — engine → version-CAS Lua commit → SSE → the BidPanel banner — in a
 * real game. Palifico is off by default and only triggers when a player first
 * drops to exactly one die, so the standard flows never reach it.
 *
 * This enables Palifico (with diceCount=3 so a player reaches 1 die fast), plays
 * challenge-every-round to attrition, and asserts the Palifico banner actually
 * appears for the opener — proving the special-round state propagates end-to-end.
 */
test.describe('Palifico (live)', () => {
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

  test('a player dropping to 1 die opens a Palifico round', async () => {
    test.setTimeout(180_000);
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');

    // Owner opens settings → diceCount 3 (faster attrition) → enable Palifico → save.
    await alice.getByRole('button', { name: '设置' }).click();
    await alice.getByRole('button', { name: '3', exact: true }).click();
    await alice.getByRole('switch', { name: /Palifico/ }).click();
    await alice.getByRole('button', { name: '保存' }).click();

    await startGame(alice);

    const pages = [alice, bob];
    const bidBtn = (p: Page) => p.getByRole('button', { name: /^叫 \d/ });
    const palificoBanner = (p: Page) => p.getByText(/Palifico 回合/);

    let sawPalifico = false;
    let gameEnded = false;
    for (let round = 0; round < 12 && !sawPalifico && !gameEnded; round++) {
      // Whoever holds the turn opens. Check both screens for the Palifico banner
      // first — it renders inside the opener's BidPanel once the round is live.
      // `null as Page | null` so TS keeps the union past the poll() closure (a plain
      // null init would narrow `opener` to `never` after the throw-guard).
      let opener = null as Page | null;
      await expect
        .poll(
          async () => {
            for (const p of pages) {
              if (
                await palificoBanner(p)
                  .isVisible()
                  .catch(() => false)
              ) {
                sawPalifico = true;
                return true;
              }
              if (
                await bidBtn(p)
                  .isVisible()
                  .catch(() => false)
              ) {
                opener = p;
                return true;
              }
            }
            return false;
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      if (sawPalifico) break;
      if (!opener) throw new Error('no opener');
      const responder = opener === alice ? bob : alice;

      await bidBtn(opener).click();
      const challenge = responder.getByRole('button', { name: '开', exact: true });
      await expect(challenge).toBeVisible({ timeout: 20_000 });
      await challenge.click();
      await responder.getByRole('button', { name: '确认开!' }).click();
      await expect(opener.getByRole('heading', { name: '揭晓!' })).toBeVisible({ timeout: 20_000 });

      // Advance: 下一局 (continue) or 查看最终结果 (game ended before Palifico).
      await expect
        .poll(
          async () => {
            for (const p of pages) {
              const next = p.getByRole('button', { name: '下一局' });
              if (await next.isVisible().catch(() => false)) {
                await next.click();
                return 'advanced';
              }
              const final = p.getByRole('button', { name: '查看最终结果' });
              if (await final.isVisible().catch(() => false)) {
                await final.click();
                gameEnded = true;
                return 'ended';
              }
            }
            return 'waiting';
          },
          { timeout: 30_000 },
        )
        .not.toBe('waiting');
    }

    // With diceCount=3 in a 2p game, a player passes through exactly 1 die before
    // elimination, so an enabled Palifico variant MUST trigger before game_end.
    // (The loop only sets sawPalifico when the banner — "Palifico 回合 · 1 点不算 ·
    // 数量锁定 · 只能加点数" — is actually visible, so this proves the special-round
    // state reached the UI end-to-end.)
    expect(sawPalifico).toBe(true);
  });
});
