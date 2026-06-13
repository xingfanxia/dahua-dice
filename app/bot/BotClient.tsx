'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type DicePhase, DiceScene } from '@/components/dice/DiceScene';
import { BidChain } from '@/components/game/BidChain';
import { BidPanel } from '@/components/game/BidPanel';
import { PlayerRing } from '@/components/game/PlayerRing';
import { RevealStage } from '@/components/game/RevealStage';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ThemeModeToggle } from '@/components/theme/ThemeModeToggle';
import { unlockAudio } from '@/lib/audio/howl-instance';
import { useDiceAudio } from '@/lib/audio/useDiceAudio';
import {
  advanceRound,
  applyBid,
  applyChallenge,
  type BotGame,
  botStep,
  createBotGame,
  HUMAN_ID,
  isHumanTurn,
} from '@/lib/bot/local-game';
import type { BotDifficulty } from '@/lib/bot/policy';
import { summarizeHand } from '@/lib/game/hand-summary';
import { type Bid, DEFAULT_RULES, type GameRules } from '@/lib/game-engine/types';

const DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard'];
// 3-10 = the GameRules.diceCount type range (the bot runs the real engine, so it
// must stay in that range — unlike /solo's 1-10, which bypasses GameRules).
const DICE_COUNTS: GameRules['diceCount'][] = [3, 4, 5, 6, 7, 8, 9, 10];
const BOT_THINK_MS = 950; // readable pause before the bot's move

type BotNote = { kind: 'bid'; count: number; face: number } | { kind: 'challenge' } | null;

