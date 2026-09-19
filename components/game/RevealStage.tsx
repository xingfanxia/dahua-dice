'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { RoomState } from '@/lib/game-engine/types';
import { PipDie } from '../dice/PipDie';
import { AvatarBadge } from './AvatarBadge';

/**
 * 揭晓舞台 (UX-1, ported from the wxapp sibling 08c6ff1) — explains, in causal order,
 * WHY someone lost (players were reading a correct result as a bug):
 *  ① the bid that was opened (who called N×face + 斋) + who 开/劈/通杀
 *  ② every hand revealed: dice that count are highlighted (real face = emerald ring,
 *     wild 1·飞 = amber ring), misses dimmed, with a per-player subtotal
 *  ③ the verdict bar: table total ≥/＜ the called count → ✓bid stands / ✗bluff
 *  ④ the ruling: who loses & why, then 减骰 (attrition) vs 聚会版 🍺喝一杯 by endMode.
 * Everything is computed from the engine's authoritative ChallengeOutcome fields
 * (actualCount / actualMeetsBid / verifiedBid / loserId…). The actor (opener/splitter/
 * sweeper) is recoverable ONLY when the bid stands (then the opener IS the loser); on a
 * bluff the loser is the bidder and the opener can't be derived from engine fields
 * (currentTurnIdx already advanced past them at reveal time), so the *Anon variants run.
 */
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
  const wild = state.rules.aceWild && !verified.isZhai && !(state.palificoActive ?? false);
  const meets = result?.actualMeetsBid ?? false;
  const total = result?.actualCount ?? 0;
  const kind = result?.kind ?? 'challenge';
  const diceLost = result?.diceLost ?? 1;
  const endMode = state.rules.endMode ?? 'attrition';
  const bidderNick = state.players[result?.bidderIdx ?? -1]?.nick ?? '?';
  const loserNames = (result?.loserIds ?? [])
    .map((id) => state.players.find((p) => p.id === id)?.nick ?? '?')
    .join(t('game.listSeparator'));
  // Attribution trick: only when the bid stands (meets) is the opener the loser, so
  // recover them from loserId; on a bluff, omit the actor name (see the file header).
  const actorNick = meets
    ? (state.players.find((p) => p.id === (result?.loserId ?? ''))?.nick ?? '?')
    : null;

  const countHand = (hand: number[]) =>
    hand.reduce((n, f) => n + (f === verified.face || (wild && f === 1) ? 1 : 0), 0);
  const aliveDice = state.players.filter((p) => p.alive).flatMap((p) => hands[p.id] ?? []);
  const faceHits = aliveDice.filter((f) => f === verified.face).length;
  const wildHits = wild ? aliveDice.filter((f) => f === 1 && verified.face !== 1).length : 0;

  const topLine =
    kind === 'pi'
      ? actorNick
        ? t('game.reveal.split', { actor: actorNick, target: bidderNick })
        : t('game.reveal.splitAnon', { target: bidderNick })
      : kind === 'tongsha'
        ? actorNick
          ? t('game.reveal.sweep', { actor: actorNick })
          : t('game.reveal.sweepAnon')
        : actorNick
          ? t('game.reveal.opened', { actor: actorNick })
          : t('game.reveal.openedAnon');
  const ruling =
    kind === 'pi'
      ? meets
        ? t('game.reveal.rulingPiMeets', { actor: actorNick ?? '?' })
        : t('game.reveal.rulingPiFails', { bidder: bidderNick })
      : kind === 'tongsha'
        ? meets
          ? t('game.reveal.rulingTongshaMeets', { actor: actorNick ?? '?', n: diceLost })
          : t('game.reveal.rulingTongshaFails', { names: loserNames })
        : meets
          ? t('game.reveal.rulingChallengeMeets', { actor: actorNick ?? '?' })
          : t('game.reveal.rulingChallengeFails', { bidder: bidderNick });

  const goodCls = 'text-emerald-700 dark:text-emerald-300';
  const badCls = 'text-red-700 dark:text-red-300';

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-center text-2xl font-bold text-red-600 dark:text-red-400">
        {t('game.revealHeader')}
      </h2>

      {/* ① the bid that was opened + who opened it (plain div — only the delayed
          verdict below is the announced live region, matching the prior behaviour). */}
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-red-400 bg-red-50 py-3 dark:border-red-500 dark:bg-red-950">
        <span className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
          {t('game.reveal.bidderCalled', { name: bidderNick })}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="num text-4xl font-bold text-gray-900 dark:text-gray-50">
            {verified.count}
          </span>
          <span className="text-2xl text-gray-500 dark:text-gray-400" aria-hidden>
            ×
          </span>
          <PipDie face={verified.face} size={48} />
          {verified.isZhai && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-100">
              {t('game.zhai')}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-red-700 dark:text-red-300">{topLine}</span>
      </div>

      {/* ② every hand revealed + per-player subtotal */}
      <div className="flex flex-col gap-2">
        {state.players.map((p, i) => {
          const hand = hands[p.id] ?? [];
          const isMe = p.id === myPlayerId;
          const sub = countHand(hand);
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl bg-white p-2.5 dark:bg-gray-800 ${
                isMe ? 'border border-red-300 dark:border-red-600' : ''
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
              <div className="flex items-center gap-2">
                <div
                  className="flex flex-wrap items-center justify-end gap-1"
                  role="img"
                  aria-label={`${p.nick}: ${hand.join(', ')}`}
                >
                  {hand.map((face, j) => {
                    const counted = face === verified.face || (wild && face === 1);
                    const isWildHit = wild && face === 1 && verified.face !== 1;
                    return (
                      <PipDie
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional dice
                        key={j}
                        face={face}
                        size={28}
                        highlighted={counted}
                        tone={isWildHit ? 'amber' : 'emerald'}
                        dimmed={!counted}
                      />
                    );
                  })}
                </div>
                <span
                  className={`w-6 text-center text-lg font-bold ${
                    sub > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-500 dark:text-gray-500'
                  }`}
                >
                  {sub}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ③ verdict bar + ④ ruling (fade in after the reveal beat) */}
      {showResult && result && (
        <output className="flex flex-col gap-3">
          <div
            className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-3 ${
              meets ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-red-50 dark:bg-red-950'
            }`}
          >
            <span className={`text-xs ${meets ? goodCls : badCls}`}>
              {t('game.reveal.tableTotal', { total, face: String(verified.face) })}
              {wild && wildHits > 0
                ? t('game.reveal.realWildSplit', { real: faceHits, wild: wildHits })
                : verified.isZhai
                  ? t('game.reveal.zhaiNote')
                  : ''}
            </span>
            <div className="flex items-center gap-2">
              <span className={`num text-3xl font-bold ${meets ? goodCls : badCls}`}>{total}</span>
              <span
                className={`text-2xl font-bold ${meets ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                aria-hidden
              >
                {meets ? '≥' : '＜'}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('game.reveal.vsCalled', { count: verified.count })}
              </span>
            </div>
            <span className={`text-sm font-bold ${meets ? goodCls : badCls}`}>
              {meets ? t('game.reveal.bidStands') : t('game.reveal.bluff')}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">{ruling}</span>
            {loserNames &&
              (endMode === 'party' ? (
                <span className="text-base font-medium text-amber-700 dark:text-amber-300">
                  {t('game.reveal.drinkUp', { names: loserNames })}
                </span>
              ) : endMode === 'attrition' ? (
                <span className="text-base font-medium text-red-600 dark:text-red-400">
                  {diceLost > 1
                    ? t('game.reveal.minusNDice', { names: loserNames, n: diceLost })
                    : t('game.reveal.minusDie', { names: loserNames })}
                </span>
              ) : (
                // knockout / score keep every die — the round is recorded as a loss
                // (toward the elimination threshold or the fewest-losses ranking),
                // surfaced at game end; no die removed and no drink.
                <span className="text-base font-medium text-gray-700 dark:text-gray-200">
                  {t('game.reveal.tookLoss', { names: loserNames })}
                </span>
              ))}
            {result.gameEnded && result.winnerIdx >= 0 && (
              <span className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400">
                {t('game.champion', { name: state.players[result.winnerIdx]?.nick ?? '?' })}
              </span>
            )}
          </div>
        </output>
      )}
    </section>
  );
}
