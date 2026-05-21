'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { resolveChallenge } from '@/lib/game-engine/resolve';
import type { RoomState } from '@/lib/game-engine/types';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

export function RevealStage({
  state,
  hands,
}: {
  state: RoomState;
  hands: Record<string, number[]> | null;
}) {
  const { tokens } = useTheme();
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowResult(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!hands || !state.lastBid) {
    return (
      <p className="text-center text-sm" style={{ color: tokens.colors.textMuted }}>
        等待揭晓…
      </p>
    );
  }

  const handsList = state.players.filter((p) => p.alive).map((p) => hands[p.id] ?? []);
  const aliveBidderIdx = state.players.filter((p) => p.alive).findIndex((p) => p.id !== state.players[state.currentTurnIdx]?.id);
  const result = resolveChallenge(state.lastBid, handsList, state.rules, state.currentTurnIdx, aliveBidderIdx);
  const loser = state.players[result.loserIdx];

  return (
    <section className="flex flex-col gap-4">
      <h2
        className="text-2xl font-display text-center"
        style={{ color: tokens.colors.primary }}
      >
        揭晓!
      </h2>

      <div className="flex flex-col gap-2">
        {state.players.map((p) => {
          const hand = hands[p.id] ?? [];
          const isMe = false; // TODO when myPlayerId is wired
          return (
            <div
              key={p.id}
              className="flex items-center justify-between p-2 rounded-xl"
              style={{ backgroundColor: tokens.colors.surface }}
            >
              <span style={{ color: tokens.colors.text }}>{p.nick}</span>
              <div className="flex gap-1 text-2xl">
                {hand.map((face, i) => (
                  <span
                    /* biome-ignore lint/suspicious/noArrayIndexKey: positional dice */
                    key={i}
                    style={{
                      color:
                        face === state.lastBid?.face || (face === 1 && state.rules.aceWild && !state.lastBid?.isZhai)
                          ? tokens.colors.accent
                          : tokens.colors.text,
                    }}
                  >
                    {DICE_GLYPHS[face - 1]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showResult && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <p style={{ color: tokens.colors.text }}>
            叫: <span className="num">{state.lastBid.count}</span> 个 {DICE_GLYPHS[state.lastBid.face - 1]} ·
            实际: <span className="num">{result.actualCount}</span>
          </p>
          <p className="text-lg" style={{ color: tokens.colors.danger }}>
            💀 {loser?.nick} 输一颗骰
          </p>
        </div>
      )}
    </section>
  );
}
