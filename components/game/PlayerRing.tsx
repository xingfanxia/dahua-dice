'use client';

import { useTheme } from '@/components/theme/ThemeProvider';
import type { Player, RoomState } from '@/lib/game-engine/types';

export function PlayerRing({
  state,
  myPlayerId,
}: {
  state: RoomState;
  myPlayerId: string | null;
}) {
  const { tokens } = useTheme();
  const turnPlayer = state.players[state.currentTurnIdx];
  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      {state.players.map((p) => {
        const isCurrent = turnPlayer?.id === p.id;
        const isMe = p.id === myPlayerId;
        return (
          <div
            key={p.id}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-transform"
            style={{
              backgroundColor: isCurrent ? tokens.colors.primary + '22' : tokens.colors.surface,
              border: `1px solid ${isCurrent ? tokens.colors.primary : tokens.colors.textMuted + '33'}`,
              transform: isCurrent ? 'scale(1.05)' : 'scale(1)',
              opacity: p.alive ? 1 : 0.4,
            }}
          >
            <span
              className="text-sm font-medium"
              style={{ color: tokens.colors.text }}
            >
              {p.nick}
              {isMe && (
                <span className="ml-1 text-xs" style={{ color: tokens.colors.textMuted }}>
                  (你)
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
  const { tokens } = useTheme();
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs num" style={{ color: tokens.colors.textMuted }}>
        🎲 {player.diceLeft}
      </span>
      {!player.alive && <span className="text-xs">💀</span>}
    </div>
  );
}
