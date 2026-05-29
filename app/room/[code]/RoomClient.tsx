'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarPicker } from '@/components/customization/AvatarPicker';
import { CustomizationDrawer } from '@/components/customization/CustomizationDrawer';
import { type DicePhase, DiceScene } from '@/components/dice/DiceScene';
import { AvatarBadge } from '@/components/game/AvatarBadge';
import { BidChain } from '@/components/game/BidChain';
import { BidPanel } from '@/components/game/BidPanel';
import { PlayerRing } from '@/components/game/PlayerRing';
import { RevealStage } from '@/components/game/RevealStage';
import { useRoomEvents } from '@/components/game/useRoomEvents';
import { useShakeDetector } from '@/components/shake/useShakeDetector';
import { useTheme } from '@/components/theme/ThemeProvider';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import type { GameRules, RoomState } from '@/lib/game-engine/types';

export function RoomClient({ initialState, code }: { initialState: RoomState; code: string }) {
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

  // SSE-driven sync: on any room event, refetch the full state. An in-flight guard
  // collapses bursts (e.g. an SSE reconnect storm) into a single /full read.
  const refetching = useRef(false);
  const refetch = useCallback(async () => {
    if (refetching.current) return;
    refetching.current = true;
    try {
      const res = await fetch(`/api/room/${code}/full`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.state) {
        setState((prev) => (data.state.version > prev.version ? data.state : prev));
      }
    } catch {
    } finally {
      refetching.current = false;
    }
  }, [code]);

  const { status: connStatus } = useRoomEvents(code, () => {
    refetch();
  });

  // Safety-net polling (every 10s) in case SSE drops
  useEffect(() => {
    const interval = setInterval(refetch, 10000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Reconnect UX (spec §10A): SSE drop → banner; sustained >30s → full-screen rejoin.
  const [reconnecting, setReconnecting] = useState(false);
  const [longOffline, setLongOffline] = useState(false);
  useEffect(() => {
    if (connStatus === 'error') {
      setReconnecting(true);
      const timer = setTimeout(() => setLongOffline(true), 30000);
      return () => clearTimeout(timer);
    }
    setReconnecting(false);
    setLongOffline(false);
  }, [connStatus]);

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

  const [saveError, setSaveError] = useState<string | null>(null);
  async function handleSaveRules(rules: GameRules) {
    const flash = (msg: string) => {
      setSaveError(msg);
      setTimeout(() => setSaveError(null), 3000);
    };
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'updateRules', code, rules }),
      });
      const j = await r.json();
      if (!j.ok) {
        flash(
          j.reason === 'wrong_phase'
            ? t('customization.midGameLocked')
            : t('customization.saveFailed'),
        );
      }
    } catch {
      flash(t('customization.saveFailed'));
    }
  }

  async function handleSetAvatar(avatar: string) {
    const prevAvatar = state.players.find((p) => p.id === myPlayerId)?.avatar ?? 'numeric';
    // Optimistic: reflect locally immediately; SSE refetch reconciles on success.
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === myPlayerId ? { ...p, avatar } : p)),
    }));
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'setAvatar', code, avatar }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.reason ?? 'failed');
    } catch {
      // The success refetch is version-gated and won't revert a failed write, so
      // roll back the optimistic change here.
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) => (p.id === myPlayerId ? { ...p, avatar: prevAvatar } : p)),
      }));
    }
  }

  if (longOffline) {
    return (
      <main
        className="min-h-[100dvh] safe-top safe-bottom flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ backgroundColor: tokens.colors.bg, color: tokens.colors.text }}
      >
        <p className="text-xl font-display">{t('game.disconnected')}</p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="px-6 min-h-[44px] rounded-2xl font-medium"
          style={{ backgroundColor: tokens.colors.primary, color: tokens.colors.bg }}
        >
          {t('game.rejoin')}
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] safe-top safe-bottom flex flex-col px-4 py-6 gap-6 max-w-md mx-auto w-full">
      {reconnecting && (
        <div
          className="text-xs text-center py-1.5 rounded-lg"
          role="status"
          style={{ backgroundColor: `${tokens.colors.danger}22`, color: tokens.colors.danger }}
        >
          {t('game.reconnecting')}
        </div>
      )}
      {saveError && (
        <div
          className="text-xs text-center py-1.5 rounded-lg"
          role="alert"
          style={{ backgroundColor: `${tokens.colors.danger}22`, color: tokens.colors.danger }}
        >
          {saveError}
        </div>
      )}
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
            className="text-sm px-3 min-h-[44px] rounded-lg transition-colors"
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
            className="text-sm min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors"
            style={{
              backgroundColor: tokens.colors.surface,
              color: tokens.colors.text,
              border: `1px solid ${tokens.colors.textMuted}33`,
            }}
            aria-label={t('common.settings')}
          >
            ⚙
          </button>
        </div>
      </div>

      <hr style={{ borderColor: `${tokens.colors.textMuted}33` }} />

      {/* Phase-driven view */}
      {state.phase === 'lobby' ? (
        <LobbyView
          state={state}
          isOwner={isOwner}
          canStart={canStart}
          busy={busy}
          onStart={handleStart}
          onLeave={handleLeave}
          onSetAvatar={handleSetAvatar}
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
  onSetAvatar,
  myPlayerId,
}: {
  state: RoomState;
  isOwner: boolean;
  canStart: boolean;
  busy: boolean;
  onStart: () => void;
  onLeave: () => void;
  onSetAvatar: (avatar: string) => void;
  myPlayerId: string | null;
}) {
  const t = useTranslations();
  const { tokens } = useTheme();
  const mySeat = state.players.findIndex((p) => p.id === myPlayerId);
  const myPlayer = mySeat >= 0 ? state.players[mySeat] : null;
  return (
    <>
      <section>
        <p className="text-sm mb-3" style={{ color: tokens.colors.textMuted }}>
          {t('lobby.playersCount', { count: state.players.length, max: 8 })}
        </p>
        <ul className="flex flex-col gap-2">
          {state.players.map((p, i) => {
            const isMe = p.id === myPlayerId;
            const isHost = p.id === state.ownerId;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: tokens.colors.surface }}
              >
                <AvatarBadge avatar={p.avatar} seed={p.id} seat={i + 1} />
                <span style={{ color: tokens.colors.text }}>
                  {isHost && <span style={{ color: tokens.colors.accent }}>★ </span>}
                  {p.nick}
                  {isMe && (
                    <span style={{ color: tokens.colors.textMuted }}> {t('lobby.you')}</span>
                  )}
                </span>
              </li>
            );
          })}
          {['waiting-a', 'waiting-b'].slice(0, Math.max(0, 2 - state.players.length)).map((key) => (
            <li
              key={key}
              className="p-3 rounded-xl border border-dashed"
              style={{
                borderColor: `${tokens.colors.textMuted}44`,
                color: tokens.colors.textMuted,
              }}
            >
              ⋯ {t('lobby.waiting')}
            </li>
          ))}
        </ul>
      </section>

      {myPlayer && (
        <AvatarPicker
          value={myPlayer.avatar}
          seat={mySeat + 1}
          seed={myPlayer.id}
          onSelect={onSetAvatar}
        />
      )}

      <section>
        <p
          className="text-xs uppercase tracking-wide mb-2"
          style={{ color: tokens.colors.textMuted }}
        >
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
            {canStart ? t('lobby.startGame') : t('lobby.needMorePlayers')}
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
  const router = useRouter();
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
        // Spec §14.4: 50–200ms, scaled by shake intensity.
        navigator.vibrate?.(Math.floor(50 + intensity * 150));
      }
    }
  });

  // Fetch my hand when game running. state.round is an intentional refetch
  // trigger — fresh dice are dealt each round even though the URL is unchanged.
  // biome-ignore lint/correctness/useExhaustiveDependencies: round drives refetch
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
    audio.stinger(); // dramatic 开 sound (spec journey #10)
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

  async function submitPi(targetPlayerId: string) {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pi', code, targetPlayerId, expectedVersion: state.version }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitTongsha() {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'tongsha', code, expectedVersion: state.version }),
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

  async function submitRematch() {
    setBusy(true);
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rematch', code }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function leaveGame() {
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

  return (
    <section className="flex-1 flex flex-col gap-4">
      {/* Screen-reader announcer for turn / phase / standing bid (spec §17C). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {state.phase === 'bidding'
          ? `${
              isMyTurn
                ? t('game.yourTurn')
                : t('game.playerTurn', {
                    name: state.players[state.currentTurnIdx]?.nick ?? '?',
                  })
            }${state.lastBid ? ` · ${state.lastBid.count} × ${state.lastBid.face}` : ''}`
          : state.phase === 'reveal'
            ? t('game.revealPhase')
            : state.phase === 'game_end'
              ? t('game.gameEnded')
              : ''}
      </p>

      <PlayerRing state={state} myPlayerId={myPlayerId} />

      {state.phase === 'bidding' && <BidChain state={state} />}

      <div
        className="aspect-square rounded-2xl overflow-hidden flex-shrink-0"
        style={{ backgroundColor: tokens.colors.surface }}
      >
        <DiceScene
          diceCount={diceCount}
          phase={dicePhase}
          onCollision={(force) => audio.collide('dice', force)}
          onAllSettled={() => audio.settle()}
        />
      </div>

      {hand && state.phase !== 'reveal' && (
        <button
          type="button"
          onMouseDown={() => setPeeking(true)}
          onMouseUp={() => setPeeking(false)}
          onMouseLeave={() => setPeeking(false)}
          onTouchStart={() => setPeeking(true)}
          onTouchEnd={() => setPeeking(false)}
          className="py-3 min-h-[44px] rounded-xl text-sm font-medium select-none"
          style={{
            backgroundColor: tokens.colors.surface,
            color: tokens.colors.primary,
            border: `1px solid ${tokens.colors.primary}55`,
          }}
          aria-label={`${t('game.peekHand')}: ${hand.join(', ')}`}
        >
          <span aria-hidden="true">
            {peeking
              ? `🎲 ${hand.map((f) => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][f - 1] || f).join(' · ')}`
              : t('game.peekHand')}
          </span>
        </button>
      )}

      {state.phase === 'bidding' && isMyTurn && (
        <BidPanel
          state={state}
          alivePlayers={alivePlayers}
          onBid={submitBid}
          onChallenge={submitChallenge}
          onPi={submitPi}
          onTongsha={submitTongsha}
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

      {state.phase === 'reveal' &&
        state.lastChallengeResult &&
        !state.lastChallengeResult.gameEnded && (
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
          <div className="flex gap-3 mt-2 w-full">
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={submitRematch}
                className="flex-1 py-3 min-h-[44px] rounded-2xl font-medium disabled:opacity-40"
                style={{ backgroundColor: tokens.colors.primary, color: tokens.colors.bg }}
              >
                {t('game.rematch')}
              </button>
            )}
            <button
              type="button"
              onClick={leaveGame}
              className="flex-1 py-3 min-h-[44px] rounded-2xl font-medium"
              style={{ backgroundColor: tokens.colors.surface, color: tokens.colors.textMuted }}
            >
              {t('game.disband')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
