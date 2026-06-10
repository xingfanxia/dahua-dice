// Exploration driver: plays a full 2-player game against the local dev server,
// screenshotting every step and dumping console errors / failed requests.
// Run: node scripts/audit/play-explore.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = 'test-results/audit-explore';
mkdirSync(OUT, { recursive: true });

const issues = [];
function wireDiagnostics(page, who) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      issues.push(`[${who}][console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => issues.push(`[${who}][pageerror] ${err.message}`));
  page.on('requestfailed', (req) => {
    // SSE close on nav + intentional /api/hand abort on round change (stale-hand
    // guard) are expected noise, not bugs.
    if (req.url().includes('/api/stream/')) return;
    if (req.url().includes('/api/hand/') && req.failure()?.errorText === 'net::ERR_ABORTED')
      return;
    issues.push(`[${who}][requestfailed] ${req.method()} ${req.url()} ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('_next/')) {
      issues.push(`[${who}][http ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });
}

let step = 0;
async function shot(page, who, label) {
  step += 1;
  const file = `${OUT}/${String(step).padStart(2, '0')}-${who}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`shot: ${file}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();
  wireDiagnostics(alice, 'alice');
  wireDiagnostics(bob, 'bob');

  // 1. Alice creates a room
  await alice.goto(BASE);
  await shot(alice, 'alice', 'home');
  await alice.getByLabel('你的名字').fill('Alice');
  await alice.getByRole('button', { name: '创建房间' }).click();
  await alice.waitForURL(/\/room\/([A-Z2-9]{6})/);
  const code = alice.url().match(/\/room\/([A-Z2-9]{6})/)[1];
  console.log('room code:', code);
  await shot(alice, 'alice', 'lobby-created');

  // 2. Bob joins via invite link
  await bob.goto(`${BASE}/?join=${code}`);
  await shot(bob, 'bob', 'join-prefilled');
  await bob.getByLabel('你的名字').fill('Bob');
  await bob.getByRole('button', { name: '进入' }).click();
  await bob.waitForURL(`**/room/${code}`);
  await shot(bob, 'bob', 'lobby-joined');
  await alice.waitForTimeout(3500); // let SSE/poll propagate Bob's join to Alice
  await shot(alice, 'alice', 'lobby-sees-bob');

  // 3. Start game
  const startBtn = alice.getByRole('button', { name: '开始游戏' });
  await startBtn.waitFor({ state: 'visible', timeout: 15000 });
  await startBtn.click();
  await alice.waitForTimeout(4000); // roll animation
  await shot(alice, 'alice', 'game-started');
  await shot(bob, 'bob', 'game-started');

  // helper: whoever has the bid button acts; play several raise turns then challenge
  async function currentActor() {
    const a = await alice
      .getByRole('button', { name: /叫/ })
      .isVisible()
      .catch(() => false);
    if (a) return { page: alice, who: 'alice' };
    const b = await bob
      .getByRole('button', { name: /叫/ })
      .isVisible()
      .catch(() => false);
    if (b) return { page: bob, who: 'bob' };
    return null;
  }

  // 4. Bid loop: 3 raises, screenshot each side after each action
  for (let i = 0; i < 3; i++) {
    let actor = null;
    for (let w = 0; w < 30 && !actor; w++) {
      actor = await currentActor();
      if (!actor) await alice.waitForTimeout(500);
    }
    if (!actor) {
      issues.push(`[flow] no player has a bid button at raise #${i} — game stuck?`);
      await shot(alice, 'alice', `stuck-raise${i}`);
      await shot(bob, 'bob', `stuck-raise${i}`);
      break;
    }
    console.log(`raise #${i}: ${actor.who}`);
    await shot(actor.page, actor.who, `before-bid-${i}`);
    await actor.page.getByRole('button', { name: /叫/ }).click();
    await actor.page.waitForTimeout(1500);
    await shot(actor.page, actor.who, `after-bid-${i}`);
  }

  // 5. Challenge from whoever is on turn now
  let challenger = null;
  for (let w = 0; w < 30 && !challenger; w++) {
    challenger = await currentActor();
    if (!challenger) await alice.waitForTimeout(500);
  }
  if (challenger) {
    console.log(`challenger: ${challenger.who}`);
    await challenger.page.getByRole('button', { name: '开', exact: true }).click();
    await shot(challenger.page, challenger.who, 'challenge-confirm');
    await challenger.page.getByRole('button', { name: '确认开!' }).click();
    await alice.waitForTimeout(2500);
    await shot(alice, 'alice', 'reveal');
    await shot(bob, 'bob', 'reveal');

    // 6. Next round
    const nextA = alice.getByRole('button', { name: '下一局' });
    const nextB = bob.getByRole('button', { name: '下一局' });
    if (await nextA.isVisible().catch(() => false)) await nextA.click();
    else if (await nextB.isVisible().catch(() => false)) await nextB.click();
    else issues.push('[flow] no 下一局 button visible on either page after reveal');
    await alice.waitForTimeout(4000);
    await shot(alice, 'alice', 'round2');
    await shot(bob, 'bob', 'round2');
  } else {
    issues.push('[flow] nobody can challenge — stuck before reveal');
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error('EXPLORE FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log('\n=== DIAGNOSTICS ===');
    for (const i of issues) console.log(i);
    console.log(`=== ${issues.length} issues captured ===`);
  });
