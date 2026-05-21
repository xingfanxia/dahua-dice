import { describe, expect, it } from 'vitest';
import { applyTransition, nextAliveIdx } from '@/lib/game-engine/state-machine';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDEF',
    phase: 'lobby',
    players: [
      { id: 'p1', nick: 'Alice', avatar: 'numeric', diceLeft: 5, alive: true },
      { id: 'p2', nick: 'Bob', avatar: 'emoji', diceLeft: 5, alive: true },
      { id: 'p3', nick: 'Cory', avatar: 'hanzi', diceLeft: 5, alive: true },
    ],
    ownerId: 'p1',
    currentTurnIdx: 0,
    lastBid: null,
    isZhaiRound: false,
    round: 0,
    rules: DEFAULT_RULES,
    theme: 'modern-minimal',
    version: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe('nextAliveIdx', () => {
  it('returns next alive player wrapping around', () => {
    const players = [
      { id: 'p1', nick: 'A', avatar: '', diceLeft: 5, alive: true },
      { id: 'p2', nick: 'B', avatar: '', diceLeft: 0, alive: false },
      { id: 'p3', nick: 'C', avatar: '', diceLeft: 5, alive: true },
    ];
    expect(nextAliveIdx(players, 0)).toBe(2); // skip eliminated p2
    expect(nextAliveIdx(players, 2)).toBe(0); // wrap to p1
  });
});

describe('applyTransition', () => {
  it('start_game moves lobby → rolling, increments round', () => {
    const s = makeState();
    const next = applyTransition(s, { type: 'start_game' });
    expect(next.phase).toBe('rolling');
    expect(next.round).toBe(1);
    expect(next.version).toBe(2);
  });

  it('all_rolled rolling → bidding', () => {
    const s = makeState({ phase: 'rolling' });
    const next = applyTransition(s, { type: 'all_rolled' });
    expect(next.phase).toBe('bidding');
  });

  it('challenge bidding → reveal', () => {
    const s = makeState({ phase: 'bidding' });
    const next = applyTransition(s, { type: 'challenge', challengerIdx: 1 });
    expect(next.phase).toBe('reveal');
    expect(next.currentTurnIdx).toBe(1);
  });

  it('resolve subtracts a die from loser and advances to round_end', () => {
    const s = makeState({ phase: 'reveal' });
    const next = applyTransition(s, {
      type: 'resolve',
      result: { actualCount: 4, loserIdx: 1, actualMeetsBid: true },
    });
    expect(next.phase).toBe('round_end');
    expect(next.players[1].diceLeft).toBe(4);
    expect(next.players[0].diceLeft).toBe(5);
  });

  it('resolve eliminates a player and transitions to game_end when only 1 alive', () => {
    const s = makeState({
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: '', diceLeft: 5, alive: true },
        { id: 'p2', nick: 'B', avatar: '', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: '', diceLeft: 0, alive: false },
      ],
    });
    const next = applyTransition(s, {
      type: 'resolve',
      result: { actualCount: 3, loserIdx: 1, actualMeetsBid: true },
    });
    expect(next.players[1].alive).toBe(false);
    expect(next.phase).toBe('game_end');
  });

  it('round_end_advance round_end → rolling, increments round, clears lastBid', () => {
    const s = makeState({
      phase: 'round_end',
      round: 3,
      lastBid: { count: 5, face: 4, isZhai: false },
      isZhaiRound: true,
    });
    const next = applyTransition(s, { type: 'round_end_advance' });
    expect(next.phase).toBe('rolling');
    expect(next.round).toBe(4);
    expect(next.lastBid).toBeNull();
    expect(next.isZhaiRound).toBe(false);
  });
});
