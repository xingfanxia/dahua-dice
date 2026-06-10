import { expect, type Page } from '@playwright/test';

// Default locale is zh-CN, so helpers target the Chinese UI strings.
export const STR = {
  nickLabel: '你的名字',
  create: '创建房间',
  enter: '进入',
  start: '开始游戏',
  reveal: '揭晓!',
};

export const CODE_RE = /\/room\/([A-Z2-9]{6})/;

/**
 * Fill the nickname input robustly against a hydration race. The home page is a
 * controlled React input; under a cold Turbopack compile + parallel load, a fill
 * can land in the DOM before React hydrates and wires its onChange — then
 * hydration resets the value to '' and submit fails with "请输入昵称". Waiting for
 * network-idle (all chunks loaded → hydration runs) and re-filling until the
 * value sticks closes that window.
 */
async function fillNickname(page: Page, nick: string) {
  await page.waitForLoadState('networkidle');
  const input = page.getByLabel(STR.nickLabel);
  await expect(input).toBeVisible({ timeout: 15000 });
  await expect(async () => {
    await input.fill(nick);
    await expect(input).toHaveValue(nick);
  }).toPass({ timeout: 15000 });
}

export async function createRoom(page: Page, nick: string): Promise<string> {
  await page.goto('/');
  await fillNickname(page, nick);
  await page.getByRole('button', { name: STR.create }).click();
  await page.waitForURL(CODE_RE, { timeout: 30000 });
  const m = page.url().match(CODE_RE);
  if (!m) throw new Error(`no room code in url: ${page.url()}`);
  return m[1];
}

export async function joinViaInvite(page: Page, code: string, nick: string) {
  // Exercises the /?join=CODE auto-fill path as well as join.
  await page.goto(`/?join=${code}`);
  await fillNickname(page, nick);
  await page.getByRole('button', { name: STR.enter }).click();
  await page.waitForURL(`**/room/${code}`, { timeout: 30000 });
}

/** Start the game from the owner's page once 2+ players are present. */
export async function startGame(ownerPage: Page) {
  const startBtn = ownerPage.getByRole('button', { name: STR.start });
  await expect(startBtn).toBeEnabled({ timeout: 15000 });
  await startBtn.click();
}
