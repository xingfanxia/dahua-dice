import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { validateNickname } from '@/lib/auth/session';
import { createSession, readSession, updateSession } from '@/lib/auth/session-store';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { sanitizeTheme } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

// Session bootstrap is unauthenticated and mints a fresh 24h Redis key per call,
// so an uncapped endpoint both fills Redis and defeats the per-session action
// limiter (mint a new token → fresh action budget). Throttle per-IP like /api/room.
const SESSION_LIMIT = 20;
const SESSION_WINDOW_SEC = 60;

/**
 * Bootstrap or refresh an anonymous session for the current device.
 * - If a valid token cookie exists, refreshes session with the new nick/theme.
 * - Otherwise creates a new session and sets the cookie.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(`session:${clientIp(req)}`, SESSION_LIMIT, SESSION_WINDOW_SEC);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited', retryAfter: limited.retryAfter },
      { status: 429 },
    );
  }

  let body: { nick?: string; theme?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }
  const v = validateNickname(body.nick);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
  const theme = sanitizeTheme(body.theme);

  const cookieStore = await cookies();
  const existing = cookieStore.get('dahua_token')?.value;
  if (existing) {
    const session = await readSession(existing);
    if (session) {
      const updated = await updateSession(existing, { nick: v.value, theme });
      return NextResponse.json({ ok: true, playerId: updated?.playerId });
    }
  }
  const { token, session } = await createSession({ nick: v.value, theme });
  cookieStore.set('dahua_token', token, {
    path: '/',
    maxAge: 86400,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  return NextResponse.json({ ok: true, playerId: session.playerId });
}
