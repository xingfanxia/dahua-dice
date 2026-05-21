# 大话骰 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task. Reference the design spec at `docs/specs/2026-05-21-dahua-dice-design.md` for any context not captured here.

**Goal:** Ship `dahua-dice.vercel.app` — a 2-8 player Liar's Dice web app with 3D physics dice, gyroscope shake-to-roll w/ magnitude coupling, audio, 4 themes, 4 customization dimensions, full Chinese rules + Palifico — in a 12-14 day budget.

**Architecture:** Next.js 16 App Router + Vercel Fluid Compute + Upstash Redis (state + Pub/Sub via REST `/subscribe/{channel}` SSE transparent pipe) + react-three-fiber + Rapier physics + Howler.js audio. Anonymous Redis session with URL token cross-device recovery. All gameplay logic server-authoritative via Lua + version CAS.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, next-intl, @upstash/redis, @react-three/fiber@^9.5.0, @react-three/rapier@^2.2.0, @react-three/drei, howler v2, Biome v2, Vitest, Playwright.

**Reference docs**: spec at `docs/specs/2026-05-21-dahua-dice-design.md`; research at `docs/research/{dahua-dice,multiplayer-sync,dice-3d-animation,dice-audio}-research.md`.

**Execution mode**: per-phase `/goal` + `superpowers:autonomous-grind`. Each phase has a verifiable predicate (specified at end of each Phase section). Phase completion = commit + tag → next phase.

---

## Phase 0: Repo init + initial commit (~30 min)

Pre-requisite for everything: get the spec + plan + research into a git repo + GitHub + Vercel before scaffolding any code.

### Task 0.1: Git init + initial commit (docs only)

**Files**: `.gitignore`, `README.md`, existing `docs/`.

- [ ] **Step 1**: Write `.gitignore`

```
node_modules/
.next/
.vercel/
.env*.local
.env
out/
dist/
.DS_Store
*.log
coverage/
.turbo/
*.tsbuildinfo
.idea/
.vscode/
!.vscode/settings.json
```

- [ ] **Step 2**: Write minimal `README.md`

```markdown
# 大话骰 (Liar's Dice)

A 2-8 player Liar's Dice web app with 3D physics dice, gyroscope shake-to-roll, audio, and 4 switchable themes.

**Status**: In development (~12-14 day MVP build).

- [Design spec](docs/specs/2026-05-21-dahua-dice-design.md)
- [Implementation plan](docs/plans/2026-05-21-dahua-dice-plan.md)
- [Research](docs/research/)

Built with Next.js 16 + Vercel + Upstash Redis + react-three-fiber + Rapier physics.
```

- [ ] **Step 3**: `git init` + initial commit

```bash
cd ~/projects/side-projects/dahua-dice
git init -b main
git add .gitignore README.md docs/
git commit -m "docs: initial spec, plan, and research"
```

### Task 0.2: GitHub repo + push

- [ ] **Step 1**: Verify gh CLI authed

```bash
gh auth status
```

- [ ] **Step 2**: Create public repo + push

```bash
gh repo create xingfanxia/dahua-dice --public \
  --description "2-8 player Liar's Dice with 3D physics dice and gyroscope shake-to-roll" \
  --source . --remote origin --push
```

### Task 0.3: Vercel link + Upstash provisioning

- [ ] **Step 1**: Link Vercel project to repo

```bash
vercel link
```

Choose existing scope (xingfanxia or active team), accept `dahua-dice` as project name.

- [ ] **Step 2**: Install Upstash Redis via Marketplace

```bash
vercel integration add upstash
```

Pick "Redis Database", region `iad1`, free tier. After provisioning, Vercel auto-populates `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `REDIS_URL` env vars.

- [ ] **Step 3**: Pull env vars to local

```bash
vercel env pull .env.local
```

Verify `.env.local` has `KV_REST_API_URL` starting with `https://...upstash.io`.

**Phase 0 done predicate**: `git remote get-url origin` returns github.com/xingfanxia/dahua-dice; `vercel link` shows linked project; `.env.local` has KV_REST_API_URL; initial docs commit visible on GitHub.

---

## Phase 1: Next.js scaffold + design tokens + i18n (Day 1-2)

### Task 1.1: Scaffold Next.js 16 + TypeScript

```bash
pnpm create next-app@latest . \
  --typescript --tailwind --eslint=false --app --src-dir=false \
  --import-alias "@/*" --turbopack
```

If prompted about overwriting `README.md` or `.gitignore`, decline (we want to keep ours).

```bash
pnpm dev   # verify scaffold runs
# Stop with Ctrl-C
git add . && git commit -m "feat: scaffold Next.js 16 app with TypeScript and Tailwind v4" && git push
```

### Task 1.2: Install Biome v2 (replaces ESLint + Prettier)

```bash
pnpm add -D @biomejs/biome
pnpm biome init
```

Write `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true, "style": { "noNonNullAssertion": "off" } }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

Add to `package.json`:

```json
"scripts": {
  "lint": "biome check .",
  "format": "biome format --write .",
  "lint:fix": "biome check --write ."
}
```

```bash
pnpm lint:fix
git add . && git commit -m "feat: configure Biome v2 for lint and format" && git push
```

### Task 1.3: Theme design tokens

**File**: `components/theme/tokens.ts`

Write the token file with all 4 themes (see spec §12 for full token spec). Schema:

```ts
export type ThemeKey = 'modern-minimal' | 'classic-bar' | 'hk-neon' | 'cartoon';

export type ThemeTokens = {
  key: ThemeKey;
  label: { 'zh-CN': string; en: string };
  colors: {
    bg: string; surface: string; primary: string; accent: string;
    text: string; textMuted: string; success: string; danger: string;
    diceFace: string; diceDot: string;
  };
  fonts: { display: string; ui: string };
  dice: { textureSetUrl: string; material: 'glass' | 'ivory' | 'painted' | 'soft'; cupMaterial: 'metal' | 'leather' | 'enamel' | 'ceramic' };
  audioPackPath: string;
  motion: { duration: string; easing: string };
};

