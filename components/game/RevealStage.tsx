'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
  const [showResult, setShowResult] = useState(false);

  // Reveal-text delay, skipped under reduced-motion (instant reveal).
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setShowResult(true);
      return;
    }
    const timer = setTimeout(() => setShowResult(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!hands || !state.lastBid) {
    return (
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        {t('game.waitingReveal')}
      </p>
    );
  }

  const result = state.lastChallengeResult ?? null;
  // For 劈 the verified bid is the TARGET's bid, not the standing bid.
  const verified = result?.verifiedBid ?? state.lastBid;
  const wildCount = state.rules.aceWild && !verified.isZhai && !(state.palificoActive ?? false);
  const loserNames = (result?.loserIds ?? [])
    .map((id) => state.players.find((p) => p.id === id)?.nick ?? '?')
    .join(t('game.listSeparator'));
  const kindLabel =
    result?.kind === 'pi'
      ? t('game.kindPi')
      : result?.kind === 'tongsha'
        ? t('game.kindTongsha')
        : t('game.kindChallenge');

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-center text-2xl font-bold text-red-600 dark:text-red-400">
        {t('game.revealHeader')}
      </h2>

      <div className="flex flex-col gap-2">
        {state.players.map((p, i) => {
          const hand = hands[p.id] ?? [];
          const isMe = p.id === myPlayerId;
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border bg-white p-2.5 dark:bg-gray-800 ${
                isMe ? 'border-red-300 dark:border-red-600' : 'border-transparent'
              }`}
            >
              <span className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <AvatarBadge avatar={p.avatar} seed={p.id} seat={i + 1} size={26} />
                {p.nick}
                {isMe && <span className="text-gray-500 dark:text-gray-400"> {t('game.you')}</span>}
                {!p.alive && (
                  <span role="img" aria-label={t('game.eliminated')}>
                    {' '}
                    💀
                  </span>
                )}
              </span>
              <div
                className="flex gap-1 text-2xl"
                role="img"
                aria-label={`${p.nick}: ${hand.join(', ')}`}
              >
                {hand.map((face, j) => {
                  const counted = face === verified.face || (face === 1 && wildCount);
                  return (
                    <span
                      /* biome-ignore lint/suspicious/noArrayIndexKey: positional dice */
                      key={j}
                      aria-hidden
                      className={counted ? 'text-amber-500' : 'text-gray-700 dark:text-gray-300'}
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
        <output className="mt-2 flex flex-col items-center gap-2">
          <p className="text-sm uppercase tracking-wide text-amber-800 dark:text-amber-300">
            {kindLabel}
          </p>
          <p className="text-gray-900 dark:text-gray-100">
            {t('game.bidLabel')} <span className="num">{verified.count}</span>
            {' × '}
            {DICE_GLYPHS[verified.face - 1]} · {t('game.actualLabel')}{' '}
            <span className="num">{result.actualCount}</span>
          </p>
          {loserNames && (
            <p className="text-lg text-red-600 dark:text-red-400">
              💀 {loserNames}{' '}
              {result.loserIds.length === 1 && result.diceLost > 1
                ? t('game.lostNDice', { n: result.diceLost })
                : t('game.lostDie')}
            </p>
          )}
          {result.gameEnded && result.winnerIdx >= 0 && (
            <p className="mt-3 text-xl font-bold text-amber-600 dark:text-amber-400">
              {t('game.champion', { name: state.players[result.winnerIdx]?.nick ?? '?' })}
            </p>
          )}
        </output>
      )}
    </section>
  );
}
