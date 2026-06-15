'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { PipDie } from '../dice/PipDie';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Rules bottom-sheet (ported from the wxapp sibling 8f473b6, opened from the home
 * 怎么玩/规则 entry). New-player friendly: the core one-liner (you bet the WHOLE
 * table, not just the opponent), a 5+5+1飞=3 dice diagram, 飞/斋/开/输了怎么算 items,
 * and the 4 settlement modes — reusing the existing customization.endMode_* copy so
 * the mode labels have one source. Web adds dialog a11y (Esc + reachable backdrop)
 * the Taro original didn't need.
 */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus management for the modal sheet (mirrors CustomizationDrawer): move focus
  // into the panel on open, restore it to the trigger on close. Tab-trapping is in
  // the onKeyDown handler below — required to honestly claim aria-modal.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={t('rulesSheet.title')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
          return;
        }
        if (e.key !== 'Tab') return;
        const f = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!f || f.length === 0) return;
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
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stops propagation only; Esc handled on dialog */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: sheet body container */}
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-5 dark:bg-gray-900"
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600"
          aria-hidden
        />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
          {t('rulesSheet.title')}
        </h2>

        {/* core one-liner */}
        <div className="mt-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            {t.rich('rulesSheet.core', {
              b: (chunks) => (
                <strong className="font-bold text-red-600 dark:text-red-400">{chunks}</strong>
              ),
            })}
          </p>
        </div>

        {/* diagram: 「3 个 5」 = 5 + 5 + 1(飞) */}
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('rulesSheet.diagramCaption')}
          </p>
          <div className="flex items-center gap-2">
            <PipDie face={5} size={56} />
            <PipDie face={5} size={56} />
            <PipDie face={1} size={56} highlighted tone="amber" />
            <span className="ml-1 text-base font-bold text-emerald-700 dark:text-emerald-400">
              {t('rulesSheet.diagramEquals')}
            </span>
          </div>
        </div>

        {/* rule items */}
        <div className="mt-4 flex flex-col gap-3">
          <RuleItem emoji="🎲" title={t('rulesSheet.flyTitle')} desc={t('rulesSheet.flyDesc')} />
          <RuleItem emoji="🚫" title={t('rulesSheet.zhaiTitle')} desc={t('rulesSheet.zhaiDesc')} />
          <RuleItem emoji="🔍" title={t('rulesSheet.openTitle')} desc={t('rulesSheet.openDesc')} />
          <RuleItem emoji="💥" title={t('rulesSheet.loseTitle')} desc={t('rulesSheet.loseDesc')} />
        </div>

        {/* 4 settlement modes — reuse the canonical customization.endMode_* copy */}
        <div className="mt-2 flex flex-col gap-2">
          <ModeRow
            name={t('customization.endMode_attrition')}
            desc={t('customization.endMode_attrition_desc')}
          />
          <ModeRow
            name={t('customization.endMode_party')}
            desc={t('customization.endMode_party_desc')}
          />
          <ModeRow
            name={t('customization.endMode_knockout')}
            desc={t('customization.endMode_knockout_desc')}
          />
          <ModeRow
            name={t('customization.endMode_score')}
            desc={t('customization.endMode_score_desc')}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-gray-900 py-3.5 text-center text-base font-medium text-white dark:bg-gray-700"
        >
          {t('rulesSheet.gotIt')}
        </button>
      </div>
    </div>
  );
}

function RuleItem({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="text-lg" aria-hidden>
        {emoji}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function ModeRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-800">
      <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100">{name}</span>
      <span className="flex-1 text-xs text-gray-500 dark:text-gray-400">{desc}</span>
    </div>
  );
}