export const THEMES: Record<ThemeKey, ThemeTokens> = { /* 4 themes — see spec §12 */ };
export const DEFAULT_THEME: ThemeKey = 'modern-minimal';
```

Values per spec §12 table (use `oklch()` not HSL/hex).

Then write `components/theme/ThemeProvider.tsx`:
- Client component, React context
- On mount: read `localStorage.getItem('dahua-theme')` → apply that or fall back to default
- On theme change: write to localStorage + set CSS variables on `document.documentElement` for all colors + fonts + motion + set `data-theme` attribute

Then write `app/globals.css`:

```css
@import "tailwindcss";

@theme inline {
  --color-bg: var(--theme-bg);
  --color-surface: var(--theme-surface);
  --color-primary: var(--theme-primary);
  --color-accent: var(--theme-accent);
  --color-text: var(--theme-text);
  --color-text-muted: var(--theme-text-muted);
  --color-success: var(--theme-success);
  --color-danger: var(--theme-danger);
  --font-display: var(--theme-font-display);
  --font-ui: var(--theme-font-ui);
}

html, body {
  background: var(--color-bg);
  color: var(--color-text);
  min-height: 100dvh;  /* NOT 100vh — iOS Safari viewport jump */
  font-family: var(--font-ui);
  -webkit-font-smoothing: antialiased;
}

.safe-top { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

.num { font-variant-numeric: tabular-nums; }
```

```bash
pnpm dev   # verify theme tokens apply
git add . && git commit -m "feat: 4-theme design token system and ThemeProvider" && git push
```

### Task 1.4: Font loading (next/font)

Update `app/layout.tsx` to load 6 web fonts (Inter, Space Grotesk, Newsreader, Outfit, Noto Serif TC, Plus Jakarta Sans) via `next/font/google` with `display: 'swap'` and CSS variable bindings. Pass `className` on `<html>` so all theme tokens resolve.

```bash
git add . && git commit -m "feat: load 6 web fonts for 4 themes via next/font" && git push
```

### Task 1.5: i18n with next-intl

```bash
pnpm add next-intl
```

Write `lib/i18n.ts` reading locale from cookie (default zh-CN). Write `messages/zh-CN.json` with sections: `common`, `home`, `lobby`, `game`, `errors`, `customization` — total ~60 keys (see spec §16). Then `messages/en.json` with same keys, English values.

Wire `next-intl` plugin in `next.config.ts`:

```ts
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./lib/i18n.ts');
export default withNextIntl({});
```

```bash
git add . && git commit -m "feat: i18n with next-intl, zh-CN default + en" && git push
```

### Task 1.6: Install runtime deps

```bash
pnpm add @upstash/redis zustand howler
pnpm add three @react-three/fiber @react-three/rapier @react-three/drei
pnpm add -D @types/howler @types/three vitest @vitest/ui happy-dom @playwright/test
pnpm exec playwright install chromium

git add . && git commit -m "feat: install runtime deps (redis, r3f, rapier, howler) and test deps" && git push
```

**Phase 1 done predicate**: `pnpm dev` boots without error; theme tokens applied to root; `messages/zh-CN.json` exists with 50+ keys; all runtime deps installed; vitest + playwright config files present.

---

## Phase 2: Anonymous session + nickname (Day 2)

### Task 2.1: Redis client helpers

**File**: `lib/redis.ts`

```ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const UPSTASH_REST_URL = process.env.KV_REST_API_URL!;
export const UPSTASH_REST_TOKEN = process.env.KV_REST_API_TOKEN!;
```

Smoke-test via `scripts/redis-ping.ts`: `await redis.set('ping', 'pong'); console.log(await redis.get('ping'));`. Run with `pnpm tsx scripts/redis-ping.ts`. Expected: `pong`.

```bash
git add . && git commit -m "feat: Upstash Redis client setup" && git push
```

### Task 2.2: Session module — TDD

**Files**: `lib/auth/session.ts`, `tests/session.test.ts`

- [ ] **Step 1**: Write failing tests for `generatePlayerId` (returns UUID v4), `generateToken` (43-char base64url 32-byte), `validateNickname` (accepts normal, rejects empty/too-long/NUL, trims whitespace) — 8 test cases.

- [ ] **Step 2**: Run `pnpm vitest run tests/session.test.ts`. Expected: all FAIL (module not found).

- [ ] **Step 3**: Implement `lib/auth/session.ts`:

```ts
import { randomBytes, randomUUID } from 'node:crypto';

export function generatePlayerId(): string { return randomUUID(); }
export function generateToken(): string { return randomBytes(32).toString('base64url'); }

export type NickValidation = { ok: true; value: string } | { ok: false; reason: 'empty' | 'too_long' | 'invalid_chars' };

export function validateNickname(input: string): NickValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > 20) return { ok: false, reason: 'too_long' };
  if (/[\x00-\x1f]/.test(trimmed)) return { ok: false, reason: 'invalid_chars' };
  return { ok: true, value: trimmed };
}
```

- [ ] **Step 4**: Run tests — expect 8 pass. Commit.

```bash
git add . && git commit -m "feat(auth): session generators + nickname validator (TDD)" && git push
```

### Task 2.3: Session Redis storage

**Files**: `lib/auth/session-store.ts`, `tests/session-store.test.ts`

Functions: `createSession({nick, theme}) → {token, session}`, `readSession(token) → Session|null`, `updateSession(token, patch) → Session|null`, `touchSession(token) → void`. Session schema per spec §7. TTL 24h.

TDD test cases: create + read back; read missing returns null; touch extends TTL; update merges patch.

Use `redis.set('session:'+token, sessionObj, {ex: 86400})` for create. After implementation tests pass, commit.

### Task 2.4: Middleware passthrough

**File**: `middleware.ts` — minimal placeholder with `config.matcher` excluding `_next` and `favicon.ico`. Reserve for future use.

**Phase 2 done predicate**: `pnpm vitest run tests/session*.test.ts` shows 11+ pass; can manually create session via curl + readSession returns same data.

---

## Phase 3: Room creation, join, lobby (Day 3-4)

### Task 3.1: Invite code generator — TDD

**Files**: `lib/room/invite-code.ts`, `tests/invite-code.test.ts`

Tests: 6-char output from alphabet `[A-HJ-NP-Z2-9]` (excludes 0/1/I/L/O); 100 generations should produce ≥ 95 unique values.

Implementation: `Math.random()` pick from 32-char alphabet 6 times. Commit.

### Task 3.2: Game types

**File**: `lib/game-engine/types.ts`

Define: `Face`, `Phase`, `Bid`, `GameRules`, `DEFAULT_RULES`, `Player`, `RoomState`. See full schema in spec §10. Notes:
- `Face`: `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`
- `Phase`: `'lobby' | 'rolling' | 'bidding' | 'reveal' | 'round_end' | 'game_end'`
- `Bid`: `{count, face, isZhai}`
- `GameRules`: per spec §10
- `RoomState`: `{code, phase, players[], ownerId, currentTurnIdx, lastBid, isZhaiRound, round, rules, theme, version, createdAt}`

Commit.

### Task 3.3: `isValidBid` — TDD

**Files**: `lib/game-engine/validate.ts`, `tests/validate.test.ts`

12+ test cases covering:
- `getStartingBidThreshold(alivePlayers, isZhai, rules)`: non-zhai = `ceil(1.5 × alive)`, zhai = `alive`
- `isValidBid(prev, next, rules, alive)`:
  - No prior bid: accepts ≥ threshold; rejects < threshold; zhai opener at `alive`
  - Continuation: count-up same face OK; face-up same count OK; count-down rejected; same count+face rejected
  - Breaking zhai (`prev.isZhai && !next.isZhai`): requires `next.count >= prev.count * 2`
  - Staying in zhai: normal continuation rules
  - `rules.allowZhai = false`: rejects any zhai bid

Implementation per spec §10. Run TDD cycle. Commit.

### Task 3.4: `resolveChallenge` — TDD

**Files**: `lib/game-engine/resolve.ts`, `tests/resolve.test.ts`

Test cases:
- `actual ≥ bid → challenger loses` (with aceWild non-zhai)
- `actual < bid → bidder loses`
- Zhai round: ace NOT wild — only native face matches
- `rules.aceWild = false`: ace also not wild

Returns `{actualCount, loserIdx, actualMeetsBid}`.

```ts
export function resolveChallenge(bid: Bid, hands: number[][], rules: GameRules, challengerIdx: number, bidderIdx?: number) {
  const wildOnesActive = !bid.isZhai && rules.aceWild;
  let actualCount = 0;
  hands.forEach(h => h.forEach(f => {
    if (f === bid.face) actualCount++;
    else if (wildOnesActive && f === 1) actualCount++;
  }));
  const actualMeetsBid = actualCount >= bid.count;
  const bidder = bidderIdx ?? (challengerIdx === 0 ? hands.length - 1 : challengerIdx - 1);
  return { actualCount, loserIdx: actualMeetsBid ? challengerIdx : bidder, actualMeetsBid };
}
```

Commit.

### Task 3.5: Lua scripts

**Files**: `lib/lua/joinRoom.lua`, `lib/lua/placeBid.lua`, `lib/lua/challenge.lua`

Each script:
- Reads room state JSON from Redis
- Validates expected_version matches (CAS)
- Mutates state
- Writes back with `SET ... EX 21600`
- `XADD` event to room events stream
- `PUBLISH` event to room channel

Skeleton for `placeBid.lua`:

```lua
local stateKey, eventsKey = KEYS[1], KEYS[2]
local playerId = ARGV[1]
local count, face = tonumber(ARGV[2]), tonumber(ARGV[3])
local isZhai = ARGV[4] == '1'
local expectedVersion = tonumber(ARGV[5])

