# dahua-dice — Project Instructions

> Project-specific instructions for AI agents working in this repo. Read `docs/specs/2026-05-21-dahua-dice-design.md` for the full design contract; this file is the "what to know in 60 seconds" extract.

## Identity

- **Path**: `~/projects/side-projects/dahua-dice/` (NOT under `work/cl/`)
- **Bucket**: `side-projects/` per `~/projects/CLAUDE.md` decision tree
- **GitHub**: `github.com/xingfanxia/dahua-dice` (public, personal account)
- **Vercel project**: `panpanmao/dahua-dice` (**personal scope** — NEVER use `computelabs`)
- **Production URL**: `https://dahua-dice-<hash>-panpanmao.vercel.app` (currently SSO-walled; disable Standard Protection in Vercel dashboard to make public)

## Critical rules

1. **Never `vercel link --yes` without explicit scope.** Always pass `--scope panpanmao`. The CLI default is hostile (picks `computelabs`). See `~/.claude/projects/-Users-xingfanxia-projects/memory/feedback_vercel_team_scope.md` for the durable rule.
2. **Next.js 16 calls it `proxy`, not `middleware`.** File is `proxy.ts` at repo root, export name MUST be `function proxy(req: NextRequest)`. If you write `middleware`, build fails.
3. **Lua scripts are JS template strings** in `lib/lua/scripts.ts`, NOT `.lua` files. (Avoids `process.cwd()` resolution at build time.) Camel-case export names: `joinRoom`, `startGame`, `placeBid`, `challenge`. The wrapper `runScript` in `lib/lua/run.ts` calls `redis.eval` via SDK.
4. **Dice rolls must be server-side** (`lib/room/dice-rng.ts` uses `crypto.randomInt`). Client UI is decorative — Rapier physics lands on random faces visually, but the authoritative hand is what the server stores in `room:{code}:hands`.
5. **Theme tokens live in `components/theme/tokens.ts`**. ThemeProvider sets CSS vars + `data-theme` attr on root. NO hardcoded colors in components; use the tokens.
6. **Anti-AI-slop applies** (from `~/.claude/CLAUDE.md` design rules): no Inter / Lucide / `100vh` / `#000` / centered hero grids. Use the 4 themes' specific fonts (Space Grotesk / Newsreader / Noto Serif TC / Plus Jakarta), `oklch()` colors, `min-h-[100dvh]`, Phosphor / Heroicons / Radix icons.

## Tech stack quick ref

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Turbopack) + React 19 + TypeScript |
| Deploy | Vercel Fluid Compute (maxDuration 300s Hobby / 800s Pro for SSE) |
| State | Upstash Redis (HTTP client + Lua eval for CAS) |
| Pub/Sub | Upstash REST `/subscribe/{channel}` SSE pipe |
| 3D | `@react-three/fiber@9.5` + `@react-three/rapier@2.2` |
| Audio | `howler` v2 (sprite assets pending — hooks ready) |
| i18n | `next-intl` (zh-CN default + en) |
| UI | Tailwind v4 + Zustand-style local state (no external state lib yet) |
| Lint | Biome v2 (replaces ESLint + Prettier; CSS formatter disabled — Tailwind v4 syntax incompatible) |
| Test | Vitest (71 tests) + Playwright (scaffolded only, no tests yet) |

## Commands

