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
5. **Dice rolls must be server-side** (`lib/room/dice-rng.ts` uses `crypto.randomInt`). Client UI is decorative — the 3D cube dice (`components/dice/MyHand` + `DiceCube`) tumble then settle on the fetched hand when the player taps/shakes to reveal, but the authoritative hand is what the server stores in `room:{code}:hands`.
6. **Single design language (2026-06-12 redesign, matches the wxapp sibling)**: neutral Tailwind grays + red-600 accent + amber secondary, dark/light dual mode. `components/theme/ThemeProvider.tsx` = mode context (auto/light/dark, `localStorage['theme-mode']`, `dark` class on `<html>`); pre-paint inline script in `app/layout.tsx` prevents flash. NO per-theme tokens (tokens.ts deleted); style with Tailwind classes + `dark:` variants only.
7. **Anti-AI-slop applies** (from `~/.claude/CLAUDE.md` design rules): no Lucide / `100vh` / centered hero grids; `min-h-[100dvh]`. Typography is intentionally the system sans stack (wxapp parity — the 4 display fonts were removed 2026-06-12). **Contrast floor**: axe wcag2aa runs in e2e — muted text ≥ gray-500 on light bg, white-on-color buttons need the 600-step shade (red-600 / emerald-700).

## Tech stack quick ref

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (Turbopack) + React 19 + TypeScript |
| Deploy | Vercel Fluid Compute (maxDuration 300s Hobby / 800s Pro for SSE) |
| State | Upstash Redis (HTTP client + Lua eval for CAS) |
| Pub/Sub | Upstash REST `/subscribe/{channel}` SSE pipe |
| Dice | CSS **3D cube** dice (`dice2d.css`) — perspective + preserve-3d, 6 pip faces, transition-driven spin+land (no keyframe snap). `components/dice/DiceCube` = dumb per-die cube (explicit rot/blank/flip); `components/dice/MyHand` = the player's own hand + the unified **tap/shake gesture** (deal→covered→tap/gyro→tumble+reveal once→tap→cover→re-peek flip), used identically in solo/bot/room (ported from the wxapp `DiceRow`). Shared `PipDie` SVG for the inline dice in reveal/bid/chain. White die + gray-900 pips both modes, no WebGL/Three.js |
| Audio | `howler` v2 — settle = real CC0 sample (Kenney dice-throw-1, always on); other 7 slots = ffmpeg-synth sprites behind `NEXT_PUBLIC_AUDIO_ENABLED` (default off; only the `modern` pack is wired since the 4-theme removal) |
| i18n | `next-intl` (zh-CN default + en, parity-checked). Default is zh-CN (no Accept-Language auto-switch); English is opt-in via the LanguageToggle (`components/i18n/LanguageToggle.tsx` → `setLocale` server action sets the `locale` cookie). |
| UI | Tailwind v4 + React local state (no external state lib) |
| Validation | Zod at API boundaries (`lib/validation/schemas.ts`) + Redis INCR rate limiter (`lib/rate-limit.ts`; 30/min action · 15/min room · 20/min session, all per-IP/session; `RATE_LIMIT_DISABLED=1` opt-out for e2e only) |
| Lint | Biome v2 (replaces ESLint + Prettier; CSS formatter disabled — Tailwind v4 syntax incompatible) |
| Test | Vitest (106 unit/integration) + Playwright e2e (happy-path / reconnect / extensions / player2-flow / full-game-to-rematch / solo / **bot** / 劈 / palifico / axe a11y; 34 tests, chromium + webkit) |

## Commands

