'use client';

import { Howl, Howler } from 'howler';

let initialized = false;
const packCache = new Map<string, Howl>();

export function unlockAudio() {
  if (initialized || typeof window === 'undefined') return;
  Howler.autoUnlock = true;
  initialized = true;
  // iOS 17 touchstart bug — defer unlock to touchend / pointerup
  const unlock = () => {
    try {
      Howler.ctx?.resume();
    } catch {
      // ignore
    }
  };
  document.addEventListener('pointerup', unlock, { once: true });
  document.addEventListener('touchend', unlock, { once: true });
}

export type AudioPack = {
  url: string; // base path, no extension — Howler will pick mp3 / webm
  sprite?: Record<string, [number, number] | [number, number, boolean]>;
};

export function getPack(pack: AudioPack): Howl {
  if (packCache.has(pack.url)) return packCache.get(pack.url)!;
  const h = new Howl({
    src: [`${pack.url}.mp3`, `${pack.url}.webm`],
    sprite: pack.sprite,
    preload: true,
    volume: 0.7,
  });
  packCache.set(pack.url, h);
  return h;
}

export function setMasterVolume(v: number) {
  Howler.volume(Math.max(0, Math.min(1, v)));
}

export function muteAll(muted: boolean) {
  Howler.mute(muted);
}
