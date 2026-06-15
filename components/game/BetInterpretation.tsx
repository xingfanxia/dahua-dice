'use client';

import { useTranslations } from 'next-intl';
import type { RoomState } from '@/lib/game-engine/types';

/**
 * One-line reading of the standing bid (ported from the wxapp sibling's CurrentBid,
 * 8f473b6): "{bidder} bets the table has at least N of face Y". Shown under the
 * current call in room + bot so a new player reads a bid as a claim about the WHOLE
 * table, not just the opponent's dice. Renders nothing before the first bid.
 */
export function BetInterpretation({ state }: { state: RoomState }) {
  const t = useTranslations();
  if (!state.lastBid) return null;
  const chain = Array.isArray(state.bidChain) ? state.bidChain : [];
  const bidderId = chain.length ? chain[chain.length - 1].playerId : null;
  const nick = state.players.find((p) => p.id === bidderId)?.nick ?? '?';
  return (
    <p className="px-3 text-center text-xs text-red-700 dark:text-red-300">
      {t('game.betInterpretation', {
        nick,
        count: state.lastBid.count,
        face: String(state.lastBid.face),
      })}
      {state.lastBid.isZhai ? t('game.betInterpretationZhaiSuffix') : ''}
    </p>
  );
}
