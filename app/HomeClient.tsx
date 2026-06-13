'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ThemeModeToggle } from '@/components/theme/ThemeModeToggle';
import { unlockAudio } from '@/lib/audio/howl-instance';

// 32-char alphabet (no 0/1/I/L/O) — matches lib/room/invite-code.ts
const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]*$/;
const CODE_LEN = 6;

export function HomeClient({
  initialError,
  initialJoinCode,
}: {
  initialError: string | null;
  initialJoinCode: string | null;
}) {
  const router = useRouter();
  const t = useTranslations();
  const nickInputRef = useRef<HTMLInputElement>(null);

  const validInitialCode =
    initialJoinCode && initialJoinCode.length === CODE_LEN && CODE_ALPHABET.test(initialJoinCode)
      ? initialJoinCode
      : '';

  const [nick, setNick] = useState('');
  const [joinCode, setJoinCode] = useState(validInitialCode);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initialError === 'room_not_found') setErr(t('errors.roomNotFound'));
    // Arm Howler autoUnlock so audio works once user reaches the room
    unlockAudio();
    // If we arrived via an invite link (?join=CODE), focus the nickname input
    // — the code is already filled, just need their name.
    if (validInitialCode) {
      nickInputRef.current?.focus();
    }
  }, [initialError, t, validInitialCode]);

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
        body: JSON.stringify({ nick: nick.trim() }),
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
      // Bootstrap session (creates cookie if missing, refreshes nick if present)
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nick: nick.trim() }),
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

  return (
    <main className="flex min-h-[100dvh] flex-col bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-10 pt-[calc(env(safe-area-inset-top)+3rem)]">
        {/* title + theme-mode pill */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
              {t('home.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('home.subtitle')}</p>
          </div>
          <ThemeModeToggle />
        </header>

        {/* invite banner — only when arrived via /?join=CODE */}
        {validInitialCode && (
          <div className="rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {t('lobby.invitedToJoin')}{' '}
            <span className="num font-semibold tracking-[0.18em]">{validInitialCode}</span>
          </div>
        )}

        {/* profile card */}
        <label className="flex items-center gap-3 rounded-2xl bg-white p-4 dark:bg-gray-800">
          <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
            {t('home.nicknamePlaceholder')}
          </span>
          <input
            ref={nickInputRef}
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
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
        </label>

        {/* create / join */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy !== null}
            aria-busy={busy === 'create'}
            className="rounded-2xl bg-red-600 py-4 text-base font-medium text-white transition active:scale-[0.985] disabled:opacity-40"
          >
            {busy === 'create' ? t('common.loading') : t('home.createRoom')}
          </button>

          <div className="flex items-stretch gap-2">
            <input
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
              className="num min-w-0 flex-1 rounded-2xl bg-white px-4 py-3.5 text-base uppercase tracking-[0.25em] text-gray-900 outline-none placeholder:tracking-normal placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={busy !== null || joinCode.length !== CODE_LEN}
              className="rounded-2xl bg-gray-900 px-6 text-base font-medium text-white transition active:scale-[0.985] disabled:opacity-40 dark:bg-gray-700"
            >
              {busy === 'join' ? '…' : t('home.enter')}
            </button>
          </div>

          {/* error line — reserved height to avoid layout shift */}
          <p
            role="status"
            aria-live="polite"
            className={`text-center text-sm transition ${
              err ? 'text-red-600 dark:text-red-400' : 'text-transparent'
            }`}
          >
            {err ?? ' '}
          </p>

          {/* offline / solo entry — no room, no network, just a local dice cup */}
          <button
            type="button"
            onClick={() => router.push('/solo')}
            disabled={busy !== null}
            className="min-h-[44px] text-center text-sm text-gray-500 underline-offset-4 transition hover:underline disabled:opacity-60 dark:text-gray-400"
          >
            🎲 {t('home.soloMode')} →
          </button>
        </div>

        {/* footer — language */}
        <footer className="mt-auto flex flex-col items-center gap-3 pt-12">
          <LanguageToggle label={t('common.language')} />
        </footer>
      </div>
    </main>
  );
}

// Map API reason codes to i18n error keys.
function mapApiReason(reason: string | undefined): string {
  switch (reason) {
    case 'no_room':
    case 'room_not_found':
      return 'roomNotFound';
    case 'room_full':
      return 'roomFull';
    case 'game_in_progress':
      return 'gameInProgress';
    case 'game_ended':
      return 'gameEnded';
    case 'session_expired':
    case 'no_session':
      return 'sessionExpired';
    case 'empty':
      return 'empty';
    case 'too_long':
      return 'tooLong';
    case 'invalid_chars':
      return 'invalidChars';
    case 'invalid_code':
      return 'invalidCode';
    case 'rate_limited':
      return 'rateLimited';
    case 'code_collision':
      return 'tryAgain';
    default:
      return 'network';
  }
}
