import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevealStage } from '@/components/game/RevealStage';
import {
  type Bid,
  type ChallengeOutcome,
  DEFAULT_RULES,
  type EndMode,
  type RoomState,
} from '@/lib/game-engine/types';

// Passthrough i18n: t(key) and t.rich(key) both return the key, so assertions check
// WHICH message branch renders (the bug-prone part: meets routing, attribution trick,
// party-vs-attrition, zhai-vs-wild). Numbers (subtotal, total) render directly.
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    (t as unknown as { rich: (k: string) => string }).rich = (key: string) => key;
    return t;
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Player = RoomState['players'][number];

function mkState(opts: {
  lastBid: Bid;
  outcome: ChallengeOutcome;
  hands: Record<string, number[]>;
  endMode?: EndMode;
  aceWild?: boolean;
  players?: Player[];
}): { state: RoomState; hands: Record<string, number[]> } {
  const players: Player[] = opts.players ?? [
    { id: 'a', nick: 'Alice', avatar: 'numeric', diceLeft: 3, alive: true, lossCount: 0 },
    { id: 'b', nick: 'Bob', avatar: 'numeric', diceLeft: 3, alive: true, lossCount: 0 },
  ];
  const state: RoomState = {
    code: 'X',
    phase: 'reveal',
    players,
    ownerId: 'a',
    currentTurnIdx: 0,
    lastBid: opts.lastBid,
    bidChain: [],
    isZhaiRound: opts.lastBid.isZhai,
    round: 1,
    rules: {
      ...DEFAULT_RULES,
      aceWild: opts.aceWild ?? true,
      endMode: opts.endMode ?? 'attrition',
    },
    theme: 'wxapp',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
    lastChallengeResult: opts.outcome,
  };
  return { state, hands: opts.hands };
}