```bash
pnpm dev            # http://localhost:3000
pnpm build          # production build (~1.5-2s)
pnpm test           # 106 unit + integration tests
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
| GET | `/bot` | 人机模式 — LOCAL single-device game vs a probability-model bot, no room/server (`app/bot/BotClient.tsx`, engine reused via `lib/bot/`). Setup screen picks 难度 + **骰子数量 (3–10, GameRules range)** → `createBotGame({ rules })` |
| GET | `/room/[code]` | Room (lobby + game, phase-driven) |
| POST | `/api/room` | Create room → return code + token |
| GET | `/api/room/[code]` | Public room info (phase, playerCount, joinable) |
| GET | `/api/room/[code]/full` | Full RoomState (for polling) |
| GET | `/api/room/[code]/all-hands` | Reveal-only: all players' dice |
| POST | `/api/action` | Universal action — Zod-validated discriminated union: join / start / bid / challenge / **pi** / **tongsha** / nextRound / leave / setAvatar / updateRules / **rematch**. Rate-limited 30/min/session |
| GET | `/api/hand/[code]` | Authenticated: caller's private dice only |
| GET | `/api/stream/[code]` | SSE pipe to Upstash subscribe channel |
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
| `room:{code}:events` | Pub/Sub channel | — | Lua `PUBLISH` → `/api/stream` SSE pipe. Ephemeral (a Redis channel, not a stored key — no TTL). No persisted XADD stream as of 2026-06-11 (the dead `/api/events` XRANGE replay + per-mutation XADD were removed) |

## Game engine

Pure, unit-tested functions in `lib/game-engine/`:
- `types.ts` — Face, Phase, Bid, GameRules (DEFAULT_RULES + **`endMode` / `knockoutLosses` / `scoreRounds`**), Player (+ `lossCount`), RoomState (+ `bidChain`, `palificoActive/BidderId/Triggered`), ChallengeOutcome (kind / loserIds / diceLost), `EndMode`
- `validate.ts` — `isValidBid(prev, next, rules, alive, opts?)` — zhai opener / break-zhai 2x / **转斋 (count ≥ prev−1, face free; reason `zhai_count_too_low`)** / 叫1必斋 / total-dice cap / Palifico count-lock
- `round.ts` — **the runtime resolution engine**: `resolveChallenge` (开) / `resolvePi` (劈) / `resolveTongsha` (通杀) / `prepareNextRound` (+ Palifico setup). Pure `(state, hands) → { state, outcome }`. **`applyLoss` records `lossCount` + applies the per-`endMode` consequence (attrition removes dice & eliminates; party/knockout/score keep dice); `finalize` branches game-end/winner on the mode.**

**Architecture (important)**: 开/劈/通杀/nextRound are computed in **Node** via `round.ts` (unit-tested), then committed atomically via a thin version-CAS Lua (`commitState` / `commitRound`). The tested code IS the runtime — there is NO separate untested Lua re-implementation of the rules. (`resolve.ts` / `state-machine.ts` / `extensions.ts` were deleted — they were dead code that duplicated the rules.)

Pinned 中式扩展 / Palifico semantics: see design spec §10/§10B. `lib/room/resolution.ts` = `readHands` (tolerant parse) + `normalizeState` (coerce cjson-`{}` arrays) + `GAME_TTL`. Boundary validation via Zod (`lib/validation/schemas.ts`); rate limit via `lib/rate-limit.ts` (30/min action, 15/min room).

All unit-tested (106 unit + integration, full game simulated end-to-end via `round.ts`). Live path covered by Playwright e2e incl. 通杀 + player-2 counter-bid + full-game-to-rematch journeys. ⚠ **The opening-bid floor MUST be clamped to total table dice** (`getStartingBidThreshold(..., totalDice)`) — an unclamped floor (e.g. 1v1 with 1 die each: floor 3 > table 2) leaves the round opener with zero legal actions and softlocks the game.

## File layout

```
app/
├── api/              # Route Handlers (server-only)
├── room/[code]/      # Lobby + game (RoomClient.tsx — turn banner / current-call hero / MyHand covered-cup / waiting card)
├── solo/             # Offline solo dice-cup (SoloClient.tsx — local rolls, no room/network)
├── bot/              # 人机模式 — local single-device game vs the bot (BotClient.tsx; reuses room components)
└── layout.tsx        # system font stack + ThemeProvider + pre-paint dark-mode script + manifest
components/
├── dice/             # DiceCube (dumb per-die 3D cube) / MyHand (own hand + tap/shake gesture, used in solo/bot/room) / PipDie (inline SVG die) / dice2d.css
├── game/             # BidPanel (prominent 斋 toggle) / PlayerRing / BidChain / RevealStage / AvatarBadge / useRoomEvents
├── theme/            # ThemeProvider (dark/light mode context) + ThemeModeToggle pill
├── customization/    # CustomizationDrawer (mode + language + dice count + rules toggles + 结算模式/endMode selector + N/K steppers) / AvatarPicker
└── shake/            # useShakeDetector (DeviceMotion + iOS perm; auto-grants on Android; `enabled` gate → listen only while covered)
lib/
├── auth/             # session.ts (generators + validator) + session-store.ts + membership.ts
├── game-engine/      # types / validate / round  (resolve/state-machine/extensions DELETED — see Game engine)
├── bot/              # policy.ts (pure binomial decision + 3 difficulties) + local-game.ts (in-memory game loop reusing round.ts)
├── room/             # invite-code (no 0/1/I/L/O) + dice-rng + resolution (readHands / normalizeState / GAME_TTL)
├── solo/             # roll.ts — client-side crypto dice for the offline solo mode (no server)
├── lua/              # scripts.ts (8 atomic + commit Lua scripts as JS strings) + run.ts
├── validation/       # schemas.ts (Zod action union + GameRules)
├── audio/            # howl-instance + useDiceAudio
├── rate-limit.ts     # Redis INCR fixed-window limiter
└── redis.ts          # Upstash client + REST URL/token exports
tests/                # unit + integration (102) + e2e/ (34 Playwright, chromium + webkit)
scripts/audit/        # browser playability harness (2p full game / 3p elimination / refresh)
docs/                 # specs / plans / research (all written before code)
messages/             # zh-CN.json + en.json (parity-checked)
```

## Audio sprites

> **Synth sprites are DISABLED by default** (`AUDIO_ENABLED` in `lib/audio/useDiceAudio.ts`, gated on `NEXT_PUBLIC_AUDIO_ENABLED=true`) — they aren't good enough to ship; when off, the sprite sheet is never fetched and every sprite helper no-ops. **Exception: `settle` plays a real CC0 sample always-on** — Kenney casino-audio `dice-throw-1` (CC0 1.0, kenney.nl/assets/casino-audio) at `public/audio/dice-throw.{mp3,webm}`, fired by `onAllSettled` in Room + Solo. The wxapp sibling repo uses the same sample（音感一致）.

Generated via ffmpeg synthesis (no external assets). 4 packs × 2 formats at `public/audio/{modern,classic,hk,cartoon}.{mp3,webm}` (~340KB total); since the 2026-06-12 theme removal only `modern` is wired in `lib/audio/useDiceAudio.ts`.

- **Regenerate**: `node scripts/audio/generate-sprites.mjs`
- **Smoke-test** (browser decode + duration drift check): `node scripts/audio/smoke.mjs` (needs `pnpm dev` running)
- **Sprite map** (hardcoded in `lib/audio/useDiceAudio.ts`, must match generator): collide[0,200] / shake[200,1200,loop] / reveal[1400,800] / win[2200,1000] / lose[3200,1000] / click[4200,100] / settle[4300,300] / stinger[4600,900], total 5500ms
- **Quality bar**: synthesized SFX with percussive envelopes (sharp transient + exp decay), an 11-clack pitch-jittered rattle for shake, and a two-pass per-segment peak-normalize (no more near-silent cues). Richer than demo-grade but still synth, not curated CC0 — tuned by DSP measurement, not by ear. Segments are length-preserving, so the 5500ms sprite map is exact. Swap in real Freesound CC0 by replacing per-segment recipes with `-i <path>.wav` inputs.

## Open items

Remaining (need a human / physical device — can't be done from a dev session):

1. **Real-device gyro test** — need iPhone 14 Pro + Pixel 7 / Android for DeviceMotion validation on hardware

Planned (2026-06-11 — research done, NOT started):

2. **微信小程序版** — friends-only 体验版路线（零备案/审核/版号；个人主体 15 体验成员 + 15 项目成员/appid）。开在**新 sibling repo** `~/projects/side-projects/dahua-dice-wxapp/`（infra 与 web 版零重叠：Taro 4 = React 18、云开发 CloudBase、`db.watch` 实时同步替代 SSE、`lib/game-engine/` 原样移植进云函数）。完整调研与架构映射：`docs/research/2026-06-11-wechat-miniprogram-port.md`；通用 playbook：`~/.claude/references/wechat-miniprogram-friends-only.md`。CloudBase skill 已装（`.claude/skills/cloudbase` → `.agents/skills/cloudbase`，`Skill(cloudbase)` 调用）。⚠ 注册普通小程序 + 工具类目，勿注册小游戏账号；游戏内永远零真钱元素。

Done (2026-06-13 — ported the wxapp dice-gesture model to web; branch `feat/port-wxapp-dice-gesture`, 107 unit + 34 e2e green):

- **Unified tap/shake gesture** across solo/bot/room, mirroring the wxapp sibling's `DiceRow` (its commits cc5ef44→f96e91c→8f35c6a): each new hand sits **static + covered** (values hidden via uniform `COVERED_ROT` + `?` blank faces, NO auto-roll); tap or gyro-shake → **first reveal tumbles + plays the always-on CC0 throw cue + vibrates (once)**, a **re-peek after covering just quick-flips** (FLIP_MS, silent — `rolledOnceRef`), tap → cover. Reduced-motion = instant flip but keeps the sound/haptic.
- **New decomposition mirrors wxapp**: `components/dice/DiceCube` (dumb per-die cube, rotation math moved out of the old `Dice2D`) + `components/dice/MyHand` (the gesture orchestrator). **Retired `Dice2D` + `DiceScene`** (deleted). `useShakeDetector` gained an `enabled` gate so the gyro listens only while covered (kills the reveal-vibration self-retrigger).
- **Fixed three pre-existing web divergences** the port surfaced: solo's shake **re-rolled** the dice (now reveals); bot **auto-threw** every round (now covered → user-triggered, restoring 仪式感); the room cup couldn't re-cover (now full cover/re-peek cycle).
- **Multipass review** (4-dim + adversarial verify, 10 findings fixed): SR-only hand announcer moved INSIDE MyHand + gated on `revealed` (the room's external `aria-live` leaked the covered hand to screen readers; now uniform across modes); solo re-roll one-frame reveal flash killed via `useLayoutEffect` reset; throw cue moved to tumble-START + kept under reduced motion (was at land + silent); dead `audio.shake`/`.dice2d-root` removed; 10 orphaned i18n keys deleted + a new `messages-parity` test guards zh/en drift; iOS hint shows tap-only until the gyro is actually armed (`canShake`).

Done (2026-06-12 — player-feedback R3, 11-issue batch; branch `feat/player-feedback-2026-06-12`, 102 unit + 34 e2e green; full triage + decisions in `docs/plans/2026-06-12-player-feedback-r3.md`):

- **#3 round-2 freeze (CRITICAL)**: `Dice2D` had one effect early-return that didn't clear `tumbling` → on a round advance whose new hand matched the previous, the dice spun forever. Now every exit path settles. Regression test in `tests/dice2d.test.ts`.
- **#1 斋叫 discount → `prev−1`** (was `ceil(prev/2)`): `validate.ts` 转斋 tightened; reason `zhai_count_too_low`; BidPanel error + i18n; spec §10B synced. The 斋 toggle was also made a prominent amber switch (the real reason a player thought zhai was missing).
- **#2 game-end modes**: `endMode` enum (`attrition` default / `party` / `knockout` / `score`) replaces the dead `loseDie` flag — `applyLoss` records `Player.lossCount` + applies the per-mode consequence, `finalize` branches winner/game-end on the mode. Zod `.default()` back-compat + `normalizeState` backfill. **CustomizationDrawer 结算模式 selector + N (knockout) / K (score) steppers**.
- **#9 dice → real 3D**: `Dice2D` rebuilt as a CSS 3D cube (perspective + preserve-3d, transition-driven spin+land); shared `PipDie` SVG replaces the literal emoji glyphs ⚀⚁⚂ in reveal/bid/chain. Zero bundle, no WebGL.
- **#6 人机模式** (new `/bot`): LOCAL single-device game — pure `lib/bot/policy.ts` (binomial decision, prefers 飞, can 破斋; 3 difficulties) drives the SAME engine via `lib/bot/local-game.ts`; `BotClient` reuses room components. Zero backend. **#7**: home offline entries promoted to real buttons.
- **#4/#5/#8/#10/#11 room UX**: visible turn-instruction banner; prominent current-call hero (count × `PipDie`); **开盅 cup ritual** (each round the dice start covered; shake/tap reveals with a tumble — the previously-feedback-only shake detector now opens the cup); a stable waiting card (no bid-panel collapse); clearer game-end controls.
- **Multipass review** (4-dim + adversarial verify) found & fixed 5: rematch Lua now resets `lossCount` (else knockout/score rematch carried losses); score-mode `lowestLossIdx` skips departed players; bot can no longer be forced to always 开 against a 斋 bid; endMode active desc contrast; lint.

Done (2026-06-12 — UI/UX redesign to wxapp design language; branch `redesign/match-wxapp`, 83 unit + 32 e2e green):

- **4-theme system removed** (modern-minimal / classic-bar / hk-neon / cartoon, tokens.ts, 5 Google fonts, theme switcher UI, `themes.*` i18n keys) → single wxapp design language: gray-50/900 surfaces, white/gray-800 cards, red-600 primary, amber secondary, emerald-700 bid/share. All `style={{tokens.colors.*}}` inline styles → Tailwind classes.
- **dark/light dual mode**: follow-system + manual 3-state pill (跟随系统→深色→浅色, `localStorage['theme-mode']`, wxapp `useThemeMode` parity); `dark` class on `<html>` + Tailwind v4 `@custom-variant dark`; pre-paint inline script kills the flash; `viewport.themeColor` light/dark pair.
- **wxapp feature parity ports** (its commits 71912fb/1e4b43e/04f60f3/dde8bd6): hand-summary chips under the dice (pure per-face counts incl 1s — `lib/game/hand-summary.ts`, keep in sync with wxapp `lib/handSummary.ts`); diceCount 3-10 grid in the drawer (Zod widened to 10 in lockstep with the wxapp cloud fn); 8-sided UI option cut from drawer+solo (engine/schema still accept 6|8; `dice-sides.spec` removed with it); solo count grid 1-10; dice 60→72px.
- **a11y kept** (wxapp has none of this, web must): keyboard play, ARIA roles/labels, focus trap, reduced-motion, 44px targets, axe wcag2aa green — palette darkened one step where wxapp's raw shades fail 4.5:1 (red-500→600 buttons, emerald-600→700, gray-400→500/600 muted text, amber-600→700/800).
- Home `theme` no longer sent to `/api/room`//api/session` (server `sanitizeTheme` defaults it; backend untouched).

