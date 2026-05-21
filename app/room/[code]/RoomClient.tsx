'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useRoomEvents } from '@/components/game/useRoomEvents';
import { DiceScene, type DicePhase } from '@/components/dice/DiceScene';
import type { RoomState } from '@/lib/game-engine/types';

export function RoomClient({
  initialState,
  code,
}: {
  initialState: RoomState;
  code: string;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const router = useRouter();
  const [state, setState] = useState<RoomState>(initialState);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Identify ourselves from cookie via /api/session (read-only — won't create)
  useEffect(() => {
    fetch(`/api/hand/${code}`, { method: 'GET' })
      .then((r) => r.json())
      .catch(() => null);
    // Quick way to know my playerId: read the cookie via a tiny GET endpoint
    fetch('/api/whoami')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setMyPlayerId(d.playerId);
      })
      .catch(() => null);
  }, [code]);

  // SSE-driven sync: on any room event, refetch the full state
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/room/${code}/full`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.state) {
        setState((prev) => (data.state.version > prev.version ? data.state : prev));
      }
    } catch {}
  }, [code]);

  useRoomEvents(code, () => {
    refetch();
  });

  // Safety-net polling (every 10s) in case SSE drops
  useEffect(() => {
    const interval = setInterval(refetch, 10000);
    return () => clearInterval(interval);
  }, [refetch]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function handleStart() {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'start', code }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    router.push('/');
  }

  const isOwner = state.ownerId === myPlayerId;
  const canStart = isOwner && state.players.length >= 2 && state.phase === 'lobby';

  return (
    <main className="min-h-[100dvh] safe-top safe-bottom flex flex-col px-4 py-6 gap-6 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
            {t('common.appName')}
          </p>
          <h1 className="text-3xl font-display num" style={{ color: tokens.colors.text }}>
            {code}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="text-sm px-3 py-2 rounded-lg transition-colors"
          style={{
            backgroundColor: tokens.colors.surface,
            color: tokens.colors.primary,
            border: `1px solid ${tokens.colors.primary}55`,
          }}
        >
          {copied ? t('lobby.copied') : t('lobby.copyCode')}
        </button>
      </div>

      <hr style={{ borderColor: tokens.colors.textMuted + '33' }} />

      {/* Phase-driven view */}
      {state.phase === 'lobby' ? (
        <LobbyView
          state={state}
          isOwner={isOwner}
          canStart={canStart}
          busy={busy}
          onStart={handleStart}
          onLeave={handleLeave}
          myPlayerId={myPlayerId}
        />
      ) : (
        <GameView state={state} myPlayerId={myPlayerId} />
      )}
    </main>
  );
}

function LobbyView({
  state,
  isOwner,
  canStart,
  busy,
  onStart,
  onLeave,
  myPlayerId,
}: {
  state: RoomState;
  isOwner: boolean;
  canStart: boolean;
  busy: boolean;
  onStart: () => void;
  onLeave: () => void;
  myPlayerId: string | null;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  return (
    <>
      <section>
        <p className="text-sm mb-3" style={{ color: tokens.colors.textMuted }}>
          {t('lobby.playersCount', { count: state.players.length, max: 8 })}
        </p>
        <ul className="flex flex-col gap-2">
          {state.players.map((p) => {
            const isMe = p.id === myPlayerId;
            const isHost = p.id === state.ownerId;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ backgroundColor: tokens.colors.surface }}
              >
                <span style={{ color: tokens.colors.text }}>
                  {isHost && <span style={{ color: tokens.colors.accent }}>★ </span>}
                  {p.nick}
                  {isMe && <span style={{ color: tokens.colors.textMuted }}> {t('lobby.you')}</span>}
                </span>
                <span className="text-xs num" style={{ color: tokens.colors.textMuted }}>
                  {p.avatar}
                </span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, 2 - state.players.length) }).map((_, i) => (
            /* biome-ignore lint/suspicious/noArrayIndexKey: placeholder slots */
            <li key={`empty-${i}`} className="p-3 rounded-xl border border-dashed"
              style={{ borderColor: tokens.colors.textMuted + '44', color: tokens.colors.textMuted }}>
              ⋯ {t('lobby.waiting')}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: tokens.colors.textMuted }}>
          {t('lobby.rulesHeader')}
        </p>
        <p className="text-sm" style={{ color: tokens.colors.text }}>
          每人 {state.rules.diceCount} 颗 · {state.rules.aceWild ? '1点万能' : '1点不算'} ·{' '}
          {state.rules.allowZhai ? '允许斋' : '禁斋'}
        </p>
      </section>

      <div className="mt-auto flex flex-col gap-2">
        {isOwner && (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || busy}
            className="py-4 rounded-2xl font-medium disabled:opacity-40 transition-opacity"
            style={{
              backgroundColor: canStart ? tokens.colors.primary : tokens.colors.surface,
              color: canStart ? tokens.colors.bg : tokens.colors.textMuted,
            }}
          >
            {canStart
              ? t('lobby.startGame')
              : t('lobby.needMorePlayers')}
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="text-sm py-2"
          style={{ color: tokens.colors.textMuted }}
        >
          {t('lobby.leaveRoom')}
        </button>
      </div>
    </>
  );
}

function GameView({ state, myPlayerId }: { state: RoomState; myPlayerId: string | null }) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const [hand, setHand] = useState<number[] | null>(null);
  const [peeking, setPeeking] = useState(false);

  // Fetch my hand when in rolling/bidding/reveal phase
  useEffect(() => {
    if (state.phase !== 'rolling' && state.phase !== 'bidding' && state.phase !== 'reveal') return;
    fetch(`/api/hand/${state.code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHand(d.hand);
      })
      .catch(() => null);
  }, [state.phase, state.code, state.round]);

  // Map server phase → DiceScene phase
  const dicePhase: DicePhase =
    state.phase === 'lobby'
      ? 'idle'
      : state.phase === 'rolling'
        ? 'rolling'
        : state.phase === 'reveal'
          ? 'revealed'
          : 'settled';

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const diceCount = myPlayer?.diceLeft ?? state.rules.diceCount;

  return (
    <section className="flex-1 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide" style={{ color: tokens.colors.textMuted }}>
          {t(
            `game.${
              state.phase === 'rolling'
                ? 'rollingPhase'
                : state.phase === 'bidding'
                  ? 'biddingPhase'
                  : 'revealPhase'
            }`,
          )}
        </p>
        <p className="text-sm" style={{ color: tokens.colors.text }}>
          {t('game.round', { n: state.round })}
        </p>
      </div>

      {/* 3D dice scene */}
      <div
        className="aspect-square rounded-2xl overflow-hidden"
        style={{ backgroundColor: tokens.colors.surface }}
      >
        <DiceScene diceCount={diceCount} phase={dicePhase} />
      </div>

      {/* Peek hand */}
      {hand && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onMouseDown={() => setPeeking(true)}
            onMouseUp={() => setPeeking(false)}
            onTouchStart={() => setPeeking(true)}
            onTouchEnd={() => setPeeking(false)}
            className="py-3 rounded-xl text-sm font-medium select-none"
            style={{
              backgroundColor: tokens.colors.surface,
              color: tokens.colors.primary,
              border: `1px solid ${tokens.colors.primary}55`,
            }}
          >
            {peeking ? '🎲 ' + hand.join(' · ') : t('game.peekHand')}
          </button>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: tokens.colors.textMuted }}>
        you: {myPlayerId?.slice(0, 8) ?? '—'}
      </p>
    </section>
  );
}
