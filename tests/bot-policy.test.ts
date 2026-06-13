import { describe, expect, it } from 'vitest';
import { decideBotAction, probBidHolds } from '@/lib/bot/policy';
import { isValidBid } from '@/lib/game-engine/validate';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

function state(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'BOT001',
    phase: 'bidding',
    players: [
      { id: 'me', nick: 'You', avatar: 'numeric', diceLeft: 5, alive: true },
      { id: 'bot', nick: 'Bot', avatar: 'numeric', diceLeft: 5, alive: true },
    ],
    ownerId: 'me',
    currentTurnIdx: 1,
    lastBid: null,
    bidChain: [],
    isZhaiRound: false,
    round: 1,
    rules: DEFAULT_RULES,
    theme: 'wxapp',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
    ...overrides,
  };
}

describe('decideBotAction', () => {
  it('challenges an impossible standing bid (more than the table can hold)', () => {
    const s = state({
      lastBid: { count: 8, face: 5, isZhai: false },
      bidChain: [{ playerId: 'me', bid: { count: 8, face: 5, isZhai: false } }],
    });
    // Bot holds no 5s and one wild 1 → can never reach 8 from its 5 + the 5 hidden.
    const action = decideBotAction(s, [1, 2, 3, 4, 6], 'hard', () => 0.99);
    expect(action.kind).toBe('challenge');
  });

  it('raises (legally) when the standing bid is plausible', () => {
    const s = state({
      lastBid: { count: 2, face: 5, isZhai: false },
      bidChain: [{ playerId: 'me', bid: { count: 2, face: 5, isZhai: false } }],
    });
    const action = decideBotAction(s, [5, 5, 1, 3, 4], 'medium', () => 0.99);
    expect(action.kind).toBe('bid');
    if (action.kind !== 'bid') return;
    expect(isValidBid(s.lastBid, action.bid, s.rules, 2, { totalDice: 10 }).ok).toBe(true);
    expect(action.bid.isZhai).toBe(false);
    expect(action.bid.face).toBeGreaterThanOrEqual(2); // never bids face 1
  });

  it('opens with a legal first bid when there is no standing bid', () => {
    const s = state({ currentTurnIdx: 1, lastBid: null });
    const action = decideBotAction(s, [6, 6, 6, 2, 3], 'easy', () => 0.99);
    expect(action.kind).toBe('bid');
    if (action.kind !== 'bid') return;
    expect(isValidBid(null, action.bid, s.rules, 2, { totalDice: 10 }).ok).toBe(true);
  });

  it('probBidHolds is 1 when the bot already holds enough', () => {
    const s = state();
    // four native 5s already cover a count-of-2 bid regardless of hidden dice.
    expect(probBidHolds(s, [5, 5, 5, 5, 2], { count: 2, face: 5, isZhai: false })).toBe(1);
  });

  it('easy bot tolerates a marginal bid that a hard bot would call', () => {
    // 3 players × 5 dice → 10 hidden from the bot. Standing bid 4×5, bot holds no
    // 5s: needs 4 from 10 hidden at p=1/3 → ≈0.44 likely — above easy's 0.3 (raise)
    // but below hard's 0.5 (challenge).
    const s = state({
      players: [
        { id: 'me', nick: 'You', avatar: 'numeric', diceLeft: 5, alive: true },
        { id: 'p2', nick: 'P2', avatar: 'numeric', diceLeft: 5, alive: true },
        { id: 'bot', nick: 'Bot', avatar: 'numeric', diceLeft: 5, alive: true },
      ],
      currentTurnIdx: 2,
      lastBid: { count: 4, face: 5, isZhai: false },
      bidChain: [{ playerId: 'me', bid: { count: 4, face: 5, isZhai: false } }],
    });
    const easy = decideBotAction(s, [2, 3, 4, 6, 6], 'easy', () => 0.99);
    const hard = decideBotAction(s, [2, 3, 4, 6, 6], 'hard', () => 0.99);
    expect(hard.kind).toBe('challenge'); // 0.44 < 0.5
    expect(easy.kind).toBe('bid'); // 0.44 < 0.3 is false → easy still raises
  });
});
