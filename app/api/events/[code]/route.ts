import { type NextRequest, NextResponse } from 'next/server';
import { requireMembership } from '@/lib/auth/membership';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';

export const runtime = 'nodejs';

/**
 * Replay recent events from the room's Redis Stream (members-only). Intended for a
 * since-ID reconnect catch-up.
 *
 * NOTE: not currently wired — the client recovers on reconnect via a full
 * `/api/room/[code]/full` refetch (SSE `onopen` → sync → refetch, plus the 3s
 * safety poll), which is simpler and version-gated. This endpoint + the per-mutation
 * XADD event log remain available for a future incremental-replay upgrade.
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
      } catch (err) {
        // A corrupt stored event must not break the whole reconnect replay,
        // but it shouldn't vanish silently — surface it so a serialization bug
        // stays detectable. The bad entry is still returned with event=null.
        console.warn(`[events] unparseable event ${id} in ${streamKey}:`, err);
      }
      return { id, event };
    },
  );
  return NextResponse.json({ ok: true, entries });
}
