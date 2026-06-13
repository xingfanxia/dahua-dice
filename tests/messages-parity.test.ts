import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import zh from '@/messages/zh-CN.json';

/**
 * The zh-CN (default) and en bundles must stay in lockstep — next-intl only errors
 * on a MISSING key at runtime, so an extra/orphaned key on one side is invisible
 * until a fresh agent trips over it. This asserts identical key sets so adding a
 * string to one locale without the other (or leaving an orphan behind) fails CI.
 */
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('i18n message parity', () => {
  it('en and zh-CN have identical key sets', () => {
    const enKeys = new Set(flatKeys(en as Record<string, unknown>));
    const zhKeys = new Set(flatKeys(zh as Record<string, unknown>));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k)).sort();
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k)).sort();
    expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] });
  });
});
