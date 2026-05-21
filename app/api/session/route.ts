import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, readSession, updateSession } from '@/lib/auth/session-store';
import { validateNickname } from '@/lib/auth/session';

export const runtime = 'nodejs';

/**
 * Bootstrap or refresh an anonymous session for the current device.
 * - If a valid token cookie exists, refreshes session with the new nick/theme.
 * - Otherwise creates a new session and sets the cookie.
 */
export async function POST(req: NextRequest) {
  let body: { nick?: string; theme?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }
  const v = validateNickname(body.nick);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
  const theme = body.theme ?? 'modern-minimal';

  const cookieStore = await cookies();
  const existing = cookieStore.get('dahua_token')?.value;
  if (existing) {
    const session = await readSession(existing);
    if (session) {
      const updated = await updateSession(existing, { nick: v.value, theme });
      return NextResponse.json({ ok: true, token: existing, playerId: updated?.playerId });
    }
  }
  const { token, session } = await createSession({ nick: v.value, theme });
  cookieStore.set('dahua_token', token, {
    path: '/',
    maxAge: 86400,
    sameSite: 'lax',
    httpOnly: false,
  });
  return NextResponse.json({ ok: true, token, playerId: session.playerId });
}