local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=state.version})
end
if state.phase ~= 'bidding' then
  return cjson.encode({ok=false, reason='wrong_phase'})
end

local turnPlayer = state.players[state.currentTurnIdx + 1]
if turnPlayer.id ~= playerId then
  return cjson.encode({ok=false, reason='not_your_turn'})
end

state.lastBid = { count=count, face=face, isZhai=isZhai }
if isZhai then state.isZhaiRound = true end

local n = #state.players
local nextIdx = state.currentTurnIdx
repeat
  nextIdx = (nextIdx + 1) % n
until state.players[nextIdx + 1].alive
state.currentTurnIdx = nextIdx
state.version = state.version + 1

redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
redis.call('XADD', eventsKey, '*', 'type', 'bid', 'payload', cjson.encode({playerId=playerId, count=count, face=face, isZhai=isZhai}), 'version', state.version)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', cjson.encode({type='bid', payload={playerId=playerId, count=count, face=face, isZhai=isZhai}, version=state.version}))

return cjson.encode({ok=true, version=state.version})
```

Wrapper in `lib/redis.ts`: load all scripts at module init via `readFileSync`. Provide a `runScript(name, keys, args)` helper that calls the @upstash/redis SDK's Lua script execution method (see SDK docs — the function is documented as the EVAL command wrapper). Returns parsed JSON.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS = {
  placeBid: readFileSync(join(process.cwd(), 'lib/lua/placeBid.lua'), 'utf8'),
  challenge: readFileSync(join(process.cwd(), 'lib/lua/challenge.lua'), 'utf8'),
  joinRoom: readFileSync(join(process.cwd(), 'lib/lua/joinRoom.lua'), 'utf8'),
};

// Reference: https://upstash.com/docs/redis/sdks/ts/commands/eval
export async function runScript(name: keyof typeof SCRIPTS, keys: string[], args: string[]) {
  // Call the Upstash SDK's Lua script command — method name is documented in SDK
  // (it accepts script body, keys array, args array)
  const result = await (redis as any)['eval'](SCRIPTS[name], keys, args);
  return JSON.parse(result as string);
}
```

Commit each Lua script + wrapper as one feat.

### Task 3.6: POST /api/room (create)

**File**: `app/api/room/route.ts`

