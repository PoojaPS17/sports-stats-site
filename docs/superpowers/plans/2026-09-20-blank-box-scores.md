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

---

## Player side (added 2026-09-20 after the production check)

**Evidence (production database, read-only, 2016-2018 NBA regular seasons, 1,502 affected player-seasons):** counting each player's rows in a no-box-score game as a game played gives ESPN's own games-played figure exactly for 1,294 of 1,358 affected player-seasons (95%). Every one of the other 66 differs by 1 or 2 games, never more. Causes seen: a game with no player rows at all (the site is 1 short), and a player listed as a non-DNP participant who did not play (the site is 1 over; e.g. a player whose whole season is blank games, 68 listed against ESPN's 67). So: where ESPN's figure is stored, show it (never above it); where it is not stored (2015 and earlier, retired players, playoffs), show the listed count and mark it. Player pages keep showing per-game averages over the games that have a box score only, and say so.

### Task 2: Player log flag and season games logic

**Files:**
- Modify: `src/lib/playerLog.ts` (`fetchPlayerLog` flag, `fetchReportedGames` for NBA)
- Modify: `src/lib/playerProfile.ts` (`PlayerLogRow`, `GamesSource`, `SeasonLine`, `PlayerProfile`, `buildProfile`, `buildStagedProfile`, `milestonesFor`)
- Test: `tests/player-profile.test.ts` or `tests/player-stages.test.ts` (append; reuse the existing `row()` helper there), `tests/player-log.test.ts` (append; update the one test that names the NFL-only rule)

**Interfaces:**
- Consumes: the existing `PlayerLogRow`, `SeasonLine`, `buildProfile(sport, allRows, specRows, reportedGames?)`, `buildStagedProfile(sport, allRows, reportedGames?)`, NBA `played` rule (`playerProfile.ts`, `nbaProfile()`).
- Produces (later tasks rely on these exact names):
  - `PlayerLogRow.no_box_score?: boolean` (optional, so existing fixtures still compile). Doc comment: NBA only; true when no player in the game has a real stat line (ESPN published none), so this row is a listed participant with zeros.
  - `export type GamesSource = "espn" | "logged" | "listed"` (`"listed"` = logged games plus the rows listed in no-box-score games, no ESPN figure available).
  - `SeasonLine.unrecorded: number`: how many of the player's rows in that season sit in no-box-score games (0 for every other sport and for ordinary seasons).
  - `PlayerProfile.unrecorded: number`: the sum of the seasons' `unrecorded` for that profile.

**Behaviour to implement**

1. **SQL flag** in `fetchPlayerLog`: add a selected column `no_box_score`:
   ```sql
   (pgs.league = 'nba' and not exists (
      select 1 from player_game_stats q
      where q.league = pgs.league and q.game_espn_id = pgs.game_espn_id
        and (coalesce(q.stats->'box'->>'MIN', '') ~ '^[0-9]+$' or coalesce(q.stats->'box'->>'PTS', '') ~ '^[1-9]')
   )) as no_box_score
   ```
   This mirrors the NBA `played` rule (numeric MIN, or PTS above zero), so a game is "no box score" exactly when nobody in it counts as having played. Do not add a migration and do not change the schema. Check whether `player_game_stats` has an index or primary key that serves the lookup by `(league, game_espn_id)` (look under `supabase/migrations` or wherever the schema lives, with `git grep`); if it does not, say so in your report as a concern (do not add one).
2. **`fetchReportedGames`** now returns ESPN's stored games played for `nfl` and `nba`; any other league still gets an empty map without a query. Update its doc comment and the one test that says "any league but the NFL" so it uses a league that is neither (for example a soccer league id) and still asserts no query is made.
3. **`buildProfile`** (NBA only in effect, because only NBA rows carry the flag):
   - `unrecordedRows = allRows.filter((r) => r.no_box_score === true && !profile.played(r))`. A flagged row that is nonetheless `played` counts as an ordinary played row and is not in `unrecordedRows`.
   - A season exists in `seasons` if it has played rows OR unrecorded rows (a player whose every game that season is a no-box-score game still gets a season line). Its `teams` include teams from unrecorded rows too.
   - Per season, `unrecorded` = number of unrecorded rows in it. `figure` = the reported figure, but for NBA only when `unrecorded > 0` (NFL keeps using it for every season exactly as now). Then:
     - `unrecorded > 0`, figure present: `games = Math.max(figure, logged)`, `gamesSource = "espn"`.
     - `unrecorded > 0`, figure absent: `games = logged + unrecorded`, `gamesSource = "listed"`.
     - `unrecorded === 0`: exactly the current behaviour (NFL: figure rules; everything else: `logged`, `"logged"`).
   - `record` stays `games > logged ? null : record(rs)` (a season with unrecorded games never shows a W-L that contradicts its games count). `line` is `aggregate(playedRows)`: averages are over the games that have a box score; with no played rows the values are null (check `aggregate` returns nulls for empty input).
   - `PlayerProfile.games` is the sum of the seasons' `games` plus the rows with a null `season_year`, whenever `reported` is defined OR any season has `unrecorded > 0`; otherwise `rows.length` as now. `gamesFromEspn` stays "some season's `gamesSource` is `espn`". `PlayerProfile.unrecorded` is the sum of the seasons' `unrecorded` (unrecorded rows with a null `season_year` are added too).
   - `rows`, `best`, `form`, the home/away, win/loss and opponent splits and the career line keep using played rows only. Nothing else about them changes.
4. **`buildStagedProfile`**: pass `reportedGames` to the regular profile for `nfl` and `nba` (was `nfl` only). The playoffs and play-in profiles get no reported figure (ESPN's stored figure is regular season only), so a playoff season with unrecorded rows is `"listed"`. `playoffs`/`playin` are non-null when `games > 0`, which now includes a stage whose games are all unrecorded. `log` and `counted` are unchanged.
5. **Milestones (`milestonesFor`)**: for NBA, the "Nth game" ordinals (50, 100, ...) and "First game on record" are positions in the chronological list of played rows PLUS unrecorded rows (a game with no box score is still a game the player played). The milestone's `game` is the row at that position; when that row is an unrecorded row, that ordinal milestone is skipped (no stat line to point at, and the game page says it has no box score). All other milestones (30-point game and the rest) use played rows only, as now. Other sports are unchanged: `milestonesFor` receives the extra list and it is empty for them.

**Tests (write first, see them fail, then implement).** In the stages/profile test file, using the existing `row()` helper extended with an optional `no_box_score`, and a blank row's stats `{ box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } }`:
- three played rows plus two unrecorded rows in one regular season, no figure: `games` 5, `gamesSource` "listed", `unrecorded` 2, `record` null, `rows.length` 3, the PPG line averaged over the 3 played rows only.
- the same with reported `Map([[2026, 6]])`: `games` 6, `gamesSource` "espn". With `Map([[2026, 4]])`: 4 (ESPN wins, never the listed 5). With `Map([[2026, 2]])`: 3 (`max` with logged).
- a season whose rows are all unrecorded (0 played, 4 unrecorded, figure 4): the season exists, `games` 4, `record` null, every `line` value null, `rows` empty.
- an ordinary NBA season (no unrecorded rows) with a reported map: the figure is ignored, `games` = logged, `gamesSource` "logged".
- a flagged row that is `played` (MIN "12") is counted as an ordinary played row, `unrecorded` 0.
- career `games` and `unrecorded` on the profile across two seasons, one of them unrecorded-heavy; a row with a null season year still counted.
- staged: a playoff stage with only unrecorded rows gives a non-null `playoffs` profile whose `games` equals the unrecorded count and `gamesSource` "listed"; `log` still excludes the unrecorded rows.
- milestones: 49 played rows then 1 unrecorded then more played rows: the 50th game milestone is skipped, the 100th points at the row in position 100 (counting the unrecorded one); with no unrecorded rows the existing 50th-game behaviour is unchanged.
- NFL behaviour unchanged (the existing NFL tests keep passing untouched).
- `fetchReportedGames` returns the NBA figures for `nba` (seed `player_season_stats` like the existing NFL test does), and `fetchPlayerLog` sets `no_box_score` true for a row in a game where nobody has a numeric MIN or PTS above zero, false when any row in the game has one, and false for a non-NBA league (embedded test DB only, seeded through `tests/helpers/testDb.ts`, following the seeding style already in `tests/player-log.test.ts`).

- [ ] **Step 1:** write the failing tests. **Step 2:** run them (`npx tsx --test tests/<file>.test.ts`), confirm they fail for the right reason. **Step 3:** implement. **Step 4:** run those files, then `npm test`, `npx tsc --noEmit`, `npm run lint`. **Step 5:** commit: `fix: NBA player seasons count games ESPN published no box score for`.
