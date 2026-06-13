'use client';

import { useTranslations } from 'next-intl';
import type { Bid, RoomState } from '@/lib/game-engine/types';
import { AvatarBadge } from './AvatarBadge';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

/** Human-readable name for a bid's face, for screen readers. */
function bidLabel(bid: Bid, count: string, face: string, zhai: string): string {
  return `${count} × ${face}${bid.isZhai ? ` (${zhai})` : ''}`;
}

export function BidChain({ state }: { state: RoomState }) {
  const t = useTranslations();
  // Array.isArray (not ?? []): a cjson-encoded empty table arrives as {} not [].
  const chain = Array.isArray(state.bidChain) ? state.bidChain : [];

  if (chain.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        {t('game.waitingFirstBid')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('game.bidChainHeader')}
      </p>
      <ol className="flex flex-col gap-1.5" aria-label={t('game.bidChainHeader')}>
        {chain.map((entry, i) => {
          const player = state.players.find((p) => p.id === entry.playerId);
          const latest = i === chain.length - 1;
          const faceGlyph = DICE_GLYPHS[entry.bid.face - 1];
          const srLabel = bidLabel(entry.bid, String(entry.bid.count), faceGlyph, t('game.zhai'));
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: bid chain is append-only and positional
              key={i}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${
                latest
                  ? 'border-red-300 bg-white dark:border-red-600 dark:bg-gray-800'
                  : 'border-transparent bg-gray-100 opacity-60 dark:bg-gray-800'
              }`}
            >
              <AvatarBadge
                avatar={player?.avatar ?? 'numeric'}
                seed={entry.playerId}
                seat={1}
                size={22}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {player?.nick ?? '?'}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="sr-only">{srLabel}</span>
                <span className="num text-base text-gray-900 dark:text-gray-100" aria-hidden>
                  {entry.bid.count}
                </span>
                <span className="text-gray-400" aria-hidden>
                  ×
                </span>
                <span className="text-xl text-gray-900 dark:text-gray-100" aria-hidden>
                  {faceGlyph}
                </span>
                {entry.bid.isZhai && (
                  <span
                    className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                    aria-hidden
                  >
                    {t('game.zhai')}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
