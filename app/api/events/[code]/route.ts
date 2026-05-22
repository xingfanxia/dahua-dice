import { type NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';
import { requireMembership } from '@/lib/auth/membership';

export const runtime = 'nodejs';

/**
 * Replay recent events from the room's Redis Stream. Members-only. Used by
 * clients on reconnect to recover any events missed during the disconnect window.
 *
 * Query: ?since=<lastEventId>  (defaults to '0-0' = from beginning)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const m = await requireMembership(code);
  if (!m.ok) return NextResponse.json({ ok: false, reason: m.reason }, { status: m.status });
  const since = req.nextUrl.searchParams.get('since') ?? '0-0';
  const streamKey = `room:${code}:events`;
  // XRANGE returns entries from `since` (exclusive of given id when prefixed with '(')
  const raw = await redis.xrange(streamKey, since === '0-0' ? '-' : `(${since}`, '+');
  // raw is an object: { id: { field: value } } in @upstash/redis
  const entries = Object.entries(raw as Record<string, Record<string, string>>).map(
    ([id, fields]) => {
      const dataStr = fields.data;
      let event: unknown = null;
      try {
        event = JSON.parse(dataStr);
      } catch {}
      return { id, event };
    },
  );
  return NextResponse.json({ ok: true, entries });
}
