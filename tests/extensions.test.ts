import { describe, expect, it } from 'vitest';
import {
  getPalificoConstraints,
  isPalificoActive,
  resolveFanpi,
  resolvePi,
  resolveTongsha,
} from '@/lib/game-engine/extensions';
import { DEFAULT_RULES, type RoomState } from '@/lib/game-engine/types';

function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDEF',
    phase: 'bidding',
    players: [
      { id: 'p1', nick: 'A', avatar: '', diceLeft: 5, alive: true },
      { id: 'p2', nick: 'B', avatar: '', diceLeft: 5, alive: true },
      { id: 'p3', nick: 'C', avatar: '', diceLeft: 5, alive: true },
    ],
    ownerId: 'p1',
    currentTurnIdx: 0,
    lastBid: { count: 5, face: 4, isZhai: false },
    isZhaiRound: false,
    round: 1,
    rules: {
      ...DEFAULT_RULES,
      chineseExtensions: { pi: true, fanpi: true, tongsha: true },
      paliFicoVariant: true,
    },
    theme: 'modern-minimal',
    version: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe('resolvePi (劈)', () => {
  it('correct 劈 (actual === bid count): all OTHER players lose 1 die', () => {
    const s = makeState();
    const r = resolvePi(s, 0, 5, { count: 5, face: 4, isZhai: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0].diceLeft).toBe(5); // splitter safe
    expect(r.state.players[1].diceLeft).toBe(4);
    expect(r.state.players[2].diceLeft).toBe(4);
    expect(r.explanation).toBe('pi_correct');
  });

  it('wrong 劈 (actual !== bid count): splitter loses 2 dice', () => {
    const s = makeState();
    const r = resolvePi(s, 0, 4, { count: 5, face: 4, isZhai: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0].diceLeft).toBe(3); // splitter -2
    expect(r.state.players[1].diceLeft).toBe(5); // others safe
    expect(r.explanation).toBe('pi_wrong');
  });

  it('refuses when rule is disabled', () => {
    const s = makeState({
      rules: { ...DEFAULT_RULES, chineseExtensions: { pi: false, fanpi: false, tongsha: false } },
    });
    const r = resolvePi(s, 0, 5, { count: 5, face: 4, isZhai: false });
    expect(r.ok).toBe(false);
  });
});

describe('resolveFanpi (反劈)', () => {
  it('counter-split was wrong (pi was right): -3 dice penalty', () => {
    const s = makeState();
    const r = resolveFanpi(s, 1, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[1].diceLeft).toBe(2); // 5 - 3
  });

  it('counter-split was right (pi was wrong): no penalty', () => {
    const s = makeState();
    const r = resolveFanpi(s, 1, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[1].diceLeft).toBe(5); // safe
  });
});

describe('resolveTongsha (通杀)', () => {
  it('eliminates all but the declared winner', () => {
    const s = makeState();
    const r = resolveTongsha(s, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe('game_end');
    expect(r.state.players[0].alive).toBe(true);
    expect(r.state.players[1].alive).toBe(false);
    expect(r.state.players[2].alive).toBe(false);
  });
});

describe('Palifico', () => {
  it('isPalificoActive: true when any alive player has exactly 1 die + variant enabled', () => {
    const s = makeState({
      players: [
        { id: 'p1', nick: 'A', avatar: '', diceLeft: 1, alive: true },
        { id: 'p2', nick: 'B', avatar: '', diceLeft: 5, alive: true },
      ],
    });
    expect(isPalificoActive(s)).toBe(true);
  });

  it('isPalificoActive: false when variant disabled', () => {
    const s = makeState({
      players: [
        { id: 'p1', nick: 'A', avatar: '', diceLeft: 1, alive: true },
        { id: 'p2', nick: 'B', avatar: '', diceLeft: 5, alive: true },
      ],
      rules: { ...DEFAULT_RULES, paliFicoVariant: false },
    });
    expect(isPalificoActive(s)).toBe(false);
  });

  it('getPalificoConstraints: aces-not-wild when active', () => {
    const s = makeState({
      players: [
        { id: 'p1', nick: 'A', avatar: '', diceLeft: 1, alive: true },
        { id: 'p2', nick: 'B', avatar: '', diceLeft: 5, alive: true },
      ],
    });
    const c = getPalificoConstraints(s, s.rules);
    expect(c?.acesNotWild).toBe(true);
  });

  it('getPalificoConstraints: null when not active', () => {
    const s = makeState();
    expect(getPalificoConstraints(s, s.rules)).toBeNull();
  });
});
