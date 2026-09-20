# Blank box scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the site showing zeros for games ESPN published no player statistics for, and make every figure derived from those games honest.

**Architecture:** ESPN's summary for every Chicago Bulls and New Orleans Pelicans game of the 2014-15 to 2017-18 NBA seasons (683 games in the production database, plus 2 in 2020-21) lists each player who played with minutes `"--"` and every statistic `"0"` / `"0-0"`. The game is otherwise real: score, period scores and attendance are right. A pure predicate on the parsed player box recognises such a game; the game page and its meta description use it. Later tasks (player pages, audit) are appended to this plan once the player-side design is settled.

**Tech Stack:** Next.js (non-standard version, see AGENTS.md), TypeScript, `node:test` via `tsx --test`, Postgres (tests use an embedded throwaway server, never a real database).

**Spec:** none; the design was agreed in chat on 2026-09-20 and is restated in this plan's Architecture and task text. Rulings made without a spec are provisional.

## Global Constraints

- Never show, estimate or invent a statistic ESPN did not publish. A game with no box score says so in words.
- The exact visitor-facing sentence is `ESPN has no box score for this game.` Do not reword it.
- Do not open, read, copy or create any `.env*` file. Do not run scrapers, `psql`, or any script against a real database. Tests that need a database use `tests/helpers/testDb.ts` (embedded throwaway Postgres) only. No network calls.
- Shell: `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` first. No `Grep` tool: use `git grep -nE`. macOS `sed -i` fails: use the Edit tool. Never use bare `git stash`.
- Tests: `npx tsx --test tests/<file>.test.ts` while iterating; full suite `npm test` once before committing; `npx tsc --noEmit` (if it reports stale `.next/dev` errors run `rm -rf .next/dev` and retry; a `SITE_NAME` error is a known pre-existing quirk, ignore only that one); `npm run lint`.
- AGENTS.md: this is not the Next.js you know. Before writing route or metadata code read the relevant guide in `node_modules/next/dist/docs/`. Task 1 only edits existing JSX and the existing `generateMetadata`; do not change routing, caching or metadata APIs.
- Work on branch `fix/blank-box-scores` in `/Users/ps/Claude/sports-stats-site/worktrees/blank-box-scores`. Commit there. Push nothing. Commit message ends with the line `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Follow the surrounding code's comment density, naming and idiom.

---

### Task 1: Game page and meta description for a game with no box score

**Files:**
- Modify: `src/lib/gamePage.ts` (add the predicate, the note, and an optional parameter to `gameDescription`)
- Modify: `src/app/[league]/games/[id]/page.tsx` (`generateMetadata` and the Player Stats block)
- Test: `tests/game-page.test.ts` (append; existing tests must keep passing untouched)

**Interfaces:**
- Consumes: `TeamPlayerBox` / `PlayerStatCategory` shapes from `src/lib/matchDetail.ts` (`{ teamId, teamName, categories: { name, labels, rows: { athleteId, name, stats: string[] }[] }[] }`); `gameDescription(league, game, date, where, scorers = "")` already exported from `src/lib/gamePage.ts`.
- Produces (exact names, later tasks rely on them):
  - `export interface PlayerBoxLike { categories: { rows: { stats: unknown[] }[] }[] }`
  - `export function playerBoxIsBlank(playerBox: PlayerBoxLike[]): boolean`
  - `export function hasNoBoxScore(game: { completed: boolean }, playerBox: PlayerBoxLike[]): boolean`
  - `export const NO_BOX_SCORE = "ESPN has no box score for this game."`
  - `export const NO_BOX_SCORE_NOTE = "ESPN has no box score for this game, so there are no player statistics to show. The final score above is unaffected."`
  - `gameDescription(league, game, date, where, scorers = "", boxScore = true)`: new optional sixth parameter.

**Behaviour to implement**

1. `playerBoxIsBlank(playerBox)` is true when the box has at least one player row and **every cell of every row is empty**. A cell is empty when, after `String(cell ?? "").trim()`, it matches `/^(?:[-–]*|0+(?:[./-]0+)*)$/`: nothing, dashes only (`""`, `"-"`, `"--"`), or a zero in any of the box score's forms (`"0"`, `"0.0"`, `"0-0"`, `"0/0"`). A cell such as `"34"`, `"-3"`, `"1-2"` or `"12.5"` is not empty. No rows at all (no teams, no categories, categories with no rows) returns **false**: with nothing listed there is nothing to call blank and the page keeps its current behaviour.
2. `hasNoBoxScore(game, playerBox)` is `game.completed && playerBoxIsBlank(playerBox)`. A game still to play or in play (`completed` false) is never "no box score", because a live game legitimately starts with zeros.
3. `gameDescription(...)` gets an optional sixth parameter `boxScore` (default `true`, so every existing call and test is unchanged). When `boxScore` is `false`, the game is `completed`, it is not called off and it is not first-class cricket, the description's tail is `` ` ${NO_BOX_SCORE} Head-to-head record.` `` in place of the usual list of what the page covers ("Line-ups, timeline, team stats, box score and head-to-head." and its NBA/NFL equivalent). The called-off branch and the first-class-cricket branch stay exactly as they are. Example, NBA, visitors first: `NBA: Cleveland Cavaliers at Chicago Bulls at United Center, Oct 28, 2015. ESPN has no box score for this game. Head-to-head record.`
4. `page.tsx`, `generateMetadata`: `details` is already loaded for a completed game. Compute `const boxScore = !(details && !isCricketLeague(league) && hasNoBoxScore(game, details.player_box));` and pass it as the sixth argument to `gameDescription` (the scorers argument stays as it is).
5. `page.tsx`, `GameDetailPage`: `const noBoxScore = !isCricket && hasNoBoxScore(game, playerBox);`. The existing Player Stats block (`!isCricket && show.playerStats && hasPlayerStats && ...`) must not render when `noBoxScore` is true. In its place, when `noBoxScore && show.playerStats`, render
   ```tsx
   <section>
     <SectionHeader>Player Stats</SectionHeader>
     <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{NO_BOX_SCORE_NOTE}</p>
   </section>
   ```
   (same card classes as the existing "Match details aren't available right now." line). No share/download image action is shown for the missing table. Nothing else on the page changes: score, period scores, facts, head-to-head, Elo card and the rest stay.

- [ ] **Step 1: Write the failing tests** in `tests/game-page.test.ts` (append; import the new names). Cover:
  - `playerBoxIsBlank`: true for a two-team NBA-shaped box whose rows are `["--","0","0-0","0-0","0-0","0","0","0","0","0","0","0","0","0"]` and DNP rows of `["-","-",...]`; false when one row has MIN `"34"`; false for a `"-3"` cell (a real minus); false for `"1-2"`; true for cells `"0.0"` and `"0/0"`; false for `[]`, for `[{ categories: [] }]` and for a team whose categories have no rows.
  - `hasNoBoxScore`: true for a completed game with the blank box; false for the same box on a game with `completed: false`; false for a completed game with a real box.
  - `gameDescription`: the exact NBA string in item 3 with `boxScore = false`; unchanged output with the parameter omitted and with `true`; a postponed game with `boxScore = false` still says it was postponed (called-off branch wins); first-class cricket ignores the parameter.
- [ ] **Step 2: Run** `npx tsx --test tests/game-page.test.ts`. Expected: the new tests fail (names not exported / description differs).
- [ ] **Step 3: Implement** in `src/lib/gamePage.ts`, then wire `page.tsx` as items 4 and 5.
- [ ] **Step 4: Run** `npx tsx --test tests/game-page.test.ts`, then `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** on `fix/blank-box-scores`: `fix: a finished game with no player statistics says so instead of showing zeros`.
