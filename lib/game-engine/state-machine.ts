import type { ChallengeResult } from './resolve';
import type { Phase, Player, RoomState } from './types';

export type Transition =
  | { type: 'start_game' }
  | { type: 'all_rolled' }
  | { type: 'next_bidder'; nextIdx: number }
  | { type: 'challenge'; challengerIdx: number }
  | { type: 'resolve'; result: ChallengeResult }
  | { type: 'round_end_advance' }
  | { type: 'game_over' };

export const PHASE_FLOW: Record<Phase, Phase[]> = {
  lobby: ['rolling'],
  rolling: ['bidding'],
  bidding: ['bidding', 'reveal'],
  reveal: ['round_end'],
  round_end: ['rolling', 'game_end'],
  game_end: [],
};

export function nextAliveIdx(players: Player[], from: number): number {
  const n = players.length;
  let i = from;
  do {
    i = (i + 1) % n;
  } while (!players[i].alive && i !== from);
  return i;
}

export function applyTransition(state: RoomState, transition: Transition): RoomState {
  switch (transition.type) {
    case 'start_game':
      return { ...state, phase: 'rolling', round: state.round + 1, currentTurnIdx: 0, lastBid: null, isZhaiRound: false, version: state.version + 1 };
    case 'all_rolled':
      return { ...state, phase: 'bidding', version: state.version + 1 };
    case 'next_bidder':
      return { ...state, currentTurnIdx: transition.nextIdx, version: state.version + 1 };
    case 'challenge':
      return { ...state, phase: 'reveal', currentTurnIdx: transition.challengerIdx, version: state.version + 1 };
    case 'resolve': {
      const { loserIdx } = transition.result;
      const players = state.players.map((p, i) =>
        i === loserIdx
          ? { ...p, diceLeft: Math.max(0, p.diceLeft - 1), alive: p.diceLeft - 1 > 0 }
          : p,
      );
      const alive = players.filter((p) => p.alive).length;
      const phase: Phase = alive <= 1 ? 'game_end' : 'round_end';
      return { ...state, players, phase, version: state.version + 1 };
    }
    case 'round_end_advance':
      return { ...state, phase: 'rolling', round: state.round + 1, lastBid: null, isZhaiRound: false, version: state.version + 1 };
    case 'game_over':
      return { ...state, phase: 'game_end', version: state.version + 1 };
    default:
      return state;
  }
}
