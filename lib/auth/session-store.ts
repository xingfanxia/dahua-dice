import { redis } from '@/lib/redis';
import { generatePlayerId, generateToken } from './session';

export const SESSION_TTL = 86400; // 24h

export type Session = {
  playerId: string;
  nick: string;
  currentRoom: string | null;
  theme: string;
  avatar: string | null;
  customization: Record<string, unknown>;
  createdAt: number;
};

export type CreateSessionInput = { nick: string; theme: string };

export async function createSession(
  input: CreateSessionInput,
): Promise<{ token: string; session: Session }> {
  const token = generateToken();
  const session: Session = {
    playerId: generatePlayerId(),
    nick: input.nick,
    currentRoom: null,
    theme: input.theme,
    avatar: null,
    customization: {},
    createdAt: Date.now(),
  };
  await redis.set(`session:${token}`, session, { ex: SESSION_TTL });
  return { token, session };
}

export async function readSession(token: string): Promise<Session | null> {
  const val = await redis.get<Session>(`session:${token}`);
  return val ?? null;
}

export async function updateSession(
  token: string,
  patch: Partial<Session>,
): Promise<Session | null> {
  const current = await readSession(token);
  if (!current) return null;
  const next = { ...current, ...patch };
  await redis.set(`session:${token}`, next, { ex: SESSION_TTL });
  return next;
}

export async function touchSession(token: string): Promise<void> {
  await redis.expire(`session:${token}`, SESSION_TTL);
}
