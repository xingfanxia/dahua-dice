import { type NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';
import type { RoomState } from '@/lib/game-engine/types';

export const runtime = 'nodejs';

/**
 * Return all players' hands. Only valid during phase=reveal.
 * Pre-reveal calls return 403.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const state = await redis.get<RoomState>(`room:${code}:state`);
  if (!state) return NextResponse.json({ ok: false, reason: 'no_room' }, { status: 404 });
  if (state.phase !== 'reveal') {
    return NextResponse.json({ ok: false, reason: 'not_reveal_phase' }, { status: 403 });
  }
  const hands = await redis.hgetall<Record<string, number[]>>(`room:${code}:hands`);
  return NextResponse.json({ ok: true, hands: hands ?? {} });
}
