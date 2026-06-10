# dahua-dice — Project Instructions

> Project-specific instructions for AI agents working in this repo. Read `docs/specs/2026-05-21-dahua-dice-design.md` for the full design contract; this file is the "what to know in 60 seconds" extract.

## Identity

- **Path**: `~/projects/side-projects/dahua-dice/` (NOT under `work/cl/`)
- **Bucket**: `side-projects/` per `~/projects/CLAUDE.md` decision tree
- **GitHub**: `github.com/xingfanxia/dahua-dice` (public, personal account)
- **Vercel project**: `panpanmao/dahua-dice` (**personal scope** — NEVER use `computelabs`)
- **Production URL**: `https://dahua-dice.vercel.app` — PUBLIC (stable domain; protection is `all_except_custom_domains`, so only the per-deploy `dahua-dice-<hash>-panpanmao.vercel.app` URLs are SSO-walled)

## Critical rules

1. **Never `vercel link --yes` without explicit scope.** Always pass `--scope panpanmao`. The CLI default is hostile (picks `computelabs`). See `~/.claude/projects/-Users-xingfanxia-projects/memory/feedback_vercel_team_scope.md` for the durable rule.
2. **`vercel.json` MUST set `framework: "nextjs"` explicitly.** Without it, Vercel auto-detection silently picks `@vercel/static-build` for Next 16, producing builds with **zero server functions**. Symptom: every app route 404s (incl. `/`, `/api/*`), but `/public/` static assets serve fine. The deploy still shows "Ready" — the bug is invisible until you actually hit the URL. See [[feedback_vercel_nextjs_framework_detection]].
3. **Next.js 16 calls it `proxy`, not `middleware`.** File is `proxy.ts` at repo root, export name MUST be `function proxy(req: NextRequest)`. If you write `middleware`, build fails.
4. **Lua scripts are JS template strings** in `lib/lua/scripts.ts`, NOT `.lua` files. They are now **atomic mutations + thin version-CAS commits only**: `joinRoom` / `startGame` / `placeBid` / `setAvatar` / `leaveRoom` / `rematch` / `commitState` / `commitRound`. Challenge/劈/通杀/nextRound resolution is computed in Node (see Game engine), NOT in Lua. `runScript` in `lib/lua/run.ts` calls `redis.eval`. ⚠ **Redis cjson.encode returns `nil` (not a string) for a table with a SHARED sub-table reference** → always build separate table literals (this silently broke every bid once).
5. **Dice rolls must be server-side** (`lib/room/dice-rng.ts` uses `crypto.randomInt`). Client UI is decorative — the 2D dice (`components/dice/Dice2D`) tumble then settle on the fetched hand, but the authoritative hand is what the server stores in `room:{code}:hands`.
6. **Theme tokens live in `components/theme/tokens.ts`**. ThemeProvider sets CSS vars + `data-theme` attr on root. NO hardcoded colors in components; use the tokens.
7. **Anti-AI-slop applies** (from `~/.claude/CLAUDE.md` design rules): no Inter / Lucide / `100vh` / `#000` / centered hero grids. Use the 4 themes' specific fonts (Space Grotesk / Newsreader / Noto Serif TC / Plus Jakarta), `oklch()` colors, `min-h-[100dvh]`, Phosphor / Heroicons / Radix icons.

## Tech stack quick ref

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Turbopack) + React 19 + TypeScript |
| Deploy | Vercel Fluid Compute (maxDuration 300s Hobby / 800s Pro for SSE) |
| State | Upstash Redis (HTTP client + Lua eval for CAS) |
| Pub/Sub | Upstash REST `/subscribe/{channel}` SSE pipe |
| Dice | 2D DOM/CSS renderer (`components/dice/Dice2D` + `dice2d.css`) — transform/opacity tumble, themed via CSS oklch vars, no WebGL/Three.js |
| Audio | `howler` v2 — 8-slice ffmpeg-synth sprites (collide/shake/reveal/win/lose/click/settle/stinger), 4 themes |
| i18n | `next-intl` (zh-CN default + en, parity-checked) |
| UI | Tailwind v4 + React local state (no external state lib) |
| Validation | Zod at API boundaries (`lib/validation/schemas.ts`) + Redis INCR rate limiter (`lib/rate-limit.ts`; 30/min action · 15/min room · 20/min session, all per-IP/session; `RATE_LIMIT_DISABLED=1` opt-out for e2e only) |
| Lint | Biome v2 (replaces ESLint + Prettier; CSS formatter disabled — Tailwind v4 syntax incompatible) |
| Test | Vitest (73 unit/integration) + Playwright e2e (happy-path / reconnect / extensions / player2-flow / full-game-to-rematch / solo / axe a11y; 22 tests, chromium + webkit) |

