import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSession } from '@/lib/auth/session-store';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  if (!token) return NextResponse.json({ ok: false, reason: 'no_session' }, { status: 401 });
  const session = await readSession(token);
  if (!session) return NextResponse.json({ ok: false, reason: 'session_expired' }, { status: 401 });

  const hand = await redis.hget<number[]>(`room:${code}:hands`, session.playerId);
  if (!hand) return NextResponse.json({ ok: false, reason: 'no_hand' }, { status: 404 });
  return NextResponse.json({ ok: true, hand });
}
