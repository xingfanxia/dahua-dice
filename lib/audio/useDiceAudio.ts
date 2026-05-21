'use client';

import type { Howl } from 'howler';
import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { getPack } from './howl-instance';

/**
 * Loads the current theme's audio sprite and exposes coupled playback helpers.
 *
 * - `collide(pairKey, force)`: triggered by Rapier onContactForce. Volume + pitch
 *   coupled to impact force. Debounced per pair (80ms).
 * - `shake(intensity)`: triggered when DeviceMotion magnitude crosses threshold.
 * - `reveal()` / `win()` / `lose()`: one-shot stingers.
 */
export function useDiceAudio() {
  const { tokens } = useTheme();
  const howlRef = useRef<Howl | null>(null);
  const lastCollideAt = useRef(new Map<string, number>());

  useEffect(() => {
    // The audio pack JSON / sprite files are created by audiosprite (Phase 10).
    // For now, load best-effort and fall back silently if missing.
    const pack = getPack({
      url: tokens.audioPackPath.replace(/\.json$/, ''),
      sprite: {
        // Placeholder sprite map — actual values come from audiosprite output.
        collide: [0, 200],
        shake: [200, 1200, true],
        reveal: [1400, 800],
        win: [2200, 1000],
        lose: [3200, 1000],
        click: [4200, 100],
      },
    });
    howlRef.current = pack;
    return () => {
      // We keep packs cached across theme switches — don't unload on every theme change
    };
  }, [tokens.audioPackPath]);

  const collide = (pairKey: string, force: number) => {
    const now = Date.now();
    if ((lastCollideAt.current.get(pairKey) ?? 0) > now - 80) return;
    lastCollideAt.current.set(pairKey, now);
    const h = howlRef.current;
    if (!h) return;
    try {
      const volume = Math.max(0.1, Math.min(1, force / 50));
      const id = h.play('collide');
      h.volume(volume, id);
      h.rate(0.85 + Math.random() * 0.3, id);
    } catch {
      // sprite not loaded yet
    }
  };

  const shake = (intensity: number) => {
    const h = howlRef.current;
    if (!h) return;
    try {
      const id = h.play('shake');
      h.volume(0.4 + intensity * 0.6, id);
      h.rate(0.9 + intensity * 0.4, id);
    } catch {}
  };

  const reveal = () => howlRef.current?.play('reveal');
  const win = () => howlRef.current?.play('win');
  const lose = () => howlRef.current?.play('lose');
  const click = () => howlRef.current?.play('click');

  return { collide, shake, reveal, win, lose, click };
}
