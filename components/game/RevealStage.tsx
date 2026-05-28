'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { RoomState } from '@/lib/game-engine/types';
import { AvatarBadge } from './AvatarBadge';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

export function RevealStage({
  state,
  hands,
  myPlayerId,
}: {
  state: RoomState;
  hands: Record<string, number[]> | null;
  myPlayerId: string | null;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowResult(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!hands || !state.lastBid) {
    return (
      <p className="text-center text-sm" style={{ color: tokens.colors.textMuted }}>
        {t('game.waitingReveal')}
      </p>
    );
  }

  // Server-computed result lives on state.lastChallengeResult. If somehow absent
  // (race during reveal-broadcast catchup), fall back to neutral "?" display.
  const result = state.lastChallengeResult ?? null;
  const loser = result ? state.players[result.loserIdx] : null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-display text-center" style={{ color: tokens.colors.primary }}>
        {t('game.revealHeader')}
      </h2>

      <div className="flex flex-col gap-2">
        {state.players.map((p, i) => {
          const hand = hands[p.id] ?? [];
          const isMe = p.id === myPlayerId;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between p-2 rounded-xl"
              style={{
                backgroundColor: tokens.colors.surface,
                outline: isMe ? `1px solid ${tokens.colors.primary}80` : 'none',
              }}
            >
              <span className="flex items-center gap-2" style={{ color: tokens.colors.text }}>
                <AvatarBadge avatar={p.avatar} seed={p.id} seat={i + 1} size={26} />
                {p.nick}
                {isMe && <span style={{ color: tokens.colors.textMuted }}> {t('game.you')}</span>}
                {!p.alive && <span style={{ color: tokens.colors.danger }}> 💀</span>}
              </span>
              <div className="flex gap-1 text-2xl">
                {hand.map((face, i) => {
                  const counted =
                    face === state.lastBid?.face ||
                    (face === 1 && state.rules.aceWild && !state.lastBid?.isZhai);
                  return (
                    <span
                      /* biome-ignore lint/suspicious/noArrayIndexKey: positional dice */
                      key={i}
                      style={{
                        color: counted ? tokens.colors.accent : tokens.colors.text,
                      }}
                    >
                      {DICE_GLYPHS[face - 1]}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {showResult && result && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <p style={{ color: tokens.colors.text }}>
            {t('game.bidLabel')} <span className="num">{state.lastBid.count}</span>
            {' × '}
            {DICE_GLYPHS[state.lastBid.face - 1]} · {t('game.actualLabel')}{' '}
            <span className="num">{result.actualCount}</span>
          </p>
          {loser && (
            <p className="text-lg" style={{ color: tokens.colors.danger }}>
              {t('game.loserLostDie', { name: loser.nick })}
            </p>
          )}
          {result.gameEnded && result.winnerIdx >= 0 && (
            <p className="mt-3 text-xl font-display" style={{ color: tokens.colors.accent }}>
              {t('game.champion', { name: state.players[result.winnerIdx]?.nick ?? '?' })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
