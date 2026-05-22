// Utility for converting oklch(...) color strings to hex.
//
// Three.js's THREE.Color parser doesn't understand the oklch color space, so we
// can't pass `tokens.colors.bg` (which is oklch) directly into <color attach=...>.
// Browsers natively support oklch in CSS — we use a one-time canvas roundtrip
// to let the browser resolve oklch to an rgb/hex value Three.js can read.

const cache = new Map<string, string>();

export function oklchToHex(input: string, fallback = '#000000'): string {
  if (!input) return fallback;
  if (cache.has(input)) return cache.get(input)!;
  if (typeof document === 'undefined') return fallback;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return fallback;
  try {
    ctx.fillStyle = input;
    const resolved = String(ctx.fillStyle);
    cache.set(input, resolved);
    return resolved;
  } catch {
    return fallback;
  }
}
