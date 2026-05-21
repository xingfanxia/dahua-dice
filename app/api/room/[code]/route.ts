import { type NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';
import type { RoomState } from '@/lib/game-engine/types';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const state = await redis.get<RoomState>(`room:${code}:state`);
  if (!state) return NextResponse.json({ ok: false, reason: 'room_not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    code: state.code,
    phase: state.phase,
    playerCount: state.players.length,
    maxPlayers: 8,
    joinable: state.phase === 'lobby' && state.players.length < 8,
    theme: state.theme,
  });
}
