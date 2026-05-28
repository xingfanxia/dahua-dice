import type { Bid, GameRules } from './types';

export type ChallengeResult = {
  actualCount: number;
  loserIdx: number;
  actualMeetsBid: boolean;
};

/**
 * Resolve a challenge ("开"). The challenger asks to verify the previous bid.
 *
 * @param bid           the bid being challenged (= the last bid)
 * @param hands         every player's dice (only ALIVE players included)
 * @param rules         current game rules
 * @param challengerIdx index into `hands` of the player who challenged
 * @param bidderIdx     index of the player who made the bid (defaults to the
 *                      player immediately preceding the challenger in `hands`)
 */
export function resolveChallenge(
  bid: Bid,
  hands: number[][],
  rules: GameRules,
  challengerIdx: number,
  bidderIdx?: number,
): ChallengeResult {
  const wildOnesActive = !bid.isZhai && rules.aceWild;
  let actualCount = 0;
  for (const hand of hands) {
    for (const face of hand) {
      if (face === bid.face) actualCount++;
      else if (wildOnesActive && face === 1) actualCount++;
    }
  }
  const actualMeetsBid = actualCount >= bid.count;
  const inferredBidder = bidderIdx ?? (challengerIdx === 0 ? hands.length - 1 : challengerIdx - 1);
  const loserIdx = actualMeetsBid ? challengerIdx : inferredBidder;
  return { actualCount, loserIdx, actualMeetsBid };
}
