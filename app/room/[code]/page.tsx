import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth/session-store';
import type { RoomState } from '@/lib/game-engine/types';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';
import { RoomClient } from './RoomClient';

export const dynamic = 'force-dynamic';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) redirect('/');
  const state = await redis.get<RoomState>(`room:${code}:state`);
  if (!state) redirect('/?error=room_not_found');

  // Anyone who isn't already in the roster gets bounced to the home page with
  // the code pre-filled — that's the "join via link" flow.
  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  const session = token ? await readSession(token) : null;
  const isMember = session && state.players.some((p) => p.id === session.playerId);
  if (!isMember) redirect(`/?join=${code}`);

  return <RoomClient initialState={state} code={code} />;
}
