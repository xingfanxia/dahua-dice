'use client';

import { useTranslations } from 'next-intl';
import type { Player, RoomState } from '@/lib/game-engine/types';
import { AvatarBadge } from './AvatarBadge';

export function PlayerRing({ state, myPlayerId }: { state: RoomState; myPlayerId: string | null }) {
  const t = useTranslations();
  const turnPlayer = state.players[state.currentTurnIdx];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {state.players.map((p, i) => {
        const isCurrent = turnPlayer?.id === p.id;
        const isMe = p.id === myPlayerId;
        return (
          <div
            key={p.id}
            aria-current={isCurrent ? 'true' : undefined}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2.5 py-1.5 transition-transform ${
              isCurrent
                ? 'scale-105 border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950'
                : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            } ${p.alive ? '' : 'opacity-40'}`}
          >
            <AvatarBadge avatar={p.avatar} seed={p.id} seat={i + 1} size={28} />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {p.nick}
              {isMe && (
                // gray-600 (not 500): must clear AA contrast on the red-50
                // current-turn card, where gray-500 lands at 4.42:1.
                <span className="ml-1 text-xs text-gray-600 dark:text-gray-400">
                  {t('lobby.you')}
                </span>
              )}
            </span>
            <PlayerStatus player={p} />
          </div>
        );
      })}
    </div>
  );
}

function PlayerStatus({ player }: { player: Player }) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-1">
      <span className="num text-xs text-gray-600 dark:text-gray-400">
        <span aria-hidden="true">🎲 {player.diceLeft}</span>
        <span className="sr-only">{t('game.diceLeftLabel', { n: player.diceLeft })}</span>
      </span>
      {!player.alive && (
        <span className="text-xs" role="img" aria-label={t('game.eliminated')}>
          💀
        </span>
      )}
    </div>
  );
}