## Commands

```bash
pnpm dev            # http://localhost:3000
pnpm build          # production build (~1.5-2s)
pnpm test           # 73 unit + integration tests
pnpm e2e            # Playwright e2e (auto-starts a dev server); browsers: playwright install chromium webkit
PLAYWRIGHT_PORT=3100 pnpm e2e   # use when :3000 is taken by another project's dev server (reuseExistingServer would grab it)
pnpm lint:fix       # Biome autofix
vercel env pull .env.local --environment=production   # canonical env (Upstash vars live in Production scope)
vercel --prod --scope panpanmao   # deploy
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Home — nickname + 创建/加入 + 线下/单人模式 entry |
| GET | `/solo` | Offline / solo dice-cup — local `crypto` rolls, no room/network (`app/solo/SoloClient.tsx`) |
| GET | `/room/[code]` | Room (lobby + game, phase-driven) |
| POST | `/api/room` | Create room → return code + token |
| GET | `/api/room/[code]` | Public room info (phase, playerCount, joinable) |
| GET | `/api/room/[code]/full` | Full RoomState (for polling) |
| GET | `/api/room/[code]/all-hands` | Reveal-only: all players' dice |
| POST | `/api/action` | Universal action — Zod-validated discriminated union: join / start / bid / challenge / **pi** / **tongsha** / nextRound / leave / setAvatar / updateRules / **rematch**. Rate-limited 30/min/session |
| GET | `/api/hand/[code]` | Authenticated: caller's private dice only |
| GET | `/api/stream/[code]` | SSE pipe to Upstash subscribe channel |
| GET | `/api/events/[code]?since=ID` | Redis Stream replay for reconnect catchup |
| POST | `/api/session` | Bootstrap or refresh anonymous session |
| GET | `/api/whoami` | Read session — playerId / nick / currentRoom |
| GET | `/api/health` | Health check `{ok:true}` |

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
| `room:{code}:state` | JSON | 30m lobby / 6h game | Full RoomState (phase, players, currentTurnIdx, lastBid, **bidChain**, **palificoActive/BidderId/Triggered**, rules, version) |
| `room:{code}:hands` | Hash | 6h | playerId → number[] (private dice) |
| `room:{code}:events` | Stream | 6h | event log via XADD; XRANGE for replay |

## Game engine

Pure, unit-tested functions in `lib/game-engine/`:
- `types.ts` — Face, Phase, Bid, GameRules (DEFAULT_RULES), Player, RoomState (+ `bidChain`, `palificoActive/BidderId/Triggered`), ChallengeOutcome (kind / loserIds / diceLost)
- `validate.ts` — `isValidBid(prev, next, rules, alive, opts?)` — zhai opener / break-zhai 2x / 转斋 (normal raise) / 叫1必斋 / total-dice cap / Palifico count-lock
- `round.ts` — **the runtime resolution engine**: `resolveChallenge` (开) / `resolvePi` (劈) / `resolveTongsha` (通杀) / `prepareNextRound` (+ Palifico setup). Pure `(state, hands) → { state, outcome }`.

**Architecture (important)**: 开/劈/通杀/nextRound are computed in **Node** via `round.ts` (unit-tested), then committed atomically via a thin version-CAS Lua (`commitState` / `commitRound`). The tested code IS the runtime — there is NO separate untested Lua re-implementation of the rules. (`resolve.ts` / `state-machine.ts` / `extensions.ts` were deleted — they were dead code that duplicated the rules.)

Pinned 中式扩展 / Palifico semantics: see design spec §10/§10B. `lib/room/resolution.ts` = `readHands` (tolerant parse) + `normalizeState` (coerce cjson-`{}` arrays) + `GAME_TTL`. Boundary validation via Zod (`lib/validation/schemas.ts`); rate limit via `lib/rate-limit.ts` (30/min action, 15/min room).

All unit-tested (73 unit + integration, full game simulated end-to-end via `round.ts`). Live path covered by Playwright e2e incl. 通杀 + player-2 counter-bid + full-game-to-rematch journeys. ⚠ **The opening-bid floor MUST be clamped to total table dice** (`getStartingBidThreshold(..., totalDice)`) — an unclamped floor (e.g. 1v1 with 1 die each: floor 3 > table 2) leaves the round opener with zero legal actions and softlocks the game.

## File layout

```
app/
├── api/              # Route Handlers (server-only)
├── room/[code]/      # Lobby + game (RoomClient.tsx is the client component)
├── solo/             # Offline solo dice-cup (SoloClient.tsx — local rolls, no room/network)
└── layout.tsx        # 6 fonts + ThemeProvider + manifest
components/
├── dice/             # Dice2D (2D DOM/CSS dice + roll animation) / DiceScene (wrapper) / dice2d.css
├── game/             # BidPanel / PlayerRing / BidChain / RevealStage / AvatarBadge / useRoomEvents
├── theme/            # tokens.ts + ThemeProvider
├── customization/    # CustomizationDrawer (themes + dice count + rules toggles incl 中式扩展) / AvatarPicker
└── shake/            # useShakeDetector (DeviceMotion + iOS perm; auto-grants on Android)
lib/
├── auth/             # session.ts (generators + validator) + session-store.ts + membership.ts
├── game-engine/      # types / validate / round  (resolve/state-machine/extensions DELETED — see Game engine)
├── room/             # invite-code (no 0/1/I/L/O) + dice-rng + resolution (readHands / normalizeState / GAME_TTL)
├── solo/             # roll.ts — client-side crypto dice for the offline solo mode (no server)
├── lua/              # scripts.ts (8 atomic + commit Lua scripts as JS strings) + run.ts
├── validation/       # schemas.ts (Zod action union + GameRules)
├── audio/            # howl-instance + useDiceAudio
├── rate-limit.ts     # Redis INCR fixed-window limiter
└── redis.ts          # Upstash client + REST URL/token exports
tests/                # unit + integration (73) + e2e/ (18 Playwright, chromium + webkit)
scripts/audit/        # browser playability harness (2p full game / 3p elimination / refresh)
docs/                 # specs / plans / research (all written before code)
messages/             # zh-CN.json + en.json (parity-checked)
```

## Audio sprites

> **Audio is DISABLED by default** (`AUDIO_ENABLED` in `lib/audio/useDiceAudio.ts`, gated on `NEXT_PUBLIC_AUDIO_ENABLED=true`). The synth SFX aren't good enough to ship yet; when off, the sprite sheet is never fetched and every play helper no-ops. Re-enable by setting the env var (ideally after dropping in real CC0 samples).

Generated via ffmpeg synthesis (no external assets). 4 themes × 2 formats at `public/audio/{modern,classic,hk,cartoon}.{mp3,webm}`. Total ~340KB across all themes.

- **Regenerate**: `node scripts/audio/generate-sprites.mjs`
- **Smoke-test** (browser decode + duration drift check): `node scripts/audio/smoke.mjs` (needs `pnpm dev` running)
- **Sprite map** (hardcoded in `lib/audio/useDiceAudio.ts`, must match generator): collide[0,200] / shake[200,1200,loop] / reveal[1400,800] / win[2200,1000] / lose[3200,1000] / click[4200,100] / settle[4300,300] / stinger[4600,900], total 5500ms
- **Quality bar**: synthesized SFX with percussive envelopes (sharp transient + exp decay), an 11-clack pitch-jittered rattle for shake, and a two-pass per-segment peak-normalize (no more near-silent cues). Richer than demo-grade but still synth, not curated CC0 — tuned by DSP measurement, not by ear. Segments are length-preserving, so the 5500ms sprite map is exact. Swap in real Freesound CC0 by replacing per-segment recipes with `-i <path>.wav` inputs.

## Open items

Remaining (need a human / physical device — can't be done from a dev session):

1. **Real-device gyro test** — need iPhone 14 Pro + Pixel 7 / Android for DeviceMotion validation on hardware

Done (2026-06-10 — round-2 audit + solo mode; branch `fix/playability-audit-r2-2026-06-09`, 73 unit + 22 e2e green ×2):

- **New feature — offline / solo dice-cup mode** (`/solo`): each phone is a fair local dice cup for playing 大话骰 face-to-face (players call bids out loud; app just rolls + shows your own hand). No room/server/network. Reuses Dice2D + themes + shake-to-roll + audio; cover/peek toggle; dice-count (1–8) + 6/8-sides; `lib/solo/roll.ts` uses `crypto.getRandomValues` (local rolls are fine — solo has no protocol adversary, unlike the multiplayer game). Home-page entry link.
- **16 confirmed bugs** from a multi-agent audit (6 dimension finders + adversarial verify):
  - **Bid TOCTOU**: bid route validated a fresh read but CAS'd on the client's version → an illegal bid could commit. Now version-gates before validation (like the challenge path).
  - **startGame race**: a join in the route read→eval window dealt a stale roster (player with no dice). startGame now CASes on the server's OWN read version + the route auto-retries on stale (≤4×) — so a client a beat behind (e.g. right after updateRules) still starts cleanly. **Do NOT CAS start on the client's expectedVersion — it breaks the updateRules→start flow (extensions e2e).**
  - `/api/session` now per-IP rate-limited (was unthrottled session-minting that also defeated the action limiter); `theme` clamped to an allow-list (`sanitizeTheme`); events-stream key now `EXPIRE`'d on every XADD (the documented 6h TTL was never applied); joinRoom lobby TTL fixed 6h→30m; rejoin now publishes its version bump.
  - SSE: hook self-reconnects on a non-200 EventSource failure (the browser won't); full-screen disconnect lockout is gated on sync STALENESS not raw SSE status (the 3s poll keeps the game live), rejoin = real reload; stream reassembles complete frames so a keepalive ping can't split a mid-frame chunk.
  - Client: stale `/api/hand` can't overwrite a new round's dice (AbortController + round tag); whoami retried w/ backoff; trailing-refetch flag; 通杀 filters dead bidders; keyboard challenge respects busy; drawer resyncs toggles on open; silent start/rematch failures surface.
  - i18n: en bundle reachable via Accept-Language fallback (`lib/i18n.ts`); localized list separator + loading label; 165→182 keys, parity-checked.
- **e2e hardening**: env-configurable port (`PLAYWRIGHT_PORT`) — `reuseExistingServer` silently grabbed another project's stale :3000 dev server and ran the whole suite against the wrong app; `RATE_LIMIT_DISABLED=1` on the test server (one shared localhost IP trips the per-IP caps); hydration-race-robust nickname fill in helpers (a pre-hydration fill was reset to '' by React → flaky "请输入昵称" / rate-limit at the home stage, a different test each run). Suite now ~38s (was ~1.7m of retry churn).
- **game-end leave label**: the secondary button only `leave`s (navigates home; leaveRoom transfers ownership) — it never dissolves the room, so the "解散房间/Disband room" label (shown to non-owners too) was relabeled to "离开房间/Leave room"; removed the unused `game.disband` key.
- **game-engine re-audit (inline)**: the audit's rules-dimension finder produced no output (spend-limit), so `resolveChallenge`/`Pi`/`Tongsha`, `isValidBid` (zhai/break-zhai/转斋/叫1必斋/Palifico/total-dice cap), `prepareNextRound` Palifico setup, and the cjson `normalizeState` boundary were all re-traced by hand — no engine bug found.

Done (2026-06-09 playability audit — the game could not be finished before this pass):

- **Game-end softlock (CRITICAL)**: reveal screen rendered no action when `gameEnded` — the reveal→game_end transition needs a `nextRound` POST, so every finished game froze at 揭晓 forever; rematch was unreachable. Now: 查看最终结果 button → game_end → rematch. Found by actually playing a full game via `scripts/audit/play-full-game.mjs`.
- **Late-game opener paralysis (CRITICAL)**: opening-bid floor `ceil(1.5×alive)` was never clamped to total table dice — 1v1 with 1 die each (floor 3 > table 2) left the opener with zero legal actions. Floor now clamps to `totalDice`.
- **Eliminated-player view**: dead players 404-spammed `/api/hand` every round; now skipped + 💀 你已出局·观战中 spectator banner.
- **BidPanel round leak**: panel surviving a round boundary kept the dead round's count/face (`key={state.round}` remount).
- **SSE keepalive**: raw Upstash pipe died at 300s idle (undici BodyTimeoutError, zero keepalives); managed pump now sends `: ping`/20s and closes gracefully at 280s.
- **Lobby**: non-owners now see 等待房主开始游戏… instead of nothing.
- **Verified live** (real chromium contexts, prod build): 2p create→join→start→8 rounds→game_end→rematch→second game; 3p with mid-game elimination + spectator + game_end on all 3 screens; refresh mid-bidding and at reveal; 18 e2e green incl. new `full-game.spec.ts`.
- **Vercel SSO note corrected**: `https://dahua-dice.vercel.app` (stable domain) is already public — protection is `all_except_custom_domains`, only per-deploy hash URLs are walled.

