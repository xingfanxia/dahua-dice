import { cookies } from 'next/headers';
import { readSession } from '@/lib/auth/session-store';
import type { RoomState } from '@/lib/game-engine/types';
import { redis } from '@/lib/redis';

export type MembershipResult =
  | { ok: true; playerId: string; state: RoomState }
  | { ok: false; status: 401 | 403 | 404; reason: string };

/**
 * Verify the caller is an authenticated member of the room (room.players includes
 * their session.playerId). Used to gate any endpoint that exposes per-room data
 * — full state, hand contents, SSE stream, event replay.
 *
 * Public discovery (phase + counts) lives at /api/room/[code] and bypasses this.
 */
export async function requireMembership(code: string): Promise<MembershipResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('dahua_token')?.value;
  if (!token) return { ok: false, status: 401, reason: 'no_session' };
  const session = await readSession(token);
  if (!session) return { ok: false, status: 401, reason: 'session_expired' };

  const state = await redis.get<RoomState>(`room:${code}:state`);
  if (!state) return { ok: false, status: 404, reason: 'room_not_found' };

  const isMember = state.players.some((p) => p.id === session.playerId);
  if (!isMember) return { ok: false, status: 403, reason: 'not_a_member' };

  return { ok: true, playerId: session.playerId, state };
}
