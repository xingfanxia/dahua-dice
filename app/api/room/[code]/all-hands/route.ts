import { type NextRequest, NextResponse } from 'next/server';
import { requireMembership } from '@/lib/auth/membership';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';

export const runtime = 'nodejs';

/**
 * Return all players' hands. Members-only, and only during phase=reveal.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const m = await requireMembership(code);
  if (!m.ok) return NextResponse.json({ ok: false, reason: m.reason }, { status: m.status });
  if (m.state.phase !== 'reveal') {
    return NextResponse.json({ ok: false, reason: 'not_reveal_phase' }, { status: 403 });
  }
  const hands = await redis.hgetall<Record<string, number[]>>(`room:${code}:hands`);
  return NextResponse.json({ ok: true, hands: hands ?? {} });
}
