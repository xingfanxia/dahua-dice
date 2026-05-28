import { describe, expect, it } from 'vitest';
import { resolveChallenge } from '@/lib/game-engine/resolve';
import { applyTransition } from '@/lib/game-engine/state-machine';
import { type Bid, DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';
import { isValidBid } from '@/lib/game-engine/validate';

function newGame(): RoomState {
  return {
    code: 'GAME01',
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
    createdAt: Date.now(),
  };
}

describe('full-game integration', () => {
  it('plays one complete round: start → bid → bid → challenge → resolve', () => {
    let state = newGame();
    state = applyTransition(state, { type: 'start_game' });
    expect(state.phase).toBe('rolling');
    expect(state.round).toBe(1);

    state = applyTransition(state, { type: 'all_rolled' });
    expect(state.phase).toBe('bidding');

    // Hands: Alice=[4,4,1,2,3], Bob=[4,5,5,1,3], Cory=[6,6,6,6,6]
    const hands = [
      [4, 4, 1, 2, 3],
      [4, 5, 5, 1, 3],
      [6, 6, 6, 6, 6],
    ];

    // Alice opens with 5 × 4 (3 alive players → starting threshold = ceil(1.5*3) = 5)
    const bid1: Bid = { count: 5, face: 4, isZhai: false };
    const v1 = isValidBid(state.lastBid, bid1, state.rules, 3);
    expect(v1.ok).toBe(true);
    state = { ...state, lastBid: bid1, currentTurnIdx: 1, version: state.version + 1 };

    // Bob bids 6 × 4
    const bid2: Bid = { count: 6, face: 4, isZhai: false };
    const v2 = isValidBid(state.lastBid, bid2, state.rules, 3);
    expect(v2.ok).toBe(true);
    state = { ...state, lastBid: bid2, currentTurnIdx: 2, version: state.version + 1 };

    // Cory challenges
    state = applyTransition(state, { type: 'challenge', challengerIdx: 2 });
    expect(state.phase).toBe('reveal');

    // Resolve: actual native 4s = 2 (Alice) + 1 (Bob) = 3; wild ones = 1 (Alice) + 1 (Bob) = 2; total = 5
    // bid was 6 → actual 5 < 6 → BIDDER (Bob = idx 1) loses
    const result = resolveChallenge(state.lastBid!, hands, state.rules, 2, 1);
    expect(result.actualCount).toBe(5);
    expect(result.loserIdx).toBe(1);

    state = applyTransition(state, { type: 'resolve', result });
    expect(state.players[1].diceLeft).toBe(4);
    expect(state.phase).toBe('round_end');
  });

  it('plays through to game_end (player elimination)', () => {
    let state = newGame();
    // Manually whittle down to 1 alive
    state = {
      ...state,
      phase: 'reveal',
      players: [
        { id: 'p1', nick: 'A', avatar: '', diceLeft: 5, alive: true },
        { id: 'p2', nick: 'B', avatar: '', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: '', diceLeft: 0, alive: false },
      ],
    };
    state = applyTransition(state, {
      type: 'resolve',
      result: { actualCount: 3, loserIdx: 1, actualMeetsBid: true },
    });
    expect(state.phase).toBe('game_end');
    expect(state.players.filter((p) => p.alive).length).toBe(1);
  });

  it('zhai opener then break-zhai sequence', () => {
    const state = newGame();
    // Zhai opener: alive=3, threshold=3
    const zhaiBid: Bid = { count: 3, face: 4, isZhai: true };
    expect(isValidBid(null, zhaiBid, state.rules, 3).ok).toBe(true);

    // Stay-in-zhai
    const next: Bid = { count: 4, face: 4, isZhai: true };
    expect(isValidBid(zhaiBid, next, state.rules, 3).ok).toBe(true);

    // Break out: must be >= 8 (4 × 2)
    expect(isValidBid(next, { count: 7, face: 4, isZhai: false }, state.rules, 3).ok).toBe(false);
    expect(isValidBid(next, { count: 8, face: 4, isZhai: false }, state.rules, 3).ok).toBe(true);
  });
});
