import { describe, expect, it } from 'vitest';
import {
  type Hands,
  prepareNextRound,
  resolveChallenge,
  resolvePi,
  resolveTongsha,
} from '@/lib/game-engine/round';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDEF',
    phase: 'bidding',
    players: [
      { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 5, alive: true },
      { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 5, alive: true },
      { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 5, alive: true },
    ],
    ownerId: 'p1',
    currentTurnIdx: 2,
    lastBid: { count: 6, face: 4, isZhai: false },
    bidChain: [
      { playerId: 'p1', bid: { count: 5, face: 4, isZhai: false } },
      { playerId: 'p2', bid: { count: 6, face: 4, isZhai: false } },
    ],
    isZhaiRound: false,
    round: 1,
    rules: {
      ...DEFAULT_RULES,
      chineseExtensions: { pi: true, fanpi: false, tongsha: true },
      paliFicoVariant: true,
    },
    theme: 'modern-minimal',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
    ...overrides,
  };
}

// p1 has 2×4 + one wild 1 (=3 toward 4); p2 has 1×4 + one wild 1 (=2); p3 has none.
const HANDS: Hands = {
  p1: [4, 4, 1, 2, 3],
  p2: [4, 5, 5, 1, 3],
  p3: [6, 6, 6, 6, 6],
};

describe('resolveChallenge (开)', () => {
  it('bid too high → bidder loses (actual 5 < bid 6, wild 1s counted)', () => {
    const r = resolveChallenge(makeState(), HANDS, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.actualCount).toBe(5); // 3 + 2 + 0
    expect(r.outcome.loserId).toBe('p2'); // standing bidder
    expect(r.state.players[1].diceLeft).toBe(4);
    expect(r.state.phase).toBe('reveal');
    expect(r.outcome.actualMeetsBid).toBe(false);
  });

  it('bid met → challenger loses', () => {
    const s = makeState({
      lastBid: { count: 4, face: 4, isZhai: false },
      bidChain: [{ playerId: 'p2', bid: { count: 4, face: 4, isZhai: false } }],
    });
    const r = resolveChallenge(s, HANDS, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.actualMeetsBid).toBe(true); // 5 >= 4
    expect(r.outcome.loserId).toBe('p3'); // challenger
  });

  it('zhai bid → 1s are NOT wild', () => {
    const s = makeState({
      lastBid: { count: 4, face: 4, isZhai: true },
      bidChain: [{ playerId: 'p2', bid: { count: 4, face: 4, isZhai: true } }],
    });
    const r = resolveChallenge(s, HANDS, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.actualCount).toBe(3); // native 4s only: 2 + 1 + 0
    expect(r.outcome.loserId).toBe('p2'); // 3 < 4 → bidder loses
  });

  it('rejects when not the challenger’s turn', () => {
    const r = resolveChallenge(makeState({ currentTurnIdx: 0 }), HANDS, 'p3');
    expect(r.ok).toBe(false);
  });

  it('flags game_end when the loser is eliminated to one survivor', () => {
    const s = makeState({
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 0, alive: false },
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 5, alive: true },
      ],
      lastBid: { count: 9, face: 4, isZhai: false },
      bidChain: [{ playerId: 'p2', bid: { count: 9, face: 4, isZhai: false } }],
    });
    const r = resolveChallenge(s, HANDS, 'p3'); // actual 5 < 9 → p2 loses last die
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.gameEnded).toBe(true);
    expect(r.outcome.winnerIdx).toBe(2); // p3 last alive
  });
});

describe('resolvePi (劈)', () => {
  it('target’s bid false → target loses a die', () => {
    // p3 劈 targets p1, whose bid was {count:5, face:4}. actual 4s = 5 ≥ 5 → p1 true → splitter loses.
    // Make p1's bid unmeetable to test target-loses: target bid {count:6}.
    const s = makeState({
      bidChain: [
        { playerId: 'p1', bid: { count: 6, face: 4, isZhai: false } },
        { playerId: 'p2', bid: { count: 6, face: 4, isZhai: false } },
      ],
    });
    const r = resolvePi(s, HANDS, 'p3', 'p1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.actualMeetsBid).toBe(false); // 5 < 6
    expect(r.outcome.loserId).toBe('p1');
    expect(r.outcome.kind).toBe('pi');
    expect(r.state.players[0].diceLeft).toBe(4);
  });

  it('target’s bid true → splitter loses a die (no 反劈)', () => {
    const s = makeState({
      bidChain: [
        { playerId: 'p1', bid: { count: 4, face: 4, isZhai: false } },
        { playerId: 'p2', bid: { count: 6, face: 4, isZhai: false } },
      ],
    });
    const r = resolvePi(s, HANDS, 'p3', 'p1'); // p1 bid 4 ≤ 5 → true → splitter p3 loses
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserId).toBe('p3');
    expect(r.outcome.diceLost).toBe(1);
  });

  it('反劈 escalates a failed 劈 to 2 dice', () => {
    const s = makeState({
      rules: {
        ...DEFAULT_RULES,
        chineseExtensions: { pi: true, fanpi: true, tongsha: false },
        paliFicoVariant: false,
      },
      bidChain: [
        { playerId: 'p1', bid: { count: 4, face: 4, isZhai: false } },
        { playerId: 'p2', bid: { count: 6, face: 4, isZhai: false } },
      ],
    });
    const r = resolvePi(s, HANDS, 'p3', 'p1'); // p1 true → splitter wrong → -2
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserId).toBe('p3');
    expect(r.outcome.diceLost).toBe(2);
    expect(r.state.players[2].diceLeft).toBe(3);
  });

  it('rejects targeting the immediate predecessor (use 开)', () => {
    const r = resolvePi(makeState(), HANDS, 'p3', 'p2'); // p2 is the standing bidder
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('pi_target_is_predecessor');
  });

  it('rejects when 劈 disabled', () => {
    const s = makeState({
      rules: { ...DEFAULT_RULES, chineseExtensions: { pi: false, fanpi: false, tongsha: false } },
    });
    expect(resolvePi(s, HANDS, 'p3', 'p1').ok).toBe(false);
  });
});

