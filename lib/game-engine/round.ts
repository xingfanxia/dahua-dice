/**
 * Round resolution engine — the SINGLE source of truth for every challenge-style
 * action (开 / 劈 / 通杀) and round advancement, including 中式扩展 + Palifico.
 *
 * These are pure functions over `(RoomState, hands)` → new `RoomState`. The API
 * route computes the next state here (in Node, where it is unit-tested) and
 * commits it atomically via a thin version-CAS Lua script. This makes the TESTED
 * code the actual runtime — there is no separate, untested Lua re-implementation
 * of the game rules (see docs/specs design.md §10 for the pinned semantics).
 *
 * Rule sources: docs/research/dahua-dice-research.md §1.5 (challenge), §3.6 (劈/
 * 反劈/通杀 = challenge-mode variants), §3.4 (Palifico).
 */

import type { Bid, ChallengeOutcome, EndMode, Player, RoomState } from './types';

/** playerId → that player's dice (only alive players are dealt hands). */
export type Hands = Record<string, number[]>;

export type ResolveResult =
  | { ok: true; state: RoomState; outcome: ChallengeOutcome }
  | { ok: false; reason: string };

/** 1s count as wild toward a bid unless the bid is zhai, aces aren't wild, or it's a Palifico round. */
function wildOnesActive(state: RoomState, bid: Bid): boolean {
  return !bid.isZhai && state.rules.aceWild && !state.palificoActive;
}

/** Count, across the given players' hands, dice matching `face` (+ wild 1s if active). */
function countFace(hands: Hands, ids: string[], face: number, wild: boolean): number {
  let n = 0;
  for (const id of ids) {
    for (const f of hands[id] ?? []) {
      if (f === face) n++;
      else if (wild && f === 1) n++;
    }
  }
  return n;
}

function idxOf(state: RoomState, playerId: string): number {
  return state.players.findIndex((p) => p.id === playerId);
}

function aliveCount(players: Player[]): number {
  return players.filter((p) => p.alive).length;
}

function lastAliveIdx(players: Player[]): number {
  let idx = -1;
  players.forEach((p, i) => {
    if (p.alive) idx = i;
  });
  return idx;
}

export function nextAliveIdx(players: Player[], from: number): number {
  const n = players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (players[i].alive) return i;
  }
  return from;
}

function prevAliveIdx(players: Player[], from: number): number {
  const n = players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i - 1 + n) % n;
    if (players[i].alive && i !== from) return i;
  }
  return from;
}

/** Active end-mode (#2). Old rooms w/o the field default to 淘汰制 for back-compat. */
function endModeOf(state: RoomState): EndMode {
  return state.rules.endMode ?? 'attrition';
}

/**
 * Record a round-loss for the player at `idx` and apply its consequence per the
 * endMode house rule. ALWAYS bumps lossCount by 1 (one round lost). Dice are only
 * removed in 'attrition' (and the player is out at 0 dice); in 'knockout' the
 * player is eliminated once lossCount reaches rules.knockoutLosses; 'party'/'score'
 * never remove dice or eliminate. `diceLost` is the attrition severity (1, or 2 for
 * a failed 劈/通杀). Immutable.
 */
function applyLoss(state: RoomState, players: Player[], idx: number, diceLost: number): Player[] {
  const mode = endModeOf(state);
  return players.map((p, i) => {
    if (i !== idx) return p;
    const lossCount = (p.lossCount ?? 0) + 1;
    if (mode === 'attrition') {
      const left = Math.max(0, p.diceLeft - diceLost);
      return { ...p, diceLeft: left, lossCount, alive: left > 0 };
    }
    if (mode === 'knockout') {
      const knocked = lossCount >= (state.rules.knockoutLosses ?? 3);
      return { ...p, lossCount, alive: !knocked };
    }
    // party / score: dice and alive unchanged — only the loss is recorded.
    return { ...p, lossCount };
  });
}

/** Seat with the fewest recorded losses (lowest-seat tiebreak) — the score-mode winner. */
function lowestLossIdx(players: Player[]): number {
  let best = -1;
  let min = Number.POSITIVE_INFINITY;
  players.forEach((p, i) => {
    const l = p.lossCount ?? 0;
    if (l < min) {
      min = l;
      best = i;
    }
  });
  return best;
}

/** The owner of the current standing bid = the last entry in the round's bid chain. */
function standingBidderId(state: RoomState): string | null {
  return state.bidChain.length ? state.bidChain[state.bidChain.length - 1].playerId : null;
}

