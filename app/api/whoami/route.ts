import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session-store';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  if (!token) return NextResponse.json({ ok: false, reason: 'no_session' }, { status: 401 });
  const session = await readSession(token);
  if (!session) return NextResponse.json({ ok: false, reason: 'session_expired' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    playerId: session.playerId,
    nick: session.nick,
    currentRoom: session.currentRoom,
  });
}
