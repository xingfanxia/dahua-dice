import type { Bid, GameRules } from './types';

export type BidValidation = { ok: true } | { ok: false; reason: string };

export function getStartingBidThreshold(
  alivePlayers: number,
  isZhai: boolean,
  rules: GameRules,
  /** Dice physically on the table. The floor must never exceed it — late-game
   * attrition (e.g. 1v1 with one die each) would otherwise leave the round
   * opener with NO legal bid (floor 3 > table 2) and no challenge either
   * (nothing to challenge yet): a hard softlock. */
  totalDice?: number,
): number {
  const floor = isZhai ? alivePlayers : Math.ceil(rules.startingBidFactor * alivePlayers);
  return totalDice != null ? Math.max(1, Math.min(floor, totalDice)) : floor;
}

export function isValidBid(
  prev: Bid | null,
  next: Bid,
  rules: GameRules,
  alivePlayers: number,
  opts?: { totalDice?: number; palifico?: boolean },
): BidValidation {
  if (!Number.isInteger(next.count) || next.count < 1)
    return { ok: false, reason: 'invalid_count' };
  if (!Number.isInteger(next.face) || next.face < 1 || next.face > rules.diceSides)
    return { ok: false, reason: 'invalid_face' };
  // Anti-grief: a bid can never exceed the dice physically on the table.
  if (opts?.totalDice != null && next.count > opts.totalDice)
    return { ok: false, reason: 'count_exceeds_dice' };

  // Palifico round (research §3.4): its own regime — 1s are not wild (handled at
  // resolution), the count is locked to the opener's, and raises are face-only.
  // The opener uses the zhai threshold since 1s don't count.
  if (opts?.palifico) {
    if (!prev) {
      if (next.count < alivePlayers) return { ok: false, reason: 'below_starting' };
      return { ok: true };
    }
    if (next.count !== prev.count) return { ok: false, reason: 'palifico_count_locked' };
    if (next.face > prev.face) return { ok: true };
    return { ok: false, reason: 'not_higher' };
  }

  if (next.isZhai && !rules.allowZhai) return { ok: false, reason: 'zhai_disabled' };

  // 叫1必斋 (research §2.3): a face-1 bid is incoherent as a 飞 call — 1 is both
  // the named face AND the wild — so bidding face 1 must enter the zhai state.
  if (next.face === 1 && !next.isZhai) return { ok: false, reason: 'face_one_must_zhai' };

  if (!prev) {
    const threshold = getStartingBidThreshold(alivePlayers, next.isZhai, rules, opts?.totalDice);
    if (next.count < threshold) return { ok: false, reason: 'below_starting' };
    return { ok: true };
  }

  // Breaking out of a zhai round (飞): a non-zhai bid following a zhai bid must
  // at least double the count (research §2.4 破斋: 飞叫的 X ≥ 斋叫的 X × 2).
  if (prev.isZhai && !next.isZhai) {
    if (next.count >= prev.count * 2) return { ok: true };
    return { ok: false, reason: 'break_zhai_needs_2x' };
  }

  // Every other transition — same regime, OR entering zhai from 飞 (research §2.3
  // 中途转斋 only requires 满足加叫规则, i.e. the normal raise rule) — uses the
  // standard raise: count up, or same count + face up.
  if (next.count > prev.count) return { ok: true };
  if (next.count === prev.count && next.face > prev.face) return { ok: true };
  return { ok: false, reason: 'not_higher' };
}
