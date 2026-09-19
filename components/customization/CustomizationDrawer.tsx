'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { type ThemeMode, useThemeMode } from '@/components/theme/ThemeProvider';
import type { EndMode, GameRules } from '@/lib/game-engine/types';

export const END_MODES: EndMode[] = ['attrition', 'party', 'knockout', 'score'];

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
}: {
  open: boolean;
  onClose: () => void;
  rules: GameRules;
  onSaveRules: (rules: GameRules) => void;
  isOwner: boolean;
}) {
  const t = useTranslations();
  const { mode, setMode } = useThemeMode();
  const [diceCount, setDiceCount] = useState<GameRules['diceCount']>(rules.diceCount);
  const [aceWild, setAceWild] = useState(rules.aceWild);
  const [allowZhai, setAllowZhai] = useState(rules.allowZhai);
  const [chineseExt, setChineseExt] = useState(rules.chineseExtensions);
  const [palifico, setPalifico] = useState(rules.paliFicoVariant);
  const [endMode, setEndMode] = useState<EndMode>(rules.endMode ?? 'attrition');
  const [knockoutLosses, setKnockoutLosses] = useState(rules.knockoutLosses ?? 3);
  const [scoreRounds, setScoreRounds] = useState(rules.scoreRounds ?? 5);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Snapshot the live rules into local edit state ONLY on the open transition, so a
  // rejected mid-game save can't leave stale toggles showing. It must NOT re-run on
  // every `rules` reference change: refetch() swaps in a fresh state object on any
  // version bump (a peer joining / changing avatar in the lobby gives a new
  // `rules` reference even with identical content), which would otherwise clobber
  // the owner's in-progress unsaved edits. The open-transition guard keeps `rules`
  // in the deps (exhaustive) while syncing exactly once per open.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDiceCount(rules.diceCount);
      setAceWild(rules.aceWild);
      setAllowZhai(rules.allowZhai);
      setChineseExt(rules.chineseExtensions);
      setPalifico(rules.paliFicoVariant);
      setEndMode(rules.endMode ?? 'attrition');
      setKnockoutLosses(rules.knockoutLosses ?? 3);
      setScoreRounds(rules.scoreRounds ?? 5);
    }
    wasOpenRef.current = open;
  }, [open, rules]);

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
    // startingBidFactor / diceSides are preserved across a save. (The 8-sided
    // option was cut from the UI — wxapp parity; engine + schema keep 6|8.)
    onSaveRules({
      ...rules,
      diceCount,
      aceWild,
      allowZhai,
      chineseExtensions: chineseExt,
      paliFicoVariant: palifico,
      endMode,
      knockoutLosses,
      scoreRounds,
    });
    onClose();
  }

  const MODES: { key: ThemeMode; label: string; icon: string }[] = [
    { key: 'auto', label: t('common.themeAuto'), icon: '🌗' },
    { key: 'light', label: t('common.themeLight'), icon: '☀️' },
    { key: 'dark', label: t('common.themeDark'), icon: '🌙' },
  ];

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
      <div onClick={onClose} className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopping propagation, not handling interaction */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: container for dialog content */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85dvh] w-full max-w-md flex-col gap-6 overflow-y-auto rounded-t-3xl bg-gray-50 p-6 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
      >
        <div className="mx-auto h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
        <h2 className="text-2xl font-bold">{t('customization.title')}</h2>

        {/* dark/light mode (always available) */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('common.theme')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={mode === m.key}
                className={`min-h-[44px] rounded-xl text-sm transition-colors ${
                  mode === m.key
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <span aria-hidden>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* Language switcher (always available) */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('common.language')}
          </h3>
          <LanguageToggle label={t('common.language')} />
        </section>

        {/* Rules (owner only) */}
        {isOwner && (
          <>
            {/* Dice count grid 3-10 (wxapp RulesEditor parity). */}
            <section className="flex flex-col gap-2">
              <span>{t('customization.diceCount')}</span>
              <div className="grid grid-cols-4 gap-2">
                {([3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDiceCount(n)}
                    aria-pressed={diceCount === n}
                    className={`num min-h-[44px] rounded-xl text-sm transition-colors ${
                      diceCount === n
                        ? 'bg-red-600 font-medium text-white'
                        : 'bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
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

            {/* Game-end mode (#2): how a loss is handled + how the game ends. */}
            <section className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('customization.endMode')}
              </h3>
              <div className="flex flex-col gap-2">
                {END_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEndMode(m)}
                    aria-pressed={endMode === m}
                    className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                      endMode === m
                        ? 'bg-red-600 text-white'
                        : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {t(`customization.endMode_${m}`)}
                    </span>
                    <span
                      className={`block text-xs ${endMode === m ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      {t(`customization.endMode_${m}_desc`)}
                    </span>
                  </button>
                ))}
              </div>
              {endMode === 'knockout' && (
                <NumberStepper
                  label={t('customization.knockoutLosses')}
                  value={knockoutLosses}
                  min={1}
                  max={20}
                  onChange={setKnockoutLosses}
                />
              )}
              {endMode === 'score' && (
                <NumberStepper
                  label={t('customization.scoreRounds')}
                  value={scoreRounds}
                  min={1}
                  max={50}
                  onChange={setScoreRounds}
                />
              )}
            </section>

            <button
              type="button"
              onClick={handleSave}
              className="rounded-2xl bg-red-600 py-4 font-medium text-white"
            >
              {t('customization.save')}
            </button>
          </>
        )}

        {!isOwner && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            {t('customization.onlyOwnerCanEdit')}
          </p>
        )}
      </div>
    </div>
  );
}

export function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-gray-800">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`${label} −`}
          className="h-9 w-9 rounded-full bg-gray-100 text-lg font-medium text-gray-900 disabled:opacity-30 dark:bg-gray-700 dark:text-gray-100"
        >
          −
        </button>
        <span className="num min-w-[2ch] text-center text-lg font-bold">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`${label} +`}
          className="h-9 w-9 rounded-full bg-gray-100 text-lg font-medium text-gray-900 disabled:opacity-30 dark:bg-gray-700 dark:text-gray-100"
        >
          +
        </button>
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
  // The whole row is the switch so the tap target is ≥44px tall (the visual pill
  // alone is only 28px). role=switch + aria-checked keeps it accessible.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
    >
      <span>{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          value ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-out ${
            value ? 'translate-x-[calc(100%+0.5rem)]' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
