// Refresh/reconnect audit: reloads a player's page mid-bidding and at reveal,
// verifying state restores (phase, own dice, actionability) and play continues.
// Run: node scripts/audit/play-refresh.mjs [base-url]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const OUT = 'test-results/audit-refresh';
mkdirSync(OUT, { recursive: true });

const issues = [];
function wire(page, who) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`[${who}][console.error] ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => issues.push(`[${who}][pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('_next/'))
      issues.push(`[${who}][http ${r.status()}] ${r.request().method()} ${r.url()}`);
  });
}

let step = 0;
async function shot(page, who, label) {
  step += 1;
  const f = `${OUT}/${String(step).padStart(2, '0')}-${who}-${label}.png`;
  await page.screenshot({ path: f, fullPage: true, caret: 'initial' });
  console.log(`shot: ${f}`);
}

const bidBtn = (p) => p.getByRole('button', { name: /^叫 \d/ });

async function main() {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();
  wire(alice, 'alice');
  wire(bob, 'bob');

  await alice.goto(BASE);
  await alice.getByLabel('你的名字').fill('Alice');
  await alice.getByRole('button', { name: '创建房间' }).click();
  await alice.waitForURL(/\/room\/([A-Z2-9]{6})/);
  const code = alice.url().match(/\/room\/([A-Z2-9]{6})/)[1];
  console.log('room code:', code);

  await bob.goto(`${BASE}/?join=${code}`);
  await bob.getByLabel('你的名字').fill('Bob');
  await bob.getByRole('button', { name: '进入' }).click();
  await bob.waitForURL(`**/room/${code}`);
  await alice.getByText('Bob').waitFor({ timeout: 20000 });
  await alice.getByRole('button', { name: '开始游戏' }).click();

  // opener bids
  let opener = null;
  let openerPage = null;
  for (let w = 0; w < 40 && !opener; w++) {
    if (
      await bidBtn(alice)
        .isVisible()
        .catch(() => false)
    ) {
      opener = 'alice';
      openerPage = alice;
    } else if (
      await bidBtn(bob)
        .isVisible()
        .catch(() => false)
    ) {
      opener = 'bob';
      openerPage = bob;
    } else await alice.waitForTimeout(500);
  }
  if (!opener) throw new Error('no opener');
  const responderPage = openerPage === alice ? bob : alice;
  const responderName = opener === 'alice' ? 'bob' : 'alice';
  await bidBtn(openerPage).click();

  // wait until responder sees the bid (challenge button up = their turn)
  await responderPage.getByRole('button', { name: '开', exact: true }).waitFor({ timeout: 20000 });

  // 1) REFRESH the responder mid-bidding, on their turn
  console.log(`refreshing ${responderName} mid-bidding...`);
  await responderPage.reload();
  // after reload: still in the room, game phase, own dice visible, can still act
  const backOk = await responderPage
    .getByRole('button', { name: '开', exact: true })
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!backOk) issues.push('[flow] after mid-bidding refresh, responder lost the challenge action');
  const diceVisible = await responderPage
    .locator('.dice2d-die')
    .first()
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!diceVisible) issues.push('[flow] after mid-bidding refresh, own dice not visible');
  await shot(responderPage, responderName, 'after-refresh-bidding');

  // responder challenges → reveal
  await responderPage.getByRole('button', { name: '开', exact: true }).click();
  await responderPage.getByRole('button', { name: '确认开!' }).click();
  await alice.getByRole('heading', { name: '揭晓!' }).waitFor({ timeout: 20000 });

  // 2) REFRESH the opener at reveal
  console.log('refreshing opener at reveal...');
  await openerPage.reload();
  const revealBack = await openerPage
    .getByRole('heading', { name: '揭晓!' })
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!revealBack) issues.push('[flow] after refresh at reveal, reveal screen not restored');
  await shot(openerPage, opener, 'after-refresh-reveal');

  // 3) round can still advance after the refreshes
  await alice.waitForTimeout(1600);
  let advanced = false;
  for (let attempt = 0; attempt < 12 && !advanced; attempt++) {
    for (const p of [alice, bob]) {
      const next = p.getByRole('button', { name: '下一局' });
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        advanced = true;
        break;
      }
      const fin = p.getByRole('button', { name: '查看最终结果' });
      if (await fin.isVisible().catch(() => false)) {
        await fin.click();
        advanced = true;
        break;
      }
    }
    if (!advanced) await alice.waitForTimeout(500);
  }
  if (!advanced) issues.push('[flow] could not advance after refreshes');
  else {
    const playable = await Promise.race([
      bidBtn(alice)
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false),
      bidBtn(bob)
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false),
    ]);
    if (!playable) issues.push('[flow] next round not biddable after refresh cycle');
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
