import { describe, expect, it } from 'vitest';
import { oklchToHex } from '@/lib/theme/oklch-to-hex';

describe('oklchToHex', () => {
  it('converts the achromatic extremes exactly', () => {
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff');
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000');
  });

  it('never returns a raw oklch string (the bug Three.js choked on)', () => {
    const hex = oklchToHex('oklch(0.2 0.02 250)'); // modern theme diceDot
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hex).not.toContain('oklch');
  });

  it('resolves the dark-blue dot to a dark, blue-dominant color', () => {
    const hex = oklchToHex('oklch(0.2 0.02 250)');
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    expect(r + g + b).toBeLessThan(150); // L=0.2 → dark
    expect(b).toBeGreaterThan(r); // hue 250 → blue channel leads
  });

  it('handles percentage lightness', () => {
    expect(oklchToHex('oklch(100% 0 0)')).toBe('#ffffff');
  });

  it('passes through non-oklch inputs unchanged (hex / named)', () => {
    expect(oklchToHex('#222')).toBe('#222');
    expect(oklchToHex('#e8e8e8')).toBe('#e8e8e8');
  });

  it('returns the fallback only for empty input', () => {
    expect(oklchToHex('', '#abcdef')).toBe('#abcdef');
  });

  it('is stable across the four themed tokens (all parse to hex)', () => {
    for (const t of ['oklch(0.25 0.04 60)', 'oklch(0.22 0.06 320)', 'oklch(0.22 0.04 30)']) {
      expect(oklchToHex(t)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
