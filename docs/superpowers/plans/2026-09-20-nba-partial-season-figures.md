# NBA partial-season figures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wherever the site's own game rows are short of what ESPN counts for an NBA regular season, the player's season line, career line, strip, meta, structured data and export card show ESPN's own season figures, so the site can no longer disagree with ESPN's player page; everything still built from game rows says so.

**Architecture:** ESPN's whole-season row is already stored in `player_season_stats.categories` (`averages` and `totals`, exact integers). A pure reader (`espnSeasonTotals`) turns it into one typed line. `buildProfile` uses that line for a season when ESPN's games exceed the logged games and the row passes sanity guards; the career line combines per-season totals over total games so it agrees with the seasons. Sections built from game rows (best games, splits, opponents, milestones, form, rivals) get one shared qualifier. The audit drops its flawed ppg bound and adds an independent game-log check.

**Tech Stack:** TypeScript, Next.js app router (server components), `tsx --test`, embedded Postgres test helper.

**Spec:** none written; the design is the "Design" section below plus `scratchpad/nba-consumer-inventory.md` (the list of every place the figures appear, cited as A/B/C items). Rulings made without a spec are provisional.

## Why (root cause, verified)

The site rebuilds a player's season numbers by adding up ESPN's per-game rows. Those rows have holes on ESPN's side:
1. ESPN published no box score for some Bulls and Pelicans games 2015-2018 (every listed player `--`/0) — handled earlier as "no box score" games.
2. ESPN's game summary sometimes lists a player who did play (ESPN's game log shows real minutes) with **no athlete id** (`scripts/lib/game-stats.ts:24` skips such rows: a row cannot be stored without an id). Lachlan Olbrich 2026 (GP 37 on ESPN, 7 on the site), Mike Scott 2021, Justin Harper 2017. The hole is in ESPN's data; the loader cannot recover it.

ESPN's stored season row is complete for both. Using it is the fix; no loader change and no backfill are needed.

## Design (binding for all tasks)

