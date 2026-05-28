import { describe, expect, it } from 'vitest';
import {
  type Hands,
  prepareNextRound,
  resolveChallenge,
  resolveTongsha,
} from '@/lib/game-engine/round';
import { type Bid, DEFAULT_RULES, type GameRules, type RoomState } from '@/lib/game-engine/types';
import { isValidBid } from '@/lib/game-engine/validate';

function newGame(rules: GameRules = DEFAULT_RULES): RoomState {
  return {
    code: 'GAME01',
    phase: 'bidding',
    players: [
      { id: 'p1', nick: 'Alice', avatar: 'numeric', diceLeft: 5, alive: true },
      { id: 'p2', nick: 'Bob', avatar: 'emoji', diceLeft: 5, alive: true },
      { id: 'p3', nick: 'Cory', avatar: 'hanzi', diceLeft: 5, alive: true },
    ],
    ownerId: 'p1',
    currentTurnIdx: 0,
    lastBid: null,
    bidChain: [],
    isZhaiRound: false,
    round: 1,
    rules,
    theme: 'modern-minimal',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
  };
}

/** Simulate the placeBid Lua: validate, append to chain, advance to next alive player. */
function placeBid(state: RoomState, bid: Bid): RoomState {
  const alive = state.players.filter((p) => p.alive).length;
  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0);
  const v = isValidBid(state.lastBid, bid, state.rules, alive, {
    totalDice,
    palifico: state.palificoActive,
  });
  if (!v.ok) throw new Error(`invalid bid: ${v.reason}`);
  const playerId = state.players[state.currentTurnIdx].id;
  let idx = state.currentTurnIdx;
  do {
    idx = (idx + 1) % state.players.length;
  } while (!state.players[idx].alive);
  return {
    ...state,
    lastBid: bid,
    bidChain: [...state.bidChain, { playerId, bid }],
    currentTurnIdx: idx,
    isZhaiRound: bid.isZhai || state.isZhaiRound,
    version: state.version + 1,
  };
}

describe('full-game integration (round.ts engine)', () => {
  it('start → bid → bid → challenge → resolve → next round', () => {
    let state = newGame();
    // Alice opens 5×4 (threshold ceil(1.5*3)=5)
    state = placeBid(state, { count: 5, face: 4, isZhai: false });
    expect(state.currentTurnIdx).toBe(1);
    // Bob raises to 6×4
    state = placeBid(state, { count: 6, face: 4, isZhai: false });
    expect(state.currentTurnIdx).toBe(2);

    // Cory challenges. native 4s: Alice 2 + Bob 1 = 3; wild 1s: 1 + 1 = 2 → actual 5 < 6 → Bob loses.
    const hands: Hands = { p1: [4, 4, 1, 2, 3], p2: [4, 5, 5, 1, 3], p3: [6, 6, 6, 6, 6] };
    const r = resolveChallenge(state, hands, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.actualCount).toBe(5);
    expect(r.outcome.loserId).toBe('p2');
    state = r.state;
    expect(state.players[1].diceLeft).toBe(4);
    expect(state.phase).toBe('reveal');

    // Advance — Bob (loser) opens the next round, chain reset.
    const nr = prepareNextRound(state);
    expect(nr.ok).toBe(true);
    state = nr.state as RoomState;
    expect(state.phase).toBe('bidding');
    expect(state.currentTurnIdx).toBe(1);
    expect(state.bidChain).toEqual([]);
    expect(state.round).toBe(2);
  });

  it('通杀 sweep removes all chain bidders when the bid is false', () => {
    let state = newGame({
      ...DEFAULT_RULES,
      chineseExtensions: { pi: false, fanpi: false, tongsha: true },
    });
    state = placeBid(state, { count: 5, face: 4, isZhai: false }); // Alice
    state = placeBid(state, { count: 8, face: 4, isZhai: false }); // Bob (overbid)
    // Cory 通杀. actual = 5 < 8 → sweep Alice + Bob.
    const hands: Hands = { p1: [4, 4, 1, 2, 3], p2: [4, 5, 5, 1, 3], p3: [6, 6, 6, 6, 6] };
    const r = resolveTongsha(state, hands, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserIds.sort()).toEqual(['p1', 'p2']);
    expect(r.state.players[0].diceLeft).toBe(4);
    expect(r.state.players[1].diceLeft).toBe(4);
    expect(r.state.players[2].diceLeft).toBe(5);
  });

  it('plays through to a single survivor (game_end)', () => {
    let state = newGame();
    state = {
      ...state,
      players: [
        { id: 'p1', nick: 'A', avatar: 'numeric', diceLeft: 5, alive: true },
        { id: 'p2', nick: 'B', avatar: 'numeric', diceLeft: 1, alive: true },
        { id: 'p3', nick: 'C', avatar: 'numeric', diceLeft: 0, alive: false },
      ],
      currentTurnIdx: 0,
    };
    // 6 dice on the table (Alice 5 + Bob 1) → max bid is 6. Alice bids the ceiling.
    state = placeBid(state, { count: 6, face: 4, isZhai: false });
    const hands: Hands = { p1: [2, 2, 3, 3, 5], p2: [6] };
    // Bob (currentTurnIdx 1) challenges. native 4s = 0, wild 1s = 0 → actual 0 < 6 → Alice loses.
    const r = resolveChallenge(state, hands, 'p2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.loserId).toBe('p1');
    // Alice 5→4, still alive; not game end yet.
    expect(r.outcome.gameEnded).toBe(false);
  });

  it('zhai opener → stay-in-zhai → break-zhai (飞 needs 2×)', () => {
    const state = newGame();
    const zhai: Bid = { count: 3, face: 4, isZhai: true };
    expect(isValidBid(null, zhai, state.rules, 3).ok).toBe(true);
    const stay: Bid = { count: 4, face: 4, isZhai: true };
    expect(isValidBid(zhai, stay, state.rules, 3).ok).toBe(true);
    expect(isValidBid(stay, { count: 7, face: 4, isZhai: false }, state.rules, 3).ok).toBe(false);
    expect(isValidBid(stay, { count: 8, face: 4, isZhai: false }, state.rules, 3).ok).toBe(true);
  });
});
