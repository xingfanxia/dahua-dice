export type Face = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DiceFace = Face;

export type Phase =
  | 'lobby'
  | 'rolling'
  | 'bidding'
  | 'reveal'
  | 'round_end'
  | 'game_end';

export type Bid = {
  count: number;
  face: Face;
  isZhai: boolean;
};

export type GameRules = {
  diceCount: 3 | 4 | 5 | 6 | 7;
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

export type RoomState = {
  code: string;
  phase: Phase;
  players: Player[];
  ownerId: string;
  currentTurnIdx: number;
  lastBid: Bid | null;
  isZhaiRound: boolean;
  round: number;
  rules: GameRules;
  theme: string;
  version: number;
  createdAt: number;
};
