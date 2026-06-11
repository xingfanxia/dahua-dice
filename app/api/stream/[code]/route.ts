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

  // Managed pump instead of a raw body pipe. The raw pipe had two failure modes:
  // (1) undici's 300s body-inactivity timeout killed idle subscriptions with a loud
  //     "failed to pipe response / BodyTimeoutError"; (2) zero keepalives meant
  //     mobile networks / proxies could silently drop the idle connection. We send
  //     `: ping` comment frames every 20s, close gracefully BEFORE the undici /
  //     maxDuration deadlines, and collapse upstream errors into a clean close —
  //     the browser EventSource auto-reconnects either way.
  const upstream = upstreamResponse.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const PING_MS = 20_000;
  const DEADLINE_MS = 280_000; // < maxDuration (300s) and < undici bodyTimeout (300s)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let ping: ReturnType<typeof setInterval> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        if (deadline) clearTimeout(deadline);
        upstream.cancel().catch(() => {});
        try {
          controller.close();
        } catch {
          // controller already errored/closed — nothing to release
        }
      };
      // Keepalive frames are enqueued from this interval, interleaving with the read
      // loop below between its awaits. If we forwarded raw upstream chunks, a ping
      // landing between two halves of one SSE frame would split it — the browser
      // would see a truncated `data:` line + `\n\n` and drop the event. So the read
      // loop reassembles upstream bytes into COMPLETE frames (terminated by a blank
      // line) before enqueuing; a `: ping\n\n` is itself a complete comment frame,
      // so it can only ever land on a frame boundary now.
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          close();
        }
      }, PING_MS);
      deadline = setTimeout(close, DEADLINE_MS);
      (async () => {
        let buf = '';
        try {
          while (true) {
            const { done, value } = await upstream.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep = buf.indexOf('\n\n');
            while (sep >= 0) {
              const frame = buf.slice(0, sep + 2);
              buf = buf.slice(sep + 2);
              controller.enqueue(encoder.encode(frame));
              sep = buf.indexOf('\n\n');
            }
          }
        } catch {
          // upstream died (idle timeout / network) — close cleanly, client reconnects
        }
        close();
      })();
    },
    cancel() {
      // browser disconnected
      upstream.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