Done (2026-05-28 full audit pass — 8 workstreams, see git log `audit/full-review-2026-05-28`):

- **Security**: Zod boundary validation (kills `diceCount:9999` DoS), Redis rate limiter, guarded JSON parse, authz status codes
- **Rules**: fixed invented enter-zhai constraint + enforce 叫1必斋 + total-dice cap (per research §2.3)
- **中式扩展 + Palifico**: fully functional end-to-end (劈/反劈/通杀/Palifico) — the toggles used to do nothing; now wired engine→Lua→UI→i18n→tests + e2e
- **Engine refactor**: tested `round.ts` is the runtime (deleted dead resolve/state-machine/extensions)
- **a11y**: keyboard play, challenge confirm, ARIA live regions, reduced-motion static dice, focus ring + drawer trap, 44px targets
- **3D/audio**: WebGL2→2D SVG fallback, wired collision audio, haptics formula, settle/stinger SFX, Android shake auto-grant
- **UX**: reconnect banner + 30s offline screen, rematch/disband, /api/health, mapApiReason completeness, error/loading boundaries

Done (2026-05-29 dice rebuild + gameplay UX fix — commits on `main`):

- **2D dice**: replaced the broken 3D R3F/Rapier dice (black-blob cup, clipping dice, THREE.Color/Clock warnings) with a 2D DOM/CSS renderer (`Dice2D` + `dice2d.css`) showing the player's own hand with a transform/opacity roll animation. Removed `three` / `@react-three/*` deps + the orphaned `oklch-to-hex` util.
- **Own dice visible**: the center now shows your hand directly — replaced the broken hold-to-peek button (a tap revealed nothing → "看不到自己的骰子").
- **Bid sync hardened**: all actions surface failures + auto-resync on a stale 409 (root cause of "player 2 can't bid" under laggy real-device sync); safety poll 10s→3s; dice re-roll once per round.
- **Audio**: richer synthesis (percussive transient+body+decay, 11-clack rattle, per-segment peak-normalize).
- **e2e**: added `player2-flow.spec.ts` — the regression the happy-path missed (player 2 COUNTER-BIDS, both see own dice, round advances). 16 e2e green.

Lower-priority / deliberate cuts (documented): app-layer hand encryption (auth-gating is sufficient — see spec §17), `Save-Data`, full forced-colors theming, orthographic camera (perspective kept), curated CC0 audio (ffmpeg-synth ships).

## Reference docs

- `docs/specs/2026-05-21-dahua-dice-design.md` — 848-line design contract (5→9/10 design-review)
- `docs/plans/2026-05-21-dahua-dice-plan.md` — 12-phase implementation plan
- `docs/research/` — 4 subagent research docs (game rules, Upstash, R3F, audio)
- `~/.claude/projects/-Users-xingfanxia-projects/memory/project_dahua_dice.md` — durable agent memory
- `~/.claude/projects/-Users-xingfanxia-projects/memory/feedback_vercel_team_scope.md` — Vercel scope rule (saved this session)