describe('RevealStage causal clarity', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // Reduced motion → the verdict/ruling block shows immediately (no 1200ms wait).
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (s: { state: RoomState; hands: Record<string, number[]> }) =>
    act(() => {
      root.render(createElement(RevealStage, { state: s.state, hands: s.hands, myPlayerId: 'a' }));
    });
  const text = () => container.textContent ?? '';

  it('bluff (actual < called): ✗ verdict, bidder loses, ＜ glyph, real+wild split', () => {
    render(
      mkState({
        lastBid: { count: 5, face: 4, isZhai: false },
        hands: { a: [4, 4, 1], b: [2, 3, 5] }, // two real 4s + one wild 1 → 3 across the table
        outcome: {
          kind: 'challenge',
          actualCount: 3,
          verifiedBid: { count: 5, face: 4, isZhai: false },
          bidderIdx: 0,
          loserIdx: 0,
          loserId: 'a',
          loserIds: ['a'],
          diceLost: 1,
          actualMeetsBid: false,
          gameEnded: false,
          winnerIdx: -1,
        },
      }),
    );
    expect(text()).toContain('game.reveal.bluff');
    expect(text()).toContain('game.reveal.rulingChallengeFails');
    expect(text()).toContain('＜');
    expect(text()).not.toContain('game.reveal.bidStands');
    // wild was active and a 1 stood in → the real+wild split renders (not the zhai note).
    expect(text()).toContain('game.reveal.realWildSplit');
    expect(text()).not.toContain('game.reveal.zhaiNote');
    // per-player subtotals: Alice 3 (4,4,1 with wild), Bob 0.
    const subs = [...container.querySelectorAll('.w-6')].map((el) => el.textContent);
    expect(subs).toEqual(['3', '0']);
  });

  it('bid stands (actual ≥ called): ✓ verdict, challenger loses via the attribution trick', () => {
    render(
      mkState({
        lastBid: { count: 2, face: 4, isZhai: false },
        hands: { a: [4, 4, 5], b: [4, 3, 2] },
        outcome: {
          kind: 'challenge',
          actualCount: 3,
          verifiedBid: { count: 2, face: 4, isZhai: false },
          bidderIdx: 0,
          loserIdx: 1,
          loserId: 'b', // the challenger; meets=true → the actor IS the loser
          loserIds: ['b'],
          diceLost: 1,
          actualMeetsBid: true,
          gameEnded: false,
          winnerIdx: -1,
        },
      }),
    );
    expect(text()).toContain('game.reveal.bidStands');
    expect(text()).toContain('game.reveal.rulingChallengeMeets');
    expect(text()).toContain('≥');
    expect(text()).not.toContain('game.reveal.bluff');
  });

  it('party mode: loser drinks (🍺) instead of losing a die', () => {
    const s = mkState({
      endMode: 'party',
      lastBid: { count: 9, face: 6, isZhai: false },
      hands: { a: [1, 2, 3], b: [2, 3, 4] },
      outcome: {
        kind: 'challenge',
        actualCount: 1,
        verifiedBid: { count: 9, face: 6, isZhai: false },
        bidderIdx: 0,
        loserIdx: 0,
        loserId: 'a',
        loserIds: ['a'],
        diceLost: 1,
        actualMeetsBid: false,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    render(s);
    expect(text()).toContain('game.reveal.drinkUp');
    expect(text()).not.toContain('game.reveal.minusDie');
  });

  it.each([
    'knockout',
    'score',
  ] as const)('%s mode: the loser takes a recorded loss (no die, no drink)', (mode) => {
    render(
      mkState({
        endMode: mode,
        lastBid: { count: 9, face: 6, isZhai: false },
        hands: { a: [1, 2, 3], b: [2, 3, 4] },
        outcome: {
          kind: 'challenge',
          actualCount: 1,
          verifiedBid: { count: 9, face: 6, isZhai: false },
          bidderIdx: 0,
          loserIdx: 0,
          loserId: 'a',
          loserIds: ['a'],
          diceLost: 1,
          actualMeetsBid: false,
          gameEnded: false,
          winnerIdx: -1,
        },
      }),
    );
    expect(text()).toContain('game.reveal.tookLoss');
    expect(text()).not.toContain('game.reveal.drinkUp'); // 🍺 is party-only
    expect(text()).not.toContain('game.reveal.minusDie'); // dice are kept
  });

  it('attrition with diceLost 2 (failed sweep): -N dice + tongsha ruling', () => {
    render(
      mkState({
        lastBid: { count: 4, face: 5, isZhai: false },
        hands: { a: [5, 5, 1], b: [5, 2, 3] },
        outcome: {
          kind: 'tongsha',
          actualCount: 4,
          verifiedBid: { count: 4, face: 5, isZhai: false },
          bidderIdx: 1,
          loserIdx: 0,
          loserId: 'a',
          loserIds: ['a'],
          diceLost: 2,
          actualMeetsBid: true,
          gameEnded: false,
          winnerIdx: -1,
        },
      }),
    );
    expect(text()).toContain('game.reveal.minusNDice');
    expect(text()).toContain('game.reveal.rulingTongshaMeets');
    expect(text()).not.toContain('game.reveal.minusDie');
  });

  it('zhai bid turns 1s off: no real+wild split, the zhai note shows instead', () => {
    const s = mkState({
      lastBid: { count: 2, face: 3, isZhai: true },
      hands: { a: [3, 1, 1], b: [3, 2, 4] }, // 1s do NOT count under zhai
      outcome: {
        kind: 'challenge',
        actualCount: 2,
        verifiedBid: { count: 2, face: 3, isZhai: true },
        bidderIdx: 0,
        loserIdx: 1,
        loserId: 'b',
        loserIds: ['b'],
        diceLost: 1,
        actualMeetsBid: true,
        gameEnded: false,
        winnerIdx: -1,
      },
    });
    render(s);
    expect(text()).toContain('game.reveal.zhaiNote');
    expect(text()).not.toContain('game.reveal.realWildSplit');
    // Alice's subtotal counts only the real 3 (the two 1s are inert under zhai) → 1.
    const subs = [...container.querySelectorAll('.w-6')].map((el) => el.textContent);
    expect(subs).toEqual(['1', '1']);
  });

  it('game end: champion line renders', () => {
    render(
      mkState({
        lastBid: { count: 3, face: 4, isZhai: false },
        hands: { a: [4, 4, 4], b: [2, 3, 5] },
        outcome: {
          kind: 'challenge',
          actualCount: 3,
          verifiedBid: { count: 3, face: 4, isZhai: false },
          bidderIdx: 0,
          loserIdx: 1,
          loserId: 'b',
          loserIds: ['b'],
          diceLost: 1,
          actualMeetsBid: true,
          gameEnded: true,
          winnerIdx: 0,
        },
      }),
    );
    expect(text()).toContain('game.champion');
  });
});
