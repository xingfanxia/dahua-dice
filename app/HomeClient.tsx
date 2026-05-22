'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { THEME_KEYS, THEMES, type ThemeKey } from '@/components/theme/tokens';
import { unlockAudio } from '@/lib/audio/howl-instance';

// 32-char alphabet (no 0/1/I/L/O) — matches lib/room/invite-code.ts
const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]*$/;
const CODE_LEN = 6;

export function HomeClient({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const t = useTranslations();
  const { theme, setTheme, tokens } = useTheme();

  const [nick, setNick] = useState('');
  const [mode, setMode] = useState<'idle' | 'join'>('idle');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialError === 'room_not_found') setErr(t('errors.roomNotFound'));
    // Arm Howler autoUnlock so audio works once user reaches the room
    unlockAudio();
  }, [initialError, t]);

  useEffect(() => {
    if (mode === 'join') codeInputRef.current?.focus();
  }, [mode]);

  function validateNickname(): string | null {
    const n = nick.trim();
    if (!n) return t('errors.empty');
    if (n.length > 20) return t('errors.tooLong');
    if (/[<>"'&]/.test(n)) return t('errors.invalidChars');
    return null;
  }

  async function handleCreate() {
    setErr(null);
    const ve = validateNickname();
    if (ve) {
      setErr(ve);
      return;
    }
    setBusy('create');
    try {
      const r = await fetch('/api/room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nick: nick.trim(), theme }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(t(`errors.${mapApiReason(j.reason)}`));
        setBusy(null);
        return;
      }
      router.push(`/room/${j.code}`);
    } catch {
      setErr(t('errors.network'));
      setBusy(null);
    }
  }

  async function handleJoin() {
    setErr(null);
    const ve = validateNickname();
    if (ve) {
      setErr(ve);
      return;
    }
    const code = joinCode.toUpperCase();
    if (code.length !== CODE_LEN || !CODE_ALPHABET.test(code)) {
      setErr(t('home.invalidCode'));
      return;
    }
    setBusy('join');
    try {
      // Bootstrap session (creates cookie if missing, refreshes nick/theme if present)
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nick: nick.trim(), theme }),
      });
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'join', code, nick: nick.trim() }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErr(t(`errors.${mapApiReason(j.reason)}`));
        setBusy(null);
        return;
      }
      router.push(`/room/${code}`);
    } catch {
      setErr(t('errors.network'));
      setBusy(null);
    }
  }

  const displayThemes = useMemo(() => THEME_KEYS, []);

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-stretch overflow-hidden">
      {/* ambient backdrop — subtle radial wash using accent tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at 18% 12%, color-mix(in oklch, ${tokens.colors.accent} 18%, transparent), transparent 55%),
            radial-gradient(ellipse at 82% 92%, color-mix(in oklch, ${tokens.colors.primary} 14%, transparent), transparent 60%),
            ${tokens.colors.bg}`,
        }}
      />

      <div className="flex flex-1 flex-col px-6 pt-[calc(env(safe-area-inset-top)+5vh)] pb-10 sm:px-10 sm:pt-[10vh]">
        {/* title block — left-aligned, off-center for visual interest */}
        <header className="max-w-md">
          <h1
            className="font-display text-[clamp(2.75rem,9vw,4.5rem)] font-bold leading-[0.95] tracking-tight text-text"
            style={{ letterSpacing: '-0.025em' }}
          >
            {t('home.title')}
          </h1>
          <p
            className="mt-3 font-display text-base tracking-wider text-text-muted/80"
            style={{ letterSpacing: '0.08em' }}
          >
            {t('home.subtitle').toUpperCase()}
          </p>
        </header>

        {/* form card */}
        <section className="mt-12 max-w-md sm:mt-16">
          <label className="block">
            <span className="block font-ui text-xs uppercase tracking-[0.14em] text-text-muted">
              {t('home.nicknamePlaceholder')}
            </span>
            <input
              type="text"
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                if (err) setErr(null);
              }}
              maxLength={20}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full border-0 border-b border-text-muted/30 bg-transparent py-3 font-display text-2xl text-text outline-none transition-colors focus:border-primary"
            />
          </label>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy !== null}
              aria-busy={busy === 'create'}
              className="group relative overflow-hidden rounded-[14px] bg-primary px-5 py-4 font-ui text-base font-medium text-bg shadow-[0_8px_24px_-12px_color-mix(in_oklch,var(--theme-primary)_60%,transparent)] transition active:scale-[0.985] disabled:opacity-60"
            >
              <span className="relative">
                {busy === 'create' ? t('common.loading') : t('home.createRoom')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode(mode === 'join' ? 'idle' : 'join')}
              disabled={busy !== null}
              className={`rounded-[14px] border px-5 py-4 font-ui text-base font-medium transition active:scale-[0.985] disabled:opacity-60 ${
                mode === 'join'
                  ? 'border-primary/70 bg-primary/10 text-text'
                  : 'border-text-muted/30 bg-transparent text-text hover:border-text-muted/60'
              }`}
            >
              {t('home.joinRoom')}
            </button>
          </div>

          {/* expanded join input */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              mode === 'join' ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="flex items-stretch gap-3">
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={joinCode}
                  onChange={(e) => {
                    // Filter to allowed alphabet, force uppercase, cap at 6
                    const cleaned = e.target.value
                      .toUpperCase()
                      .replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, '')
                      .slice(0, CODE_LEN);
                    setJoinCode(cleaned);
                    if (err) setErr(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && joinCode.length === CODE_LEN) handleJoin();
                  }}
                  placeholder={t('home.joinPrompt')}
                  className="block flex-1 rounded-[12px] border border-text-muted/25 bg-surface/40 px-4 py-3 font-display text-2xl tracking-[0.35em] text-text tabular-nums placeholder:text-base placeholder:tracking-normal placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={busy !== null || joinCode.length !== CODE_LEN}
                  className="rounded-[12px] bg-accent px-5 font-ui text-sm font-medium text-bg transition active:scale-[0.985] disabled:opacity-40"
                >
                  {busy === 'join' ? '…' : t('home.enter')}
                </button>
              </div>
            </div>
          </div>

          {/* error line — reserved height to avoid layout shift */}
          <p
            role="status"
            aria-live="polite"
            className={`mt-4 font-ui text-sm transition ${
              err ? 'text-danger' : 'text-transparent'
            }`}
          >
            {err ?? ' '}
          </p>
        </section>

        {/* footer — theme picker */}
        <footer className="mt-auto max-w-md pt-12">
          <div className="border-t border-text-muted/15 pt-6">
            <span className="font-ui text-[11px] uppercase tracking-[0.16em] text-text-muted/70">
              {t('common.settings')}
            </span>
            <div className="mt-3 flex flex-wrap gap-2">
              {displayThemes.map((k) => (
                <ThemeChip
                  key={k}
                  themeKey={k}
                  active={k === theme}
                  onClick={() => setTheme(k)}
                />
              ))}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function ThemeChip({
  themeKey,
  active,
  onClick,
}: {
  themeKey: ThemeKey;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTranslations();
  const palette = THEMES[themeKey].colors;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 font-ui text-sm transition ${
        active
          ? 'border-text/30 bg-text/[0.06] text-text'
          : 'border-text-muted/20 text-text-muted hover:border-text-muted/40 hover:text-text'
      }`}
    >
      <span
        aria-hidden
        className="block size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
        style={{
          background: `conic-gradient(from 140deg, ${palette.primary}, ${palette.accent}, ${palette.primary})`,
        }}
      />
      <span>{t(`themes.${themeKey}`)}</span>
    </button>
  );
}

// Map API reason codes to i18n error keys.
function mapApiReason(reason: string | undefined): string {
  switch (reason) {
    case 'room_full':
      return 'roomFull';
    case 'room_not_found':
      return 'roomNotFound';
    case 'game_in_progress':
      return 'gameInProgress';
    case 'session_expired':
      return 'sessionExpired';
    case 'empty':
      return 'empty';
    case 'too_long':
      return 'tooLong';
    case 'invalid_chars':
      return 'invalidChars';
    default:
      return 'network';
  }
}
