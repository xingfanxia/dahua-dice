'use client';

import { useTheme } from '@/components/theme/ThemeProvider';
import type { Bid, RoomState } from '@/lib/game-engine/types';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

export function BidChain({ state }: { state: RoomState }) {
  const { tokens } = useTheme();
  // For MVP, only show the most recent bid (full chain requires event log replay)
  if (!state.lastBid) {
    return (
      <p className="text-sm text-center" style={{ color: tokens.colors.textMuted }}>
        等待第一个叫数…
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
        最新叫数
      </p>
      <BidChip bid={state.lastBid} />
    </div>
  );
}

function BidChip({ bid }: { bid: Bid }) {
  const { tokens } = useTheme();
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        backgroundColor: tokens.colors.surface,
        border: `1px solid ${tokens.colors.primary}55`,
      }}
    >
      <span className="text-xl num" style={{ color: tokens.colors.text }}>
        {bid.count}
      </span>
      <span style={{ color: tokens.colors.textMuted }}>×</span>
      <span className="text-2xl" style={{ color: tokens.colors.text }}>
        {DICE_GLYPHS[bid.face - 1]}
      </span>
      {bid.isZhai && (
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: tokens.colors.accent + '33', color: tokens.colors.accent }}
        >
          斋
        </span>
      )}
    </div>
  );
}
