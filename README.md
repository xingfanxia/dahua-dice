# 大话骰 (Liar's Dice)

A 2-8 player Liar's Dice web app with 3D physics dice, gyroscope shake-to-roll, audio hooks, and 4 switchable themes.

**Live**: https://dahua-dice-6l1inck4f-panpanmao.vercel.app
(currently behind Vercel "Standard Protection" — disable via Vercel dashboard → project settings → Deployment Protection to make publicly accessible)

## Features

- 🎲 **3D physics dice** — `react-three-fiber@9.5` + `@react-three/rapier@2.2` Rapier physics, `onContactForce` audio coupling, `onSleep` face detection
- 📱 **Mobile-first** with gyroscope shake-to-roll (DeviceMotion API, iOS permission flow)
- 🎨 **4 switchable themes** — modern-minimal / classic-bar / hk-neon / cartoon, each with distinct color tokens, fonts, and motion language (no shared "AI slop" defaults)
- 🌐 **i18n** — zh-CN default + en, via `next-intl`
- 🔄 **Realtime multiplayer** via Upstash Redis + Vercel Fluid Compute SSE pipe (`/subscribe/{channel}` transparent stream)
- 🔒 **Server-authoritative gameplay** — Lua scripts + CAS version locks for atomic bid/challenge mutations; dice values encrypted server-side
- 🎮 **Full ruleset** — standard Liar's Dice + 斋 (close-call) + 1点万能 toggle + 中式扩展 (劈/反劈/通杀) + Palifico (Perudo variant)
- 🎵 **Audio hooks** wired (Howler + onContactForce coupling; sprite assets pending Phase 10 audio pack generation)

## Build & run locally

```bash
pnpm install
vercel env pull .env.local     # requires being linked to panpanmao/dahua-dice
pnpm dev
# open http://localhost:3000
```

## Project structure

- [Design spec](docs/specs/2026-05-21-dahua-dice-design.md) — 22 sections, screens / data model / state machine / 4 themes / a11y
- [Implementation plan](docs/plans/2026-05-21-dahua-dice-plan.md) — 12 phases, ~60 tasks
- [Research](docs/research/) — 4 docs: game rules / Upstash multiplayer / R3F+Rapier dice / Howler audio

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui patterns · Zustand · next-intl · @upstash/redis · @react-three/fiber 9.5 · @react-three/rapier 2.2 · howler · Biome v2 · Vitest · Playwright

## Test

```bash
pnpm test            # 71 tests, all green
pnpm test:coverage   # vitest + @vitest/coverage-v8
```

## Deploy

```bash
vercel --prod        # panpanmao scope (personal); deploys current branch
```
