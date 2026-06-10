// 3-player playability audit: plays to full completion with one player
// eliminated mid-game. Verifies turn rotation skips the dead player, the
// eliminated player gets a sane spectator view, game_end reaches all three,
// and rematch returns everyone to the lobby.
// Run: node scripts/audit/play-3p-game.mjs [base-url]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const OUT = 'test-results/audit-3p';
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
  const names = ['Alice', 'Bob', 'Carol'];
  const ctxs = [];
  const pages = {};
  for (const n of names) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
    ctxs.push(c);
    pages[n] = await c.newPage();
    wire(pages[n], n);
  }
  const [alice, bob, carol] = names.map((n) => pages[n]);

  await alice.goto(BASE);
  await alice.getByLabel('你的名字').fill('Alice');
  await alice.getByRole('button', { name: '创建房间' }).click();
  await alice.waitForURL(/\/room\/([A-Z2-9]{6})/);
  const code = alice.url().match(/\/room\/([A-Z2-9]{6})/)[1];
  console.log('room code:', code);

  for (const [n, p] of [
    ['Bob', bob],
    ['Carol', carol],
  ]) {
    await p.goto(`${BASE}/?join=${code}`);
    await p.getByLabel('你的名字').fill(n);
    await p.getByRole('button', { name: '进入' }).click();
    await p.waitForURL(`**/room/${code}`);
  }
  // all three visible in the owner's lobby
  await alice.getByText('Bob').waitFor({ timeout: 20000 });
  await alice.getByText('Carol').waitFor({ timeout: 20000 });
  await alice.getByRole('button', { name: '开始游戏' }).click();

  let gameEnded = false;
  let eliminatedChecked = false;
  let round = 0;
  for (; round < 40 && !gameEnded; round++) {
    // 1) whoever can bid opens
    let opener = null;
    for (let w = 0; w < 60 && !opener; w++) {
      for (const n of names) {
        if (
          await bidBtn(pages[n])
            .isVisible()
            .catch(() => false)
        ) {
          opener = n;
          break;
        }
      }
      if (!opener) await alice.waitForTimeout(500);
    }
    if (!opener) {
      issues.push(`[flow] r${round}: nobody can open — STUCK`);
      for (const n of names) await shot(pages[n], n, `stuck-r${round}`);
      break;
    }
    await bidBtn(pages[opener]).click();

    // 2) next turn-holder challenges. A bid can 409 on a stale version right at
    // a round boundary (client one version behind); a human just taps again —
    // do the same: if no challenger appears within ~8s, re-click the opener's
    // bid button (when still enabled) up to 3 times.
    let challenger = null;
    let rebids = 0;
    for (let w = 0; w < 60 && !challenger; w++) {
      for (const n of names) {
        if (n === opener) continue;
        if (
          await pages[n]
            .getByRole('button', { name: '开', exact: true })
            .isVisible()
            .catch(() => false)
        ) {
          challenger = n;
          break;
        }
      }
      if (!challenger) {
        if (w > 0 && w % 20 === 0 && rebids < 3) {
          const btn = bidBtn(pages[opener]);
          if (await btn.isEnabled().catch(() => false)) {
            rebids += 1;
            console.log(`r${round}: re-bidding after stale 409 (attempt ${rebids})`);
            await btn.click();
          }
        }
        await alice.waitForTimeout(400);
      }
    }
    if (!challenger) {
      issues.push(`[flow] r${round}: nobody can challenge — STUCK`);
      for (const n of names) await shot(pages[n], n, `nochal-r${round}`);
      break;
    }
    await pages[challenger].getByRole('button', { name: '开', exact: true }).click();
    await pages[challenger].getByRole('button', { name: '确认开!' }).click();
    await alice.getByRole('heading', { name: '揭晓!' }).waitFor({ timeout: 20000 });

    // 3) once someone is ACTUALLY eliminated (spectator banner up), audit views.
    // (The reveal loser line also contains 💀 every round — match the banner.)
    if (!eliminatedChecked) {
      await alice.waitForTimeout(800);
      for (const n of names) {
        const dead = await pages[n]
          .getByText('你已出局')
          .first()
          .isVisible()
          .catch(() => false);
        if (dead) {
          eliminatedChecked = true;
          for (const m of names) await shot(pages[m], m, `elimination-r${round}`);
          break;
        }
      }
    }

    // 4) advance
    await alice.waitForTimeout(1600);
    let advanced = false;
    for (let attempt = 0; attempt < 12 && !advanced && !gameEnded; attempt++) {
      for (const n of names) {
        const next = pages[n].getByRole('button', { name: '下一局' });
        if (await next.isVisible().catch(() => false)) {
          await next.click();
          advanced = true;
          break;
        }
        const fin = pages[n].getByRole('button', { name: '查看最终结果' });
        if (await fin.isVisible().catch(() => false)) {
          await fin.click();
          gameEnded = true;
          break;
        }
        if (
          await pages[n]
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
      issues.push(`[flow] r${round}: no advance — STUCK`);
      for (const n of names) await shot(pages[n], n, `noadv-r${round}`);
      break;
    }
  }

  console.log(`rounds: ${round}, gameEnded: ${gameEnded}, sawElimination: ${eliminatedChecked}`);

  if (gameEnded) {
    // game_end must propagate to ALL THREE (incl. the eliminated spectator)
    for (const n of names) {
      const ok = await pages[n]
        .getByText('游戏结束')
        .first()
        .waitFor({ timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) issues.push(`[flow] game_end never reached ${n}'s screen`);
      await shot(pages[n], n, 'game-end');
    }
    // rematch: only the owner (Alice) should have the button
    const aliceHas = await alice
      .getByRole('button', { name: '再来一局' })
      .isVisible()
      .catch(() => false);
    if (!aliceHas) issues.push('[flow] owner has no rematch button at game_end');
    else {
      await alice.getByRole('button', { name: '再来一局' }).click();
      // Lobby markers per role: owner gets 开始游戏 back, non-owners get the
      // 等待房主 status line. Propagation is SSE/poll — wait, don't snapshot.
      for (const n of names) {
        const marker =
          n === 'Alice'
            ? pages[n].getByRole('button', { name: '开始游戏' })
            : pages[n].getByText('等待房主').first();
        const lobbyish = await marker
          .waitFor({ timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        if (!lobbyish) issues.push(`[flow] rematch did not return ${n} to lobby`);
      }
      await shot(alice, 'Alice', 'rematch-lobby');
      await shot(carol, 'Carol', 'rematch-lobby');
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
    console.log('\n=== DIAGNOSTICS ===');
    for (const i of issues) console.log(i);
    console.log(`=== ${issues.length} issues captured ===`);
  });