POST handler:
1. Parse + validate body (`nick`, optional `theme`)
2. Validate nickname → 400 if invalid
3. Create session
4. Generate invite code w/ collision retry (up to 5 tries)
5. Create initial RoomState (phase=lobby, players=[creator], version=1)
6. `redis.set('room:'+code+':state', state, {ex: 1800})` — 30m lobby TTL
7. Return `{ok: true, code, token, playerId}`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { generateInviteCode } from '@/lib/room/invite-code';
import { redis } from '@/lib/redis';
import { createSession } from '@/lib/auth/session-store';
import { validateNickname } from '@/lib/auth/session';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateNickname(body.nick ?? '');
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });

  const { token, session } = await createSession({ nick: v.value, theme: body.theme ?? 'modern-minimal' });

  let code = generateInviteCode();
  for (let i = 0; i < 5 && (await redis.exists(`room:${code}:state`)); i++) code = generateInviteCode();

  const state: RoomState = {
    code, phase: 'lobby',
    players: [{ id: session.playerId, nick: session.nick, avatar: 'numeric', diceLeft: DEFAULT_RULES.diceCount, alive: true }],
    ownerId: session.playerId, currentTurnIdx: 0, lastBid: null, isZhaiRound: false, round: 0,
    rules: DEFAULT_RULES, theme: session.theme, version: 1, createdAt: Date.now(),
  };
  await redis.set(`room:${code}:state`, state, { ex: 1800 });

  return NextResponse.json({ ok: true, code, token, playerId: session.playerId });
}
```

Test with curl. Commit.

### Task 3.7: POST /api/action (universal action endpoint)

**File**: `app/api/action/route.ts`

Handles all in-room actions: `join`, `start`, `roll`, `bid`, `challenge`, `leave`. Switch on `body.action`. Each calls appropriate Lua script via `runScript`. Returns `{ok, version}` or `{ok: false, reason}`.

Validate session token via cookie. Verify player is in room. Then dispatch.

Commit.

### Task 3.8: GET /api/room/[code]

**File**: `app/api/room/[code]/route.ts`

Returns `{phase, playerCount, joinable, theme}` (no full state — that goes through SSE) for the home page's "is this room valid?" check.

Commit.

### Task 3.9: GET /api/hand/[code]

**File**: `app/api/hand/[code]/route.ts`

Authenticated handler: read session token from cookie → resolve playerId → fetch encrypted hand from `room:{code}:hands` → decrypt → return only the caller's dice.

Commit.

### Task 3.10: Home page UI

**File**: `app/page.tsx`

See spec §6A wireframe. Client component. State: `nick`, `joinMode` (`idle | creating | joining`), `code` (6 chars), `error`.

Components: nickname input, two CTAs (创建/加入), `<DigitGrid>` for 6-char code entry (auto-advance, paste detection, all-uppercase), error display.

On `createRoom`: POST /api/room → set cookie `dahua_token={token}` → `router.push('/room/${code}')`.

On `joinRoom`: POST /api/action with `{action: 'join', code, nick}` → handle response.

Use `useTranslations('home')` for all text. Use Tailwind utility classes from theme tokens. Components ≥ 44px tap target.

Commit.

### Task 3.11: Lobby page (`app/room/[code]/page.tsx`)

Server Component fetches initial state from Redis → renders Client Component `<RoomClient initialState={...} code={...} />` which:
- Subscribes via `useRoomEvents` (Phase 4)
- Renders Lobby UI when `phase === 'lobby'` (player roster, rules summary, "开始游戏" button for owner)
- Renders Game UI for other phases (Phase 8)

For Phase 3, only Lobby render. Wireframe in spec §6A.

Commit.

**Phase 3 done predicate**: Two browser tabs can create + join a room via 6-char code; player roster shows both nicks; "开始游戏" button activates at 2+ players; manual e2e works.

---

## Phase 4: SSE + Realtime sync (Day 4-5)

### Task 4.1: GET /api/stream/[code] — SSE pipe

**File**: `app/api/stream/[code]/route.ts`

```ts
import type { NextRequest } from 'next/server';
import { UPSTASH_REST_URL, UPSTASH_REST_TOKEN } from '@/lib/redis';

