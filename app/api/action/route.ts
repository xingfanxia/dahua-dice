import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession, updateSession } from '@/lib/auth/session-store';
import { validateNickname } from '@/lib/auth/session';
import { isValidInviteCode } from '@/lib/room/invite-code';
import { runScript } from '@/lib/lua/run';
import { redis } from '@/lib/redis';
import { isValidBid } from '@/lib/game-engine/validate';
import { rollDice } from '@/lib/room/dice-rng';
import type { Face, RoomState } from '@/lib/game-engine/types';

export const runtime = 'nodejs';

import type { GameRules } from '@/lib/game-engine/types';

type Action =
  | { type: 'join'; code: string; nick: string; avatar?: string }
  | { type: 'start'; code: string }
  | { type: 'roll'; code: string }
  | { type: 'bid'; code: string; count: number; face: Face; isZhai: boolean; expectedVersion: number }
  | { type: 'challenge'; code: string; expectedVersion: number }
  | { type: 'updateRules'; code: string; rules: GameRules };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Action;
  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  if (!token) return NextResponse.json({ ok: false, reason: 'no_session' }, { status: 401 });
  const session = await readSession(token);
  if (!session) return NextResponse.json({ ok: false, reason: 'session_expired' }, { status: 401 });

  if (!body?.code || !isValidInviteCode(body.code.toUpperCase())) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const code = body.code.toUpperCase();
  const stateKey = `room:${code}:state`;

  switch (body.type) {
    case 'join': {
      const v = validateNickname(body.nick);
      if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
      // Update session nick + currentRoom (best-effort)
      await updateSession(token, { nick: v.value, currentRoom: code });
      const result = await runScript('joinRoom', [stateKey], [
        session.playerId,
        v.value,
        body.avatar ?? 'numeric',
      ]);
      const status = !result.ok && result.reason === 'room_full' ? 403 : 200;
      return NextResponse.json(result, { status: result.ok ? 200 : status });
    }
    case 'start': {
      const result = await runScript('startGame', [stateKey], [session.playerId]);
      if (result.ok) {
        // Roll dice for each alive player; store encrypted hands separately
        const state = await redis.get<RoomState>(stateKey);
        if (state) {
          const handsKey = `room:${code}:hands`;
          await redis.del(handsKey);
          const handsMap: Record<string, number[]> = {};
          for (const p of state.players) {
            if (p.alive) handsMap[p.id] = rollDice(p.diceLeft, state.rules.diceSides);
          }
          await redis.hset(handsKey, handsMap as Record<string, unknown>);
          await redis.expire(handsKey, 21600);
          // Advance phase from rolling → bidding
          const updated = { ...state, phase: 'bidding' as const, version: state.version + 1 };
          await redis.set(stateKey, updated, { ex: 21600 });
        }
      }
      return NextResponse.json(result);
    }
    case 'roll': {
      // Each player can request a fresh roll only when phase=rolling; rare
      return NextResponse.json({ ok: false, reason: 'rolling_auto_on_start' });
    }
    case 'bid': {
      const state = await redis.get<RoomState>(stateKey);
      if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
      const alive = state.players.filter((p) => p.alive).length;
      const validation = isValidBid(
        state.lastBid,
        { count: body.count, face: body.face, isZhai: body.isZhai },
        state.rules,
        alive,
      );
      if (!validation.ok) {
        return NextResponse.json({ ok: false, reason: validation.reason }, { status: 400 });
      }
      const result = await runScript('placeBid', [stateKey], [
        session.playerId,
        String(body.count),
        String(body.face),
        body.isZhai ? '1' : '0',
        String(body.expectedVersion),
      ]);
      return NextResponse.json(result);
    }
    case 'challenge': {
      const result = await runScript('challenge', [stateKey], [session.playerId, String(body.expectedVersion)]);
      return NextResponse.json(result);
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
      const updated: RoomState = {
        ...state,
        rules: body.rules,
        players: state.players.map((p) => ({ ...p, diceLeft: body.rules.diceCount })),
        version: state.version + 1,
      };
      await redis.set(stateKey, updated, { ex: 21600 });
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
