import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStore } = vi.hoisted(() => ({
  mockStore: new Map<string, { value: unknown; expiresAt?: number }>(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    async set(key: string, value: unknown, options?: { ex?: number }) {
      mockStore.set(key, {
        value,
        expiresAt: options?.ex ? Date.now() + options.ex * 1000 : undefined,
      });
      return 'OK';
    },
    async get<T>(key: string): Promise<T | null> {
      const entry = mockStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        mockStore.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async expire(key: string, ttl: number) {
      const entry = mockStore.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + ttl * 1000;
      return 1;
    },
    async ttl(key: string) {
      const entry = mockStore.get(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
    },
    async exists(key: string) {
      return mockStore.has(key) ? 1 : 0;
    },
  },
  UPSTASH_REST_URL: '',
  UPSTASH_REST_TOKEN: '',
}));

import { createSession, readSession, SESSION_TTL, touchSession, updateSession } from '@/lib/auth/session-store';

beforeEach(() => {
  mockStore.clear();
});

describe('session-store', () => {
  it('creates a session and reads it back', async () => {
    const { token, session } = await createSession({ nick: 'AX', theme: 'modern-minimal' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.nick).toBe('AX');
    expect(session.theme).toBe('modern-minimal');
    expect(session.playerId).toMatch(/^[0-9a-f-]{36}$/);

    const read = await readSession(token);
    expect(read).not.toBeNull();
    expect(read?.nick).toBe('AX');
    expect(read?.playerId).toBe(session.playerId);
  });

  it('returns null for unknown token', async () => {
    expect(await readSession('nonexistent-token')).toBeNull();
  });

  it('touch refreshes TTL', async () => {
    const { token } = await createSession({ nick: 'AX', theme: 'modern-minimal' });
    // Forge an older expiry to verify touch resets it
    const entry = mockStore.get(`session:${token}`)!;
    entry.expiresAt = Date.now() + 1000;
    await touchSession(token);
    expect(entry.expiresAt).toBeGreaterThan(Date.now() + (SESSION_TTL - 5) * 1000);
  });

  it('updateSession merges a patch', async () => {
    const { token } = await createSession({ nick: 'AX', theme: 'modern-minimal' });
    const updated = await updateSession(token, { currentRoom: 'ABC123', theme: 'hk-neon' });
    expect(updated?.currentRoom).toBe('ABC123');
    expect(updated?.theme).toBe('hk-neon');
    expect(updated?.nick).toBe('AX'); // untouched

    const reRead = await readSession(token);
    expect(reRead?.currentRoom).toBe('ABC123');
  });

  it('updateSession returns null for unknown token', async () => {
    expect(await updateSession('nope', { nick: 'X' })).toBeNull();
  });

  it('createSession initializes currentRoom = null, avatar = null', async () => {
    const { session } = await createSession({ nick: 'AX', theme: 'classic-bar' });
    expect(session.currentRoom).toBeNull();
    expect(session.avatar).toBeNull();
    expect(session.customization).toEqual({});
  });
});
