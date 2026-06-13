'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bid, Face, GameRules, Player, RoomState } from '@/lib/game-engine/types';
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate';
import { AvatarBadge } from './AvatarBadge';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

export function BidPanel({
  state,
  alivePlayers,
  onBid,
  onChallenge,
  onPi,
  onTongsha,
  busy,
}: {
  state: RoomState;
  alivePlayers: number;
  onBid: (bid: Bid) => void;
  onChallenge: () => void;
  onPi: (targetId: string) => void;
  onTongsha: () => void;
  busy: boolean;
}) {
  const t = useTranslations();
  const rules: GameRules = state.rules;
  const palifico = state.palificoActive ?? false;
  const chain = Array.isArray(state.bidChain) ? state.bidChain : [];
  const meId = state.players[state.currentTurnIdx]?.id ?? null;
  const standingOwner = chain.length ? chain[chain.length - 1].playerId : null;

  // 劈 can target any alive chain bidder who is NOT the immediate predecessor or self.
  const piTargets: Player[] =
    rules.chineseExtensions.pi && state.lastBid
      ? [...new Set(chain.map((e) => e.playerId))]
          .filter((id) => id !== standingOwner && id !== meId)
          .map((id) => state.players.find((p) => p.id === id))
          .filter((p): p is Player => !!p && p.alive)
      : [];
  const canTongsha =
    rules.chineseExtensions.tongsha &&
    !!state.lastBid &&
    [...new Set(chain.map((e) => e.playerId))].some((id) => {
      // Must be a still-alive opponent — offering 通杀 against a dead/left bidder
      // (mirrors the piTargets filter) only produces a server rejection.
      if (id === meId) return false;
      const p = state.players.find((pl) => pl.id === id);
      return !!p && p.alive;
    });

  const totalDice = state.players.reduce((s, p) => s + (p.alive ? p.diceLeft : 0), 0);
  const initialCount = palifico
    ? (state.lastBid?.count ?? alivePlayers)
    : state.lastBid
      ? state.lastBid.count + 1
      : getStartingBidThreshold(alivePlayers, false, rules, totalDice);
  const initialFace: Face = state.lastBid?.face ?? 4;
  const [count, setCount] = useState(initialCount);
  const [face, setFace] = useState<Face>(initialFace);
  const [zhaiChecked, setZhaiChecked] = useState(state.lastBid?.isZhai ?? false);
  const [piOpen, setPiOpen] = useState(false);
  // 叫1必斋: face 1 forces zhai (non-Palifico). In Palifico, 1s are simply not wild.
  const isZhai = palifico ? false : face === 1 ? true : zhaiChecked;
  const countLocked = palifico && !!state.lastBid; // Palifico locks the count to the opener's

  const candidate: Bid = useMemo(() => ({ count, face, isZhai }), [count, face, isZhai]);
  const validation = isValidBid(state.lastBid, candidate, rules, alivePlayers, {
    totalDice,
    palifico,
  });
  const [challengePending, setChallengePending] = useState(false);

  // Keyboard play (spec §17C): 1-6 select face · +/- count · Enter bid (or confirm
  // challenge) · Space arms the challenge confirm · Esc cancels. A ref carries the
  // latest values so the document listener binds once.
  const kb = useRef({
    candidate,
    validation,
    challengePending,
    busy,
    countLocked,
    hasLastBid: !!state.lastBid,
    diceSides: rules.diceSides,
    allowZhai: rules.allowZhai,
    palifico,
    onBid,
    onChallenge,
  });
  kb.current = {
    candidate,
    validation,
    challengePending,
    busy,
    countLocked,
    hasLastBid: !!state.lastBid,
    diceSides: rules.diceSides,
    allowZhai: rules.allowZhai,
    palifico,
    onBid,
    onChallenge,
  };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = kb.current;
      if (e.key >= '1' && e.key <= '8') {
        const f = Number(e.key);
        if (f <= s.diceSides && !(f === 1 && !s.allowZhai && !s.palifico)) setFace(f as Face);
        return;
      }
      if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') {
        if (!s.countLocked) setCount((c) => c + 1);
        return;
      }
      if (e.key === '-' || e.key === 'ArrowDown') {
        if (!s.countLocked) setCount((c) => Math.max(1, c - 1));
        return;
      }
      if (e.key === 'Escape') {
        setChallengePending(false);
        setPiOpen(false);
        return;
      }
      if (tag === 'BUTTON') return; // let Space/Enter activate a focused button natively
      if (e.key === 'Enter') {
        e.preventDefault();
        if (s.challengePending) {
          // Same busy-guard as the bid path: a challenge fired via keyboard while a
          // bid POST is still in flight would race the in-flight action.
          if (s.busy) return;
          setChallengePending(false);
          s.onChallenge();
        } else if (s.validation.ok && !s.busy) {
          s.onBid(s.candidate);
        }
        return;
      }
      if (e.key === ' ' && s.hasLastBid) {
        e.preventDefault();
        setChallengePending((p) => !p);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 dark:bg-gray-800">
      {palifico && (
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-center text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {t('game.palificoBanner')}
        </p>
      )}

      {state.lastBid && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('game.callDescription', {
            count: state.lastBid.count,
            face: DICE_GLYPHS[state.lastBid.face - 1],
          })}
          {state.lastBid.isZhai && (
            <span className="ml-1 text-amber-800 dark:text-amber-300">· {t('game.zhai')}</span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('game.count')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={countLocked}
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="h-11 w-11 rounded-full bg-gray-100 text-xl font-medium text-gray-900 disabled:opacity-30 dark:bg-gray-700 dark:text-gray-100"
            aria-label={t('game.countDown')}
          >
            −
          </button>
          <span className="num min-w-[2ch] text-center text-3xl font-bold text-gray-900 dark:text-gray-100">
            {count}
          </span>
          <button
            type="button"
            disabled={countLocked}
            onClick={() => setCount((c) => c + 1)}
            className="h-11 w-11 rounded-full bg-gray-100 text-xl font-medium text-gray-900 disabled:opacity-30 dark:bg-gray-700 dark:text-gray-100"
            aria-label={t('game.countUp')}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('game.face')}
        </span>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: rules.diceSides }, (_, i) => (i + 1) as Face).map((f) => {
            const disabled = f === 1 && !rules.allowZhai && !palifico;
            const active = face === f;
            return (
              <button
                key={f}
                type="button"
                disabled={disabled}
                onClick={() => setFace(f)}
                className={`aspect-square min-h-[44px] rounded-xl text-2xl disabled:opacity-30 ${
                  active
                    ? 'bg-red-600 font-semibold text-white'
                    : 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
                }`}
                aria-pressed={active}
                aria-label={`${f}`}
              >
                {DICE_GLYPHS[f - 1]}
              </button>
            );
          })}
        </div>
      </div>

      {rules.allowZhai && !palifico && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
          <input
            type="checkbox"
            checked={isZhai}
            disabled={face === 1}
            onChange={(e) => setZhaiChecked(e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          {t('game.zhaiCall')}
          {face === 1 && (
            <span className="text-gray-500 dark:text-gray-400">· {t('game.faceOneAutoZhai')}</span>
          )}
        </label>
      )}

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={busy || !validation.ok}
          onClick={() => onBid(candidate)}
          className="flex-1 rounded-2xl bg-emerald-700 py-4 font-medium text-white transition-opacity disabled:opacity-40"
        >
          {t('game.submitBid', { count, face: DICE_GLYPHS[face - 1] })}
        </button>
        {state.lastBid && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setChallengePending(true)}
            className="flex-1 rounded-2xl bg-red-600 py-4 font-medium text-white transition-opacity disabled:opacity-40"
            aria-haspopup="true"
          >
            {t('game.challenge')}
          </button>
        )}
      </div>

      {/* Challenge confirm — fat-finger / Space guard before the irreversible 开. */}
      {challengePending && state.lastBid && (
        <div
          className="flex items-center gap-2 rounded-2xl bg-red-100 p-3 dark:bg-red-950"
          role="alertdialog"
          aria-label={t('game.challengeConfirm')}
        >
          <span className="flex-1 text-sm text-red-700 dark:text-red-300">
            {t('game.challengeConfirm')}
          </span>
          <button
            type="button"
            onClick={() => setChallengePending(false)}
            className="min-h-[44px] rounded-xl px-4 text-sm text-gray-700 dark:text-gray-300"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setChallengePending(false);
              onChallenge();
            }}
            className="min-h-[44px] rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('game.challengeConfirmBtn')}
          </button>
        </div>
      )}

      {/* 中式扩展 actions */}
      {(piTargets.length > 0 || canTongsha) && (
        <div className="flex gap-3">
          {piTargets.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPiOpen((o) => !o)}
              className="flex-1 rounded-2xl border border-amber-500 py-3 text-sm font-medium text-amber-800 disabled:opacity-40 dark:border-amber-400 dark:text-amber-300"
              aria-expanded={piOpen}
            >
              {t('game.pi')}
            </button>
          )}
          {canTongsha && (
            <button
              type="button"
              disabled={busy}
              onClick={onTongsha}
              className="flex-1 rounded-2xl border border-red-400 py-3 text-sm font-medium text-red-600 disabled:opacity-40 dark:text-red-400"
            >
              {t('game.tongsha')}
            </button>
          )}
        </div>
      )}

      {piOpen && piTargets.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('game.piPickTarget')}</p>
          <div className="flex flex-wrap gap-2">
            {piTargets.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setPiOpen(false);
                  onPi(p.id);
                }}
                className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-gray-900 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-100"
              >
                <AvatarBadge avatar={p.avatar} seed={p.id} seat={1} size={22} />
                {p.nick}
              </button>
            ))}
          </div>
        </div>
      )}

      {!validation.ok && (
        <p className="text-center text-xs text-red-600 dark:text-red-400" role="alert">
          {(() => {
            switch (validation.reason) {
              case 'zhai_disabled':
                return t('errors.zhaiDisabled');
              case 'invalid_count':
                return t('errors.invalidCount');
              case 'invalid_face':
                return t('errors.invalidFace');
              case 'count_exceeds_dice':
                return t('errors.countExceedsDice');
              case 'below_starting':
                return t('errors.belowStarting', {
                  min: getStartingBidThreshold(alivePlayers, isZhai, rules, totalDice),
                });
              case 'break_zhai_needs_2x':
                return t('errors.breakZhaiNeeds2x');
              case 'face_one_must_zhai':
                return t('errors.faceOneMustZhai');
              case 'palifico_count_locked':
                return t('errors.palificoCountLocked');
              case 'not_higher':
                return t('errors.mustBeHigher');
              default:
                return t('errors.invalidBid');
            }
          })()}
        </p>
      )}
    </section>
  );
}
