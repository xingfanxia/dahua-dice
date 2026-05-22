'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useRoomEvents } from '@/components/game/useRoomEvents';
import { DiceScene, type DicePhase } from '@/components/dice/DiceScene';
import { BidPanel } from '@/components/game/BidPanel';
import { PlayerRing } from '@/components/game/PlayerRing';
import { BidChain } from '@/components/game/BidChain';
import { RevealStage } from '@/components/game/RevealStage';
import { CustomizationDrawer } from '@/components/customization/CustomizationDrawer';
import { useShakeDetector } from '@/components/shake/useShakeDetector';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import { unlockAudio } from '@/lib/audio/howl-instance';
import type { GameRules, RoomState } from '@/lib/game-engine/types';

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

  // Identify ourselves from cookie via /api/whoami
  useEffect(() => {
    fetch('/api/whoami')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setMyPlayerId(d.playerId);
      })
      .catch(() => null);
    // Arm Howler's autoUnlock for iOS Safari (needs to bind to user gesture)
    unlockAudio();
  }, []);

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
    const url = `${window.location.origin}/room/${code}`;
    const shareText = t('lobby.shareText', { code });
    // Prefer native share sheet on mobile (iOS/Android). Fall back to clipboard.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('common.appName'), text: shareText, url });
        return;
      } catch {
        // user canceled OR API rejected — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
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
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'leave', code }),
      });
    } finally {
      router.push('/');
    }
  }

  const isOwner = state.ownerId === myPlayerId;
  const canStart = isOwner && state.players.length >= 2 && state.phase === 'lobby';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { setTheme } = useTheme();

  async function handleSaveRules(rules: GameRules) {
    await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'updateRules', code, rules }),
    });
  }

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
        <div className="flex gap-2">
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
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="text-sm px-3 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: tokens.colors.surface,
              color: tokens.colors.text,
              border: `1px solid ${tokens.colors.textMuted}33`,
            }}
            aria-label="settings"
          >
            ⚙
          </button>
        </div>
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
        <GameView state={state} myPlayerId={myPlayerId} code={code} />
      )}

      <CustomizationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        rules={state.rules}
        onSaveRules={handleSaveRules}
        isOwner={isOwner}
        currentTheme={state.theme as 'modern-minimal' | 'classic-bar' | 'hk-neon' | 'cartoon'}
        onSwitchTheme={setTheme}
      />
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
          {t('lobby.rulesSummary', {
            count: state.rules.diceCount,
            aceWild: state.rules.aceWild
              ? t('lobby.rulesSummaryAceWild')
              : t('lobby.rulesSummaryAceStrict'),
            allowZhai: state.rules.allowZhai
              ? t('lobby.rulesSummaryZhaiOn')
              : t('lobby.rulesSummaryZhaiOff'),
          })}
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