```bash
pnpm dev            # http://localhost:3000
pnpm build          # production build (~1.5-2s)
pnpm test           # 71 unit + integration tests
pnpm lint:fix       # Biome autofix
vercel env pull .env.local --environment=production   # canonical env (Upstash vars live in Production scope)
vercel --prod --scope panpanmao   # deploy
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Home — nickname + 创建/加入 |
| GET | `/room/[code]` | Room (lobby + game, phase-driven) |
| POST | `/api/room` | Create room → return code + token |
| GET | `/api/room/[code]` | Public room info (phase, playerCount, joinable) |
| GET | `/api/room/[code]/full` | Full RoomState (for polling) |
| GET | `/api/room/[code]/all-hands` | Reveal-only: all players' dice |
| POST | `/api/action` | Universal action (join/start/bid/challenge/updateRules) |
| GET | `/api/hand/[code]` | Authenticated: caller's private dice only |
| GET | `/api/stream/[code]` | SSE pipe to Upstash subscribe channel |
| GET | `/api/events/[code]?since=ID` | Redis Stream replay for reconnect catchup |
| POST | `/api/session` | Bootstrap or refresh anonymous session |
| GET | `/api/whoami` | Read session — playerId / nick / currentRoom |

## Environment variables

Required in `.env.local` (auto-pulled from Vercel Production scope):

- `KV_REST_API_URL` — `https://<host>.upstash.io`
- `KV_REST_API_TOKEN` — write token
- `KV_REST_API_READ_ONLY_TOKEN` — read token (not currently used)
- `KV_URL` / `REDIS_URL` — TCP URLs (not used; we're HTTP-only)
- `VERCEL_OIDC_TOKEN` — auto-injected by Vercel

## Redis key schema

| Key | Type | TTL | Content |
|---|---|---|---|
| `session:{token}` | JSON | 24h | playerId / nick / currentRoom / theme / avatar / customization |
| `room:{code}:state` | JSON | 30m lobby / 6h game | Full RoomState (phase, players, currentTurnIdx, lastBid, rules, version) |
| `room:{code}:hands` | Hash | 6h | playerId → number[] (private dice) |
| `room:{code}:events` | Stream | 6h | event log via XADD; XRANGE for replay |

## Game engine

Pure functions in `lib/game-engine/`:
- `types.ts` — Face, Phase, Bid, GameRules (DEFAULT_RULES), Player, RoomState
- `validate.ts` — `isValidBid(prev, next, rules, alivePlayers)` covers zhai opener / break-zhai 2x / enter-zhai threshold / continuation
- `resolve.ts` — `resolveChallenge(bid, hands[], rules, challengerIdx, bidderIdx?)`
- `state-machine.ts` — `applyTransition(state, transition)` for phase flow
- `extensions.ts` — 劈 / 反劈 / 通杀 / Palifico

All TDD-tested (71 tests in `tests/`). Integration test simulates 8-round game end-to-end.

## File layout

```
app/
├── api/              # Route Handlers (server-only)
├── room/[code]/      # Lobby + game (RoomClient.tsx is the client component)
└── layout.tsx        # 6 fonts + ThemeProvider + manifest
components/
├── dice/             # Dice / DiceCup / DiceCanvas / DiceScene (dynamic ssr:false)
├── game/             # BidPanel / PlayerRing / BidChain / RevealStage / useRoomEvents
├── theme/            # tokens.ts + ThemeProvider
├── customization/    # CustomizationDrawer (4 themes + dice count + rules toggles)
└── shake/            # useShakeDetector (DeviceMotion + iOS perm)
lib/
├── auth/             # session.ts (generators + validator) + session-store.ts (Redis)
├── game-engine/      # types / validate / resolve / state-machine / extensions
├── room/             # invite-code (32-char alphabet, no 0/1/I/L/O) + dice-rng
├── lua/              # scripts.ts (4 Lua scripts as JS strings) + run.ts
├── audio/            # howl-instance + useDiceAudio
└── redis.ts          # Upstash client + REST URL/token exports
tests/                # 8 files, 71 tests
docs/                 # specs / plans / research (all written before code)
messages/             # zh-CN.json + en.json (~78 keys)
```

## Open items (out of MVP scope — pickup in next session)

1. **Vercel SSO wall** — toggle Deployment Protection off in dashboard for public access
2. **Audio sprites** — generate audiosprite mp3+json for 4 themes (sources in `docs/research/dice-audio-research.md`)
3. **Real-device gyro test** — need iPhone 14 Pro + Pixel 7 / Android for DeviceMotion validation
4. **Playwright e2e tests** — config exists, write happy-path + reconnect tests (skeleton in plan Phase 12)
5. **Per-theme dice materials** — currently all themes use the same BoxGeometry + SVG pips; design spec calls for distinct materials (frosted glass / ivory / enamel / pastel ceramic) via shaders or texture maps
6. **Player avatar picker UI** — `avatar` field exists in Player schema but no picker UI yet; default is `numeric`

## Reference docs

- `docs/specs/2026-05-21-dahua-dice-design.md` — 848-line design contract (5→9/10 design-review)
- `docs/plans/2026-05-21-dahua-dice-plan.md` — 12-phase implementation plan
- `docs/research/` — 4 subagent research docs (game rules, Upstash, R3F, audio)
- `~/.claude/projects/-Users-xingfanxia-projects/memory/project_dahua_dice.md` — durable agent memory
- `~/.claude/projects/-Users-xingfanxia-projects/memory/feedback_vercel_team_scope.md` — Vercel scope rule (saved this session)