Done (2026-06-11 — dead-code cleanup): removed the unused `/api/events/[code]` since-ID replay endpoint (no caller anywhere — reconnect uses `/full` refetch) and dropped the per-mutation `XADD`+`EXPIRE` to `room:{code}:events` from every Lua script (kept `PUBLISH`, which is a separate Redis namespace and drives the SSE pipe). `room:{code}:events` is now a pure pub/sub channel, no persisted stream. Realtime sync unaffected (verified via the audit harness).

Done (2026-06-10 — round-2 audit + solo mode; branch `fix/playability-audit-r2-2026-06-09`, 79 unit + 32 e2e green ×2):

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

Lower-priority / deliberate cuts (documented): app-layer hand encryption (auth-gating is sufficient — see spec §17), `Save-Data`, full forced-colors theming, orthographic camera (perspective kept), curated CC0 audio for the remaining 7 sprite slots (settle got a real CC0 sample 2026-06-12; synth sprites stay off by default).

## Reference docs

- `docs/specs/2026-05-21-dahua-dice-design.md` — 848-line design contract (5→9/10 design-review)
- `docs/plans/2026-05-21-dahua-dice-plan.md` — 12-phase implementation plan
- `docs/research/` — 4 subagent research docs (game rules, Upstash, R3F, audio) + `2026-06-11-wechat-miniprogram-port.md` (小程序版调研：体验版合规路线 + 架构映射 + 开工 checklist)
- `~/.claude/projects/-Users-xingfanxia-projects/memory/project_dahua_dice.md` — durable agent memory
- `~/.claude/projects/-Users-xingfanxia-projects/memory/feedback_vercel_team_scope.md` — Vercel scope rule (saved this session)