function GameView({
  state,
  myPlayerId,
  code,
}: {
  state: RoomState;
  myPlayerId: string | null;
  code: string;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const [hand, setHand] = useState<number[] | null>(null);
  const [allHands, setAllHands] = useState<Record<string, number[]> | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [busy, setBusy] = useState(false);
  const audio = useDiceAudio();
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;

  // Audio coupling — fire stingers on phase transitions
  useEffect(() => {
    if (state.phase === 'reveal') audio.reveal();
    if (state.phase === 'game_end') {
      const r = state.lastChallengeResult;
      if (r && r.winnerIdx >= 0 && state.players[r.winnerIdx]?.id === myPlayerId) audio.win();
      else audio.lose();
    }
  }, [state.phase, state.lastChallengeResult, audio, myPlayerId, state.players]);

  // Shake → audio coupling (vibration if available). Roll trigger isn't wired yet —
  // server auto-rolls on start/nextRound, so this is feedback only.
  useShakeDetector((intensity) => {
    if (phaseRef.current === 'rolling' || phaseRef.current === 'bidding') {
      audio.shake(intensity);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(Math.floor(intensity * 30));
      }
    }
  });

  // Fetch my hand when game running
  useEffect(() => {
    if (state.phase !== 'rolling' && state.phase !== 'bidding' && state.phase !== 'reveal') return;
    fetch(`/api/hand/${state.code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHand(d.hand);
      })
      .catch(() => null);
  }, [state.phase, state.code, state.round]);

  // Fetch all hands on reveal
  useEffect(() => {
    if (state.phase !== 'reveal') {
      setAllHands(null);
      return;
    }
    fetch(`/api/room/${state.code}/all-hands`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAllHands(d.hands);
      })
      .catch(() => null);
  }, [state.phase, state.code]);

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
  const isMyTurn = state.players[state.currentTurnIdx]?.id === myPlayerId;
  const alivePlayers = state.players.filter((p) => p.alive).length;

  async function submitBid(bid: {
    count: number;
    face: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    isZhai: boolean;
  }) {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bid',
          code,
          count: bid.count,
          face: bid.face,
          isZhai: bid.isZhai,
          expectedVersion: state.version,
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitChallenge() {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'challenge',
          code,
          expectedVersion: state.version,
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitNextRound() {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'nextRound',
          code,
          expectedVersion: state.version,
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex-1 flex flex-col gap-4">
      <PlayerRing state={state} myPlayerId={myPlayerId} />

      {state.phase === 'bidding' && <BidChain state={state} />}

      <div
        className="aspect-square rounded-2xl overflow-hidden flex-shrink-0"
        style={{ backgroundColor: tokens.colors.surface }}
      >
        <DiceScene diceCount={diceCount} phase={dicePhase} />
      </div>

      {hand && state.phase !== 'reveal' && (
        <button
          type="button"
          onMouseDown={() => setPeeking(true)}
          onMouseUp={() => setPeeking(false)}
          onMouseLeave={() => setPeeking(false)}
          onTouchStart={() => setPeeking(true)}
          onTouchEnd={() => setPeeking(false)}
          className="py-3 rounded-xl text-sm font-medium select-none"
          style={{
            backgroundColor: tokens.colors.surface,
            color: tokens.colors.primary,
            border: `1px solid ${tokens.colors.primary}55`,
          }}
        >
          {peeking
            ? '🎲 ' + hand.map((f) => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][f - 1] || f).join(' · ')
            : t('game.peekHand')}
        </button>
      )}

      {state.phase === 'bidding' && isMyTurn && (
        <BidPanel
          state={state}
          alivePlayers={alivePlayers}
          onBid={submitBid}
          onChallenge={submitChallenge}
          busy={busy}
        />
      )}

      {state.phase === 'bidding' && !isMyTurn && (
        <p className="text-center text-sm" style={{ color: tokens.colors.textMuted }}>
          {t('game.playerTurn', { name: state.players[state.currentTurnIdx]?.nick ?? '?' })}
        </p>
      )}

      {state.phase === 'reveal' && (
        <RevealStage state={state} hands={allHands} myPlayerId={myPlayerId} />
      )}

      {state.phase === 'reveal' && state.lastChallengeResult && !state.lastChallengeResult.gameEnded && (
        <button
          type="button"
          disabled={busy}
          onClick={submitNextRound}
          className="py-3 rounded-2xl font-medium disabled:opacity-40"
          style={{ backgroundColor: tokens.colors.primary, color: tokens.colors.bg }}
        >
          {t('game.nextRound')}
        </button>
      )}

      {state.phase === 'game_end' && (
        <div className="flex flex-col items-center gap-3 mt-4">
          <p className="text-xl font-display" style={{ color: tokens.colors.accent }}>
            {t('game.gameEnded')}
          </p>
          {state.lastChallengeResult && state.lastChallengeResult.winnerIdx >= 0 && (
            <p style={{ color: tokens.colors.text }}>
              {t('game.champion', {
                name: state.players[state.lastChallengeResult.winnerIdx]?.nick ?? '?',
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
