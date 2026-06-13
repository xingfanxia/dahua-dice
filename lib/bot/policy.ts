/**
 * Bot policy — a PURE decision function the local game loop wraps (the LLM-as-
 * subroutine pattern, but here the "AI" is a probability model). Given the bot's
 * own hand + the public state, it returns one action: a legal raise or a 开
 * (challenge). It never mutates state and takes an injectable RNG so it is
 * deterministic under test.
 *
 * Model: estimate P(the standing bid holds) from the bot's own matching dice plus
 * a binomial over the hidden dice; challenge when that probability is low, else
 * pick the most defensible legal raise (highest P it itself holds). Difficulty is
 * two knobs — challengeThreshold (how readily it calls) and bluffRate (how often
 * it over-bids past its own evidence).
 */

import type { Bid, Face, RoomState } from '../game-engine/types';
import { getStartingBidThreshold, isValidBid } from '../game-engine/validate';

export type BotAction = { kind: 'bid'; bid: Bid } | { kind: 'challenge' };
export type BotDifficulty = 'easy' | 'medium' | 'hard';

type Knobs = { challengeThreshold: number; bluffRate: number };

const DIFFICULTY: Record<BotDifficulty, Knobs> = {
  easy: { challengeThreshold: 0.3, bluffRate: 0 },
  medium: { challengeThreshold: 0.42, bluffRate: 0.12 },
  hard: { challengeThreshold: 0.5, bluffRate: 0.3 },
};

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(X ≥ k) for X ~ Binomial(n, p). */
function binomAtLeast(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  for (let i = k; i <= n; i++) total += choose(n, i) * p ** i * (1 - p) ** (n - i);
  return Math.min(1, total);
}

/** 1s are wild toward a non-1 face unless the bid is zhai, aces off, or Palifico. */
function wildActive(state: RoomState, bid: Bid): boolean {
  return !bid.isZhai && state.rules.aceWild && !(state.palificoActive ?? false) && bid.face !== 1;
}

/** Dice in the bot's hand that count toward `bid` (face matches, plus wild 1s). */
function ownMatches(hand: number[], bid: Bid, wild: boolean): number {
  let n = 0;
  for (const f of hand) {
    if (f === bid.face) n++;
    else if (wild && f === 1) n++;
  }
  return n;
}

/** The bot's estimate that a bid is true, from its own hand + the hidden dice. */
export function probBidHolds(state: RoomState, hand: number[], bid: Bid): number {
  const wild = wildActive(state, bid);
  const own = ownMatches(hand, bid, wild);
  const totalAliveDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0);
  const hidden = Math.max(0, totalAliveDice - hand.length);
  const pMatch = (wild ? 2 : 1) / state.rules.diceSides;
  return binomAtLeast(bid.count - own, hidden, pMatch);
}

/** Enumerate legal next bids around the standing bid / opener (both 飞 and 斋 so
 * the bot can break a 斋 round, which needs count ≥ prev×2, or stay/转斋). isValidBid
 * filters every candidate, so the emitted set is always legal. */
function legalBids(state: RoomState, alive: number, totalDice: number): Bid[] {
  const out: Bid[] = [];
  const prev = state.lastBid;
  const baseCount = prev
    ? prev.count
    : getStartingBidThreshold(alive, false, state.rules, totalDice);
  // Bot never bids BELOW the standing count; the high end reaches 破斋 (count ≥
  // prev×2) only when the standing bid is 斋. Clamped to the table dice.
  const lo = baseCount;
  const hi = Math.min(totalDice, prev?.isZhai ? prev.count * 2 + 1 : baseCount + 2);
  for (let count = lo; count <= hi; count++) {
    // faces 2..diceSides (bot skips face 1 to avoid the 叫1必斋 special case).
    for (let face = 2 as number; face <= state.rules.diceSides; face++) {
      for (const isZhai of [false, true]) {
        if (isZhai && !state.rules.allowZhai) continue;
        const bid: Bid = { count, face: face as Face, isZhai };
        if (
          isValidBid(prev, bid, state.rules, alive, { totalDice, palifico: state.palificoActive })
            .ok
        )
          out.push(bid);
      }
    }
  }
  return out;
}

export function decideBotAction(
  state: RoomState,
  hand: number[],
  difficulty: BotDifficulty = 'medium',
  rng: () => number = Math.random,
): BotAction {
  const knobs = DIFFICULTY[difficulty];
  const alive = state.players.filter((p) => p.alive).length;
  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0);

  // Challenge an implausible standing bid.
  if (state.lastBid) {
    const p = probBidHolds(state, hand, state.lastBid);
    if (p < knobs.challengeThreshold) return { kind: 'challenge' };
  }

  const candidates = legalBids(state, alive, totalDice);
  if (candidates.length === 0) {
    // No legal raise left (e.g. count already at the table cap) — must call.
    return { kind: 'challenge' };
  }
  // Prefer 飞 (flying) raises — the bot's natural register, where 1s help it. It
  // only falls back to 斋 when NO flying raise is legal (e.g. breaking a 斋 round
  // would need count ≥ prev×2 > the table dice).
  const flying = candidates.filter((c) => !c.isZhai);
  const pool = flying.length > 0 ? flying : candidates;
  // Most defensible raise = the one the bot itself is most confident holds.
  const scored = pool
    .map((bid) => ({ bid, p: probBidHolds(state, hand, bid) }))
    .sort((a, b) => b.p - a.p);
  const safest = scored[0];
  // Bluff: occasionally take a more aggressive (lower-confidence but legal) raise.
  if (rng() < knobs.bluffRate && scored.length > 1) {
    const bolder = scored.find((c) => c.bid.count > safest.bid.count) ?? scored[1];
    return { kind: 'bid', bid: bolder.bid };
  }
  return { kind: 'bid', bid: safest.bid };
}
