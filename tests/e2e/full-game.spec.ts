import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, startGame } from './helpers';

/**
 * Regression for the game-end softlock: the reveal screen used to render NO
 * action button when lastChallengeResult.gameEnded was true, so a finished game
 * could never reach the game_end phase (where rematch/disband live) — every
 * completed game froze on 揭晓 forever.
 *
 * Plays a complete game to elimination (opener bids → responder challenges each
 * round = fastest attrition), then walks 查看最终结果 → 游戏结束 → 再来一局 → lobby.
 */
test.describe('full game to completion', () => {
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

  // A full game is up to ~9 challenge rounds; allow headroom on cold dev servers.
  test('game reaches game_end, rematch returns to lobby', async () => {
    test.setTimeout(300_000);
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');
    await startGame(alice);

    const pages = [alice, bob];
    const bidBtn = (p: Page) => p.getByRole('button', { name: /^叫 \d/ });

    let gameEnded = false;
    for (let round = 0; round < 12 && !gameEnded; round++) {
      // whoever holds the turn opens the round with the default (valid) bid
      let opener: Page | null = null;
      await expect
        .poll(
          async () => {
            for (const p of pages) {
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
      if (!opener) throw new Error('no opener');
      const responder = opener === alice ? bob : alice;
      await bidBtn(opener).click();

      // responder challenges immediately → reveal
      const challenge = responder.getByRole('button', { name: '开', exact: true });
      await expect(challenge).toBeVisible({ timeout: 20_000 });
      await challenge.click();
      await responder.getByRole('button', { name: '确认开!' }).click();
      await expect(opener.getByRole('heading', { name: '揭晓!' })).toBeVisible({
        timeout: 20_000,
      });

      // advance: 下一局 (continue) or 查看最终结果 (THE regression — must exist)
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

    expect(gameEnded).toBe(true);

    // game_end screen propagates to BOTH players (SSE/poll), with champion shown.
    // .first(): the sr-only phase announcer also says 游戏结束.
    for (const p of pages) {
      await expect(p.getByText('游戏结束').first()).toBeVisible({ timeout: 20_000 });
      await expect(p.getByText(/🏆/).first()).toBeVisible({ timeout: 20_000 });
    }

    // rematch (owner-only button) → back to lobby with start button for the owner
    const rematch = alice.getByRole('button', { name: '再来一局' });
    await expect(rematch).toBeVisible({ timeout: 20_000 });
    await rematch.click();
    await expect(alice.getByRole('button', { name: '开始游戏' })).toBeVisible({
      timeout: 20_000,
    });
    // non-owner lands in the lobby too
    await expect(bob.getByText('Alice')).toBeVisible({ timeout: 20_000 });
  });
});
