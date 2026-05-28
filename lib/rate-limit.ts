/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE in a single atomic
 * eval (so the TTL can never be lost between INCR and EXPIRE — that race would
 * otherwise leave a counter with no expiry and lock a caller out permanently).
 *
 * Spec §17: 30 actions/minute per session. Room creation is unauthenticated, so
 * it is throttled per-IP to prevent room-spam / Redis-fill.
 */

import { redis } from './redis';

const INCR_WITH_TTL = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return c
`;

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfter: number };

/**
 * @param identifier  caller key (session token, playerId, or IP)
 * @param limit       max requests allowed within the window
 * @param windowSec   window length in seconds
 */
export async function rateLimit(
  identifier: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const count = (await redis.eval(
    INCR_WITH_TTL,
    [`rl:${identifier}`],
    [String(windowSec)],
  )) as number;
  if (count > limit) return { ok: false, retryAfter: windowSec };
  return { ok: true, remaining: Math.max(0, limit - count) };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
