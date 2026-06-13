# Player-Feedback R3 — 11-issue batch (2026-06-12)

> Branch `feat/player-feedback-2026-06-12`. Source: 11 player issues reported 2026-06-12.
> Investigation: 6-agent parallel triage (all root causes located to file:line).
> This doc is the durable carry-forward state for a long autonomous run — update status per phase.

## Decisions (locked by user 2026-06-12)

- **#1 zhai discount** → `prev.count − 1` (literal "少叫一个"), NOT the currently-shipped `ceil(prev/2)`. Also make the 斋 toggle discoverable (UX) + sync spec/i18n.
- **#2 lose-a-die** → make it ONE house rule `endMode` enum supporting ALL of: `attrition` (减骰子·last-standing, current default) · `party` (不减骰子·no winner·endless) · `knockout` (不减骰子·out after N losses) · `score` (不减骰子·fixed K rounds·fewest losses wins).
- **#9 dice** → CSS 3D cube for the animated tray + a shared SVG PipDie replacing the literal emoji glyphs ⚀⚁⚂ in RevealStage/BidPanel/BidChain. No WebGL, no image assets.
- **#6 bot** → LOCAL single-device mode: new `/bot` route + BotClient reusing the pure engine + existing dice/bid components. 1 AI, 3 difficulty levels (bluffRate + challengeThreshold knobs). Zero backend changes.

## Phases (FB = player-FeedBack milestone)

| Milestone | Issues | Scope | Status |
|---|---|---|---|
| **FB-1** | #3 | Round-2 perpetual-tumble freeze — Dice2D early-return now snaps to rest + regression test | ✅ DONE (710e048) |
| **FB-2** | #1 | Zhai discount → `prev−1`; reason zhai_count_too_low; validate tests + spec §10B + i18n (both locales) | ✅ DONE (02c9b49) |
| **FB-3** | #2 | `endMode` enum engine (party/knockout/score + attrition default); Player.lossCount; finalize() per-mode; Zod .default() back-compat; normalizeState backfill; 91 unit | ✅ DONE (02ece36) |
| **FB-4** | #9 | CSS 3D cube dice (Dice2D + dice2d.css, transition-driven spin+land); shared `PipDie` SVG; deleted 3× DICE_GLYPHS emoji; verified light+dark | ✅ DONE (6b80630) |
| **FB-5** | #6 | `lib/bot/policy.ts` (pure, TDD) + local game loop + `app/bot/BotClient.tsx` (/bot) + home entry | ⏳ TODO |
| **FB-6** | #4 #5 #7 #8 #10 #11 | UX pass: turn-instruction banner (#4); current-call hero (#11); persistent BidPanel, no unmount-collapse (#10); elevated game-end controls (#5); prominent solo entry (#7); room roll ritual — client-side reveal gate on shake/tap (#8) | ⏳ TODO |
| **FB-7** | #2 #1 | CustomizationDrawer: endMode selector + N/K inputs + prominent 斋 toggle; messages/*.json parity | ⏳ TODO |
| **FB-8** | all | e2e (round-2 [data-tumbling] assertion, endMode flows, bot smoke); multipass review; neat-freak docs sync; PR | ⏳ TODO |

## Non-obvious notes (carry-forward)

- e2e count baseline was 32 (dice-sides.spec deleted with the 8-sided UI; engine/schema still accept 6|8).
- The 斋 rule (#1) was ALREADY shipped (commit f847f58) as ceil/2 — FB-2 TIGHTENS it to prev−1; existing tests validate.test.ts:135-141 must be updated (4个4→3个5 still legal under prev−1: 3≥3 ✓; 4个4→2个X was legal under ceil/2, must become ILLEGAL under prev−1).
- `loseDie:boolean` flag exists in engine/types/tests but is dead (never in Zod schema). FB-3 SUPERSEDES it with `endMode` — migrate the loseDie tests (round.test.ts:353-380) to endMode, derive dice-removal from `endMode === 'attrition'`.
- Dice cube only models d6; 7/8 faces (8-sided engine variant) stay numeric.
- UI work (FB-4/FB-6/FB-7) must invoke the frontend-design skill first and honor the wxapp design language (gray-50/900, red-600, dark/light). axe wcag2aa stays green.
- Bot rolls are local-crypto (same precedent as /solo — no protocol adversary on one device).