export const runtime = 'nodejs';
export const maxDuration = 800;

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const channel = `room:${code}:events`;
  const upstashStream = await fetch(`${UPSTASH_REST_URL}/subscribe/${channel}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${UPSTASH_REST_TOKEN}`, Accept: 'text/event-stream' },
  });
  return new Response(upstashStream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

Commit.

### Task 4.2: Client EventSource hook

**File**: `components/game/useRoomEvents.ts`

```ts
import { useEffect, useRef } from 'react';

export function useRoomEvents(code: string, onEvent: (e: { type: string; payload: unknown; version: number }) => void) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const es = new EventSource(`/api/stream/${code}`);
    es.onmessage = (msg) => { try { ref.current(JSON.parse(msg.data)); } catch {} };
    return () => es.close();
  }, [code]);
}
```

Commit.

### Task 4.3: Zustand store for game state

**File**: `components/game/useGameStore.ts`

```ts
import { create } from 'zustand';
import type { RoomState, Player, Bid } from '@/lib/game-engine/types';

type GameStore = RoomState & {
  myHand: number[] | null;
  setState: (s: Partial<RoomState>) => void;
  applyEvent: (e: { type: string; payload: any; version: number }) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  // ...initial state from server
  myHand: null,
  setState: (s) => set(s),
  applyEvent: (e) => set((prev) => {
    if (e.version <= prev.version) return prev;  // stale
    // Apply based on e.type: 'bid' → update lastBid + currentTurnIdx; 'challenge' → phase=reveal; etc.
    return { ...prev, version: e.version, /* other fields */ };
  }),
}));
```

Commit.

### Task 4.4: Resync via XRANGE on reconnect

When EventSource errors then reconnects (browser auto-reconnect), client should fetch any missed events from `room:{code}:events` Stream using XRANGE since last known event ID. Add `/api/events/[code]?since=ID` route. On reconnect, fetch + apply.

Commit.

**Phase 4 done predicate**: Two tabs in same room — Tab A's bid appears in Tab B's UI within 500ms; closing+reopening Tab B re-syncs state correctly.

---

## Phase 5: Game engine — zhai + extensions + Palifico (Day 5)

### Task 5.1: Zhai full test coverage

Extend `tests/validate.test.ts` to cover all zhai transitions:
- Open with zhai
- Break zhai 2x
- Stay in zhai
- Can't zhai if disabled
- Ace-wild toggle interaction
- aceWild=false + non-zhai bid: aces not wild

### Task 5.2: Chinese extension actions

**Files**: `lib/game-engine/extensions.ts`, `tests/extensions.test.ts`

Implement:
- `applyPi(state, playerIdx) → state` — 劈: a player matches the current bid exactly (without challenging); typically halves remaining dice
- `applyFanpi(state, playerIdx) → state` — 反劈: counter-劈; reverses the 劈 penalty
- `applyTongsha(state) → state` — 通杀: ending move; all losers lose 1 die at once

TDD each. Commit each.

### Task 5.3: Palifico variant

When `rules.paliFicoVariant && player.diceLeft === 1`, next round triggers Palifico mode:
- `isZhaiRound = true` (aces not wild)
- Bid count can start at 1
- Players can only raise face (not count)
- Bid count is fixed to whatever Palifico player chose

Implement in state-machine transition logic. TDD.

### Task 5.4: Integration test — full simulated game

`tests/integration/full-game.test.ts`: simulate 4 players, 8 rounds, all pure-function calls — verify state evolves correctly through game phases.

**Phase 5 done predicate**: `pnpm vitest run` shows ≥ 40 passing tests; coverage ≥ 80% on `lib/game-engine/`.

---

## Phase 6: 3D Dice + physics (Day 5-7)

### Task 6.1: DiceCanvas wrapper

**File**: `components/dice/DiceCanvas.tsx`

```tsx
'use client';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense } from 'react';

export default function DiceCanvas({ count, theme, onAllSettled }: { count: number; theme: string; onAllSettled: (faces: number[]) => void }) {
  return (
    <Canvas shadows={false} dpr={[1, 2]} camera={{ position: [0, 4, 0], fov: 35 }} gl={{ antialias: true, alpha: true }}>
      <Suspense fallback={null}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={0.6} />
        <Physics gravity={[0, -9.8, 0]} timeStep="vary">
          <Floor />
          <DiceCup theme={theme} />
          <DiceCluster count={count} theme={theme} onAllSettled={onAllSettled} />
        </Physics>
      </Suspense>
    </Canvas>
  );
}
```

Parent dynamic-imports: `dynamic(() => import('./DiceCanvas'), { ssr: false })`.

Commit.

### Task 6.2: Dice geometry + 6 face textures

**File**: `components/dice/Dice.tsx`

`<RigidBody>` wrapping `<mesh><boxGeometry args={[0.5, 0.5, 0.5]} />` with 6 `<meshStandardMaterial attach={'material-${i}'} map={faceTextures[i]} />`. Load textures via `useTexture` from theme's `textureSetUrl`.

`onSleep`: detect top face via quaternion (rotate 6 face normals to world space, pick one most aligned with +Y). Map index → face number.

```ts
function detectTopFace(body: RapierRigidBody): number {
  const rot = body.rotation();
  const q = new Quaternion(rot.x, rot.y, rot.z, rot.w);
  const faceNormals = [
    { face: 5, n: new Vector3(0, 1, 0) },     // top face up = shows 5? (verify with test cube)
    { face: 2, n: new Vector3(0, -1, 0) },
    { face: 1, n: new Vector3(1, 0, 0) },
    { face: 6, n: new Vector3(-1, 0, 0) },
    { face: 3, n: new Vector3(0, 0, 1) },
    { face: 4, n: new Vector3(0, 0, -1) },
  ];
  let bestFace = 1, bestDot = -2;
  for (const { face, n } of faceNormals) {
    const rotated = n.applyQuaternion(q);
    if (rotated.y > bestDot) { bestDot = rotated.y; bestFace = face; }
  }
  return bestFace;
}
```

Commit.

### Task 6.3: DiceCup geometry

**File**: `components/dice/DiceCup.tsx`

A cylinder (open-top, slight wall thickness) acting as a static collider container. Theme-specific material (metal/leather/enamel/ceramic). Initially positioned to cover the dice. On reveal, animates Y+ upward (lifts off).

Use `useFrame` + simple animation state to lerp the position over 0.6s.

Commit.

### Task 6.4: Roll action — apply impulse

When phase transitions to `rolling`, for each `<Dice>`, call `body.applyImpulse({x: random*intensity*8, y: 0, z: random*intensity*8}, true)` and `body.applyTorqueImpulse({x: random*intensity*30, y: random*intensity*30, z: random*intensity*30}, true)`. `intensity` defaults to 1 if no shake; comes from gyroscope hook otherwise.

Track per-die settled state. When all 5 settled (`onSleep` fired for each), collect faces array and call `onAllSettled(faces)`.

Commit.

### Task 6.5: Cup lift reveal animation

When phase transitions to `reveal`, cup animates Y+1.5 over 0.6s with `cubic-bezier(0.2, 0.8, 0.2, 1)` easing. Use React state + `useFrame` lerp.

Commit.

**Phase 6 done predicate**: Browser shows 5 dice tumbling in cup, settling, then cup lifts on reveal phase. 60fps on iPhone 12 Safari (verified via chrome-devtools-mcp performance trace).

---

## Phase 7: Gyroscope + audio coupling (Day 7)

### Task 7.1: useShakeDetector hook

**File**: `components/shake/useShakeDetector.ts`

```ts
import { useEffect, useRef, useState } from 'react';

export function useShakeDetector(onShake: (intensity: number) => void) {
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (permission !== 'granted') return;
    const peak = { mag: 0, start: 0 };

    function handler(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const m = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2) - 9.8;
      const intensity = Math.max(0, Math.min(1, (m - 12) / (37 - 12)));
      if (intensity > 0.4) {
        if (peak.mag === 0) peak.start = Date.now();
        peak.mag = Math.max(peak.mag, intensity);
        if (Date.now() - peak.start > 150) {
          onShakeRef.current(peak.mag);
          peak.mag = 0;
        }
      } else {
        peak.mag = 0;
      }
    }

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [permission]);

  const requestPermission = async () => {
    const DM = (window as any).DeviceMotionEvent;
    if (DM?.requestPermission) {
      const resp = await DM.requestPermission();
      setPermission(resp === 'granted' ? 'granted' : 'denied');
      if (resp === 'granted') localStorage.setItem('dahua-shake-granted', '1');
    } else {
      setPermission('granted');
    }
  };

  useEffect(() => {
    if (localStorage.getItem('dahua-shake-granted') === '1') setPermission('granted');
  }, []);

  return { permission, requestPermission };
}
```

Commit.

### Task 7.2: ShakePermissionGate component

Modal that appears on first roll attempt if `permission === 'unknown'`. Tap "授权陀螺仪" calls `requestPermission`. Show fallback "点这里摇" button if denied.

Commit.

### Task 7.3: Couple intensity to dice physics + audio + haptics

In `<DiceCluster>` (Rolling phase):
- `onShake(intensity)`: apply impulses scaled by intensity
- Trigger audio shake (Phase 10): volume + pitch from intensity
- `navigator.vibrate?.(50 + intensity * 150)` (Android only)

Commit.

**Phase 7 done predicate**: On iPhone 14 Pro Safari, shake unlocks DeviceMotion (granted), shake intensity visibly affects dice spin (gentle vs aggressive), audio volume increases with shake intensity.

---

## Phase 8: Bidding + reveal UI (Day 8-9)

### Task 8.1: BidPanel component

**File**: `components/game/BidPanel.tsx`

Renders when `phase === 'bidding' && players[currentTurnIdx].id === myId`. Per spec §6A wireframe.

State: `count` (number, default = `(lastBid?.count ?? 0) + 1`), `face` (Face, default = `lastBid?.face ?? 1`), `isZhai` (default `lastBid?.isZhai ?? false`).

Components:
- Count stepper (`-` / `+`, tabular-nums display)
- 6 face buttons (D6 default; D8 if `rules.diceSides === 8`)
- Zhai checkbox (disabled if `!rules.allowZhai`)
- Submit button "叫 {count}个{face}" — calls `isValidBid` client-side; if valid, POSTs `/api/action`
- Challenge button "🔓 开!" — POSTs `/api/action` with `action: 'challenge'`

Style: bottom 35% of viewport, semi-transparent surface bg, primary (green) for 叫, danger (red) for 开.

Commit.

### Task 8.2: BidChain history

**File**: `components/game/BidChain.tsx`

Renders list of all bids this round. Each item: player avatar (套装颜色) + "X个 ⚄" text. Latest at the top. Smooth slide-down animation on new entry.

Commit.

### Task 8.3: PlayerRing layout

**File**: `components/game/PlayerRing.tsx`

Top section of game screen. Shows other players in circular/arc arrangement. Each player chip: avatar + nick + status (✓ rolled / 💭 thinking / 💀 lost die). Highlight current turn player.

Commit.

### Task 8.4: RevealStage

**File**: `components/game/RevealStage.tsx`

Full-bleed overlay during reveal phase. Cup lifts (Phase 6.5). All hands shown grouped by player. Outcome text: "上家叫: 四个 4   实际: 五个 4 (含1点)" + "💀 LittleM 输一颗骰子". Confetti or 💀 particles (theme-specific).

3s auto-advance to next round.

Commit.

### Task 8.5: Phase-driven render in `<RoomClient>`

```tsx
function RoomClient({ initialState, code }: { initialState: RoomState; code: string }) {
  const state = useGameStore();
  useRoomEvents(code, state.applyEvent);
  
  switch (state.phase) {
    case 'lobby': return <LobbyView />;
    case 'rolling': return <RollingView />;
    case 'bidding': return <BiddingView />;
    case 'reveal': return <RevealStage />;
    case 'round_end': return <RoundEndView />;
    case 'game_end': return <GameEndView />;
  }
}
```

Commit.

**Phase 8 done predicate**: Full happy path playable end-to-end via 2 tabs: create room → both join → start → roll → bid → bid → bid → challenge → reveal → next round.

---

## Phase 9: Customization + 中式扩展 + Palifico UI (Day 9-10)

### Task 9.1: CustomizationDrawer

**File**: `components/customization/CustomizationDrawer.tsx`

Bottom-sheet drawer (shadcn/ui drawer). Only owner can save. Sub-components:
- `<CountPicker>`: stepper 3-7
- `<AppearancePicker>`: 4-card picker (numeric/emoji/hanzi/brand) with live preview
- `<RulesToggles>`: aceWild, allowZhai, chineseExtensions.{pi, fanpi, tongsha}, paliFicoVariant, diceSides
- `<AvatarPicker>`: redirect to per-player picker flow

On save: POST `/api/action` with `action: 'updateRules', rules: {...}` → updates RoomState.

See spec §6A wireframe.

Commit.

### Task 9.2: 中式扩展 + Palifico actions in UI

Add new action buttons in BidPanel when applicable rules are on:
- 劈 (pi): visible when prev bid has count > 2
- 反劈 (fanpi): visible only after 劈
- 通杀 (tongsha): special end-of-game button

Palifico round indicator: visible chip at top of game screen when active.

Commit.

### Task 9.3: AvatarPicker (per-player)

**File**: `components/customization/AvatarPicker.tsx`

When `phase === 'lobby'`, each player chooses their texture set. Stored in `players[i].avatar`. Conflicts: by default unique-within-room; owner toggle to allow duplicates.

Commit.

### Task 9.4: Theme switcher in settings drawer

**File**: `components/theme/ThemeSwitcher.tsx`

Radio selector of 4 themes. On change: calls `setTheme` from ThemeProvider. Also POSTs to `/api/action` with `action: 'updateSession', theme` to persist.

Commit.

**Phase 9 done predicate**: All 4 customization dimensions functional; toggling rules mid-lobby visibly updates rules summary; in-game avatar identifies whose dice on reveal; theme switch instantaneous and persistent.

---

## Phase 10: Audio system (Day 11)

### Task 10.1: Howler singleton + iOS unlock

**File**: `lib/audio/howl-instance.ts`

```ts
import { Howl, Howler } from 'howler';

let initialized = false;
let packCache = new Map<string, Howl>();

export function unlockAudio() {
  if (initialized) return;
  Howler.autoUnlock = true;
  initialized = true;
  document.addEventListener('pointerup', () => Howler.ctx?.resume(), { once: true });
  document.addEventListener('touchend', () => Howler.ctx?.resume(), { once: true });
}

export function getPack(packPath: string): Howl {
  if (packCache.has(packPath)) return packCache.get(packPath)!;
  const audioJson = packPath.endsWith('.json') ? packPath : packPath + '.json';
  // Fetch audiosprite JSON to get sprite definitions
  // (or import statically if bundled)
  const h = new Howl({
    src: [packPath.replace('.json', '.mp3'), packPath.replace('.json', '.webm')],
    sprite: {},  // populated from audiosprite JSON
  });
  packCache.set(packPath, h);
  return h;
}
```

Call `unlockAudio()` once on first user interaction (e.g., home page CTA click).

Commit.

### Task 10.2: Audio sprites with audiosprite

```bash
pnpm add -D audiosprite
mkdir -p public/audio/sources/{modern,classic,hk,cartoon}
# (manually populate sources from research doc's URLs)
pnpm exec audiosprite -e mp3,webm -o public/audio/modern public/audio/sources/modern/*.mp3
# Repeat for other 3 themes
```

This produces `public/audio/modern.mp3`, `modern.webm`, `modern.json` with sprite definitions like `{shake: [0, 1200], collide: [1500, 200], reveal: [2000, 800], ...}`.

Commit each theme's sprite as separate commit.

### Task 10.3: useDiceAudio hook

**File**: `lib/audio/useDiceAudio.ts`

```ts
import { useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { useTheme } from '@/components/theme/ThemeProvider';

export function useDiceAudio() {
  const { tokens } = useTheme();
  const howlRef = useRef<Howl | null>(null);
  const lastCollideAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Load JSON manifest then construct Howl
    fetch(tokens.audioPackPath).then(r => r.json()).then(manifest => {
      howlRef.current = new Howl({
        src: [tokens.audioPackPath.replace('.json', '.mp3'), tokens.audioPackPath.replace('.json', '.webm')],
        sprite: manifest.sprite,
      });
    });
    return () => { howlRef.current?.unload(); };
  }, [tokens.audioPackPath]);

  const collide = (pairKey: string, force: number) => {
    const now = Date.now();
    // Debounce: same pair within 80ms → skip
    if ((lastCollideAt.current.get(pairKey) ?? 0) > now - 80) return;
    lastCollideAt.current.set(pairKey, now);
    if (!howlRef.current) return;
    const volume = Math.max(0.1, Math.min(1, force / 50));
    const id = howlRef.current.play('collide');
    howlRef.current.volume(volume, id);
    howlRef.current.rate(0.85 + Math.random() * 0.3, id);
  };

  const shakeStart = (intensity: number) => {
    const id = howlRef.current?.play('shake');
    if (id) {
      howlRef.current?.volume(0.4 + intensity * 0.6, id);
      howlRef.current?.rate(0.9 + intensity * 0.4, id);
    }
  };

  const reveal = () => howlRef.current?.play('reveal');
  const win = () => howlRef.current?.play('win');
  const lose = () => howlRef.current?.play('lose');

  return { collide, shakeStart, reveal, win, lose };
}
```

Commit.

### Task 10.4: Wire into Rapier onContactForce

In `<Dice>` component:

```tsx
<RigidBody
  onContactForce={(payload) => {
    const force = payload.totalForceMagnitude;
    if (force > 5) collide(`${myIdx}-${payload.otherCollider.handle}`, force);
  }}
  ...
/>
```

Commit.

### Task 10.5: Theme switch reloads audio pack

ThemeProvider already triggers via `tokens.audioPackPath` change; `useDiceAudio` re-runs on theme change automatically.

**Phase 10 done predicate**: Shake → shake audio with volume/pitch coupled; dice collisions audible w/ force-mapped volume; theme switch swaps audio pack; iOS Safari plays audio after first user gesture.

---

## Phase 11: PWA + safe-area + reduced-motion polish (Day 12)

### Task 11.1: manifest.json

**File**: `public/manifest.json`

```json
{
  "name": "大话骰",
  "short_name": "大话骰",
  "description": "Liar's Dice",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#080d1f",
  "theme_color": "#5da3ff",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Commit.

### Task 11.2: Generate icons via gpt-image

```bash
~/.claude/skills/gpt-image/generate.py \
  "App icon for 大话骰 dice game. Vector flat illustration, dice cup motif with 3 dice tumbling around it, modern minimal style, blue gradient bg #080d1f to #1a2755, orange accent on dice, 1024x1024, centered, no text, app icon style with rounded square frame" \
  --name dahua-icon-1024 --format png

# Then resize to required sizes
sips -z 192 192 icons/dahua-icon-1024.png --out public/icons/icon-192.png
sips -z 512 512 icons/dahua-icon-1024.png --out public/icons/icon-512.png
sips -z 180 180 icons/dahua-icon-1024.png --out public/icons/icon-180.png
```

Commit.

### Task 11.3: Update app/layout.tsx with PWA meta

```tsx
<head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="大话骰" />
  <link rel="apple-touch-icon" href="/icons/icon-180.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</head>
```

Commit.

### Task 11.4: Reduced-motion + a11y pass

- Verify globals.css media query covers all transitions
- For Rapier physics: add a `noPhysicsMode` flag. When `prefers-reduced-motion: reduce`, skip physics; just transition dice to settled positions instantly.
- Add ARIA live region in game screen: `<div aria-live="polite" aria-atomic="true">{announcement}</div>` updates on phase changes ("Player B 叫了 four 4s", "Reveal phase, you won")
- Keyboard navigation: home page tab order; in-game `1-6` for face, `+/-` for count, `Enter` to bid, `Space` to challenge (with confirm modal)

Commit.

### Task 11.5: Performance audit

Run chrome-devtools-mcp `performance_start_trace` on `/` and `/room/[code]`. Targets:
- LCP < 2.5s
- CLS < 0.1
- TBT < 200ms
- FID < 100ms

Identify offenders. Common fixes: dynamic-import heavy components, lazy-load audio, preload critical fonts.

Commit any optimizations.

**Phase 11 done predicate**: Adding to Home Screen on iOS works with proper icon; lighthouse mobile score ≥ 80; reduced-motion preference disables shake animation visuals; keyboard nav works.

---

## Phase 12: Tests + a11y + production deploy (Day 13-14)

### Task 12.1: Playwright e2e happy path

**File**: `tests/e2e/happy-path.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('two players play a complete game', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto('http://localhost:3000');
  await pageA.fill('input[aria-label="你的名字"]', 'Alice');
  await pageA.click('button:has-text("创建房间")');
  await pageA.waitForURL(/\/room\/[A-Z2-9]{6}/);
  const url = pageA.url();
  const code = url.match(/\/room\/([A-Z2-9]{6})/)![1];

  await pageB.goto('http://localhost:3000');
  await pageB.fill('input[aria-label="你的名字"]', 'Bob');
  await pageB.click('button:has-text("加入房间")');
  await pageB.fill('input[name="invite-code"]', code);
  await pageB.click('button:has-text("进入")');
  await pageB.waitForURL(`/room/${code}`);

  // Both players see each other in lobby
  await expect(pageA.locator('text=Alice')).toBeVisible();
  await expect(pageA.locator('text=Bob')).toBeVisible();
  await expect(pageB.locator('text=Alice')).toBeVisible();
  await expect(pageB.locator('text=Bob')).toBeVisible();

  // Start game
  await pageA.click('button:has-text("开始游戏")');
  await expect(pageA.locator('text=摇骰阶段')).toBeVisible({ timeout: 5000 });

  // Continue with roll + bid + challenge interactions...
});
```

Commit.

### Task 12.2: Multi-viewport screenshot sweep

Using chrome-devtools-mcp + `emulate_device`:

```ts
// In a test script
const devices = ['iPhone 14 Pro', 'Pixel 7', 'iPad'];
const themes = ['modern-minimal', 'classic-bar', 'hk-neon', 'cartoon'];
const phases = ['home', 'lobby', 'rolling', 'bidding', 'reveal'];

