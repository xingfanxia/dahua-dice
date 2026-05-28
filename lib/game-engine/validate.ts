import type { Bid, GameRules } from './types';

export type BidValidation = { ok: true } | { ok: false; reason: string };

export function getStartingBidThreshold(
  alivePlayers: number,
  isZhai: boolean,
  rules: GameRules,
): number {
  return isZhai ? alivePlayers : Math.ceil(rules.startingBidFactor * alivePlayers);
}

export function isValidBid(
  prev: Bid | null,
  next: Bid,
  rules: GameRules,
  alivePlayers: number,
): BidValidation {
  if (next.isZhai && !rules.allowZhai) return { ok: false, reason: 'zhai_disabled' };
  if (!Number.isInteger(next.count) || next.count < 1)
    return { ok: false, reason: 'invalid_count' };
  if (!Number.isInteger(next.face) || next.face < 1 || next.face > rules.diceSides)
    return { ok: false, reason: 'invalid_face' };

  if (!prev) {
    const threshold = getStartingBidThreshold(alivePlayers, next.isZhai, rules);
    if (next.count < threshold) return { ok: false, reason: 'below_starting' };
    return { ok: true };
  }

  // Breaking out of zhai round (飞): non-zhai bid following a zhai bid must double the count
  if (prev.isZhai && !next.isZhai) {
    if (next.count >= prev.count * 2) return { ok: true };
    return { ok: false, reason: 'break_zhai_needs_2x' };
  }

  // Going into zhai from non-zhai (entering zhai round)
  if (!prev.isZhai && next.isZhai) {
    // Must be strictly more than half of prev.count (entering zhai cuts pool)
    if (next.count > Math.ceil(prev.count / 2)) return { ok: true };
    return { ok: false, reason: 'enter_zhai_too_low' };
  }

  // Same regime (both zhai or both non-zhai): count up, or same count + face up
  if (next.count > prev.count) return { ok: true };
  if (next.count === prev.count && next.face > prev.face) return { ok: true };
  return { ok: false, reason: 'not_higher' };
}
