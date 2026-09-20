# NFL traded-player games and the 2015 season window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Two NFL/NBA player-total gaps found by the production audit on 2026-09-20 show correct games played: a traded NFL player's season, and the 2015 seasons the loader never stored.

**Architecture:** Both are in the season-stats loader path. `seasonGamesPlayed` (pure, `scripts/lib/season-row.ts`) decides the NFL games figure that `upsertOneSeason` stores in `player_season_stats.games_played` and that the audit's live mode recomputes. The loader window (`yearsBack`, default 10, in `scripts/lib/season-stats.ts`) and the audit's own `YEARS_BACK` (`scripts/audit-player-totals.ts`) decide which seasons get a stored row.

**Tech Stack:** TypeScript, tsx `--test`, node:assert.

## Global Constraints

- Every number shown on the site must be correct; never lose or degrade data. NFL and NBA behaviour outside these two fixes is unchanged; other leagues are untouched.
- Never run a scraper or script against a database, never open `.env*` files; tests use only pure functions (this plan needs no database).
- No production writes are part of this branch. The backfill that applies the fix is run by the user afterwards.
- `scripts/lib/season-row.ts` has no database import and must stay that way (tests and the audit import it without a connection).

## Evidence (production audit, 2026-09-20)

ESPN's athlete `/stats` payload for a player traded mid-season has one row per team plus a "Totals" row. The **Totals row's `GP` is the first team's games only**, while its other columns are whole-season. Example, Shiloh Keo 2016 (id 14122), Defense category: `denver-broncos GP 3`, `new-orleans-saints GP 7`, `2016 Totals GP 3` (TOT 8 = 2 + 6, so the stats are summed but GP is not). ESPN's game log for him has 10 regular-season games. The loader stores 3, the site shows the logged 7 (box scores list only players with a stat line), the truth is 10 = 3 + 7. Checked across 16 traded seasons: ESPN's game log has the same number of games as the sum of the team GPs in 13; in three (Thompson 2017, Barner 2018, Mack Brown 2017) the sum is one higher than the game-log count. The site's logged count is lower than the sum in five (Keo 7 vs 10, Matthews 6 vs 8, Coley 2 vs 3, Mack Brown 3 vs 4, King 14 vs 15). Totals GP never exceeds the sum of the team GPs.

`upsertPlayerSeasonStats(..., yearsBack = 10)` keeps seasons from `currentYear - 10` = 2016. The site's games go back one season further (`backfill-games.ts` starts at `currentYear - YEARS_BACK - 1` = 2015), so 1,713 NFL players' 2015 seasons (and the NBA's 2014-15) have no stored ESPN row: their games are the box-score count, which misses games with no stat line.

---

### Task 1: A traded player's games are the sum over teams

**Files:**
- Modify: `scripts/lib/season-row.ts` (`seasonGamesPlayed` and its doc comment)
- Modify: `scripts/lib/audit-player-totals.ts` (the doc comment of `gamesPlayedFromPayload` ~line 248; and the `tradedSeasons` comment ~line 300 if it now reads wrong)
- Test: `tests/season-row.test.ts`

**Interfaces:**
- Produces: `seasonGamesPlayed(categories, seasonYear): number | null`, same signature. New rule: `max(totalsGp, sumOfTeamGp)` when both exist; `totalsGp` when there are no team rows; `sumOfTeamGp` when there is no Totals row; null when neither. A team's GP is still its largest across categories. A single-team season is unchanged (no Totals row, one team).

- [ ] **Step 1: Write the failing tests** in `tests/season-row.test.ts`:
  - Keo 2016: categories with Defense rows `denver-broncos "3"`, `new-orleans-saints "7"`, `2016 Totals "3"` (displayName "2016  Totals") → `10`.
  - Totals GP above the sum stays (Totals 17, teams 6 + 10 = 16) → `17`.
  - Totals equal to the sum (the existing McCaffrey shape: 6 + 11, Totals 17) → `17`.
  - A Totals row in only one category, the teams' rows in two others, Totals GP smaller than the sum → the sum.
  - A traded player where one team appears in only some categories (largest across categories per team is used, then summed) with a smaller Totals row → the sum.
  - Rename the existing test "a traded player with a Totals row gets the Totals GP, not the sum, wherever the row sits" to say it takes the larger of the two, keep its assertions.
- [ ] **Step 2: Run** `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; npx tsx --test tests/season-row.test.ts` and confirm the new tests fail.
- [ ] **Step 3: Implement** in `seasonGamesPlayed`: keep the loop; after it compute `teamSum`; return per the rule above. Rewrite the function's doc comment: ESPN's Totals row `GP` is only the first team's games for a traded player (cite Keo 2016: 3 vs 3 + 7), so the Totals row is used only as a floor.
- [ ] **Step 4: Run** the focused test, then `npm test`, `npx tsc --noEmit`, `npm run lint` (`rm -rf .next/dev` if tsc shows stale errors).
- [ ] **Step 5: Commit** as "fix: a traded NFL player's games played are the sum over teams, ESPN's Totals row shows only the first team".

### Task 2: Keep the 2015 season rows

**Files:**
- Modify: `scripts/lib/season-row.ts` (new exported constant)
- Modify: `scripts/lib/season-stats.ts` (default `yearsBack`; the comment above `upsertPlayerSeasonStats`)
- Modify: `scripts/audit-player-totals.ts` (`YEARS_BACK`, and header comments/USAGE/summary text that say "last 10 years" or "current-roster players" if they now read wrong)

**Interfaces:**
- Produces: `export const SEASON_YEARS_BACK = 11;` in `scripts/lib/season-row.ts`, with a comment that the site's game history starts one season before `currentYear - 10` (`backfill-games.ts` uses `currentYear - YEARS_BACK - 1`), so the season-stats window must reach that far or those seasons have no ESPN games figure. Fix round 1 (final review): a relative window would drop 2015 again on 2027-01-01, so the window is pinned to the games history: `seasonWindowStart(league, currentYear) = min(currentYear - SEASON_YEARS_BACK, HISTORY_START[league] ?? Infinity)` in `scripts/lib/season-row.ts`. `upsertPlayerSeasonStats` uses it by default (an explicit `yearsBack` still means `currentYear - yearsBack`) and the audit uses it per league for `minYear` instead of its local `YEARS_BACK`.

- [ ] **Step 1: Implement** the constant and the two uses; delete the audit's local `YEARS_BACK` (check the audit script's other use of it). Update any comment that states the ten-year window. No test can pin the constant without depending on today's date, so do not write a date-dependent test; `tsc` and lint cover it.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 3: Commit** as "fix: keep the 2015 season rows the site has games for".
