/**
 * Hand face-count summary rows for the dice card (ported from the wxapp's
 * lib/handSummary.ts — keep in sync): pure per-face counts including 1s
 * ("3 ×2"); wild-1 arithmetic is left to the player (AX feedback — the old
 * "(+n)" annotation read as technical noise).
 */
export function summarizeHand(hand: number[]): string[] {
  const counts = new Map<number, number>();
  for (const f of hand) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => a - b).map((f) => `${f} ×${counts.get(f)}`);
}
