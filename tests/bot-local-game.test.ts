import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  applyBid,
  applyChallenge,
  BOT_ID,
  type BotGame,
  botStep,
  createBotGame,
  HUMAN_ID,
  isHumanTurn,
} from '@/lib/bot/local-game';

function freshGame(): BotGame {
  return createBotGame({ humanNick: 'You', humanAvatar: 'numeric', botNick: 'CPU', botAvatar: 'numeric' });
}

describe('local bot game', () => {
  it('deals both players a full hand and starts on the human', () => {
    const g = freshGame();
    expect(g.state.players).toHaveLength(2);
    expect(g.hands[HUMAN_ID]).toHaveLength(5);
    expect(g.hands[BOT_ID]).toHaveLength(5);
    expect(isHumanTurn(g)).toBe(true);
    expect(g.state.phase).toBe('bidding');
  });

  it('human bid advances to the bot, and a bot step produces a legal action', () => {
    let g = freshGame();
    g = applyBid(g, HUMAN_ID, { count: 2, face: 4, isZhai: false });
    expect(g.state.currentTurnIdx).toBe(1); // bot
    expect(isHumanTurn(g)).toBe(false);
    const stepped = botStep(g, 'medium', () => 0.99);
    expect(stepped.action).not.toBeNull();
    // The bot either raised (back to the human's turn) or called (reveal phase).
    if (stepped.action?.kind === 'bid') {
      expect(stepped.game.state.bidChain).toHaveLength(2);
      expect(isHumanTurn(stepped.game)).toBe(true);
    } else {
      expect(stepped.game.state.phase).toBe('reveal');
    }
  });

  it('a human challenge resolves through the engine to a reveal with an outcome', () => {
    let g = freshGame();
    // Bot opens (force its turn first by having the human bid, bot raise), then human 开.
    g = applyBid(g, HUMAN_ID, { count: 1, face: 3, isZhai: false });
    g = botStep(g, 'easy', () => 0.99).game; // bot raises (or calls)
    if (g.state.phase === 'bidding' && isHumanTurn(g)) {
      g = applyChallenge(g, HUMAN_ID);
      expect(g.state.phase).toBe('reveal');
      expect(g.state.lastChallengeResult).toBeTruthy();
    }
  });

  it('advanceRound re-deals fresh hands and bumps the round in attrition', () => {
    let g = freshGame();
    g = applyBid(g, HUMAN_ID, { count: 1, face: 3, isZhai: false });
    // Drive bot turns until a challenge resolves (cap iterations defensively).
    for (let i = 0; i < 8 && g.state.phase === 'bidding'; i++) {
      if (isHumanTurn(g)) {
        g = applyChallenge(g, HUMAN_ID);
        break;
      }
      g = botStep(g, 'medium', () => 0.99).game;
    }
    expect(g.state.phase).toBe('reveal');
    if (!g.state.lastChallengeResult?.gameEnded) {
      const round0 = g.state.round;
      g = advanceRound(g);
      expect(g.state.phase).toBe('bidding');
      expect(g.state.round).toBe(round0 + 1);
      expect(g.hands[HUMAN_ID].length).toBeGreaterThan(0);
    }
  });
});