- **Which seasons use ESPN's line:** NBA regular season, `espn.games > logged` (ESPN counts games we hold no stat line for), and the row passes the guards: (a) `espn.pts >=` the points summed over the recorded rows; (b) if the player's rows in the season span more than one team, `espn.games >= logged + listedUnrecorded` (a stored row that is only one team's stint has fewer games than that). A season failing a guard keeps today's behaviour: games `max(figure, logged)` when unrecorded games are listed, averages over recorded games, dagger and footnote.
- **The line:** per-game figure = ESPN `totals` value / GP (exact integers; equals ESPN's rounded average). GS = ESPN `averages` GS (a count). MIN = ESPN `averages` MIN (already per game). FG%/3P%/FT% = made/attempted from `totals` (`"447-1048"`). `+/-` has no ESPN figure: null.
- **Career line:** for every stat, (sum of box-row values over seasons not using ESPN + sum of ESPN totals over seasons using ESPN) / (rows with a value + ESPN games). MIN uses ESPN's rounded per-game figure times games (rounding ≤ 0.05 per game); GS and made/attempted are plain sums. A stat with no ESPN figure (`+/-`) is null in a career that includes an ESPN season.
- **Games, W-L:** `games` = `espn.games` (gamesSource `"espn"`), `record` null (as now when games > logged). Playoffs and play-in never use ESPN figures (the stored row is regular season only).
- **Wording is generalised:** the games ESPN has no stat line for are "no box score" games or games ESPN's box scores list a player without an id; the copy says "games without a box score" / "no stat line", never claims ESPN published none.
- **Traded players:** a season whose rows span more than one team uses ESPN's line only under guard (b).
- **Left as is, and said so on the page:** best games, splits, opponents, milestones, form, rivals stay box-row based.

## Global Constraints

- Never open or read `.env.local` anywhere; never run scripts against production. Tests use the embedded Postgres helper only.
- Never use bare `git stash`; no pushes, no merges; commit on the branch `fix/nba-partial-season-figures` only.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Test command: `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; npx tsx --test tests/*.test.ts` (392 pass before this plan). Also `npx tsc --noEmit` (the `SITE_NAME` error is pre-existing) and `npx eslint <changed files>`.
- Behaviour for NFL, soccer and every non-regular NBA table must not change; the existing tests are the guard.
- No Grep tool: use `git grep -nE`. macOS `sed -i` fails: use Edit.
- `AGENTS.md`: this Next.js has breaking changes; for any page edit, keep to patterns already in the file.

## File Structure

- Create `src/lib/espnSeason.ts` — pure reader of the stored ESPN season row (Task 1).
- Modify `src/lib/playerProfile.ts` — `aggregateWithEspn`, `buildProfile`/`buildStagedProfile` take `espnSeasons`, `SeasonLine.lineSource`, `PlayerProfile.boxOnlyShort` (Tasks 1, 2).
- Modify `src/lib/playerLog.ts`, `src/lib/queries.ts` — `fetchEspnSeasons`, `getPlayerEspnSeasons` (Task 1).
- Modify the two player pages and the audit CLI to pass `espnSeasons` (Task 1).
- Modify `src/lib/playerCopy.ts` and the components/pages that show the sections (Task 2).
- Modify `scripts/lib/audit-player-totals.ts`, `scripts/audit-player-totals.ts`; create `scripts/lib/espn-gamelog.ts` (Task 3).
- Tests: `tests/espn-season.test.ts` (new), `tests/player-profile.test.ts`, `tests/player-stages.test.ts`, `tests/audit-player-totals.test.ts`, `tests/espn-gamelog.test.ts` (new), page/copy tests where they exist.

---

### Task 1: ESPN season line in the profile

**Files:**
- Create: `src/lib/espnSeason.ts`, `tests/espn-season.test.ts`
- Modify: `src/lib/playerProfile.ts` (`aggregate` ~309-336; `SeasonLine` ~368; `PlayerProfile` ~404; `buildProfile` ~536-627; `buildStagedProfile` ~647-670), `src/lib/playerLog.ts`, `src/lib/queries.ts:~648`, `src/app/[league]/players/[slug]/page.tsx` (~83), `src/app/[league]/players/[slug]/[season]/page.tsx` (~51, ~82), `scripts/audit-player-totals.ts` (~128), `scripts/lib/audit-player-totals.ts` (`siteSeasons`)
- Test: `tests/espn-season.test.ts`, `tests/player-profile.test.ts`, `tests/player-stages.test.ts`, `tests/player-log.test.ts` (fetchEspnSeasons), `tests/audit-player-totals.test.ts`

**Interfaces:**
- Produces (`src/lib/espnSeason.ts`):
```ts
export interface EspnSeasonTotals {
  games: number;                 // averages GP
  starts: number | null;         // averages GS (a count)
  minutesPerGame: number | null; // averages MIN
  pts: number; reb: number; ast: number; stl: number; blk: number; to: number; // totals, exact
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; // totals "made-attempted"
}
export function espnSeasonTotals(categories: unknown): EspnSeasonTotals | null;
```
  Returns null unless `averages.GP` is a positive number and every one of PTS, REB, AST, STL, BLK, TO, FG, 3PT, FT is readable in `totals` (thousands separators stripped; `FG` etc. parsed as `made-attempted`).
- Produces (`playerLog.ts`): `fetchEspnSeasons(db: Pick<Pool,"query">, league: League, playerEspnId: string): Promise<Map<number, EspnSeasonTotals>>` — empty map unless `league === "nba"`; reads `season, categories` from `player_season_stats` and keeps the rows `espnSeasonTotals` accepts.
- Produces (`queries.ts`): `getPlayerEspnSeasons(league, playerEspnId)` wrapping it with `pool`.
- Produces (`playerProfile.ts`): `aggregateWithEspn(rows: PlayerLogRow[], espn: EspnSeasonTotals[], specs: StatSpec[]): Line`; `aggregate(rows, specs)` becomes `aggregateWithEspn(rows, [], specs)` with unchanged results; `SeasonLine.lineSource: "espn" | "box"`; `PlayerProfile.boxOnlyShort: number` (seasons with `games > recorded` whose `lineSource` is `"box"`); `buildProfile(sport, allRows, specRows?, reportedGames?, espnSeasons?: ReadonlyMap<number, EspnSeasonTotals>)`; `buildStagedProfile(sport, allRows, reportedGames?, espnSeasons?)` passes `espnSeasons` to the regular-season profile only, and only for NBA.

- [ ] **Step 1: Failing tests for the reader** (`tests/espn-season.test.ts`). Use this stored shape (Knicks 2022 row of the sample payload): `{ averages: { labels: ["GP","GS","MIN","FG","FG%","3PT","3P%","FT","FT%","OR","DR","REB","AST","BLK","STL","PF","TO","PTS"], values: ["26","4","24.5","4.7-10.5","44.5","1.4-3.5","40.2","1.2-1.2","96.8","0.8","2.2","3.0","4.0","0.5","0.8","0.6","1.5","12.0"] }, totals: { labels: ["FG","FG%","3PT","3P%","FT","FT%","OR","DR","REB","AST","BLK","STL","PF","TO","PTS"], values: ["122-274","44.5","37-92","40.2","30-31","96.8","21","57","78","103","12","22","15","39","311"] } }`. Assert: games 26, starts 4, minutesPerGame 24.5, pts 311, reb 78, ast 103, stl 22, blk 12, to 39, fgm 122, fga 274, tpm 37, tpa 92, ftm 30, fta 31. Also: `"1,080"` PTS reads 1080; missing `totals` → null; missing `averages` → null; `GP` `"0"` → null; a `totals` without `FT` → null; `null`, `undefined`, `"x"` input → null; `GS` blank → `starts: null`.
- [ ] **Step 2: Run** `npx tsx --test tests/espn-season.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/espnSeason.ts`: helpers `valueOf(cat, label): string | null` (label lookup in `cat.labels`, blank → null), `numberAt`, `pairAt` (regex `^([\d,]+)-([\d,]+)$`), then `espnSeasonTotals`. Keep it pure: no imports.
- [ ] **Step 4: Run** the tests; expect PASS. Commit `feat: read ESPN's stored NBA season line`.
- [ ] **Step 5: Failing tests for the profile** (`tests/player-profile.test.ts`, reuse its row builders). Cases, each asserting exact values:
  1. Season with 7 recorded rows (PTS sums to 42) and an ESPN line `{games: 37, pts: 89, ...}`: `seasons[0].games === 37`, `gamesSource === "espn"`, `lineSource === "espn"`, `record === null`, `line.pts === 89/37`, `line.gs`/`min` from ESPN, `line.fg_pct === 100*fgm/fga`, `recorded === 7`; `boxOnlyShort === 0`.
  2. Same but `espn.pts` (30) below the recorded points (42): guard (a) fails → `lineSource === "box"`, `line.pts === 42/7`, `games` = today's value, `boxOnlyShort === 1`.
  3. Two teams in the season, `espn.games` below `logged + listed`: guard (b) fails → box. Two teams with `espn.games >= logged + listed`: ESPN.
  4. `espn.games <= logged` (complete season): box, `lineSource === "box"`, `boxOnlyShort === 0`.
  5. Career line with one ESPN season (games 37, pts 89) and one box season (10 rows, 200 points): `career.pts === (89+200)/(37+10)`; `career.gs` sums; `career.fg_pct` from summed made/attempted; a box season's `pm` present and an ESPN season present → `career.pm === null`.
  6. No `espnSeasons` argument, or non-NBA sport: results identical to today (the existing tests in the file).
  7. Playoff/play-in profiles in `buildStagedProfile` never use ESPN lines.
  8. A player whose only games are ESPN-short with no rows listed (Olbrich shape: recorded 7, no unrecorded rows, ESPN games 37): ESPN line, `unrecorded === 0`, `games - recorded === 30`.
- [ ] **Step 6: Run** the profile tests; expect the new cases FAIL.
- [ ] **Step 7: Implement.** In `playerProfile.ts`:
```ts
type EspnPart = { total: number; n: number };
function espnPart(t: EspnSeasonTotals, key: string): EspnPart | null {
  const g = t.games;
  switch (key) {
    case "gs": return t.starts === null ? null : { total: t.starts, n: g };
    case "min": return t.minutesPerGame === null ? null : { total: t.minutesPerGame * g, n: g };
    case "pts": case "reb": case "ast": case "stl": case "blk": case "to": return { total: t[key], n: g };
    case "fgm": case "fga": case "tpm": case "tpa": case "ftm": case "fta": return { total: t[key], n: g };
    default: return null; // pm has no ESPN figure
  }
}
```
  `aggregateWithEspn` is today's `aggregate` loop with, per non-rate spec, the ESPN parts added to `total` and `n`, and `line[key] = null` when `espn.length > 0` and any ESPN season has no part for that key. The rate specs stay computed from the summed makes and attempts. `aggregate(rows, specs)` calls it with `[]`.
  In `buildProfile`, when `sport === "nba"` and `espnSeasons` is given, for each season (regular-season profile only, i.e. when `reportedGames` or `espnSeasons` is given):
```ts
const espn = sport === "nba" ? espnSeasons?.get(season) : undefined;
const recordedPoints = rs.reduce((n, r) => n + (cell(r.stats, "box", "PTS") ?? 0), 0);
const useEspn = espn !== undefined && espn.games > logged && espn.pts >= recordedPoints && (teams.size <= 1 || espn.games >= logged + us.length);
```
  When `useEspn`: `games = espn.games`, `gamesSource = "espn"`, `line = aggregateWithEspn([], [espn], specs)`, `lineSource = "espn"`. Otherwise the existing code, `lineSource = "box"`. Keep an `espnUsed: Map<number, EspnSeasonTotals>`; the career is `aggregateWithEspn(rows.filter((r) => r.season_year === null || !espnUsed.has(r.season_year)), [...espnUsed.values()], specs)`. `boxOnlyShort = seasons.filter((s) => s.games > s.recorded && s.lineSource === "box").length`. `gamesFromEspn` stays `seasons.some((s) => s.gamesSource === "espn")`.
  `fetchEspnSeasons` and `getPlayerEspnSeasons` as specified. In the three call sites, fetch it next to `reportedGames` and pass it through `buildStagedProfile`. In `scripts/lib/audit-player-totals.ts` `siteSeasons`, an NBA season with `lineSource === "espn"` gets no `noBoxScore`; the audit CLI fetches `fetchEspnSeasons` with its own pool.
- [ ] **Step 8: Run** the full suite, `npx tsc --noEmit`, eslint on changed files; all green (only the pre-existing `SITE_NAME` tsc error). Add a `fetchEspnSeasons` case to `tests/player-log.test.ts` (embedded Postgres: one row with a valid `categories`, one row with `categories` lacking `totals`; only the first is returned; non-nba league returns an empty map).
- [ ] **Step 9: Commit** `feat: show ESPN's season figures where the game rows are short`.

---

### Task 2: Say what each section counts, and keep every figure on one basis

**Files:**
- Modify: `src/lib/playerCopy.ts`, `src/lib/playerProfile.ts` (`milestonesFor` detail), `src/app/[league]/players/[slug]/page.tsx`, `src/app/[league]/players/[slug]/[season]/page.tsx`, `src/components/PlayerExportCard.tsx` (or the card-note constant's user), `src/components/PlayerSeasonTable.tsx` (tooltip wording only)
- Test: `tests/player-copy.test.ts` (create if absent; follow the existing copy/page test conventions in `tests/`), `tests/player-profile.test.ts`

**Interfaces:**
- Consumes: `PlayerProfile.boxOnlyShort`, `noBoxScoreGames(sport, games, recorded)`, `unlistedGameCount(staged)`, `SeasonLine.lineSource`.
- Produces (`playerCopy.ts`): `NBA_NO_BOX_SCORE_NOTE` (reworded, below); `BOX_ROWS_ONLY_NOTE`; `withBoxRowsNote(text: string, n: number): string`; `nbaCardNote(boxOnlyShort: number): string`.

Additions found in the Task 1 review (all in scope for this task):
- The regular-season footnote at the bottom of `players/[slug]/page.tsx` (~353-376, "per-game averages are over the N games with a box score") is false for a season shown from ESPN's line. Reword: when any season has `lineSource === "espn"`, say the season figures for those seasons are ESPN's own and the game-by-game sections count only games with a box score.
- The † tooltip (`noBoxScoreGamesTitle`, used in `PlayerSeasonTable.tsx` ~40 and the career row) says "ESPN published no box score for" N games; reword per the copy rules below, and for a season with `lineSource === "espn"` do not claim the games are missing from the averages.
- Meta description: quote averages only when `profile.boxOnlyShort === 0` and `profile.career.pts !== null` (today's page code quotes them when `recorded > 0`, which stays wrong for an ESPN season with no rows and for a partial box-only season). The season page's `figures` follows the same rule.
- `milestonesFor`: the "Nth game" ordinals (50th, 100th, ...) index into recorded plus listed rows. When the profile's `games` exceeds that timeline length (some games have no row at all, e.g. a game where ESPN gave no athlete id), the Nth game cannot be located, so skip the ordinals and keep "First game on record". Pass the missing count in (`games - (recorded + unrecorded rows)`); test it with a fixture of 60 played rows: `games` 90 gives no "50th game" (and no other ordinal), `games` 60 gives "50th game", and "First game on record" is present in both.

Copy (exact):
- `NBA_NO_BOX_SCORE_NOTE`: "† ESPN's box scores have no stat line for some of this player's games. For those seasons the games, per-game averages and percentages are ESPN's own season figures where ESPN stores them (W-L is left blank). The game log, best games, splits and milestones below count only games with a box score."
- `NBA_NO_BOX_SCORE_STAGE_NOTE` keeps its meaning; reword "ESPN published no box score" to "ESPN's box scores have no stat line" for consistency.
- `BOX_ROWS_ONLY_NOTE`: "Counts only games with a box score." `withBoxRowsNote(text, n)` returns `text` when `n <= 0`, else `` `${text} ${BOX_ROWS_ONLY_NOTE}` ``.
- `nbaCardNote(boxOnlyShort)`: `boxOnlyShort === 0` → "† Includes games without a box score; the figures are ESPN's season figures." else "† Includes games without a box score; some seasons' averages count only games with a box score."
- `noBoxScoreGamesTitle` / `unlistedGamesNote`: replace "ESPN published no box score for" with "without a box score" (keep the counts and the `"espn"` vs listed distinction).

- [ ] **Step 1: Failing tests** for the copy helpers (exact strings above, `n` 0 / 1 / 2), for `milestonesFor` detail (`"N times in games with a box score, most recently"` when the profile's `games > recorded`, unchanged otherwise) and for a meta-description helper: `gamesAndFigures(gamesText, figures)` is called with `null` figures when `boxOnlyShort > 0` (assert on the page's `figures` builder if it is exported; otherwise extract a small exported function `metaFigures(profile)` in `playerProfile.ts` returning `null` when `boxOnlyShort > 0` and test it).
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.** Apply, in both player pages: `withBoxRowsNote` to the descriptions of Best games (n = `unlistedGameCount(staged)`), Home and away, By result, Against each opponent, Milestones, Recent form (n = `noBoxScoreGames(regular...)` for the regular-only sections, `unlistedGameCount(staged)` for the counted ones: Best games, Recent form); change the opponents description "Every opponent faced, most often first." to "Opponents faced, most often first."; add the `NBA_NO_BOX_SCORE_NOTE` description above the career strip on the main page (the strip currently has none; the season page already has it above the strip); the head-to-head links text "N games played in" gets " with a box score" when the regular profile has unrecorded games; the export card's footnote uses `nbaCardNote(profile.boxOnlyShort)`; the meta description and the JSON-LD `description` quote games only (no averages) when `boxOnlyShort > 0`, on both pages (`profileSummary` and the season page's `figures`).
- [ ] **Step 4: Run** full suite, tsc, eslint. Commit `feat: name what each player section counts`.

---

### Task 3: Audit — drop the flawed bound, add the independent game-log check

**Files:**
- Modify: `scripts/lib/audit-player-totals.ts`, `scripts/audit-player-totals.ts`, `tests/audit-player-totals.test.ts`
- Create: `scripts/lib/espn-gamelog.ts`, `tests/espn-gamelog.test.ts`

**Interfaces:**
- Consumes: `SeasonLine.lineSource`, `fetchEspnSeasons`, `EspnSeasonTotals`.
- Produces (`espn-gamelog.ts`, pure): `gamelogRegularSeason(payload: unknown): { games: number; points: number } | null` — reads ESPN's athlete game-log payload (`names`, `seasonTypes[]` with `displayName` containing "Regular", `categories[].events[].stats`), counting an event only when its `minutes` cell is a number (so a game with `--` counts as not played) and summing the `points` cell; null when the payload has no `points` column. A network wrapper `fetchGamelog(playerEspnId, season)` in the CLI only: `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{id}/gamelog?season={season}`, `User-Agent` header as the other ESPN fetches in `scripts/lib/espn.ts` use (use that module's helper if it has one), 150 ms between requests.
- Produces (audit): verdict `"partial (no box score)"` replacing `"explained (no box score)"`; new CLI flag `--gamelog` and its report.

- [ ] **Step 1: Failing tests** in `tests/audit-player-totals.test.ts`: (a) the reworked rule — a listed, box-only season: games agree within `MAX_LISTED_DRIFT` and ESPN's points total ≥ recorded points − tol ⇒ `"partial (no box score)"` (never fails the run); ESPN's total below the recorded points ⇒ `MISMATCH`; the upper bound is gone: a season with 2 recorded games (best game 12) and ESPN ppg 20 over 30 games is `"partial (no box score)"`, not `MISMATCH`; all-blank season with site ppg null ⇒ `"partial (no box score)"`; (b) `siteSeasons` for an ESPN-line season emits no `noBoxScore`, and its `ppg` equals ESPN's rounded average, so `compareSeason` returns `"match"`; (c) parser tests for `gamelogRegularSeason` with a small fixture (three regular-season events, one with `--` minutes, one playoff event that must be ignored) and a payload with no `points` column ⇒ null.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.** In `compareSeason` replace `ppgExplained` with the lower bound only (`espn ppg x games >= recorded points - 0.05 x games`, and the all-blank rule), rename the verdict everywhere (type, docs, CLI usage text, summary counts, tests). Add `--gamelog` to `parseArgs`/`Args` (boolean) and to `USAGE`. In the CLI, with `--gamelog`, for every NBA season the site shows from ESPN's line (`lineSource === "espn"`), fetch the game log, and classify: **confirmed** (gamelog games equals ESPN GP and gamelog points equals ESPN's totals PTS); **ESPN internal** (games within 3 of ESPN GP; points within what those games could hold: listed, never fails); **MISMATCH** (anything else, printed with both sides). Print counts per class and every non-confirmed season. `--gamelog` never runs unless asked, and honours `--limit`. Existing behaviour without the flag is unchanged.
- [ ] **Step 3b: Report ESPN rows the reader rejects.** `espnSeasonTotals` returns null for a row whose points fail the identity (`pts = 2*fgm + tpm + ftm`) or whose made exceed attempted; such a season silently falls back to the box-derived line. In the stored-mode CLI run (no flag needed), count and list every NBA player-season whose stored `categories` has `averages.GP` above the site's logged games but which `espnSeasonTotals` rejects ("ESPN row unusable": player, season, ESPN GP, site games), informational, never fails the run. Test it through a small pure helper (`unusableEspnRow(categories, siteGames)` in `scripts/lib/audit-player-totals.ts`) with three cases: usable row (false), row failing the points identity with GP above site games (true), row failing it with GP not above site games (false).
- [ ] **Step 4: Run** full suite, tsc, eslint. Commit `feat: audit checks partial seasons against ESPN's game log`.

---

## Self-review

- Spec coverage: ESPN line (Task 1), consistent career/strip/table/card/meta/JSON-LD (Tasks 1-2: all read `profile.season/career`; meta/JSON-LD guard in Task 2), section qualifiers and the "Every opponent faced" fix (Task 2), audit bound and independent check (Task 3). Not in this plan: milestones/best games recomputed from ESPN (ESPN's `miscellaneous` has season DD2/TD3 counts, unused on purpose), compare page `gamesLogged` (never displayed), loader change (root cause is ESPN's missing player id; no fix possible at the source).
- Type consistency: `EspnSeasonTotals`, `espnSeasonTotals`, `fetchEspnSeasons`, `getPlayerEspnSeasons`, `aggregateWithEspn`, `lineSource`, `boxOnlyShort`, `withBoxRowsNote`, `nbaCardNote`, `gamelogRegularSeason` are used with the same names in every task.
