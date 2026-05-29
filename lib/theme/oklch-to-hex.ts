// Convert `oklch(L C H)` color strings to hex for Three.js.
//
// THREE.Color's parser doesn't understand the oklch color space, so tokens like
// `tokens.colors.diceDot` (oklch) can't be passed into `<color>` / material
// `color=` props directly. We previously tried a canvas `fillStyle` roundtrip to
// let the browser resolve oklch → rgb, but that's unreliable: current Chromium /
// WebKit serialize the `fillStyle` getter back as `oklch(...)` (preserving the
// color space), so the roundtrip returned the input unchanged and Three.js still
// choked (and it returned a fallback during SSR). We now do the OKLCH → sRGB math
// directly — deterministic, SSR-safe, no browser dependency.

const cache = new Map<string, string>();

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// Linear-light sRGB channel → gamma-encoded sRGB (CSS Color 4 transfer fn).
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

// Björn Ottosson's OKLab → linear sRGB, given OKLCH components.
function oklchToHexImpl(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  const hex = (x: number): string =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(bl)}`;
}

export function oklchToHex(input: string, fallback = '#000000'): string {
  if (!input) return fallback;
  const cached = cache.get(input);
  if (cached) return cached;

  // Not oklch (already hex / rgb / named) → Three.js parses it directly.
  const m = input.trim().match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) {
    cache.set(input, input);
    return input;
  }

  const L = m[1].endsWith('%') ? Number.parseFloat(m[1]) / 100 : Number.parseFloat(m[1]);
  const C = Number.parseFloat(m[2]);
  const H = Number.parseFloat(m[3]);
  if (Number.isNaN(L) || Number.isNaN(C) || Number.isNaN(H)) return fallback;

  const hex = oklchToHexImpl(L, C, H);
  cache.set(input, hex);
  return hex;
}
