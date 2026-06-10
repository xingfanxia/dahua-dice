// Full-game playability audit: plays a complete 2-player game to elimination,
// then rematch, against BASE (default prod :3001). Measures cross-client sync
// latency for every action and dumps console errors / failed requests.
// Run: node scripts/audit/play-full-game.mjs [base-url]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const OUT = 'test-results/audit-full-game';
mkdirSync(OUT, { recursive: true });

const issues = [];
const syncTimes = [];
function wireDiagnostics(page, who) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`[${who}][console.error] ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (err) => issues.push(`[${who}][pageerror] ${err.message}`));
  page.on('requestfailed', (req) => {
    // SSE close on nav is expected noise
    if (req.url().includes('/api/stream/')) return;
    // /api/hand is intentionally aborted on a round change (the client's stale-hand
    // guard calls AbortController.abort() so a slow prior-round hand can't overwrite
    // the new round). Fast automated play trips this every round — it's not a bug.
    if (req.url().includes('/api/hand/') && req.failure()?.errorText === 'net::ERR_ABORTED') return;
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
  await page.screenshot({ path: file, fullPage: true, caret: 'initial' });
  console.log(`shot: ${file}`);
}

const bidBtn = (p) => p.getByRole('button', { name: /^叫 \d/ });

async function main() {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();
  wireDiagnostics(alice, 'alice');
  wireDiagnostics(bob, 'bob');
  const pages = { alice, bob };

  // --- setup ---
  await alice.goto(BASE);
  await alice.getByLabel('你的名字').fill('Alice');
  await alice.getByRole('button', { name: '创建房间' }).click();
  await alice.waitForURL(/\/room\/([A-Z2-9]{6})/);
  const code = alice.url().match(/\/room\/([A-Z2-9]{6})/)[1];
  console.log('room code:', code);

  const tJoin = Date.now();
  await bob.goto(`${BASE}/?join=${code}`);
  await bob.getByLabel('你的名字').fill('Bob');
  await bob.getByRole('button', { name: '进入' }).click();
  await bob.waitForURL(`**/room/${code}`);
  // sync check: how long until Alice sees Bob in the lobby?
  await alice.getByText('Bob').waitFor({ timeout: 20000 });
  syncTimes.push({ what: 'alice sees bob join', ms: Date.now() - tJoin });

  await alice.getByRole('button', { name: '开始游戏' }).click();

  // --- play until game_end ---
  let round = 0;
  let gameEnded = false;
  for (; round < 40 && !gameEnded; round++) {
    // find actor with a bid button
    let actor = null;
    const tTurn = Date.now();
    for (let w = 0; w < 60 && !actor; w++) {
      for (const [who, p] of Object.entries(pages)) {
        if (
          await bidBtn(p)
            .isVisible()
            .catch(() => false)
        ) {
          actor = { who, p };
          break;
        }
      }
      if (!actor) {
        // game over screen?
        for (const p of Object.values(pages)) {
          if (
            await p
              .getByText('游戏结束')
              .first()
              .isVisible()
              .catch(() => false)
          ) {
            gameEnded = true;
            actor = null;
            break;
          }
        }
        if (gameEnded) break;
        await alice.waitForTimeout(500);
      }
    }
    if (gameEnded) break;
    if (!actor) {
      issues.push(`[flow] round ${round}: nobody can act for 30s — STUCK`);
      await shot(alice, 'alice', `stuck-r${round}`);
      await shot(bob, 'bob', `stuck-r${round}`);
      break;
    }
    syncTimes.push({ what: `r${round} turn ready (${actor.who})`, ms: Date.now() - tTurn });

    // opener bids; responder challenges → fastest path to attrition
    const opener = actor;
    const responder = opener.who === 'alice' ? { who: 'bob', p: bob } : { who: 'alice', p: alice };
    await bidBtn(opener.p).click();

    const tSee = Date.now();
    const challengeBtn = responder.p.getByRole('button', { name: '开', exact: true });
    try {
      await challengeBtn.waitFor({ timeout: 20000 });
    } catch {
      issues.push(`[flow] round ${round}: ${responder.who} never saw the bid (no 开 button)`);
      await shot(responder.p, responder.who, `nobid-r${round}`);
      break;
    }
    syncTimes.push({ what: `r${round} ${responder.who} sees bid`, ms: Date.now() - tSee });
    await challengeBtn.click();
    await responder.p.getByRole('button', { name: '确认开!' }).click();

    // reveal on both
    const tReveal = Date.now();
    await alice.getByRole('heading', { name: '揭晓!' }).waitFor({ timeout: 20000 });
    await bob.getByRole('heading', { name: '揭晓!' }).waitFor({ timeout: 20000 });
    syncTimes.push({ what: `r${round} both see reveal`, ms: Date.now() - tReveal });
    if (round === 0) {
      await shot(alice, 'alice', 'reveal-r0');
      await shot(bob, 'bob', 'reveal-r0');
    }

    // advance: 下一局 (round continues) or 查看最终结果 (game over → game_end screen)
    await alice.waitForTimeout(1600); // result text delay
    let advanced = false;
    for (let attempt = 0; attempt < 12 && !advanced && !gameEnded; attempt++) {
      for (const [, p] of Object.entries(pages)) {
        const next = p.getByRole('button', { name: '下一局' });
        if (await next.isVisible().catch(() => false)) {
          await next.click();
          advanced = true;
          break;
        }
        const final = p.getByRole('button', { name: '查看最终结果' });
        if (await final.isVisible().catch(() => false)) {
          await final.click();
          await p.getByText('游戏结束').first().waitFor({ timeout: 15000 });
          gameEnded = true;
          break;
        }
        if (
          await p
            .getByText('游戏结束')
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          gameEnded = true;
          break;
        }
      }
      if (!advanced && !gameEnded) await alice.waitForTimeout(500);
    }
    if (!advanced && !gameEnded) {
      issues.push(`[flow] round ${round}: reveal done but no advance button — STUCK`);
      await shot(alice, 'alice', `noadvance-r${round}`);
      await shot(bob, 'bob', `noadvance-r${round}`);
      break;
    }
  }

  console.log(`rounds played: ${round}, gameEnded: ${gameEnded}`);
  await shot(alice, 'alice', 'end-alice');
  await shot(bob, 'bob', 'end-bob');

  // --- rematch ---
  if (gameEnded) {
    let rematched = false;
    for (const [who, p] of Object.entries(pages)) {
      const re = p.getByRole('button', { name: '再来一局' });
      if (await re.isVisible().catch(() => false)) {
        await re.click();
        rematched = true;
        console.log(`rematch clicked by ${who}`);
        break;
      }
    }
    if (!rematched) issues.push('[flow] game ended but no rematch button visible on either page');
    else {
      // rematch resets to the LOBBY: owner gets 开始游戏 back; then a second game
      // must actually start and reach a biddable state.
      const tRe = Date.now();
      const startBtn = alice.getByRole('button', { name: '开始游戏' });
      const backToLobby = await startBtn
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (!backToLobby) {
        issues.push('[flow] rematch clicked but owner never returned to lobby');
      } else {
        syncTimes.push({ what: 'rematch -> lobby', ms: Date.now() - tRe });
        await startBtn.click();
        let ok = false;
        for (let w = 0; w < 40 && !ok; w++) {
          for (const p of Object.values(pages)) {
            if (
              await bidBtn(p)
                .isVisible()
                .catch(() => false)
            )
              ok = true;
          }
          if (!ok) await alice.waitForTimeout(500);
        }
        if (ok) syncTimes.push({ what: 'rematch second game playable', ms: Date.now() - tRe });
        else issues.push('[flow] second game after rematch never reached a biddable state');
      }
      await shot(alice, 'alice', 'rematch-alice');
      await shot(bob, 'bob', 'rematch-bob');
    }
  }

  await browser.close();
}

main()
  .catch((e) => {
    console.error('EXPLORE FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log('\n=== SYNC LATENCIES ===');
    for (const s of syncTimes) console.log(`${s.ms}ms\t${s.what}`);
    console.log('\n=== DIAGNOSTICS ===');
    for (const i of issues) console.log(i);
    console.log(`=== ${issues.length} issues captured ===`);
  });
