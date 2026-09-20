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

### Task 3: Player pages say which games have no box score

**Files:**
- Modify: `src/lib/playerProfile.ts` (add `recorded`, teams from unrecorded rows, "First game on record" milestone)
- Modify: `src/lib/playerCopy.ts` (NBA copy helpers)
- Modify: `src/components/PlayerSeasonTable.tsx`, `src/components/PlayerStatsShared.tsx`, `src/components/PlayerGameLogTable.tsx` (only if needed for the empty-log line)
- Modify: `src/app/[league]/players/[slug]/page.tsx`, `src/app/[league]/players/[slug]/[season]/page.tsx`
- Test: `tests/player-stages.test.ts` (append), `tests/player-copy.test.ts` (create)

**Interfaces:**
- Consumes (from Task 2, exact): `PlayerLogRow.no_box_score?`, `GamesSource = "espn" | "logged" | "listed"`, `SeasonLine.unrecorded`, `PlayerProfile.unrecorded`.
- Produces (exact names):
  - `SeasonLine.recorded: number` = the season's played rows (games with a stat line). `PlayerProfile.recorded: number` = the sum of the seasons' `recorded` plus played rows with a null `season_year`. Games without a box score in a season are `games - recorded` (never negative; when a stale ESPN figure is below the listed count it is 0). Display code uses `games - recorded`, not `unrecorded`, for every count it prints.
  - In `src/lib/playerCopy.ts`:
    ```ts
    export const NBA_NO_BOX_SCORE_NOTE = "ESPN published no box score for some of this player's games. Those games count toward GP (ESPN's own figure where it is stored) but not toward the per-game averages, the game log or the best games, and W-L is left blank for those seasons.";
    export function noBoxScoreGamesTitle(n: number, source: GamesSource): string
    //  "espn":   `Includes ${n} ${n === 1 ? "game" : "games"} ESPN published no box score for.`
    //  other:    `Includes ${n} ${n === 1 ? "game" : "games"} ESPN published no box score for, counted from the game rosters; ESPN's own games-played figure is not stored for this season.`
    export function unlistedGamesNote(n: number): string
    //  `${n} ${n === 1 ? "game" : "games"} ESPN published no box score for ${n === 1 ? "is" : "are"} not listed.`
    ```

**Behaviour to implement**

1. `playerProfile.ts`: add `recorded` to `SeasonLine` and `PlayerProfile` as above. Profile-level `teams` (and the season line's teams, already done) include teams from unrecorded rows too. "First game on record" for NBA is emitted even when the earliest row is an unrecorded one (`game` is that row; `PlayerMilestones.tsx` only prints opponent and date and links the game page, which itself says ESPN has no box score). The Nth-game ordinals that land on an unrecorded row stay skipped. Also tidy two test nits from the Task 2 review: the stale `seedGames` docstring in `tests/player-log.test.ts` (names the wrong ids) and the trivial "no 30-point game" assertion in `tests/player-stages.test.ts` (give a played row 30 points and assert the milestone points at it).
2. `PlayerSeasonTable.tsx`: `mixed` (the `*` on a season whose games figure is not ESPN's) applies to the NFL only (`profile.sport === "nfl"`), so ordinary NBA seasons never get it. For a season with `games - recorded > 0` (any sport that has such seasons, in practice NBA) the GP cell shows the number followed by `†` with `title={noBoxScoreGamesTitle(games - recorded, row.gamesSource)}`. The career row's GP likewise gets `†` and a title (`noBoxScoreGamesTitle(profile.games - profile.recorded, "espn")` when any season is `"espn"`, else with `"listed"`) when `profile.games - profile.recorded > 0`.
3. `PlayerStatsShared.tsx` (`careerStripStats` and whatever renders the strip and the export card): the GP stat carries the same `†` and title when `profile.games - profile.recorded > 0`. Keep `careerStripStats`'s existing shape for other callers; add the marker in a way `tests/player-stages.test.ts` (which imports `careerStripStats`) still passes unchanged for ordinary profiles.
4. Both player pages (`[slug]/page.tsx`, `[slug]/[season]/page.tsx`): for NBA, when the regular-season profile has `games - recorded > 0`, the regular-season `SectionHeader` description is the existing text followed by a space and `NBA_NO_BOX_SCORE_NOTE`; the same for the Playoffs description when the playoffs profile has `games - recorded > 0`. The wording of the footer at `[slug]/page.tsx` (the "Regular-season figures are summed from the N ... games" line for NBA) must no longer say "summed" or use `profile.games` when `games > recorded`: say the averages are over the `profile.recorded` games with a box score. The page meta descriptions stay as they are (they quote ESPN's games-played figure, which is what the page shows). A season page whose regular season has `games > 0` but no recorded games renders its table row (GP, dashes) plus the note; verify nothing throws for a profile with `rows.length === 0` and `games > 0` (`profile.career`, `firstDate`, `lastDate`, `best`, `form`, splits and the strip must all cope with empty rows).
5. Game log: when `staged.counted.unrecorded > 0` show `unlistedGamesNote(staged.counted.unrecorded)` as the game-log section description's tail (or as a muted line under the header, following how the page already places notes); when the log is empty but the player has games, that same line is shown instead of the table's empty state.
6. `tests/player-copy.test.ts` (new) asserts the three helpers' exact strings for n = 1 and n = 2 and both sources. `tests/player-stages.test.ts` gets tests for `recorded` (ordinary season, season with unrecorded rows and a figure, stale figure below logged, all-unrecorded season, null-season-year rows, career sum), profile `teams` from an unrecorded-only team, and the First-game-on-record milestone.
7. JSX has no automated test. After tsc and lint pass, do this manual check and report it: render is not possible without a database, so instead re-read every changed JSX expression for `undefined`/`NaN` risks (`games - recorded` on both profiles, an empty `seasons` list, `staged.counted` when there are no counted rows).

- [ ] **Step 1:** write the failing tests (copy helpers, `recorded`, teams, milestone). **Step 2:** run them, see them fail for the right reason. **Step 3:** implement `playerProfile.ts` and `playerCopy.ts`, then the components and pages. **Step 4:** `npx tsx --test tests/player-stages.test.ts tests/player-copy.test.ts tests/player-log.test.ts`, then `npm test`, `npx tsc --noEmit`, `npm run lint`. **Step 5:** commit: `fix: player pages say which games ESPN published no box score for`.

### Task 4: The player-totals audit tells "no box score" from a real mismatch

**Files:**
- Modify: `scripts/lib/audit-player-totals.ts` (`SeasonFigures`, `Verdict`, `compareSeason`, `siteSeasons`, doc comments)
- Modify: `scripts/audit-player-totals.ts` (summary, listing, header comment)
- Test: `tests/audit-player-totals.test.ts` (append; existing tests keep passing untouched)

**Why.** `audit:player-totals nba` on production reported 1,343 MISMATCH because ESPN's headline GP and PPG count Bulls and Pelicans games (2014-15 to 2017-18) that ESPN published no box score for, so the site's own per-game average covers fewer games than ESPN's. After Tasks 2 and 3 the site shows ESPN's games played for such seasons, and averages over the games with a box score. The audit must (a) keep failing a real mismatch and (b) list the expected shortfall separately, with the reason. Read-only script; nothing here writes.

**Interfaces:**
- Consumes (from Tasks 2 and 3): `SeasonLine.games`, `SeasonLine.recorded`, `SeasonLine.unrecorded`, `SeasonLine.gamesSource` (`"espn" | "logged" | "listed"`), `PlayerProfile.rows` (played rows, each with `stats.box.PTS`).
- Produces (exact names):
  - `SeasonFigures.noBoxScore?: { listed: number; recorded: number; points: number; bestGame: number }` (site side, NBA only, present only when the season's `unrecorded > 0`): `listed` = `recorded + unrecorded` (the player's own count from our rows, before ESPN's figure is applied); `recorded` = games with a stat line; `points` = the sum of PTS over those recorded games; `bestGame` = the largest PTS in one recorded game that season (0 when none).
  - `Verdict` gains `"explained (no box score)"`.
  - `export const MAX_LISTED_DRIFT = 2` (the largest gap between our listed count and ESPN's games played that was seen in production: 1,502 affected player-seasons, 1,294 exact, the other 66 within 1 or 2 games; causes seen: a game with no player rows at all, a listed player who did not play).

**Behaviour to implement (`compareSeason`, only when `options.league === "nba"` and `site.noBoxScore` is present and ESPN has data with `espn.games !== null`)**

1. `games`: the site's shown `site.games` is compared with `espn.games` exactly as now (with the stored ESPN figure it is equal by construction; a `"listed"` season has no ESPN row and stays `no ESPN row` through the existing branch). In addition `Math.abs(site.noBoxScore.listed - espn.games) > MAX_LISTED_DRIFT` is a `MISMATCH` with a difference `{ field: "games (listed)", site: listed, espn: espn.games }`.
2. `ppg`: ESPN's PPG covers all of `espn.games`, the site's average covers `recorded`. Let `missingGames = espn.games - recorded`. If `missingGames <= 0`, compare `ppg` as now (nothing is missing, so it must match). Otherwise, unless the one-decimal `ppg` values are equal (then no difference), the ppg difference is **explained** when `espnTotal = espn.ppg * espn.games` satisfies `espnTotal - points >= -tol` and `espnTotal - points <= bestGame * missingGames + tol`, with `tol = 0.05 * espn.games` (ESPN publishes PPG to one decimal). Outside those bounds the ppg difference stays a real `MISMATCH` difference. `espn.ppg === null` is treated as 0, as `differs` does now.
3. Verdict: no real differences and at least one explained ppg difference → `"explained (no box score)"` (its `differences` carry the ppg difference for the listing). No differences at all → `match`. Any real difference → `MISMATCH`, listing only real ones (plus an explained ppg one is NOT listed there). NFL, and NBA seasons without `noBoxScore`, behave exactly as today.
4. `siteSeasons("nba", regular)` sets `noBoxScore` on the season's figures when `season.unrecorded > 0`, computing `points` and `bestGame` from `regular.rows` of that season with the same `cell(r.stats, "box", "PTS")` reader the page uses (null counts as 0). Its `ppg` figure is unchanged (`season.line.pts`).

**CLI (`scripts/audit-player-totals.ts`)**: an `explained` list; summary line `  explained (no box score):   N   (ESPN published no box score for some of the team's games; the games figure matches ESPN or is within 2, the average is inside what those games could hold; never fails the run)`. Counted in `compared` (both sides have the season) but not in `matched`. A listing via the existing `section(...)` helper titled `explained: ESPN published no box score for some of the team's games` (measure: games without a box score = `espn games - recorded`; use the finding's differences to get what you need, add fields to `Finding` if required). `--strict` does not fail on it. The header comment and `USAGE` text mention the new class. Exit codes are unchanged.

**Tests (write first).** In `tests/audit-player-totals.test.ts`, with `SeasonFigures` literals:
- games equal ESPN's and ppg lower than ESPN's but inside the bound → `"explained (no box score)"`.
- ppg exactly equal at one decimal → `match`.
- ppg drift above the bound (`bestGame * missingGames + tol`) → `MISMATCH` with a `ppg` difference; ppg below the lower bound (site total above ESPN's total by more than `tol`) → `MISMATCH`.
- rounding: a drift that is inside `tol` only → explained.
- `listed` differs from ESPN by `MAX_LISTED_DRIFT` → not a mismatch on games; by `MAX_LISTED_DRIFT + 1` → `MISMATCH` with field `games (listed)`.
- `missingGames <= 0` with a ppg difference → `MISMATCH` (nothing is missing, so it must match).
- a season with no `noBoxScore` and every existing case (NBA and NFL): unchanged (the existing tests are the guard).
- `siteSeasons("nba", …)` built from `buildStagedProfile` rows with `no_box_score: true` rows sets `noBoxScore` with the right `listed`, `recorded`, `points`, `bestGame`, and leaves it unset for an ordinary season.
- a `"listed"` season with no ESPN row is `no ESPN row`.

- [ ] **Step 1:** write the failing tests. **Step 2:** run `npx tsx --test tests/audit-player-totals.test.ts`, see them fail for the right reason. **Step 3:** implement. **Step 4:** that file, then `npm test`, `npx tsc --noEmit`, `npm run lint`. **Step 5:** commit: `fix: the player-totals audit lists games ESPN published no box score for as explained`.
