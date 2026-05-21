/**
 * 中式扩展规则 — Chinese-bar extensions to standard Liar's Dice.
 *
 * These are optional, toggled via `rules.chineseExtensions`. Each is pure-function
 * helper that returns the post-action room state mutation.
 *
 * 劈 (Pi):        A player "splits" a bid that matches exactly — declares the bid
 *                  is right on the count, before the next player acts. If correct,
 *                  every OTHER player loses 1 die; if wrong, the splitter loses 2.
 * 反劈 (Fanpi):    Counter-split — challenges a 劈. If the 劈 was wrong, the
 *                  counter-splitter is rewarded.
 * 通杀 (Tongsha):  End-game move — the winner of the last challenge declares
 *                  "tongsha" and all remaining losers go out simultaneously.
 *
 * Palifico:        When a player drops to 1 die, the next round is Palifico:
 *                  zhai-like (1s not wild), counts cannot decrease, and the
 *                  Palifico player bids first.
 */

import type { Bid, GameRules, Player, RoomState } from './types';

export type ExtensionAction =
  | { type: 'pi'; playerId: string }
  | { type: 'fanpi'; playerId: string }
  | { type: 'tongsha'; playerId: string };

export type ExtensionResult =
  | { ok: true; state: RoomState; explanation: string }
  | { ok: false; reason: string };

export function isPalificoActive(state: RoomState): boolean {
  if (!state.rules.paliFicoVariant) return false;
  return state.players.some((p) => p.alive && p.diceLeft === 1);
}

/**
 * Resolve a 劈 (Pi) action. The player declares the current bid is exactly correct.
 * Caller must supply the verified actual count (from challenging hands).
 */
export function resolvePi(
  state: RoomState,
  splitterIdx: number,
  actualCount: number,
  bid: Bid,
): ExtensionResult {
  if (!state.rules.chineseExtensions.pi) return { ok: false, reason: 'pi_disabled' };
  if (state.phase !== 'bidding') return { ok: false, reason: 'wrong_phase' };
  const splitter = state.players[splitterIdx];
  if (!splitter?.alive) return { ok: false, reason: 'splitter_eliminated' };

  const exact = actualCount === bid.count;
  const players: Player[] = state.players.map((p, i) => {
    if (i === splitterIdx) {
      // splitter: -2 dice on wrong, 0 on right
      const newCount = exact ? p.diceLeft : Math.max(0, p.diceLeft - 2);
      return { ...p, diceLeft: newCount, alive: newCount > 0 };
    }
    if (exact) {
      // all others lose 1 if splitter was right
      const newCount = Math.max(0, p.diceLeft - 1);
      return { ...p, diceLeft: newCount, alive: newCount > 0 };
    }
    return p;
  });

  return {
    ok: true,
    state: { ...state, players, phase: 'round_end', version: state.version + 1 },
    explanation: exact ? 'pi_correct' : 'pi_wrong',
  };
}

/**
 * Resolve a 反劈 (Fanpi) — counter-split. Triggered after another player's 劈.
 * If the 劈 was wrong, the counter-splitter is safe; else the counter-splitter
 * pays double the 劈 penalty.
 */
export function resolveFanpi(
  state: RoomState,
  counterSplitterIdx: number,
  piWasRight: boolean,
): ExtensionResult {
  if (!state.rules.chineseExtensions.fanpi) return { ok: false, reason: 'fanpi_disabled' };
  const counter = state.players[counterSplitterIdx];
  if (!counter?.alive) return { ok: false, reason: 'counter_eliminated' };

  const penalty = piWasRight ? 3 : 0; // -3 if 劈 was right (we mis-counter); 0 if wrong (safe)
  const players: Player[] = state.players.map((p, i) =>
    i === counterSplitterIdx
      ? {
          ...p,
          diceLeft: Math.max(0, p.diceLeft - penalty),
          alive: p.diceLeft - penalty > 0,
        }
      : p,
  );
  return {
    ok: true,
    state: { ...state, players, version: state.version + 1 },
    explanation: piWasRight ? 'fanpi_wrong' : 'fanpi_correct',
  };
}

/**
 * Resolve 通杀 — winner declares end-of-game. All other alive players are
 * eliminated. Requires rules.tongsha + a winning condition (e.g. last challenge winner).
 */
export function resolveTongsha(state: RoomState, winnerIdx: number): ExtensionResult {
  if (!state.rules.chineseExtensions.tongsha) return { ok: false, reason: 'tongsha_disabled' };
  const winner = state.players[winnerIdx];
  if (!winner?.alive) return { ok: false, reason: 'winner_eliminated' };

  const players: Player[] = state.players.map((p, i) =>
    i === winnerIdx ? p : { ...p, alive: false, diceLeft: 0 },
  );
  return {
    ok: true,
    state: { ...state, players, phase: 'game_end', version: state.version + 1 },
    explanation: 'tongsha_complete',
  };
}

/**
 * Palifico-aware bid validation. When Palifico round is active:
 * - 1s are NOT wild (regardless of rules.aceWild)
 * - count cannot decrease across the round
 * - the Palifico player (the one with 1 die) bids first
 */
export function getPalificoConstraints(
  state: RoomState,
  rules: GameRules,
): { acesNotWild: boolean; lockedCount: boolean } | null {
  if (!isPalificoActive(state)) return null;
  return { acesNotWild: true, lockedCount: !!rules.paliFicoVariant };
}
