'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { Bid, Face, GameRules, RoomState } from '@/lib/game-engine/types';
import { getStartingBidThreshold, isValidBid } from '@/lib/game-engine/validate';

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

  const initialCount = state.lastBid
    ? state.lastBid.count + 1
    : Math.ceil(rules.startingBidFactor * alivePlayers);
  const initialFace: Face = state.lastBid?.face ?? 4;
  const initialZhai = state.lastBid?.isZhai ?? false;
  const [count, setCount] = useState(initialCount);
  const [face, setFace] = useState<Face>(initialFace);
  const [zhaiChecked, setZhaiChecked] = useState(initialZhai);
  // 叫1必斋: naming face 1 forces zhai (1 is both the named face AND the wild).
  const isZhai = face === 1 ? true : zhaiChecked;

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
              · {t('game.zhai')}
            </span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <span
          className="text-xs uppercase tracking-wide"
          style={{ color: tokens.colors.textMuted }}
        >
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
        <span
          className="text-xs uppercase tracking-wide"
          style={{ color: tokens.colors.textMuted }}
        >
          {t('game.face')}
        </span>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: rules.diceSides }, (_, i) => (i + 1) as Face).map((f) => {
            const disabled = f === 1 && !rules.allowZhai; // a face-1 bid requires zhai
            return (
              <button
                key={f}
                type="button"
                disabled={disabled}
                onClick={() => setFace(f)}
                className="aspect-square rounded-xl text-2xl disabled:opacity-30"
                style={{
                  backgroundColor: face === f ? tokens.colors.primary : tokens.colors.bg,
                  color: face === f ? tokens.colors.bg : tokens.colors.text,
                  fontWeight: face === f ? 600 : 400,
                }}
              >
                {DICE_GLYPHS[f - 1]}
              </button>
            );
          })}
        </div>
      </div>

      {rules.allowZhai && (
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: tokens.colors.text }}
        >
          <input
            type="checkbox"
            checked={isZhai}
            disabled={face === 1}
            onChange={(e) => setZhaiChecked(e.target.checked)}
            className="w-4 h-4"
          />
          {t('game.zhaiCall')}
          {face === 1 && (
            <span style={{ color: tokens.colors.textMuted }}>· {t('game.faceOneAutoZhai')}</span>
          )}
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
            {t('game.challenge')}
          </button>
        )}
      </div>

      {!validation.ok && (
        <p className="text-xs text-center" style={{ color: tokens.colors.danger }}>
          {(() => {
            switch (validation.reason) {
              case 'zhai_disabled':
                return t('errors.zhaiDisabled');
              case 'invalid_count':
                return t('errors.invalidCount');
              case 'invalid_face':
                return t('errors.invalidFace');
              case 'below_starting':
                return t('errors.belowStarting', {
                  min: getStartingBidThreshold(alivePlayers, false, rules),
                });
              case 'break_zhai_needs_2x':
                return t('errors.breakZhaiNeeds2x');
              case 'face_one_must_zhai':
                return t('errors.faceOneMustZhai');
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