/** Build the reveal-phase state + outcome from a resolved set of losses. */
function finalize(
  state: RoomState,
  players: Player[],
  partial: Omit<ChallengeOutcome, 'gameEnded' | 'winnerIdx' | 'loserId'>,
): { ok: true; state: RoomState; outcome: ChallengeOutcome } {
  const mode = endModeOf(state);
  let gameEnded: boolean;
  let winnerIdx: number;
  if (mode === 'party') {
    // 聚会版: never ends on its own — runs until players leave (leaveRoom Lua ends it).
    gameEnded = false;
    winnerIdx = -1;
  } else if (mode === 'score') {
    // 计分制: ends after K rounds; fewest-losses player wins.
    gameEnded = state.round >= (state.rules.scoreRounds ?? 5);
    winnerIdx = gameEnded ? lowestLossIdx(players) : -1;
  } else {
    // attrition + knockout: last player standing wins.
    gameEnded = aliveCount(players) <= 1;
    winnerIdx = gameEnded ? lastAliveIdx(players) : -1;
  }
  const outcome: ChallengeOutcome = {
    ...partial,
    loserId: players[partial.loserIdx]?.id ?? '',
    gameEnded,
    winnerIdx,
  };
  return {
    ok: true,
    state: {
      ...state,
      players,
      phase: 'reveal',
      lastChallengeResult: outcome,
      version: state.version + 1,
    },
    outcome,
  };
}

/**
 * 开 (Dudo) — challenge the standing bid. actual ≥ count → challenger loses a die;
 * actual < count → the bidder (standing-bid owner) loses a die.
 */
export function resolveChallenge(
  state: RoomState,
  hands: Hands,
  challengerId: string,
): ResolveResult {
  if (state.phase !== 'bidding') return { ok: false, reason: 'wrong_phase' };
  if (!state.lastBid) return { ok: false, reason: 'no_bid_to_challenge' };
  const challengerIdx = idxOf(state, challengerId);
  if (challengerIdx < 0 || !state.players[challengerIdx].alive)
    return { ok: false, reason: 'not_in_room' };
  if (state.players[state.currentTurnIdx]?.id !== challengerId)
    return { ok: false, reason: 'not_your_turn' };

  const bid = state.lastBid;
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
  const actualCount = countFace(hands, aliveIds, bid.face, wildOnesActive(state, bid));
  const meets = actualCount >= bid.count;

  const bidderId = standingBidderId(state);
  const bidderIdx =
    bidderId != null ? idxOf(state, bidderId) : prevAliveIdx(state.players, challengerIdx);
  const loserIdx = meets ? challengerIdx : bidderIdx;
  const players = applyLoss(state, state.players, loserIdx, 1);

  return finalize(state, players, {
    kind: 'challenge',
    actualCount,
    verifiedBid: bid,
    bidderIdx,
    loserIdx,
    loserIds: [state.players[loserIdx].id],
    diceLost: 1,
    actualMeetsBid: meets,
  });
}

/**
 * 劈 (Split / 跳杀) — skip your predecessor and challenge a SPECIFIC non-adjacent
 * player's bid from the round chain. If that bid is false → the target loses a die;
 * if true → the splitter loses a die (2 dice when 反劈 is enabled — the bite-back).
 *
 * Played on YOUR turn (in-turn variant), not as an out-of-turn interrupt — a
 * deliberate simplification of the table rule, pinned in spec §10B.
 */
export function resolvePi(
  state: RoomState,
  hands: Hands,
  splitterId: string,
  targetId: string,
): ResolveResult {
  if (!state.rules.chineseExtensions.pi) return { ok: false, reason: 'pi_disabled' };
  if (state.phase !== 'bidding') return { ok: false, reason: 'wrong_phase' };
  if (!state.lastBid) return { ok: false, reason: 'no_bid_to_challenge' };
  const splitterIdx = idxOf(state, splitterId);
  if (splitterIdx < 0 || !state.players[splitterIdx].alive)
    return { ok: false, reason: 'not_in_room' };
  if (state.players[state.currentTurnIdx]?.id !== splitterId)
    return { ok: false, reason: 'not_your_turn' };

  const targetIdx = idxOf(state, targetId);
  if (targetIdx < 0 || !state.players[targetIdx].alive || targetId === splitterId)
    return { ok: false, reason: 'invalid_target' };
  // 劈 must skip the predecessor — challenging the standing-bid owner is just 开.
  if (targetId === standingBidderId(state))
    return { ok: false, reason: 'pi_target_is_predecessor' };
  const targetEntry = [...state.bidChain].reverse().find((e) => e.playerId === targetId);
  if (!targetEntry) return { ok: false, reason: 'pi_target_no_bid' };

  const tbid = targetEntry.bid;
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
  const actualCount = countFace(hands, aliveIds, tbid.face, wildOnesActive(state, tbid));
  const meets = actualCount >= tbid.count;

  const loserIdx = meets ? splitterIdx : targetIdx;
  const diceLost = meets && state.rules.chineseExtensions.fanpi ? 2 : 1;
  const players = applyLoss(state, state.players, loserIdx, diceLost);

  return finalize(state, players, {
    kind: 'pi',
    actualCount,
    verifiedBid: tbid,
    bidderIdx: targetIdx,
    loserIdx,
    loserIds: [state.players[loserIdx].id],
    diceLost,
    actualMeetsBid: meets,
  });
}

