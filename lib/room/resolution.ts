/**
 * Node-side helpers for the resolution actions (开 / 劈 / 通杀 / nextRound), which
 * compute the next state with the unit-tested lib/game-engine/round.ts engine and
 * commit it via a thin version-CAS Lua script.
 */

import type { Hands } from '@/lib/game-engine/round';
import type { RoomState } from '@/lib/game-engine/types';
import { redis } from '@/lib/redis';

/** Game-phase room TTL (6h), matching the Lua scripts. */
export const GAME_TTL = 21600;

/** Read the per-player dice hash, tolerating both auto-parsed arrays and JSON strings. */
export async function readHands(handsKey: string): Promise<Hands> {
  const raw = await redis.hgetall<Record<string, unknown>>(handsKey);
  const out: Hands = {};
  if (!raw) return out;
  for (const [id, val] of Object.entries(raw)) {
    if (Array.isArray(val)) {
      out[id] = val as number[];
    } else if (typeof val === 'string') {
      try {
        out[id] = JSON.parse(val) as number[];
      } catch {
        out[id] = [];
      }
    }
  }
  return out;
}

/**
 * Coalesce a RoomState read from Redis so rooms created before the bidChain /
 * Palifico fields existed don't crash the resolution engine during a deploy window.
 */
export function normalizeState(state: RoomState): RoomState {
  // Array.isArray (not `?? []`): Lua's cjson encodes an empty table as `{}`, which
  // arrives as an object — coerce those back to [] so .includes/.length are safe.
  return {
    ...state,
    bidChain: Array.isArray(state.bidChain) ? state.bidChain : [],
    palificoActive: state.palificoActive ?? false,
    palificoBidderId: state.palificoBidderId ?? null,
    palificoTriggered: Array.isArray(state.palificoTriggered) ? state.palificoTriggered : [],
  };
}
