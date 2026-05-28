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

export async function createRoom(page: Page, nick: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel(STR.nickLabel).fill(nick);
  await page.getByRole('button', { name: STR.create }).click();
  await page.waitForURL(CODE_RE);
  const m = page.url().match(CODE_RE);
  if (!m) throw new Error(`no room code in url: ${page.url()}`);
  return m[1];
}

export async function joinViaInvite(page: Page, code: string, nick: string) {
  // Exercises the /?join=CODE auto-fill path as well as join.
  await page.goto(`/?join=${code}`);
  await page.getByLabel(STR.nickLabel).fill(nick);
  await page.getByRole('button', { name: STR.enter }).click();
  await page.waitForURL(`**/room/${code}`);
}

/** Start the game from the owner's page once 2+ players are present. */
export async function startGame(ownerPage: Page) {
  const startBtn = ownerPage.getByRole('button', { name: STR.start });
  await expect(startBtn).toBeEnabled({ timeout: 15000 });
  await startBtn.click();
}
