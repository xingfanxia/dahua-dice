#!/usr/bin/env node
// Headless smoke test for generated audio sprites.
//
// Boots a chromium instance, loads http://localhost:3000, captures console
// messages, decodes each theme's sprite via AudioContext.decodeAudioData,
// and confirms total duration ≈ 4.300s. Verifies the LAME header is honored
// by browser decode (not just by ffmpeg's mp3 decoder).
//
// Requires the dev server already running on :3000.
// Run: node scripts/audio/smoke.mjs

import { chromium } from '@playwright/test';

const URL = 'http://localhost:3000';
const THEMES = ['modern', 'classic', 'hk', 'cartoon'];
const EXPECTED_DURATION = 4.3;
const TOLERANCE = 0.01; // 10ms — generous for any browser-side artifact

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(`[pageerror] ${err.message}`);
});

console.log(`navigating to ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

// Use the page's AudioContext to decode each sprite — this is the same code
// path Howler uses under the hood, so it validates browser-side gapless decode.
const results = await page.evaluate(async (themes) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const out = [];
  for (const theme of themes) {
    for (const ext of ['mp3', 'webm']) {
      const url = `/audio/${theme}.${ext}`;
      try {
        const r = await fetch(url);
        if (!r.ok) {
          out.push({ url, ok: false, error: `HTTP ${r.status}` });
          continue;
        }
        const buf = await r.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);
        out.push({
          url,
          ok: true,
          duration: audioBuf.duration,
          sampleRate: audioBuf.sampleRate,
          channels: audioBuf.numberOfChannels,
          length: audioBuf.length,
        });
      } catch (e) {
        out.push({ url, ok: false, error: String(e) });
      }
    }
  }
  return out;
}, THEMES);

await browser.close();

let fail = false;
console.log('\n--- decode results ---');
for (const r of results) {
  if (!r.ok) {
    console.log(`✗ ${r.url}: ${r.error}`);
    fail = true;
    continue;
  }
  const driftMs = Math.abs(r.duration - EXPECTED_DURATION) * 1000;
  const ok = driftMs < TOLERANCE * 1000;
  if (!ok) fail = true;
  console.log(
    `${ok ? '✓' : '✗'} ${r.url}: dur=${r.duration.toFixed(4)}s (drift ${driftMs.toFixed(1)}ms)` +
    ` sr=${r.sampleRate} ch=${r.channels} samples=${r.length}`,
  );
}

if (consoleErrors.length) {
  console.log('\n--- console errors / warnings during load ---');
  for (const e of consoleErrors) console.log(e);
  // Audio-related errors are blockers; other warnings are noise (e.g. dev HMR).
  const audioErr = consoleErrors.filter((e) =>
    /audio|Howl|sprite|decode/i.test(e),
  );
  if (audioErr.length) fail = true;
}

process.exit(fail ? 1 : 0);
