'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { THEME_KEYS, type ThemeKey } from '@/components/theme/tokens';
import type { GameRules } from '@/lib/game-engine/types';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
function focusablesOf(el: HTMLElement | null): HTMLElement[] {
  return el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

export function CustomizationDrawer({
  open,
  onClose,
  rules,
  onSaveRules,
  isOwner,
  currentTheme,
  onSwitchTheme,
}: {
  open: boolean;
  onClose: () => void;
  rules: GameRules;
  onSaveRules: (rules: GameRules) => void;
  isOwner: boolean;
  currentTheme: ThemeKey;
  onSwitchTheme: (key: ThemeKey) => void;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const [diceCount, setDiceCount] = useState<3 | 4 | 5 | 6 | 7>(rules.diceCount);
  const [aceWild, setAceWild] = useState(rules.aceWild);
  const [allowZhai, setAllowZhai] = useState(rules.allowZhai);
  const [chineseExt, setChineseExt] = useState(rules.chineseExtensions);
  const [palifico, setPalifico] = useState(rules.paliFicoVariant);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus management for the modal drawer (spec §17C): move focus in on open,
  // restore to the trigger on close. Tab-trapping is handled in onKeyDown below.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    focusablesOf(panelRef.current)[0]?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  if (!open) return null;

  function handleSave() {
    // Spread current rules (not DEFAULT_RULES) so non-edited fields like
    // diceSides / startingBidFactor are preserved across a save.
    onSaveRules({
      ...rules,
      diceCount,
      aceWild,
      allowZhai,
      chineseExtensions: chineseExt,
      paliFicoVariant: palifico,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('customization.title')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
          return;
        }
        if (e.key !== 'Tab') return;
        const f = focusablesOf(panelRef.current);
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      {/* Backdrop — click outside panel dismisses; Esc handler on parent for keyboard. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled at parent role=dialog */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: scrim, not interactive content */}
      <div
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: `color-mix(in oklch, ${tokens.colors.bg} 65%, transparent)` }}
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopping propagation, not handling interaction */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: container for dialog content */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-3xl p-6 flex flex-col gap-6"
        style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
      >
        <div
          className="w-12 h-1 rounded-full mx-auto"
          style={{ backgroundColor: tokens.colors.textMuted }}
        />
        <h2 className="text-2xl font-display">{t('customization.title')}</h2>

        {/* Theme switcher (always available) */}
        <section className="flex flex-col gap-2">
          <h3
            className="text-xs uppercase tracking-wide"
            style={{ color: tokens.colors.textMuted }}
          >
            {t('customization.themeSection')}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {THEME_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onSwitchTheme(key)}
                className="py-3 rounded-xl text-sm transition-colors"
                style={{
                  backgroundColor:
                    currentTheme === key ? tokens.colors.primary : tokens.colors.surface,
                  color: currentTheme === key ? tokens.colors.bg : tokens.colors.text,
                }}
              >
                {t(`themes.${key}`)}
              </button>
            ))}
          </div>
        </section>

        {/* Rules (owner only) */}
        {isOwner && (
          <>
            <section className="flex items-center justify-between">
              <span>{t('customization.diceCount')}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDiceCount((c) => Math.max(3, c - 1) as 3 | 4 | 5 | 6 | 7)}
                  className="w-11 h-11 rounded-full"
                  style={{ backgroundColor: tokens.colors.surface }}
                  aria-label="−"
                >
                  −
                </button>
                <span className="text-2xl num">{diceCount}</span>
                <button
                  type="button"
                  onClick={() => setDiceCount((c) => Math.min(7, c + 1) as 3 | 4 | 5 | 6 | 7)}
                  className="w-11 h-11 rounded-full"
                  style={{ backgroundColor: tokens.colors.surface }}
                  aria-label="+"
                >
                  +
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3
                className="text-xs uppercase tracking-wide"
                style={{ color: tokens.colors.textMuted }}
              >
                {t('customization.rules')}
              </h3>
              <Toggle label={t('customization.aceWild')} value={aceWild} onChange={setAceWild} />
              <Toggle
                label={t('customization.allowZhai')}
                value={allowZhai}
                onChange={setAllowZhai}
              />
              <Toggle
                label={t('customization.pi')}
                value={chineseExt.pi}
                onChange={(v) => setChineseExt({ ...chineseExt, pi: v })}
              />
              <Toggle
                label={t('customization.fanpi')}
                value={chineseExt.fanpi}
                onChange={(v) => setChineseExt({ ...chineseExt, fanpi: v })}
              />
              <Toggle
                label={t('customization.tongsha')}
                value={chineseExt.tongsha}
                onChange={(v) => setChineseExt({ ...chineseExt, tongsha: v })}
              />
              <Toggle label={t('customization.palifico')} value={palifico} onChange={setPalifico} />
            </section>

            <button
              type="button"
              onClick={handleSave}
              className="py-4 rounded-2xl font-medium"
              style={{ backgroundColor: tokens.colors.primary, color: tokens.colors.bg }}
            >
              {t('customization.save')}
            </button>
          </>
        )}

        {!isOwner && (
          <p className="text-sm text-center" style={{ color: tokens.colors.textMuted }}>
            {t('customization.onlyOwnerCanEdit')}
          </p>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tokens } = useTheme();
  // The whole row is the switch so the tap target is ≥44px tall (the visual pill
  // alone is only 28px). role=switch + aria-checked keeps it accessible.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 w-full min-h-[44px] text-left"
    >
      <span style={{ color: tokens.colors.text }}>{label}</span>
      <span
        className="w-12 h-7 rounded-full relative transition-colors shrink-0"
        style={{
          backgroundColor: value ? tokens.colors.success : `${tokens.colors.textMuted}55`,
        }}
      >
        <span
          className="absolute top-1 left-1 w-5 h-5 rounded-full transition-transform duration-200 ease-out"
          style={{
            backgroundColor: tokens.colors.bg,
            transform: value ? 'translateX(calc(100% + 0.5rem))' : 'translateX(0)',
          }}
        />
      </span>
    </button>
  );
}
