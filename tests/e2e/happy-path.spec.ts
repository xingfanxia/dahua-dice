import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createRoom, joinViaInvite, STR, startGame } from './helpers';

test.describe('happy path', () => {
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

  test('two players create, join, play a round to reveal', async () => {
    const code = await createRoom(alice, 'Alice');
    await joinViaInvite(bob, code, 'Bob');

    // Both see each other in the lobby roster.
    await expect(alice.getByText('Alice')).toBeVisible();
    await expect(alice.getByText('Bob')).toBeVisible();
    await expect(bob.getByText('Alice')).toBeVisible();
    await expect(bob.getByText('Bob')).toBeVisible();

    await startGame(alice);

    // Alice has the first turn → her BidPanel submit button ("叫 N 个 ⚃") shows.
    const aliceBid = alice.getByRole('button', { name: /叫/ });
    await expect(aliceBid).toBeVisible({ timeout: 15000 });
    await aliceBid.click();

    // Bob now has the turn and can challenge ("开").
    const bobChallenge = bob.getByRole('button', { name: '开', exact: true });
    await expect(bobChallenge).toBeVisible({ timeout: 15000 });
    await bobChallenge.click();

    // Reveal stage appears for both players.
    await expect(alice.getByText(STR.reveal)).toBeVisible({ timeout: 15000 });
    await expect(bob.getByText(STR.reveal)).toBeVisible({ timeout: 15000 });
  });
});
