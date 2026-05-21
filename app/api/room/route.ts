import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';
import { createSession } from '@/lib/auth/session-store';
import { validateNickname } from '@/lib/auth/session';
import { generateInviteCode } from '@/lib/room/invite-code';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

export const runtime = 'nodejs';

const LOBBY_TTL = 1800; // 30 minutes

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }
  const { nick, theme } = (body as { nick?: string; theme?: string }) ?? {};
  const v = validateNickname(nick);
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });

  const { token, session } = await createSession({ nick: v.value, theme: theme ?? 'modern-minimal' });

  let code = generateInviteCode();
  for (let i = 0; i < 5 && (await redis.exists(`room:${code}:state`)); i++) {
    code = generateInviteCode();
  }
  if (await redis.exists(`room:${code}:state`)) {
    return NextResponse.json({ ok: false, reason: 'code_collision' }, { status: 500 });
  }

  const state: RoomState = {
    code,
    phase: 'lobby',
    players: [
      {
        id: session.playerId,
        nick: session.nick,
        avatar: 'numeric',
        diceLeft: DEFAULT_RULES.diceCount,
        alive: true,
      },
    ],
    ownerId: session.playerId,
    currentTurnIdx: 0,
    lastBid: null,
    isZhaiRound: false,
    round: 0,
    rules: DEFAULT_RULES,
    theme: session.theme,
    version: 1,
    createdAt: Date.now(),
  };
  await redis.set(`room:${code}:state`, state, { ex: LOBBY_TTL });

  const cookieStore = await cookies();
  cookieStore.set('dahua_token', token, {
    path: '/',
    maxAge: 86400,
    sameSite: 'lax',
    httpOnly: false, // client also needs to read for SSE subscription auth (later)
  });

  return NextResponse.json({ ok: true, code, token, playerId: session.playerId });
}