describe('resolveTongsha (通杀/连开)', () => {
  it('standing bid false → every other chain bidder loses a die', () => {
    const r = resolveTongsha(makeState(), HANDS, 'p3'); // standing 6×4, actual 5 < 6 → sweep p1,p2
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserIds.sort()).toEqual(['p1', 'p2']);
    expect(r.state.players[0].diceLeft).toBe(4);
    expect(r.state.players[1].diceLeft).toBe(4);
    expect(r.state.players[2].diceLeft).toBe(5); // tongsha-er safe
  });

  it('standing bid true → 通杀er loses 2 dice', () => {
    const s = makeState({
      lastBid: { count: 4, face: 4, isZhai: false },
      bidChain: [
        { playerId: 'p1', bid: { count: 3, face: 4, isZhai: false } },
        { playerId: 'p2', bid: { count: 4, face: 4, isZhai: false } },
      ],
    });
    const r = resolveTongsha(s, HANDS, 'p3'); // actual 5 ≥ 4 → backfire
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserIds).toEqual(['p3']);
    expect(r.state.players[2].diceLeft).toBe(3);
  });

  it('rejects when 通杀 disabled', () => {
    const s = makeState({
      rules: { ...DEFAULT_RULES, chineseExtensions: { pi: false, fanpi: false, tongsha: false } },
    });
    expect(resolveTongsha(s, HANDS, 'p3').ok).toBe(false);
  });
});

describe('prepareNextRound + Palifico', () => {
  it('game over → game_end', () => {
    const s = makeState({
      phase: 'reveal',
      lastChallengeResult: {
        kind: 'challenge',
        actualCount: 0,
        verifiedBid: { count: 1, face: 4, isZhai: false },
        bidderIdx: 0,
        loserIdx: 0,
        loserId: 'p1',
        loserIds: ['p1'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: true,
        winnerIdx: 1,
      },
    });
    const r = prepareNextRound(s);
    expect(r.ok).toBe(true);
    expect(r.state?.phase).toBe('game_end');
  });

  it('a player newly at 1 die triggers a Palifico round they open', () => {
    const s = makeState({
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 5, alive: true },
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 5, alive: true },
      ],
      lastChallengeResult: {
        kind: 'challenge',
        actualCount: 0,
        verifiedBid: { count: 9, face: 4, isZhai: false },
        bidderIdx: 1,
        loserIdx: 1,
        loserId: 'p2',
        loserIds: ['p2'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    const r = prepareNextRound(s);
    expect(r.ok).toBe(true);
    expect(r.state?.palificoActive).toBe(true);
    expect(r.state?.palificoBidderId).toBe('p2');
    expect(r.state?.currentTurnIdx).toBe(1); // p2 opens
    expect(r.state?.palificoTriggered).toContain('p2');
    expect(r.state?.phase).toBe('bidding');
    expect(r.state?.bidChain).toEqual([]);
  });

  it('Palifico opener prefers the round loser when several drop to 1 die at once', () => {
    const s = makeState({
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 1, alive: true },
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 5, alive: true },
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 1, alive: true },
      ],
      lastChallengeResult: {
        kind: 'challenge',
        actualCount: 0,
        verifiedBid: { count: 9, face: 4, isZhai: false },
        bidderIdx: 2,
        loserIdx: 2,
        loserId: 'p3',
        loserIds: ['p3'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    const r = prepareNextRound(s);
    expect(r.state?.palificoActive).toBe(true);
    expect(r.state?.palificoBidderId).toBe('p3'); // the loser, not lowest-seat p1
    expect(r.state?.currentTurnIdx).toBe(2);
    expect((r.state?.palificoTriggered ?? []).slice().sort()).toEqual(['p1', 'p3']); // both marked
  });

  it('Palifico after a 通杀 sweep — a swept 1-die loser opens (loserIds, not loserId)', () => {
    const s = makeState({
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 5, alive: true }, // 通杀er, safe
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 1, alive: true }, // swept to 1
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 1, alive: true }, // swept to 1
      ],
      lastChallengeResult: {
        kind: 'tongsha',
        actualCount: 0,
        verifiedBid: { count: 9, face: 4, isZhai: false },
        bidderIdx: 1,
        loserIdx: 1,
        loserId: 'p2',
        loserIds: ['p2', 'p3'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    const r = prepareNextRound(s);
    expect(r.state?.palificoActive).toBe(true);
    expect(['p2', 'p3']).toContain(r.state?.palificoBidderId); // a swept 1-die loser, never the safe p1
    expect((r.state?.palificoTriggered ?? []).slice().sort()).toEqual(['p2', 'p3']);
  });

  it('Palifico is one-shot — an already-triggered 1-die player does not re-trigger', () => {
    const s = makeState({
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 3, alive: true },
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 3, alive: true },
      ],
      palificoTriggered: ['p2'],
      lastChallengeResult: {
        kind: 'challenge',
        actualCount: 0,
        verifiedBid: { count: 9, face: 4, isZhai: false },
        bidderIdx: 0,
        loserIdx: 0,
        loserId: 'p1',
        loserIds: ['p1'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    const r = prepareNextRound(s);
    expect(r.state?.palificoActive).toBe(false);
    expect(r.state?.currentTurnIdx).toBe(0); // loser (p1) opens
  });
});
