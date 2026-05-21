import { randomInt } from 'node:crypto';

/**
 * Roll `count` dice with `sides` faces using crypto-grade random.
 * Server-side only — never trust client rolls.
 */
export function rollDice(count: number, sides: number = 6): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(randomInt(1, sides + 1));
  return out;
}
