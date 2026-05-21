import { redirect } from 'next/navigation';
import { redis } from '@/lib/redis';
import { isValidInviteCode } from '@/lib/room/invite-code';
import type { RoomState } from '@/lib/game-engine/types';
import { RoomClient } from './RoomClient';

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) redirect('/');
  const state = await redis.get<RoomState>(`room:${code}:state`);
  if (!state) redirect('/?error=room_not_found');
  return <RoomClient initialState={state} code={code} />;
}
