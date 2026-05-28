# 大话骰 (Liar's Dice)

A 2-8 player Liar's Dice web app with 3D physics dice, gyroscope shake-to-roll, per-theme audio, and 4 switchable themes. Mobile-first, realtime, server-authoritative.

<p align="center">
  <img src="docs/screenshots/home-iphone14.png" alt="Home — Modern Minimal theme" width="300" />
  <img src="docs/screenshots/home-hk-neon.png" alt="Home — HK Neon theme" width="300" />
</p>
<p align="center"><em>Same screen, two of the four built-in themes (Modern Minimal · HK Neon).</em></p>

**Live**: https://dahua-dice-6l1inck4f-panpanmao.vercel.app
(currently behind Vercel "Standard Protection" — disable via Vercel dashboard → project settings → Deployment Protection to make publicly accessible)

## Features

- 🎲 **3D physics dice** — `react-three-fiber@9` + `@react-three/rapier@2` Rapier physics, `onContactForce` audio coupling, `onSleep` quaternion face detection. Each theme renders a distinct material (frosted glass / ivory / lacquered enamel / matte ceramic) via `meshPhysicalMaterial` + a local Lightformer environment — no external HDR fetch.
- 📱 **Mobile-first** with gyroscope shake-to-roll (DeviceMotion API, iOS permission flow), `100dvh` safe-area layout, native share-sheet invite links.
- 🎨 **4 switchable themes** — modern-minimal / classic-bar / hk-neon / cartoon, each with distinct `oklch()` color tokens, display fonts, dice + cup materials, and motion language (no shared "AI slop" defaults).
- 🧑‍🤝‍🧑 **Player avatars** — pick from 12 glyphs or a numbered seat badge in the lobby; rendered as per-player tinted badges across lobby, turn ring, and reveal.
- 🌐 **i18n** — zh-CN default + en, via `next-intl`.
- 🔄 **Realtime multiplayer** via Upstash Redis + Vercel Fluid Compute SSE pipe (`/subscribe/{channel}` transparent stream), with Redis Stream (`XRANGE`) replay for reconnect catch-up.
- 🔒 **Server-authoritative gameplay** — Lua scripts + CAS version locks for atomic bid/challenge mutations; dice rolled with `crypto.randomInt`; private hands are server-only and auth-gated per player (never broadcast before reveal).
- 🎮 **Full ruleset** — standard Liar's Dice + 斋 (close-call) + 1点万能 toggle + 中式扩展 (劈/反劈/通杀) + Palifico (Perudo variant).
- 🎵 **Per-theme audio** — Howler sprite packs synthesized with ffmpeg (resonant collision, multi-tap shake rattle, reveal/win/lose stingers), coupled to dice contact force. Regenerate with `node scripts/audio/generate-sprites.mjs`.

## Build & run locally

```bash
pnpm install
vercel env pull .env.local --environment=production   # requires link to panpanmao/dahua-dice
pnpm dev
# open http://localhost:3000
```

## Test

```bash
pnpm test            # 71 unit + integration tests (game engine, validation, resolve, state machine)
pnpm test:coverage   # vitest + @vitest/coverage-v8
pnpm e2e             # Playwright: happy-path, reconnect, axe a11y — chromium + webkit (mobile Safari)
```

The e2e suite drives two browser contexts through create → join → start → bid → challenge → reveal, a mid-game reload re-sync, and `@axe-core` WCAG A/AA scans of the home / lobby / bidding screens. It reuses a running `pnpm dev` (or starts one). First run needs the browsers: `pnpm exec playwright install chromium webkit`.

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

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Zustand · next-intl · @upstash/redis · @react-three/fiber 9 · @react-three/rapier 2 · @react-three/drei · howler · Biome v2 · Vitest · Playwright + @axe-core/playwright