export function BotClient() {
  const t = useTranslations();
  const router = useRouter();
  const audio = useDiceAudio();

  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
  const [diceCount, setDiceCount] = useState<GameRules['diceCount']>(DEFAULT_RULES.diceCount);
  const [game, setGame] = useState<BotGame | null>(null);
  const [diceHand, setDiceHand] = useState<number[] | null>(null);
  const [dicePhase, setDicePhase] = useState<DicePhase>('settled');
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<BotNote>(null);

  const gameRef = useRef<BotGame | null>(null);
  gameRef.current = game;

  useEffect(() => {
    unlockAudio();
  }, []);

  const start = useCallback(() => {
    setNote(null);
    setGame(
      createBotGame({
        humanNick: t('bot.you'),
        humanAvatar: 'numeric',
        botNick: t('bot.cpu'),
        botAvatar: 'numeric',
        rules: { ...DEFAULT_RULES, diceCount },
      }),
    );
  }, [t, diceCount]);

  // Re-tumble the player's own dice ONLY at the start of each round (null→hand
  // flash, same pattern as room/solo so an identical hand still animates). The
  // round is the intentional trigger; the hand is read via ref so a same-round
  // bid doesn't re-roll the dice.
  const round = game?.state.round;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is the trigger; hand read via ref on purpose
  useEffect(() => {
    if (!gameRef.current) return;
    setDiceHand(null);
    setDicePhase('rolling');
    const id = setTimeout(() => {
      setDiceHand(gameRef.current?.hands[HUMAN_ID] ?? null);
      setDicePhase('settled');
    }, 60);
    return () => clearTimeout(id);
  }, [round]);

  // Drive the bot: whenever it's a bot's turn during bidding, think then act once.
  useEffect(() => {
    if (!game || game.state.phase !== 'bidding' || isHumanTurn(game)) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const id = setTimeout(() => {
      const { game: next, action } = botStep(game, difficulty);
      if (action?.kind === 'bid') {
        setNote({ kind: 'bid', count: action.bid.count, face: action.bid.face });
      } else if (action?.kind === 'challenge') {
        setNote({ kind: 'challenge' });
      }
      setThinking(false);
      setGame(next);
    }, BOT_THINK_MS);
    return () => clearTimeout(id);
  }, [game, difficulty]);

  const onBid = useCallback((bid: Bid) => {
    const g = gameRef.current;
    if (!g) return;
    setNote(null);
    setGame(applyBid(g, HUMAN_ID, bid));
  }, []);

  const onChallenge = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setNote(null);
    setGame(applyChallenge(g, HUMAN_ID));
  }, []);

  const onNext = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setNote(null);
    setGame(advanceRound(g));
  }, []);

  // Difficulty picker (pre-game / between games).
  if (!game) {
    return (
      <Shell t={t} onBack={() => router.push('/')}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{t('bot.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('bot.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-4 dark:bg-gray-800">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('bot.difficulty')}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={`min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                  difficulty === d
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {t(`bot.${d}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-4 dark:bg-gray-800">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('bot.diceCount')}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {DICE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDiceCount(n)}
                aria-pressed={diceCount === n}
                className={`num min-h-[44px] rounded-xl text-base transition-colors ${
                  diceCount === n
                    ? 'bg-red-600 font-medium text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={start}
          className="rounded-2xl bg-red-600 py-4 text-base font-medium text-white active:scale-[0.99]"
        >
          {t('bot.start')}
        </button>
      </Shell>
    );
  }

  const state = game.state;
  const alivePlayers = state.players.filter((p) => p.alive).length;
  const human = state.players.find((p) => p.id === HUMAN_ID);
  const summaryRows = diceHand && diceHand.length > 0 ? summarizeHand(diceHand) : [];
  const noteText =
    note?.kind === 'bid'
      ? t('bot.cpuBid', { count: note.count, face: note.face })
      : note?.kind === 'challenge'
        ? t('bot.cpuChallenge')
        : null;

  return (
    <Shell t={t} onBack={() => router.push('/')}>
      <section className="flex flex-col gap-4">
        {/* Turn / status banner — always tells you whose move it is. */}
        <p className="rounded-xl bg-white py-2 text-center text-sm font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100">
          {state.phase === 'reveal'
            ? t('game.revealPhase')
            : state.phase === 'game_end'
              ? t('game.gameEnded')
              : isHumanTurn(game)
                ? t('game.yourTurn')
                : thinking
                  ? t('bot.thinking')
                  : t('game.playerTurn', { name: t('bot.cpu') })}
        </p>

        {noteText && state.phase !== 'game_end' && (
          <p className="text-center text-sm text-amber-800 dark:text-amber-300" role="status">
            {noteText}
          </p>
        )}

        <PlayerRing state={state} myPlayerId={HUMAN_ID} />

        {state.phase === 'bidding' && <BidChain state={state} />}

        {/* The human's own dice. */}
        <div className="flex flex-shrink-0 flex-col items-center gap-2 rounded-2xl bg-white py-4 dark:bg-gray-800">
          <DiceScene
            diceCount={human?.diceLeft ?? state.rules.diceCount}
            phase={dicePhase}
            hand={diceHand}
            onCollision={(force) => audio.collide('dice', force)}
            onAllSettled={() => audio.settle()}
          />
          {summaryRows.length > 0 && state.phase !== 'reveal' && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-1">
              {summaryRows.map((row) => (
                <span
                  key={row}
                  className="num rounded-lg bg-gray-100 px-2.5 py-1 text-base font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  {row}
                </span>
              ))}
            </div>
          )}
        </div>

        {state.phase === 'bidding' && isHumanTurn(game) && (
          <BidPanel
            key={state.round}
            state={state}
            alivePlayers={alivePlayers}
            onBid={onBid}
            onChallenge={onChallenge}
            onPi={() => {}}
            onTongsha={() => {}}
            busy={thinking}
          />
        )}

        {state.phase === 'reveal' && (
          <RevealStage state={state} hands={game.hands} myPlayerId={HUMAN_ID} />
        )}

        {state.phase === 'reveal' && state.lastChallengeResult && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-2xl bg-red-600 py-3 font-medium text-white"
          >
            {state.lastChallengeResult.gameEnded ? t('game.toFinalResult') : t('game.nextRound')}
          </button>
        )}

        {state.phase === 'game_end' && (
          <div className="mt-2 flex flex-col items-center gap-3">
            {state.lastChallengeResult && state.lastChallengeResult.winnerIdx >= 0 && (
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {t('game.champion', {
                  name: state.players[state.lastChallengeResult.winnerIdx]?.nick ?? '?',
                })}
              </p>
            )}
            <div className="mt-1 flex w-full gap-3">
              <button
                type="button"
                onClick={start}
                className="min-h-[44px] flex-1 rounded-2xl bg-red-600 py-3 font-medium text-white"
              >
                {t('bot.rematch')}
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="min-h-[44px] flex-1 rounded-2xl bg-white py-3 font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              >
                {t('common.back')}
              </button>
            </div>
          </div>
        )}
      </section>
    </Shell>
  );
}

/** Shared page chrome (header + max-width column + footer), matching /solo. */
function Shell({
  t,
  onBack,
  children,
}: {
  t: ReturnType<typeof useTranslations>;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-gray-50 dark:bg-gray-900">
      <div className="safe-bottom mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] rounded-lg text-sm text-gray-500 transition-colors dark:text-gray-400"
            aria-label={t('common.back')}
          >
            ← {t('common.back')}
          </button>
          <ThemeModeToggle />
        </header>
        {children}
        <footer className="mt-auto flex justify-center pt-6">
          <LanguageToggle label={t('common.language')} />
        </footer>
      </div>
    </main>
  );
}
