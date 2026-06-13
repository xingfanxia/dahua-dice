/**
 * Local (single-device) human-vs-bot game. PURE functions that drive the SAME
 * unit-tested engine (lib/game-engine/round.ts + validate.ts) over an in-memory
 * RoomState + Hands — no Redis, no Lua, no network. The bot's decision comes from
 * lib/bot/policy.ts; everything else (bidding, resolution, round advance) reuses
 * the multiplayer engine verbatim, so the bot plays by exactly the same rules.
 *
 * Local crypto rolls are fine here for the same reason as /solo: a single device
 * playing itself has no protocol adversary.
 */

import type { Hands } from '../game-engine/round';
import { nextAliveIdx, prepareNextRound, resolveChallenge } from '../game-engine/round';
import {
  type Bid,
  DEFAULT_RULES,
  type GameRules,
  type Player,
  type RoomState,
} from '../game-engine/types';
import { rollDiceClient } from '../solo/roll';
import { type BotAction, type BotDifficulty, decideBotAction } from './policy';

export const HUMAN_ID = 'me';
export const BOT_ID = 'bot';

export type BotGame = { state: RoomState; hands: Hands };

function dealHands(players: Player[], rules: GameRules): Hands {
  const hands: Hands = {};
  for (const p of players) {
    if (p.alive) hands[p.id] = rollDiceClient(p.diceLeft, rules.diceSides);
  }
  return hands;
}

export function createBotGame(opts: {
  humanNick: string;
  humanAvatar: string;
  botNick: string;
  botAvatar: string;
  rules?: GameRules;
}): BotGame {
  const rules = opts.rules ?? DEFAULT_RULES;
  const players: Player[] = [
    {
      id: HUMAN_ID,
      nick: opts.humanNick || 'You',
      avatar: opts.humanAvatar || 'numeric',
      diceLeft: rules.diceCount,
      alive: true,
      lossCount: 0,
    },
    {
      id: BOT_ID,
      nick: opts.botNick || 'CPU',
      avatar: opts.botAvatar || 'numeric',
      diceLeft: rules.diceCount,
      alive: true,
      lossCount: 0,
    },
  ];
  const state: RoomState = {
    code: 'BOT',
    phase: 'bidding',
    players,
    ownerId: HUMAN_ID,
    currentTurnIdx: 0, // human opens round 1
    lastBid: null,
    bidChain: [],
    isZhaiRound: false,
    round: 1,
    rules,
    theme: 'wxapp',
    version: 1,
    createdAt: 0,
    palificoActive: false,
    palificoBidderId: null,
    palificoTriggered: [],
    lastChallengeResult: null,
  };
  return { state, hands: dealHands(players, rules) };
}

/** Append a bid to the chain and advance the turn (mirrors the placeBid Lua). */
export function applyBid(game: BotGame, playerId: string, bid: Bid): BotGame {
  const s = game.state;
  if (s.phase !== 'bidding') return game;
  if (s.players[s.currentTurnIdx]?.id !== playerId) return game;
  const bidChain = s.lastBid == null ? [] : [...s.bidChain];
  bidChain.push({ playerId, bid: { ...bid } });
  return {
    ...game,
    state: {
      ...s,
      lastBid: { ...bid },
      bidChain,
      isZhaiRound: s.isZhaiRound || bid.isZhai,
      currentTurnIdx: nextAliveIdx(s.players, s.currentTurnIdx),
      version: s.version + 1,
    },
  };
}

/** Resolve a 开 challenge through the engine; moves to the reveal phase. */
export function applyChallenge(game: BotGame, challengerId: string): BotGame {
  const r = resolveChallenge(game.state, game.hands, challengerId);
  if (!r.ok) return game;
  return { ...game, state: r.state };
}

/** Reveal → next round (re-deals hands) or game_end. */
export function advanceRound(game: BotGame): BotGame {
  const r = prepareNextRound(game.state);
  if (!r.ok || !r.state) return game;
  if (r.state.phase === 'game_end') return { ...game, state: r.state };
  return { state: r.state, hands: dealHands(r.state.players, r.state.rules) };
}

/**
 * If it's a bot's turn during bidding, compute and apply one bot action. Returns
 * the (possibly unchanged) game plus the action taken, so the caller can animate
 * a thinking delay and narrate the move. No-op on the human's turn.
 */
export function botStep(
  game: BotGame,
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): { game: BotGame; action: BotAction | null } {
  const s = game.state;
  if (s.phase !== 'bidding') return { game, action: null };
  const cur = s.players[s.currentTurnIdx];
  if (!cur || cur.id === HUMAN_ID || !cur.alive) return { game, action: null };
  const action = decideBotAction(s, game.hands[cur.id] ?? [], difficulty, rng);
  if (action.kind === 'challenge') {
    if (!s.lastBid) return { game, action: null }; // can't 开 with no standing bid
    return { game: applyChallenge(game, cur.id), action };
  }
  return { game: applyBid(game, cur.id, action.bid), action };
}

export function isHumanTurn(game: BotGame): boolean {
  return (
    game.state.phase === 'bidding' && game.state.players[game.state.currentTurnIdx]?.id === HUMAN_ID
  );
}
