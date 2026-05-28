'use client';

import type { Howl } from 'howler';
import { useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { getPack } from './howl-instance';

/**
 * Loads the current theme's audio sprite and exposes coupled playback helpers.
 *
 * - `collide(pairKey, force)`: Rapier onContactForce. Volume ← impact force,
 *   pitch ±0.15. Debounced per pair (80ms) to avoid machine-gun clatter.
 * - `shake(intensity)`: DeviceMotion magnitude → volume + pitch.
 * - `settle / reveal / stinger / win / lose / click`: fixed-volume one-shots.
 *
 * Concurrent playback is capped at 6 (spec §15): the oldest sound is evicted.
 */
export function useDiceAudio() {
  const { tokens } = useTheme();
  const howlRef = useRef<Howl | null>(null);
  const lastCollideAt = useRef(new Map<string, number>());
  const active = useRef<number[]>([]);

  useEffect(() => {
    // Sprite map mirrors scripts/audio/generate-sprites.mjs exactly (5500ms total).
    const pack = getPack({
      url: tokens.audioPackPath.replace(/\.json$/, ''),
      sprite: {
        collide: [0, 200],
        shake: [200, 1200, true],
        reveal: [1400, 800],
        win: [2200, 1000],
        lose: [3200, 1000],
        click: [4200, 100],
        settle: [4300, 300],
        stinger: [4600, 900],
      },
    });
    howlRef.current = pack;
    return () => {
      // Packs are cached across theme switches — don't unload per theme change.
    };
  }, [tokens.audioPackPath]);

  // Cap concurrent sounds at 6 — evict the oldest (spec §15). Stopping an already-
  // finished id is a harmless no-op, so this stays correct without per-sound 'end'
  // bookkeeping.
  const cap = (h: Howl, id: number | undefined) => {
    if (id == null) return;
    active.current.push(id);
    if (active.current.length > 6) {
      const oldest = active.current.shift();
      if (oldest != null) {
        try {
          h.stop(oldest);
        } catch {}
      }
    }
  };

  const collide = (pairKey: string, force: number) => {
    const now = Date.now();
    if ((lastCollideAt.current.get(pairKey) ?? 0) > now - 80) return;
    lastCollideAt.current.set(pairKey, now);
    const h = howlRef.current;
    if (!h) return;
    try {
      const id = h.play('collide');
      h.volume(Math.max(0.1, Math.min(1, force / 50)), id);
      h.rate(1 + (Math.random() * 2 - 1) * 0.15, id); // ±0.15 per spec §15
      cap(h, id);
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
      cap(h, id);
    } catch {}
  };

  const oneShot = (name: string, volume: number) => {
    const h = howlRef.current;
    if (!h) return;
    try {
      const id = h.play(name);
      h.volume(volume, id);
      cap(h, id);
    } catch {}
  };

  const settle = () => oneShot('settle', 0.6);
  const reveal = () => oneShot('reveal', 0.7);
  const stinger = () => oneShot('stinger', 0.9);
  const win = () => oneShot('win', 0.8);
  const lose = () => oneShot('lose', 0.8);
  const click = () => oneShot('click', 0.5);

  return { collide, shake, settle, reveal, stinger, win, lose, click };
}