/**
 * 通杀 (连开 / Chain dudo) — challenge the standing bid; if it is false, EVERY other
 * player who bid this round loses a die (sweep). If it holds, the 通杀er loses 2 dice.
 */
export function resolveTongsha(state: RoomState, hands: Hands, tongshaId: string): ResolveResult {
  if (!state.rules.chineseExtensions.tongsha) return { ok: false, reason: 'tongsha_disabled' };
  if (state.phase !== 'bidding') return { ok: false, reason: 'wrong_phase' };
  if (!state.lastBid) return { ok: false, reason: 'no_bid_to_challenge' };
  const tIdx = idxOf(state, tongshaId);
  if (tIdx < 0 || !state.players[tIdx].alive) return { ok: false, reason: 'not_in_room' };
  if (state.players[state.currentTurnIdx]?.id !== tongshaId)
    return { ok: false, reason: 'not_your_turn' };

  const bid = state.lastBid;
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
  const actualCount = countFace(hands, aliveIds, bid.face, wildOnesActive(state, bid));
  const meets = actualCount >= bid.count;

  const chainBidderIds = [...new Set(state.bidChain.map((e) => e.playerId))].filter(
    (id) => id !== tongshaId && state.players[idxOf(state, id)]?.alive,
  );
  if (chainBidderIds.length === 0) return { ok: false, reason: 'tongsha_no_targets' };

  let players = state.players;
  let loserIds: string[];
  let loserIdx: number;
  let diceLost: number;
  if (!meets) {
    // Sweep: every other chain bidder loses a die.
    for (const id of chainBidderIds) players = applyLoss(state, players, idxOf(state, id), 1);
    loserIds = chainBidderIds;
    loserIdx = idxOf(state, chainBidderIds[0]);
    diceLost = 1;
  } else {
    // Backfire: the 通杀er loses 2 dice.
    players = applyLoss(state, players, tIdx, 2);
    loserIds = [tongshaId];
    loserIdx = tIdx;
    diceLost = 2;
  }

  return finalize(state, players, {
    kind: 'tongsha',
    actualCount,
    verifiedBid: bid,
    bidderIdx:
      standingBidderId(state) != null ? idxOf(state, standingBidderId(state) as string) : tIdx,
    loserIdx,
    loserIds,
    diceLost,
    actualMeetsBid: meets,
  });
}

/**
 * Advance reveal → next round (or game_end). Computes Palifico setup: the first time
 * a player drops to exactly 1 die, the next round is theirs to open with 1s not wild
 * and the count locked (research §3.4). Otherwise the round loser opens.
 *
 * The caller (route) deals fresh hands for the returned state and commits atomically.
 */
export function prepareNextRound(state: RoomState): {
  ok: boolean;
  state?: RoomState;
  reason?: string;
} {
  if (state.phase !== 'reveal') return { ok: false, reason: 'wrong_phase' };
  const res = state.lastChallengeResult;
  if (!res) return { ok: false, reason: 'no_result' };
  if (res.gameEnded) {
    return { ok: true, state: { ...state, phase: 'game_end', version: state.version + 1 } };
  }

  const freshOnes = state.players.filter(
    (p) => p.alive && p.diceLeft === 1 && !state.palificoTriggered.includes(p.id),
  );
  let palificoActive = false;
  let palificoBidderId: string | null = null;
  let palificoTriggered = state.palificoTriggered;
  let openerIdx: number;

  if (state.rules.paliFicoVariant && freshOnes.length > 0) {
    // The player who just dropped to 1 die opens (research §3.4 "他永远先叫"). Prefer
    // a freshly-1-die player among this round's losers (loserIds covers 通杀 sweeps,
    // where loserId may be a multi-die player); else lowest seat. Mark every current
    // 1-die player so each only ever triggers Palifico once.
    const opener = freshOnes.find((p) => res.loserIds.includes(p.id)) ?? freshOnes[0];
    palificoActive = true;
    palificoBidderId = opener.id;
    openerIdx = idxOf(state, opener.id);
    palificoTriggered = [...state.palificoTriggered, ...freshOnes.map((p) => p.id)];
  } else {
    // Round loser opens the next round (or the next alive seat if eliminated).
    const loserIdx = res.loserIdx;
    openerIdx = state.players[loserIdx]?.alive ? loserIdx : nextAliveIdx(state.players, loserIdx);
  }

  return {
    ok: true,
    state: {
      ...state,
      phase: 'bidding',
      round: state.round + 1,
      currentTurnIdx: openerIdx,
      lastBid: null,
      isZhaiRound: false,
      bidChain: [],
      palificoActive,
      palificoBidderId,
      palificoTriggered,
      lastChallengeResult: null,
      version: state.version + 1,
    },
  };
}
