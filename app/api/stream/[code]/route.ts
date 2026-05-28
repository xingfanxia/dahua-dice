import type { NextRequest } from 'next/server';
import { requireMembership } from '@/lib/auth/membership';
import { UPSTASH_REST_TOKEN, UPSTASH_REST_URL } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Fluid Compute: max 800s on Pro, 300s on Hobby
export const maxDuration = 300;

/**
 * Server-Sent Events endpoint that subscribes to `room:{code}:events` on
 * Upstash Redis and pipes messages to the browser EventSource. Members-only.
 *
 * Architecture (per docs/research/multiplayer-sync-research.md path B):
 *   client EventSource → /api/stream/[code]
 *                            └→ fetch upstash REST /subscribe/{channel}
 *                                                  (SSE stream)
 *                            ◀──── pipe ─────────┘
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return new Response('invalid_code', { status: 400 });
  }
  const m = await requireMembership(code);
  if (!m.ok) return new Response(m.reason, { status: m.status });

  const channel = `room:${code}:events`;
  const upstreamResponse = await fetch(`${UPSTASH_REST_URL}/subscribe/${channel}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      Accept: 'text/event-stream',
    },
    cache: 'no-store',
    // Cancel the upstream pipe when the browser disconnects, so we don't
    // hold the Upstash subscribe open until maxDuration.
    signal: req.signal,
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response(`upstash_subscribe_failed:${upstreamResponse.status}`, { status: 502 });
  }

  return new Response(upstreamResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
