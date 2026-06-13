/**
 * Zod schemas for validating untrusted request bodies at the API boundary.
 *
 * Engineering standard: validate at system boundaries, trust internal code.
 * These guard the two POST surfaces that accept structured input — `/api/action`
 * and `/api/room` — against malformed JSON, type confusion, and out-of-range
 * values (e.g. `diceCount: 9999` which would otherwise drive a huge server-side
 * `rollDice` allocation).
 */

import { z } from 'zod';

/** Invite code: loose length guard here; exact alphabet check is `isValidInviteCode`. */
const codeField = z.string().min(1).max(12);

/**
 * Canonical theme ids. `theme` rides in from the unauthenticated /api/room and
 * /api/session bodies, is persisted into room state, and is reflected back by the
 * unauthenticated GET /api/room/[code] — so it MUST be clamped to a known value,
 * not a free-form string (otherwise a bloated theme string becomes a reflected
 * amplification vector).
 */
const THEME_IDS = ['modern-minimal', 'classic-bar', 'hk-neon', 'cartoon'] as const;
export function sanitizeTheme(value: unknown): string {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
    ? value
    : 'modern-minimal';
}

/**
 * GameRules — every field range-checked. `diceCount`/`diceSides` use literal
 * unions so the parsed type matches `GameRules` exactly; unknown keys are
 * stripped (zod object default), so junk fields can't ride along into Redis.
 */
export const gameRulesSchema = z.object({
  // 3-10, in lockstep with GameRules['diceCount'] and the wxapp cloud fn's zod
  // (its commit 1e4b43e widened both sides together — keep in sync).
  diceCount: z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
  ]),
  aceWild: z.boolean(),
  allowZhai: z.boolean(),
  startingBidFactor: z.number().min(1).max(3),
  diceSides: z.union([z.literal(6), z.literal(8)]),
  chineseExtensions: z.object({
    pi: z.boolean(),
    fanpi: z.boolean(),
    tongsha: z.boolean(),
  }),
  paliFicoVariant: z.boolean(),
});

/**
 * Universal action body. Discriminated on `type` so each variant only accepts
 * its own fields. `count`/`face`/`expectedVersion` are int-bounded here; the
 * full game-legality of a bid is still enforced by `isValidBid` + the Lua CAS.
 * `nick` gets a loose cap here — `validateNickname` does the real XSS/length check.
 */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    code: codeField,
    nick: z.string().max(40),
    avatar: z.string().max(32).optional(),
  }),
  z.object({ type: z.literal('start'), code: codeField }),
  z.object({ type: z.literal('rematch'), code: codeField }),
  z.object({
    type: z.literal('bid'),
    code: codeField,
    count: z.number().int().min(1).max(200),
    face: z.number().int().min(1).max(8),
    isZhai: z.boolean(),
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('challenge'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('pi'),
    code: codeField,
    targetPlayerId: z.string().min(1).max(64),
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('tongsha'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('nextRound'),
    code: codeField,
    expectedVersion: z.number().int().min(0),
  }),
  z.object({ type: z.literal('leave'), code: codeField }),
  z.object({ type: z.literal('setAvatar'), code: codeField, avatar: z.string().max(32) }),
  z.object({ type: z.literal('updateRules'), code: codeField, rules: gameRulesSchema }),
]);

export type ParsedAction = z.infer<typeof actionSchema>;