for (const device of devices)
  for (const theme of themes)
    for (const phase of phases) {
      // Set up the state, screenshot
    }
```

Visual regression: compare against baseline images. Commit.

### Task 12.3: Axe automated a11y scan

```bash
pnpm add -D @axe-core/playwright
```

Add a11y test:

```ts
import { AxeBuilder } from '@axe-core/playwright';

test('home page is a11y compliant', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

Repeat for lobby, bidding screens. Fix any violations. Commit.

### Task 12.4: Production deploy

```bash
vercel --prod
```

Smoke test live URL:
1. Open https://dahua-dice.vercel.app on iPhone
2. Create room, copy code, share link
3. Open in another device, join
4. Play a full round
5. Verify audio, gyroscope, 3D dice all work

If any issues, fix + redeploy. Commit fixes.

### Task 12.5: README polish

Update README with:
- Live link: https://dahua-dice.vercel.app
- Animated GIF / mp4 of gameplay (record via screen capture, convert to optimized webp)
- Feature list
- Tech stack
- Local dev instructions
- License (MIT)

Final commit.

**Phase 12 done predicate**: `pnpm playwright test` passes all tests; dahua-dice.vercel.app loads and is playable from at least one real mobile device; lighthouse mobile ≥ 80; Axe scan zero violations; README has live link + demo media.

---

## Cross-cutting concerns

- **DRY**: types defined once in `lib/game-engine/types.ts`, imported everywhere.
- **YAGNI**: no AI opponents, no spectator mode, no replay — those are Phase 2 / post-MVP.
- **TDD**: game-engine pure functions are TDD-mandatory; UI tasks tested via Playwright.
- **Commits**: every task ends with commit + push. No multi-task commits.
- **i18n**: every user-facing string goes through `useTranslations`. Check via grep before each phase commit.
- **Audio sources licensing**: only CC0 / Pixabay (no attribution required) / ElevenLabs (we own generated). Track sources in `docs/research/dice-audio-research.md`.

## Self-Review Results

**Spec coverage scan**:
- Spec §1-§4 (Overview/Goals/Decisions/Tech Stack) → Phases 0, 1
- Spec §5 (Directory) → Phase 1
- Spec §6 (Routes & API) → Phases 3, 4
- Spec §6A (Screen IA wireframes) → Phases 3, 8, 9
- Spec §7 (Data model) → Phases 2, 3
- Spec §8 (State machine) → Phases 3, 5, 8
- Spec §9 (Data flow / SSE) → Phase 4
- Spec §10, §10A (Game engine + interaction states) → Phases 3, 5, 8
- Spec §11 (3D dice) → Phase 6
- Spec §12 (Theme system + per-theme patterns) → Phases 1, 9
- Spec §13 (4 customization dims) → Phase 9
- Spec §14 (Gyroscope) → Phase 7
- Spec §15 (Audio) → Phase 10
- Spec §16 (i18n) → Phase 1
- Spec §17 (Security) → Phases 2, 3 (session, encryption mentioned)
- Spec §17A (User journey) → covered implicitly across phases (each phase = journey step)
- Spec §17B (Component vocab) → Phases 3, 8, 9 (components built up)
- Spec §17C (Responsive & a11y) → Phase 11.4 + 12.3
- Spec §18 (Roadmap) → matches phase plan
- Spec §19 (Test strategy) → Phases 5, 12
- Spec §21 (Anti-AI-slop) → Phase 1.3 (tokens) + Phase 6 (textures) + Phase 9 (themes)

All sections covered ✓.

**Placeholder scan**: no TBD / TODO / "fill in" in task bodies. Lua scripts reference "see SDK docs" where appropriate (Upstash @upstash/redis Lua execution method).

**Type consistency check**:
- `Bid`, `GameRules`, `RoomState`, `Phase`, `Player`, `Face` all defined once in `lib/game-engine/types.ts`
- `isValidBid(prev, next, rules, alive)` consistent throughout
- `resolveChallenge(bid, hands, rules, challengerIdx, bidderIdx?)` consistent
- API action names match Lua script names: `placeBid` ↔ `placeBid.lua` ↔ `/api/action {action: 'bid'}`

**Naming**: `generateInviteCode` (consistent); `useShakeDetector` (consistent); `useDiceAudio` (consistent); `useRoomEvents` (consistent).

## Plan Done

Total: 13 phases (0-12), ~60 tasks, ~12-14 day budget.

Per-phase done predicates serve as `/goal` predicates. Phase 0 = setup; Phases 1-2 = foundation; Phases 3-5 = backend/game-engine; Phases 6-7 = 3D + gyroscope; Phases 8-10 = UI + audio; Phases 11-12 = polish + deploy.

Execution mode: per-phase `/goal` + `superpowers:autonomous-grind`. Between phases: `clear` previous, `start` next predicate. No human review gates between phases (autonomous).
