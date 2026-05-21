'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import { isValidBid } from '@/lib/game-engine/validate';
import type { Bid, Face, GameRules, RoomState } from '@/lib/game-engine/types';

const DICE_GLYPHS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '7', '8'];

export function BidPanel({
  state,
  alivePlayers,
  onBid,
  onChallenge,
  busy,
}: {
  state: RoomState;
  alivePlayers: number;
  onBid: (bid: Bid) => void;
  onChallenge: () => void;
  busy: boolean;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const rules: GameRules = state.rules;

  const initialCount = state.lastBid ? state.lastBid.count + 1 : Math.ceil(rules.startingBidFactor * alivePlayers);
  const initialFace: Face = state.lastBid?.face ?? 4;
  const initialZhai = state.lastBid?.isZhai ?? false;
  const [count, setCount] = useState(initialCount);
  const [face, setFace] = useState<Face>(initialFace);
  const [isZhai, setIsZhai] = useState(initialZhai);

  const candidate: Bid = useMemo(() => ({ count, face, isZhai }), [count, face, isZhai]);
  const validation = isValidBid(state.lastBid, candidate, rules, alivePlayers);

  return (
    <section
      className="rounded-3xl p-4 flex flex-col gap-4"
      style={{ backgroundColor: tokens.colors.surface }}
    >
      {state.lastBid && (
        <p className="text-sm" style={{ color: tokens.colors.textMuted }}>
          {t('game.callDescription', {
            count: state.lastBid.count,
            face: DICE_GLYPHS[state.lastBid.face - 1],
          })}
          {state.lastBid.isZhai && (
            <span className="ml-1" style={{ color: tokens.colors.accent }}>
              · 斋
            </span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
          {t('game.count')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="w-10 h-10 rounded-full text-xl font-medium"
            style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
          >
            −
          </button>
          <span
            className="text-3xl num min-w-[2ch] text-center"
            style={{ color: tokens.colors.text }}
          >
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount((c) => c + 1)}
            className="w-10 h-10 rounded-full text-xl font-medium"
            style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
          {t('game.face')}
        </span>
        <div className="grid grid-cols-6 gap-2">
          {([1, 2, 3, 4, 5, 6] as Face[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFace(f)}
              className="aspect-square rounded-xl text-2xl"
              style={{
                backgroundColor: face === f ? tokens.colors.primary : tokens.colors.bg,
                color: face === f ? tokens.colors.bg : tokens.colors.text,
                fontWeight: face === f ? 600 : 400,
              }}
            >
              {DICE_GLYPHS[f - 1]}
            </button>
          ))}
        </div>
      </div>

      {rules.allowZhai && (
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: tokens.colors.text }}>
          <input
            type="checkbox"
            checked={isZhai}
            onChange={(e) => setIsZhai(e.target.checked)}
            className="w-4 h-4"
          />
          {t('game.zhaiCall')}
        </label>
      )}

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          disabled={busy || !validation.ok}
          onClick={() => onBid(candidate)}
          className="flex-1 py-4 rounded-2xl font-medium disabled:opacity-40 transition-opacity"
          style={{
            backgroundColor: tokens.colors.success,
            color: tokens.colors.bg,
          }}
        >
          {t('game.submitBid', { count, face: DICE_GLYPHS[face - 1] })}
        </button>
        {state.lastBid && (
          <button
            type="button"
            disabled={busy}
            onClick={onChallenge}
            className="flex-1 py-4 rounded-2xl font-medium disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: tokens.colors.danger, color: tokens.colors.bg }}
          >
            🔓 {t('game.challenge')}
          </button>
        )}
      </div>

      {!validation.ok && (
        <p className="text-xs text-center" style={{ color: tokens.colors.danger }}>
          {validation.reason === 'not_higher'
            ? t('errors.mustBeHigher')
            : validation.reason}
        </p>
      )}
    </section>
  );
}
