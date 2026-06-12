export type Face = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DiceFace = Face;

export type Phase = 'lobby' | 'rolling' | 'bidding' | 'reveal' | 'round_end' | 'game_end';

export type Bid = {
  count: number;
  face: Face;
  isZhai: boolean;
};

export type GameRules = {
  diceCount: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  aceWild: boolean; // 1 点是否万能 (only when not in zhai round)
  allowZhai: boolean;
  startingBidFactor: number; // default 1.5 → ceil(1.5 × alivePlayers)
  diceSides: 6 | 8;
  chineseExtensions: { pi: boolean; fanpi: boolean; tongsha: boolean };
  paliFicoVariant: boolean;
};

export const DEFAULT_RULES: GameRules = {
  diceCount: 5,
  aceWild: true,
  allowZhai: true,
  startingBidFactor: 1.5,
  diceSides: 6,
  chineseExtensions: { pi: false, fanpi: false, tongsha: false },
  paliFicoVariant: false,
};

export type Player = {
  id: string;
  nick: string;
  avatar: string; // texture set key
  diceLeft: number;
  alive: boolean;
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
