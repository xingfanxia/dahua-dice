'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarPicker } from '@/components/customization/AvatarPicker';
import { CustomizationDrawer } from '@/components/customization/CustomizationDrawer';
import { MyHand } from '@/components/dice/MyHand';
import { PipDie } from '@/components/dice/PipDie';
import { AvatarBadge } from '@/components/game/AvatarBadge';
import { BetInterpretation } from '@/components/game/BetInterpretation';
import { BidChain } from '@/components/game/BidChain';
import { BidPanel } from '@/components/game/BidPanel';
import { OnboardHint } from '@/components/game/OnboardHint';
import { PlayerRing } from '@/components/game/PlayerRing';
import { RevealStage } from '@/components/game/RevealStage';
import { useRoomEvents } from '@/components/game/useRoomEvents';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import type { GameRules, RoomState } from '@/lib/game-engine/types';

export function RoomClient({ initialState, code }: { initialState: RoomState; code: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [state, setState] = useState<RoomState>(initialState);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Identify ourselves from cookie via /api/whoami. Retried with backoff: a single
  // swallowed failure used to leave myPlayerId null forever, so the player could
  // never take their turn (isMyTurn keys on it) — soft-locking the whole table.
  useEffect(() => {
    let cancelled = false;
    async function identify(attempt = 0) {
      try {
        const r = await fetch('/api/whoami');
        const d = await r.json();
        if (cancelled) return;
        if (d.ok && d.playerId) {
          setMyPlayerId(d.playerId);
          return;
        }
        throw new Error('no_player_id');
      } catch {
        if (!cancelled && attempt < 5) {
          setTimeout(() => identify(attempt + 1), 1000 * (attempt + 1));
        }
      }
    }
    identify();
    // Arm Howler's autoUnlock for iOS Safari (needs to bind to user gesture)
    unlockAudio();
    return () => {
      cancelled = true;
    };
  }, []);

  // Timestamp of the last successful /full read. Drives the reconnect / offline UI
  // off ACTUAL sync health rather than the SSE channel alone — so the full-screen
  // "disconnected" lockout only fires when polling has ALSO stopped landing fresh
  // state (e.g. room expired or membership lost), not on a transient SSE blip while
  // the 3s poll is still keeping the game live.
  const lastSyncRef = useRef(Date.now());
  // SSE-driven sync: on any room event, refetch the full state. An in-flight guard
  // collapses bursts into a single /full read; a trailing-refetch flag ensures an
  // event arriving mid-flight isn't dropped (it re-runs once the current read ends).
  const refetching = useRef(false);
  const pendingRefetch = useRef(false);
  const refetch = useCallback(async () => {
    if (refetching.current) {
      pendingRefetch.current = true;
      return;
    }
    refetching.current = true;
    try {
      do {
        pendingRefetch.current = false;
        const res = await fetch(`/api/room/${code}/full`, { cache: 'no-store' });
        if (!res.ok) continue; // 403/404 → no fresh sync; staleness will surface it
        const data = await res.json();
        if (data.ok && data.state) {
          lastSyncRef.current = Date.now();
          setState((prev) => (data.state.version > prev.version ? data.state : prev));
        }
      } while (pendingRefetch.current);
    } catch {
    } finally {
      refetching.current = false;
    }
  }, [code]);

  const { status: connStatus } = useRoomEvents(code, () => {
    refetch();
  });

  // Safety-net polling (every 3s) in case SSE drops, so turn/phase updates still
  // land quickly. The in-flight guard in refetch() collapses overlapping polls.
  useEffect(() => {
    const interval = setInterval(refetch, 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Reconnect UX (spec §10A): SSE dropped AND sync going stale → banner; sync stale
  // >30s → full-screen rejoin. A 1s ticker evaluates real sync health so a brief
  // SSE blip (e.g. the 280s graceful stream rotation) doesn't flash the banner, and
  // the lockout never appears while the 3s poll is still landing fresh state.
  const [reconnecting, setReconnecting] = useState(false);
  const [longOffline, setLongOffline] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const staleMs = Date.now() - lastSyncRef.current;
      setReconnecting(connStatus === 'error' && staleMs > 4000);
      setLongOffline(staleMs > 30000);
    }, 1000);
    return () => clearInterval(id);
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
    } catch {
      // clipboard blocked (perms / insecure context) — best-effort; the invite
      // link is already on screen, so skipping the "copied" toast is acceptable
    }
  }

  const [startError, setStartError] = useState<string | null>(null);
  async function handleStart() {
    setBusy(true);
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The start CAS + retry is handled server-side (against the server's own
        // read), so the client doesn't send a version. We still surface a failure
        // instead of swallowing it (the old silent path).
        body: JSON.stringify({ type: 'start', code }),
      });
      const j = await r.json().catch(() => ({ ok: false }) as { ok: false });
      if (!j.ok) {
        await refetch();
        setStartError(t('lobby.startFailed'));
        setTimeout(() => setStartError(null), 3000);
      }
    } catch {
      setStartError(t('lobby.startFailed'));
      setTimeout(() => setStartError(null), 3000);
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
      <main className="safe-top safe-bottom flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center dark:bg-gray-900">
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {t('game.disconnected')}
        </p>
        <button
          type="button"
          // Full reload re-runs the SSR fetch AND tears down the dead EventSource /
          // client state — router.refresh() only re-fetches RSC and leaves the
          // permanently-CLOSED SSE + stale client error in place (a no-op rejoin).
          onClick={() => window.location.reload()}
          className="min-h-[44px] rounded-2xl bg-red-600 px-6 font-medium text-white"
        >
          {t('game.rejoin')}
        </button>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-4 py-6">
      {reconnecting && (
        <div
          className="rounded-lg bg-amber-100 py-1.5 text-center text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          role="status"
        >
          {t('game.reconnecting')}
        </div>
      )}
      {saveError && (
        <div
          className="rounded-lg bg-red-100 py-1.5 text-center text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
          role="alert"
        >
          {saveError}
        </div>
      )}
      {startError && (
        <div
          className="rounded-lg bg-red-100 py-1.5 text-center text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
          role="alert"
        >
          {startError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('common.appName')}
          </p>
          <h1 className="num text-3xl font-bold text-gray-900 dark:text-gray-50">{code}</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[44px] rounded-full bg-emerald-700 px-4 text-sm font-medium text-white transition-colors"
          >
            {copied ? t('lobby.copied') : t('lobby.copyCode')}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 transition-colors dark:bg-gray-800 dark:text-gray-300"
            aria-label={t('common.settings')}
          >
            ⚙
          </button>
        </div>
      </div>

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
        <GameView state={state} myPlayerId={myPlayerId} code={code} refetch={refetch} />
      )}

      <CustomizationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        rules={state.rules}
        onSaveRules={handleSaveRules}
        isOwner={isOwner}
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
  const mySeat = state.players.findIndex((p) => p.id === myPlayerId);
  const myPlayer = mySeat >= 0 ? state.players[mySeat] : null;
  return (
    <>
      <section>
        <p className="mb-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('lobby.playersCount', { count: state.players.length, max: 8 })}
        </p>
        <ul className="flex flex-col gap-2">
          {state.players.map((p, i) => {
            const isMe = p.id === myPlayerId;
            const isHost = p.id === state.ownerId;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 dark:bg-gray-800"
              >
                <AvatarBadge avatar={p.avatar} seed={p.id} seat={i + 1} />
                <span className="text-gray-900 dark:text-gray-100">
                  {isHost && <span className="text-amber-600 dark:text-amber-400">★ </span>}
                  {p.nick}
                  {isMe && (
                    <span className="text-gray-500 dark:text-gray-400"> {t('lobby.you')}</span>
                  )}
                </span>
              </li>
            );
          })}
          {['waiting-a', 'waiting-b'].slice(0, Math.max(0, 2 - state.players.length)).map((key) => (
            <li
              key={key}
              className="rounded-xl border border-dashed border-gray-300 p-3 text-gray-500 dark:border-gray-600 dark:text-gray-400"
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

      <section className="flex flex-col gap-1 rounded-xl bg-white p-3 dark:bg-gray-800">
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('lobby.rulesHeader')}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
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
        {isOwner ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || busy}
            className={`rounded-2xl py-4 font-medium transition-opacity ${
              canStart
                ? 'bg-red-600 text-white disabled:opacity-40'
                : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
            }`}
          >
            {canStart ? t('lobby.startGame') : t('lobby.needMorePlayers')}
          </button>
        ) : (
          <p
            className="rounded-2xl bg-white py-4 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            role="status"
          >
            {t('lobby.waitingForHost')}
          </p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="min-h-[44px] py-2 text-sm text-gray-500 dark:text-gray-400"
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
  refetch,
}: {
  state: RoomState;
  myPlayerId: string | null;
  code: string;
  refetch: () => Promise<void>;
}) {
  const t = useTranslations();
  const [hand, setHand] = useState<number[] | null>(null);
  const [allHands, setAllHands] = useState<Record<string, number[]> | null>(null);
  const [busy, setBusy] = useState(false);
  // Surfaces a swallowed action failure ("can't bid") for ~3s. The root cause of
  // the silent failure was every submit doing `await fetch()` and ignoring the
  // result; flashAction is the shared sink for those errors. A 409 (stale CAS)
  // additionally triggers refetch() so the client re-syncs to the live turn.
  const [actionError, setActionError] = useState<string | null>(null);
  const actionErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashAction = useCallback((msg: string) => {
    setActionError(msg);
    if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    actionErrorTimer.current = setTimeout(() => setActionError(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    },
    [],
  );

  // POST an action, surface failures, and re-sync on a stale-version (409) reject.
  // Returns true on success. `stale` means the server moved on (someone else acted
  // or the turn advanced) — refetch pulls the live state so the player can retry.
  // The 10s abort bounds a hung connection: without it `busy` never clears and the
  // panel's buttons stay disabled forever (softlock on a flaky mobile network).
  // Every failure path refetches — a lost response may mean the action actually
  // committed server-side, and refetch converges the client either way.
  const postAction = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout?.(10_000),
        });
        const data = await res.json().catch(() => ({ ok: false }) as { ok: false });
        if (!data.ok) {
          await refetch();
          flashAction(data.reason === 'stale' ? t('game.staleResynced') : t('game.actionFailed'));
          return false;
        }
        return true;
      } catch {
        await refetch();
        flashAction(t('game.actionFailed'));
        return false;
      }
    },
    [refetch, flashAction, t],
  );
  const audio = useDiceAudio();
  const router = useRouter();

  // Audio coupling — fire stingers ONCE per phase transition. Gated on a ref of the
  // last phase that fired so unrelated re-renders (the `audio`/`state.players`
  // identities change every render) don't replay the reveal/win/lose stinger.
  const lastAudioPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAudioPhaseRef.current === state.phase) return;
    lastAudioPhaseRef.current = state.phase;
    if (state.phase === 'reveal') audio.reveal();
    if (state.phase === 'game_end') {
      const r = state.lastChallengeResult;
      if (r && r.winnerIdx >= 0 && state.players[r.winnerIdx]?.id === myPlayerId) audio.win();
      else audio.lose();
    }
  }, [state.phase, state.lastChallengeResult, audio, myPlayerId, state.players]);

  // Shake-to-reveal (#8 roll ritual) now lives inside MyHand, which arms the gyro
  // only while the cup is covered and plays the throw sound + vibration itself.

  // Fetch my hand when game running. state.round is an intentional refetch
  // trigger — fresh dice are dealt each round even though the URL is unchanged.
  // Eliminated players are dealt nothing — fetching would 404-spam every round.
  const amAlive = state.players.find((p) => p.id === myPlayerId)?.alive ?? false;
  const lastRoundRef = useRef(state.round);
  useEffect(() => {
    if (state.phase !== 'rolling' && state.phase !== 'bidding' && state.phase !== 'reveal') return;
    // New round → clear the prior hand first so the dice re-roll cleanly: no stale
    // faces flash, and even an identical re-deal still re-triggers the roll animation.
    if (lastRoundRef.current !== state.round) {
      lastRoundRef.current = state.round;
      setHand(null);
    }
    if (!amAlive) return;
    // Tag the fetch with the round it was issued for + abort on cleanup, so a slow
    // response from the PREVIOUS round can never overwrite the new round's hand
    // (a last-writer-wins reorder would otherwise show dice the player doesn't have).
    const ctrl = new AbortController();
    const fetchedRound = state.round;
    fetch(`/api/hand/${state.code}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && lastRoundRef.current === fetchedRound) setHand(d.hand);
      })
      .catch(() => null);
    return () => ctrl.abort();
  }, [state.phase, state.code, state.round, amAlive]);

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

  const myPlayer = state.players.find((p) => p.id === myPlayerId);
  const isMyTurn = state.players[state.currentTurnIdx]?.id === myPlayerId;
  const alivePlayers = state.players.filter((p) => p.alive).length;

  async function submitBid(bid: {
    count: number;
    face: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    isZhai: boolean;
  }) {
    setBusy(true);
    try {
      await postAction({
        type: 'bid',
        code,
        count: bid.count,
        face: bid.face,
        isZhai: bid.isZhai,
        expectedVersion: state.version,
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitChallenge() {
    audio.stinger(); // dramatic 开 sound (spec journey #10)
    setBusy(true);
    try {
      await postAction({ type: 'challenge', code, expectedVersion: state.version });
    } finally {
      setBusy(false);
    }
  }

  async function submitPi(targetPlayerId: string) {
    setBusy(true);
    try {
      await postAction({ type: 'pi', code, targetPlayerId, expectedVersion: state.version });
    } finally {
      setBusy(false);
    }
  }

  async function submitTongsha() {
    setBusy(true);
    try {
      await postAction({ type: 'tongsha', code, expectedVersion: state.version });
    } finally {
      setBusy(false);
    }
  }

  async function submitNextRound() {
    setBusy(true);
    try {
      await postAction({ type: 'nextRound', code, expectedVersion: state.version });
    } finally {
      setBusy(false);
    }
  }

  async function submitRematch() {
    setBusy(true);
    try {
      // Route through postAction so a failed rematch (e.g. 429 rate_limited) flashes
      // an error + re-syncs instead of silently leaving the owner on the end screen.
      await postAction({ type: 'rematch', code });
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
    <section className="flex flex-1 flex-col gap-4">
      {actionError && (
        <div
          className="rounded-lg bg-red-100 py-1.5 text-center text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
          role="alert"
        >
          {actionError}
        </div>
      )}

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

      {/* Visible turn / instruction banner (#4) — always tells you what to do. */}
      {state.phase === 'bidding' && (
        <p
          className="rounded-xl bg-white py-2 text-center text-sm font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          role="status"
        >
          {isMyTurn
            ? t('game.yourTurnHint')
            : t('game.waitingTurn', { name: state.players[state.currentTurnIdx]?.nick ?? '?' })}
        </p>
      )}

      {/* Dismissible how-to memo on your turn (#UX-3, ported from the wxapp sibling). */}
      {state.phase === 'bidding' && isMyTurn && amAlive && <OnboardHint />}

      <PlayerRing state={state} myPlayerId={myPlayerId} />

      {/* Current standing call (#11) — the most important info, shown big and always. */}
      {state.phase === 'bidding' && (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 dark:bg-gray-800">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('game.currentCall')}
          </span>
          {state.lastBid ? (
            <>
              <div className="flex items-center gap-2">
                <span className="num text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {state.lastBid.count}
                </span>
                <span className="text-xl text-gray-400" aria-hidden>
                  ×
                </span>
                <PipDie face={state.lastBid.face} size={34} />
                {state.lastBid.isZhai && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    {t('game.zhai')}
                  </span>
                )}
              </div>
              <BetInterpretation state={state} />
            </>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('game.waitingFirstBid')}
            </span>
          )}
        </div>
      )}

      {/* Bid history — only once there are bids; the empty "waiting" state is
          already shown by the current-call hero above (avoids a duplicate line). */}
      {state.phase === 'bidding' && Array.isArray(state.bidChain) && state.bidChain.length > 0 && (
        <BidChain state={state} />
      )}

      {/* My dice card — covered each round; tap / shake to throw + reveal (#8 ritual
          via MyHand, ported from the wxapp sibling). On reveal the hand shows in
          RevealStage instead, so MyHand renders only during bidding. */}
      {state.phase === 'bidding' && amAlive && <MyHand hand={hand} round={state.round} />}

      {state.phase === 'bidding' && isMyTurn && (
        <BidPanel
          // Remount per round: count/face are useState initialized from lastBid,
          // and a panel surviving a round transition (e.g. 409 resync while the
          // same player keeps the turn) would carry the dead round's values.
          key={state.round}
          state={state}
          alivePlayers={alivePlayers}
          onBid={submitBid}
          onChallenge={submitChallenge}
          onPi={submitPi}
          onTongsha={submitTongsha}
          busy={busy}
        />
      )}

      {myPlayer && !myPlayer.alive && state.phase !== 'game_end' && (
        <p
          className="rounded-lg bg-gray-100 py-1.5 text-center text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          role="status"
        >
          💀 {t('game.spectating')}
        </p>
      )}

      {/* Not your turn — a stable waiting card, not a bare line, so the bid area
          doesn't jarringly collapse to nothing after you bid (#10). */}
      {state.phase === 'bidding' && !isMyTurn && amAlive && (
        <div className="rounded-2xl bg-white py-4 text-center dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('game.playerTurn', { name: state.players[state.currentTurnIdx]?.nick ?? '?' })}
          </p>
        </div>
      )}

      {state.phase === 'reveal' && (
        <RevealStage state={state} hands={allHands} myPlayerId={myPlayerId} />
      )}

      {/* The reveal→next transition ALWAYS needs a nextRound POST — including when
          the game just ended (server flips phase to game_end where rematch lives).
          Rendering no button on gameEnded used to softlock every finished game. */}
      {state.phase === 'reveal' && state.lastChallengeResult && (
        <button
          type="button"
          disabled={busy}
          onClick={submitNextRound}
          className="rounded-2xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
        >
          {state.lastChallengeResult.gameEnded ? t('game.toFinalResult') : t('game.nextRound')}
        </button>
      )}

      {state.phase === 'game_end' && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t('game.gameEnded')}
          </p>
          {state.lastChallengeResult && state.lastChallengeResult.winnerIdx >= 0 && (
            <p className="text-lg text-amber-600 dark:text-amber-400">
              {t('game.champion', {
                name: state.players[state.lastChallengeResult.winnerIdx]?.nick ?? '?',
              })}
            </p>
          )}
          <div className="mt-2 flex w-full gap-3">
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={submitRematch}
                className="min-h-[44px] flex-1 rounded-2xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              >
                {t('game.rematch')}
              </button>
            )}
            {/* Honest label: this action just leaves to home (the leaveRoom Lua
                transfers ownership to a remaining player), it does not dissolve
                the room — so don't promise "disband" (esp. to non-owners). */}
            <button
              type="button"
              onClick={leaveGame}
              className="min-h-[44px] flex-1 rounded-2xl border border-gray-200 bg-white py-3 font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {t('lobby.leaveRoom')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
