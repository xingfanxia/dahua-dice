export type Face = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DiceFace = Face;

export type Phase = 'lobby' | 'rolling' | 'bidding' | 'reveal' | 'round_end' | 'game_end';

export type Bid = {
  count: number;
  face: Face;
  isZhai: boolean;
};

/**
 * Game-end / scoring house rule (#2). Decides whether a loss removes a die and
 * how the game ends:
 *  - attrition  减骰子·末位淘汰·剩 1 人获胜（默认，向后兼容旧房间）
 *  - party      不减骰子·永不淘汰·无人获胜，每轮只决出输家（喝一杯），玩到手动结束
 *  - knockout   不减骰子·累计输 knockoutLosses 次淘汰·剩 1 人获胜
 *  - score      不减骰子·打满 scoreRounds 轮·输得最少者获胜
 */
export type EndMode = 'attrition' | 'party' | 'knockout' | 'score';

export type GameRules = {
  diceCount: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  aceWild: boolean; // 1 点是否万能 (only when not in zhai round)
  allowZhai: boolean;
  startingBidFactor: number; // default 1.5 → ceil(1.5 × alivePlayers)
  diceSides: 6 | 8;
  chineseExtensions: { pi: boolean; fanpi: boolean; tongsha: boolean };
  paliFicoVariant: boolean;
  // 旧房间无 endMode 字段 → 引擎按 `?? 'attrition'` 解算，normalizeState 也会回填。
  endMode: EndMode;
  knockoutLosses: number; // N: knockout 模式累计输几次淘汰
  scoreRounds: number; // K: score 模式打满几轮
};

export const DEFAULT_RULES: GameRules = {
  diceCount: 5,
  aceWild: true,
  allowZhai: true,
  startingBidFactor: 1.5,
  diceSides: 6,
  chineseExtensions: { pi: false, fanpi: false, tongsha: false },
  paliFicoVariant: false,
  endMode: 'attrition',
  knockoutLosses: 3,
  scoreRounds: 5,
};

export type Player = {
  id: string;
  nick: string;
  avatar: string; // texture set key
  diceLeft: number;
  alive: boolean;
  // 累计输的轮数（knockout 淘汰判定 + score 排名用）。旧房间省略，视为 0。
  lossCount?: number;
};

export type ChallengeOutcome = {
  kind: 'challenge' | 'pi' | 'tongsha'; // 开 / 劈 / 通杀
  actualCount: number;
  verifiedBid: Bid; // the bid that was checked against the table
  bidderIdx: number; // who made the verified bid
  loserIdx: number; // primary loser (for single-loser display)
  loserId: string;
  loserIds: string[]; // every loser (通杀 sweep can be several); always includes loserId
  diceLost: number; // dice the primary loser lost (1, or 2 for a failed 劈/通杀)
  actualMeetsBid: boolean;
  gameEnded: boolean;
  winnerIdx: number; // -1 if game not ended
};

/** One entry in a round's bid chain, used by 劈 (target a non-adjacent bidder) and 通杀 (sweep all bidders). */
export type BidChainEntry = { playerId: string; bid: Bid };

export type RoomState = {
  code: string;
  phase: Phase;
  players: Player[];
  ownerId: string;
  currentTurnIdx: number;
  lastBid: Bid | null;
  bidChain: BidChainEntry[]; // bids placed this round, in order; reset each round
  isZhaiRound: boolean;
  round: number;
  rules: GameRules;
  theme: string;
  version: number;
  createdAt: number;
  // Palifico (research §3.4): first time a player hits 1 die, the next round is theirs.
  palificoActive: boolean; // current round is a Palifico round
  palificoBidderId: string | null; // who opens the Palifico round
  palificoTriggered: string[]; // playerIds whose one-shot Palifico has already fired
  lastChallengeResult?: ChallengeOutcome | null;
};
