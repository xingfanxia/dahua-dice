/**
 * Client-side dice roll for the offline / solo "dice cup" mode.
 *
 * Unlike the multiplayer game — where rolls MUST be server-side because a
 * malicious client could otherwise cheat its own hand — solo mode has no
 * protocol adversary: the phone is just a fair dice cup for one person playing
 * face-to-face. So we roll locally with `crypto.getRandomValues` (uniform via
 * rejection sampling), falling back to `Math.random` only where Web Crypto is
 * unavailable. No network, no room, no shared state.
 */
export function rollDiceClient(count: number, sides: number): number[] {
  const n = Math.max(0, Math.floor(count));
  const s = Math.max(2, Math.floor(sides));
  const out: number[] = [];
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObj?.getRandomValues) {
    // Largest multiple of `s` that fits in a byte — values at/above it are
    // rejected so the modulo is unbiased.
    const limit = Math.floor(256 / s) * s;
    const buf = new Uint8Array(1);
    for (let i = 0; i < n; i++) {
      let v: number;
      do {
        cryptoObj.getRandomValues(buf);
        v = buf[0];
      } while (v >= limit);
      out.push((v % s) + 1);
    }
    return out;
  }

  for (let i = 0; i < n; i++) {
    out.push(1 + Math.floor(Math.random() * s));
  }
  return out;
}
