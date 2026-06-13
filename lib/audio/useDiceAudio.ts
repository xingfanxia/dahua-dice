'use client';

import type { Howl } from 'howler';
import { useEffect, useRef } from 'react';
import { getPack } from './howl-instance';

/**
 * The synthesized sprite SFX are OFF by default — they aren't good enough to ship.
 * Set `NEXT_PUBLIC_AUDIO_ENABLED=true` to re-enable them. When off, the sprite
 * sheet is never fetched and every sprite helper below no-ops (howlRef stays null,
 * so each play guard short-circuits).
 *
 * Exception: `settle` plays a real CC0 sample (Kenney casino-audio dice-throw-1,
 * `public/audio/dice-throw.{mp3,webm}`) and ships ALWAYS ON, independent of this
 * gate — the wxapp sibling repo wires the same sample for 摇骰.
 */
const AUDIO_ENABLED = process.env.NEXT_PUBLIC_AUDIO_ENABLED === 'true';

/**
 * Loads the current theme's audio sprite and exposes coupled playback helpers.
 *
 * - `collide(pairKey, force)`: Rapier onContactForce. Volume ← impact force,
 *   pitch ±0.15. Debounced per pair (80ms) to avoid machine-gun clatter.
 * - `shake(intensity)`: DeviceMotion magnitude → volume + pitch.
 * - `settle`: real CC0 dice-landing sample, always on (see header note).
 * - `reveal / stinger / win / lose / click`: fixed-volume sprite one-shots.
 *
 * Concurrent playback is capped at 6 (spec §15): the oldest sound is evicted.
 */
export function useDiceAudio() {
  const howlRef = useRef<Howl | null>(null);
  const settleRef = useRef<Howl | null>(null);
  const lastCollideAt = useRef(new Map<string, number>());
  const active = useRef<number[]>([]);

  useEffect(() => {
    // Curated CC0 settle sample — separate from the synth sprite, not env-gated.
    settleRef.current = getPack({ url: '/audio/dice-throw' });
  }, []);

  useEffect(() => {
    if (!AUDIO_ENABLED) return; // sound disabled — don't even fetch the sprite sheet
    // Sprite map mirrors scripts/audio/generate-sprites.mjs exactly (5500ms total).
    // Single sprite pack since the 4-theme system was removed; the per-theme
    // packs still exist under public/audio/ but only `modern` is wired.
    const pack = getPack({
      url: '/audio/modern',
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
    // Packs are cached in howl-instance — no unload on unmount.
  }, []);

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

  const settle = () => {
    const h = settleRef.current;
    if (!h) return;
    try {
      const id = h.play();
      h.volume(0.6, id);
    } catch {}
  };
  const reveal = () => oneShot('reveal', 0.7);
  const stinger = () => oneShot('stinger', 0.9);
  const win = () => oneShot('win', 0.8);
  const lose = () => oneShot('lose', 0.8);
  const click = () => oneShot('click', 0.5);

  return { collide, shake, settle, reveal, stinger, win, lose, click };
}
