import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { validateNickname } from '@/lib/auth/session';
import { readSession, updateSession } from '@/lib/auth/session-store';
import { normalizeAvatar } from '@/lib/avatars';
import type { Face, RoomState } from '@/lib/game-engine/types';
import { isValidBid } from '@/lib/game-engine/validate';
import { runScript } from '@/lib/lua/run';
import { rateLimit } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';
import { rollDice } from '@/lib/room/dice-rng';
import { isValidInviteCode } from '@/lib/room/invite-code';
import { actionSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

/** Spec §17: 30 actions / minute per session. */
const ACTION_LIMIT = 30;
const ACTION_WINDOW_SEC = 60;

/** Map a Lua failure reason to the right HTTP status (client keys on `reason`; this is for correct semantics/observability). */
function statusForReason(reason: string | undefined): number {
  switch (reason) {
    case 'no_room':
      return 404;
    case 'room_full':
    case 'not_owner':
    case 'not_in_room':
    case 'not_alive':
    case 'not_your_turn':
      return 403;
    case 'stale':
      return 409;
    default:
      return 400;
  }
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const body = parsed.data;

  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  if (!token) return NextResponse.json({ ok: false, reason: 'no_session' }, { status: 401 });
  const session = await readSession(token);
  if (!session) return NextResponse.json({ ok: false, reason: 'session_expired' }, { status: 401 });

  const limited = await rateLimit(`action:${token}`, ACTION_LIMIT, ACTION_WINDOW_SEC);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited', retryAfter: limited.retryAfter },
      { status: 429 },
    );
  }

  if (!isValidInviteCode(body.code.toUpperCase())) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const code = body.code.toUpperCase();
  const stateKey = `room:${code}:state`;
  const handsKey = `room:${code}:hands`;

  switch (body.type) {
    case 'join': {
      const v = validateNickname(body.nick);
      if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
      const result = await runScript(
        'joinRoom',
        [stateKey],
        [session.playerId, v.value, normalizeAvatar(body.avatar)],
      );
      // Only pin the session to this room AFTER the join is confirmed, so a 404
      // / full / in-progress room never leaves the session pointing at it.
      if (result.ok) await updateSession(token, { nick: v.value, currentRoom: code });
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'start': {
      // Generate hands in Node (crypto.randomInt) then atomically commit via Lua
      // so phase advance + hands hash are written in a single CAS.
      const state = await redis.get<RoomState>(stateKey);
      if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
      if (state.phase !== 'lobby') {
        return NextResponse.json({ ok: false, reason: 'wrong_phase' }, { status: 400 });
      }
      const handArgs: string[] = [];
      for (const p of state.players) {
        if (!p.alive) continue;
        handArgs.push(p.id, JSON.stringify(rollDice(p.diceLeft, state.rules.diceSides)));
      }
      const result = await runScript(
        'startGame',
        [stateKey, handsKey],
        [session.playerId, ...handArgs],
      );
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'bid': {
      const state = await redis.get<RoomState>(stateKey);
      if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
      const alive = state.players.filter((p) => p.alive).length;
      const validation = isValidBid(
        state.lastBid,
        { count: body.count, face: body.face as Face, isZhai: body.isZhai },
        state.rules,
        alive,
      );
      if (!validation.ok) {
        return NextResponse.json({ ok: false, reason: validation.reason }, { status: 400 });
      }
      const result = await runScript(
        'placeBid',
        [stateKey],
        [
          session.playerId,
          String(body.count),
          String(body.face),
          body.isZhai ? '1' : '0',
          String(body.expectedVersion),
        ],
      );
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'challenge': {
      const result = await runScript(
        'resolveChallenge',
        [stateKey, handsKey],
        [session.playerId, String(body.expectedVersion)],
      );
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'nextRound': {
      const state = await redis.get<RoomState>(stateKey);
      if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
      // Generate fresh hands for all alive players
      const handArgs: string[] = [];
      for (const p of state.players) {
        if (!p.alive) continue;
        handArgs.push(p.id, JSON.stringify(rollDice(p.diceLeft, state.rules.diceSides)));
      }
      const result = await runScript(
        'nextRound',
        [stateKey, handsKey],
        [session.playerId, String(body.expectedVersion), ...handArgs],
      );
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'leave': {
      const result = await runScript('leaveRoom', [stateKey], [session.playerId]);
      // Clear currentRoom on session even if removal failed (best-effort)
      await updateSession(token, { currentRoom: null });
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'setAvatar': {
      const result = await runScript(
        'setAvatar',
        [stateKey],
        [session.playerId, normalizeAvatar(body.avatar)],
      );
      return NextResponse.json(result, {
        status: result.ok ? 200 : statusForReason(result.reason),
      });
    }

    case 'updateRules': {
      const state = await redis.get<RoomState>(stateKey);
      if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
      if (state.ownerId !== session.playerId) {
        return NextResponse.json({ ok: false, reason: 'not_owner' }, { status: 403 });
      }
      if (state.phase !== 'lobby') {
        return NextResponse.json({ ok: false, reason: 'wrong_phase' }, { status: 400 });
      }
      // body.rules is schema-validated (diceCount 3-7, diceSides 6|8, factor 1-3,
      // unknown keys stripped) — safe to persist verbatim.
      const updated: RoomState = {
        ...state,
        rules: body.rules,
        players: state.players.map((p) => ({ ...p, diceLeft: body.rules.diceCount })),
        version: state.version + 1,
      };
      await redis.set(stateKey, updated, { ex: 1800 });
      const payload = JSON.stringify({
        type: 'rules_updated',
        payload: { rules: body.rules },
        version: updated.version,
      });
      await redis.xadd(`room:${code}:events`, '*', { data: payload });
      await redis.publish(`room:${code}:events`, payload);
      return NextResponse.json({ ok: true, version: updated.version });
    }

    default:
      return NextResponse.json({ ok: false, reason: 'unknown_action' }, { status: 400 });
  }
}
