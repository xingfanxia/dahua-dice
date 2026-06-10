# 大话骰 (Liar's Dice)

A 2-8 player Liar's Dice web app with animated 2D dice, gyroscope shake-to-roll, per-theme audio, and 4 switchable themes. Mobile-first, realtime, server-authoritative.

<p align="center">
  <img src="docs/screenshots/home-iphone14.png" alt="Home — Modern Minimal theme" width="300" />
  <img src="docs/screenshots/home-hk-neon.png" alt="Home — HK Neon theme" width="300" />
</p>
<p align="center"><em>Same screen, two of the four built-in themes (Modern Minimal · HK Neon).</em></p>

**Live**: https://dahua-dice.vercel.app (public — only per-deploy hash URLs are SSO-walled)

## Features

- 🎲 **Animated 2D dice** — a lightweight DOM/CSS renderer (`components/dice/Dice2D`) shows your own hand and tumbles on each roll (GPU `transform`/`opacity` only, reduced-motion aware), themed directly via CSS `oklch()` tokens — no WebGL/Three.js. The roll is always server-authoritative (`crypto.randomInt`); the animation is decorative.
- 📱 **Mobile-first** with gyroscope shake-to-roll (DeviceMotion API, iOS permission flow), `100dvh` safe-area layout, native share-sheet invite links.
- 🎨 **4 switchable themes** — modern-minimal / classic-bar / hk-neon / cartoon, each with distinct `oklch()` color tokens, display fonts, dice + cup materials, and motion language (no shared "AI slop" defaults).
- 🧑‍🤝‍🧑 **Player avatars** — pick from 12 glyphs or a numbered seat badge in the lobby; rendered as per-player tinted badges across lobby, turn ring, and reveal.
- 🌐 **i18n** — zh-CN default + en, via `next-intl`.
- 🔄 **Realtime multiplayer** via Upstash Redis + Vercel Fluid Compute SSE pipe (`/subscribe/{channel}` transparent stream). On reconnect the client refetches full room state (SSE `onopen` → refetch, plus a 3s safety poll), so a brief drop never loses sync. (A since-ID `XRANGE` replay endpoint, `/api/events`, exists for a future incremental-catch-up upgrade but isn't currently wired.)
- 🎲 **Offline / solo mode** (`/solo`) — for playing face-to-face, each phone is a fair local dice cup: roll (button or shake), see your own hand, cover/peek to hide it across the table; no room, no network. Rolls use `crypto.getRandomValues` locally (solo has no protocol adversary, unlike the server-authoritative multiplayer game).
- 🔒 **Server-authoritative gameplay** — challenge / 劈 / 通杀 / round resolution runs in a **pure, unit-tested engine** (`lib/game-engine/round.ts`) computed in Node, then committed atomically via version-CAS Lua; bids/joins are atomic Lua mutations. Inputs are Zod-validated at the boundary and rate-limited (30/min/session); dice rolled with `crypto.randomInt`; private hands are server-only and auth-gated per player (never broadcast before reveal).
- 🎮 **Full ruleset** — standard Liar's Dice + 斋 (close-call) + 1点万能 + 叫1必斋 + the 中式扩展 (劈 challenge a non-adjacent bidder / 反劈 bite-back / 通杀 sweep-all) + Palifico (the one-die opener round). All toggleable in the lobby and enforced end-to-end.
- ♿ **Accessibility** — full keyboard play (1-6 face · ±count · Enter bid · Space-to-challenge with confirm), ARIA live regions for turns/bids/reveal, `prefers-reduced-motion` static dice, themed focus rings, drawer focus-trap, ≥44px touch targets.
- 🎵 **Per-theme audio** — Howler sprite packs synthesized with ffmpeg (resonant collision, multi-tap shake rattle, settle thunk, reveal/win/lose + dramatic 开 stinger), coupled to dice contact force. Regenerate with `node scripts/audio/generate-sprites.mjs`.

## Build & run locally

```bash
pnpm install
vercel env pull .env.local --environment=production   # requires link to panpanmao/dahua-dice
pnpm dev
# open http://localhost:3000
```

## Test

```bash
pnpm test            # 79 unit + integration tests (game engine, validation, round resolution)
pnpm test:coverage   # vitest + @vitest/coverage-v8
pnpm e2e             # Playwright: happy-path, reconnect, extensions, solo, 劈, palifico, 8-sided, axe a11y — chromium + webkit (mobile Safari)
PLAYWRIGHT_PORT=3100 pnpm e2e   # use a free port if :3000 is taken by another dev server
```

The e2e suite (30 tests across 2 projects) drives two browser contexts through create → join → start → bid → counter-bid → challenge → reveal → next round (incl. asserting each player sees their own dice), a **complete game to elimination → final results → rematch → lobby**, a 通杀 (sweep) extension journey, a mid-game reload re-sync, the **offline / solo dice-cup** flow (roll · cover/peek · dice-count), and `@axe-core` WCAG A/AA scans of the home / lobby / bidding / solo screens. It auto-starts a dev server (override the port with `PLAYWRIGHT_PORT`). First run needs the browsers: `pnpm exec playwright install chromium webkit`.

## Deploy

```bash
vercel --prod --scope panpanmao   # personal scope — never the computelabs team
```

## Project structure

- [Design spec](docs/specs/2026-05-21-dahua-dice-design.md) — 22 sections: screens / data model / state machine / 4 themes / a11y
- [Implementation plan](docs/plans/2026-05-21-dahua-dice-plan.md) — 12 phases, ~60 tasks
- [Research](docs/research/) — game rules / Upstash multiplayer / R3F+Rapier dice / Howler audio
- `CLAUDE.md` — 60-second orientation for AI agents working in this repo

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · next-intl · zod · @upstash/redis · howler · Biome v2 · Vitest · Playwright + @axe-core/playwright
