import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, STR, startGame } from './helpers';

test.describe('reconnect', () => {
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

  test('a player who reloads mid-game re-syncs to the live state', async () => {
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');
    await startGame(alice);

    // Confirm the game is underway for Bob before reloading: it is Alice's turn,
    // so Bob sees the "Alice 思考中" turn indicator (game view, not lobby).
    await expect(bob.locator('p:not([aria-live])', { hasText: '思考中' })).toBeVisible({ timeout: 15000 });

    // Hard reload Bob — the room page is server-rendered from Redis, so the
    // current phase/roster must come back without dropping to the lobby.
    await bob.reload();

    // Still the same room, still in-game, NOT back at the lobby. The turn
    // indicator ("Alice 思考中") proves the live phase + roster came back.
    await expect(bob).toHaveURL(new RegExp(`/room/${code}`));
    await expect(bob.locator('p:not([aria-live])', { hasText: '思考中' })).toBeVisible({ timeout: 15000 });
    await expect(bob.getByRole('button', { name: STR.start })).toHaveCount(0);

    // And live sync still works post-reload: Alice bids, Bob sees it's his turn
    // (challenge button appears) driven by SSE on the fresh connection.
    const aliceBid = alice.getByRole('button', { name: /叫/ });
    await expect(aliceBid).toBeVisible({ timeout: 15000 });
    await aliceBid.click();
    await expect(bob.getByRole('button', { name: '开', exact: true })).toBeVisible({
      timeout: 15000,
    });
  });
});
