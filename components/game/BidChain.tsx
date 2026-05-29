'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { Bid, RoomState } from '@/lib/game-engine/types';
import { AvatarBadge } from './AvatarBadge';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

/** Human-readable name for a bid's face, for screen readers. */
function bidLabel(bid: Bid, count: string, face: string, zhai: string): string {
  return `${count} × ${face}${bid.isZhai ? ` (${zhai})` : ''}`;
}

export function BidChain({ state }: { state: RoomState }) {
  const t = useTranslations();
  const { tokens } = useTheme();
  // Array.isArray (not ?? []): a cjson-encoded empty table arrives as {} not [].
  const chain = Array.isArray(state.bidChain) ? state.bidChain : [];

  if (chain.length === 0) {
    return (
      <p className="text-sm text-center" style={{ color: tokens.colors.textMuted }}>
        {t('game.waitingFirstBid')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                backgroundColor: tokens.colors.surface,
                opacity: latest ? 1 : 0.6,
                border: latest ? `1px solid ${tokens.colors.primary}66` : '1px solid transparent',
              }}
            >
              <AvatarBadge
                avatar={player?.avatar ?? 'numeric'}
                seed={entry.playerId}
                seat={1}
                size={22}
              />
              <span className="text-sm" style={{ color: tokens.colors.textMuted }}>
                {player?.nick ?? '?'}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="sr-only">{srLabel}</span>
                <span className="num text-base" style={{ color: tokens.colors.text }} aria-hidden>
                  {entry.bid.count}
                </span>
                <span style={{ color: tokens.colors.textMuted }} aria-hidden>
                  ×
                </span>
                <span className="text-xl" style={{ color: tokens.colors.text }} aria-hidden>
                  {faceGlyph}
                </span>
                {entry.bid.isZhai && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${tokens.colors.accent}33`,
                      color: tokens.colors.accent,
                    }}
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
