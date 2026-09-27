# Player Performance Cards Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every NBA/NFL performance card a real, indexable page (`/[league]/games/[id]/players/[slug]`) whose link unfurls with the existing phase-1 card image, add "Season high"/"Triple-double" tags, and extend the existing "Share card" control to two places that don't have it yet (Best games, Milestones).

**Architecture:** Extract the data-loading and element-building logic already living inside the phase-1 `card` route into a shared lib module so the new page's `opengraph-image` reuses the identical render path (no second copy to drift). A new pure `performanceTags` function computes tags from data the app already has (no new stat logic). The page itself is a thin server component: the same PNG embedded as an `<img>`, an accessible stat table built from the same `performanceLine` array the card already uses, and links back. Indexability is computed from the game's already-stored leaders.

**Tech Stack:** Next.js 16 (App Router route conventions: `page.tsx`, `opengraph-image.tsx`, `generateMetadata`), Postgres (`node:test` + `embedded-postgres` via `tests/helpers/testDb.ts`), existing `next/og` `ImageResponse`.

**Spec:** [docs/superpowers/specs/2026-09-27-player-performance-cards-phase2-design.md](../specs/2026-09-27-player-performance-cards-phase2-design.md)

## Global Constraints

- NBA and NFL only. Every other league must 404 on the new page, exactly like the existing `card` route (`SUPPORTED_LEAGUES = new Set(["nba", "nfl"])` in `card/route.ts`).
- Soccer, a "next opponent" teaser, and any tag beyond "Season high"/"Triple-double" are explicitly out of scope — do not add them.
- The card image itself is never re-rendered as a second copy: the new page and its `opengraph-image.tsx` reuse the same element-building function the `card` route uses.
- The existing phase-1 "Share card"/"Download image" buttons (`ImageActions`) are unchanged — no navigation is inserted into that flow. The new page is an additional, linked destination.
- Every stat shown anywhere on the new page comes from `performanceLine(sport, row, profile)` — no new stat-formatting logic.
- "Season high" tag-eligible stats: every stat `performanceLine` surfaces for this sport, EXCLUDING any spec with a `rate` property (FG%/3P%/FT%/YPC/punt-avg), EXCLUDING NFL's `pass_int` (interceptions thrown — a turnover), EXCLUDING NBA's `pm` (+/-). NFL's `int` (interceptions made, category `interceptions`) IS eligible — do not confuse it with `pass_int`.
- "Season high" only fires for a season where `SeasonLine.recorded === SeasonLine.games` (no games missing a box score) — one check, both sports.
- "Triple-double" (NBA only): at least 3 of PTS/REB/AST/STL/BLK are non-null and ≥ 10, read directly via `cell()`, not through `performanceLine`. A `null` category never counts as 0.
- Indexed iff this player is one of the game's stored leaders (`game_details.details->'leaders'`, the same data `MatchLeaders` renders) — every other pair still renders fully (200), just `noindex`. `ownImage: true` applies to every pair regardless of index status.
- Every task ends with its own tests passing (`npm test`) and `npx tsc --noEmit` clean before moving to the next task.

---

### Task 1: Extract the shared performance-card data loader

**Files:**
- Create: `src/lib/performanceCardData.ts`
- Modify: `src/app/[league]/games/[id]/players/[slug]/card/route.ts`
- Test: `tests/performance-card-data.test.ts`

**Interfaces:**
- Produces:
  - `export interface PerformanceCardData { game: GameRow; player: PlayerRow; row: PlayerLogRow; profile: PlayerProfile; sport: "nba" | "nfl"; stats: PerformanceStat[]; teamColor: string | null; isHomeTeam: boolean; }`
  - `export async function loadPerformanceCardData(league: string, id: string, slug: string): Promise<PerformanceCardData | null>` — returns `null` exactly where the current `card` route 404s (unknown league/not nba-nfl/unknown game/unknown player/no stat line for this player in this game).
  - `export function buildPerformanceCardElement(data: PerformanceCardData): ReactElement` — the same `createElement(PerformanceCard, {...})` call the route builds today, factored out so a second caller (Task 3's `opengraph-image.tsx`) never repeats the prop-mapping.

This task's tests are consumed by every later task: Task 2's `performanceTags` takes `data.row`, `data.profile`'s seasons, and `data.sport`. Task 3's page and `opengraph-image.tsx` both call `loadPerformanceCardData` and `buildPerformanceCardElement`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/performance-card-data.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let loadPerformanceCardData: (typeof import("../src/lib/performanceCardData"))["loadPerformanceCardData"];
let buildPerformanceCardElement: (typeof import("../src/lib/performanceCardData"))["buildPerformanceCardElement"];

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ loadPerformanceCardData, buildPerformanceCardElement } = await import("../src/lib/performanceCardData"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic', 'G', '77')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', $1)`, [JSON.stringify(NBA_LINE)]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a real triple loads the game, player, row, profile, sport and stats", async () => {
  const data = await loadPerformanceCardData("nba", "g1", "luka-doncic");
  assert.ok(data);
  assert.equal(data!.game.espn_id, "g1");
  assert.equal(data!.player.slug, "luka-doncic");
  assert.equal(data!.sport, "nba");
  assert.equal(data!.row.stats.box!.PTS, "34");
  const pts = data!.stats.find((s) => s.key === "pts");
  assert.equal(pts?.value, "34");
});

test("an unknown game, unknown player, a league outside NBA/NFL, or a player with no line in this game all return null", async () => {
  assert.equal(await loadPerformanceCardData("nba", "nope", "luka-doncic"), null);
  assert.equal(await loadPerformanceCardData("nba", "g1", "nobody"), null);
  assert.equal(await loadPerformanceCardData("epl", "g1", "luka-doncic"), null);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p2', '1', 'Bench Guy', 'bench-guy')`);
  assert.equal(await loadPerformanceCardData("nba", "g1", "bench-guy"), null);
});

test("buildPerformanceCardElement builds the same element the card route renders (same stats, same team accent)", async () => {
  const data = await loadPerformanceCardData("nba", "g1", "luka-doncic");
  const element = buildPerformanceCardElement(data!);
  assert.equal(element.type, (await import("../src/components/PerformanceCard")).PerformanceCard);
  assert.equal((element.props as { playerName: string }).playerName, "Luka Dončić");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-card-data.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/performanceCardData'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/performanceCardData.ts
import { createElement, type ReactElement } from "react";
import { isLeague, getGameByEspnId, getPlayerBySlug, getPlayerLog, getPlayerReportedGames, getPlayerEspnSeasons, type GameRow, type League, type PlayerRow } from "./queries";
import { buildStagedProfile, playerSport, type PlayerLogRow, type PlayerProfile } from "./playerProfile";
import { performanceLine, type PerformanceStat } from "./performanceLine";
import { PerformanceCard } from "@/components/PerformanceCard";
import { gameRoundLabel } from "./stage";
import { formatGameDate } from "./gameDay";

// Phase 1/2 is NBA and NFL only — every other league returns null, same guarantee as the card route's 404.
const SUPPORTED_LEAGUES = new Set(["nba", "nfl"]);

// Reuses queries.ts's own PlayerRow (what getPlayerBySlug actually returns) rather than declaring a
// second, narrower type of the same name — that would either silently shadow the real one or, if
// TypeScript caught the mismatch (its `position`/`jersey` are optional there, not required), fail to
// compile on the very first assignment. No new player type here.
export interface PerformanceCardData {
  league: "nba" | "nfl";
  game: GameRow;
  player: PlayerRow;
  row: PlayerLogRow;
  profile: PlayerProfile;
  sport: "nba" | "nfl";
  stats: PerformanceStat[];
  teamColor: string | null;
  isHomeTeam: boolean;
}

// Loads and validates a (league, game, player) triple exactly like the card route's own checks —
// null wherever that route would 404, so the route, the page and its opengraph-image can never
// disagree about which pairs exist. No caller repeats this validation.
export async function loadPerformanceCardData(league: string, id: string, slug: string): Promise<PerformanceCardData | null> {
  if (!isLeague(league) || !SUPPORTED_LEAGUES.has(league)) return null;
  if (league !== "nba" && league !== "nfl") return null; // narrows for tsc, unreachable at runtime (see above)

  const [game, player] = await Promise.all([getGameByEspnId(league, id), getPlayerBySlug(league, slug)]);
  if (!game || !player) return null;

  const sport = playerSport(league);
  if (!sport) return null; // unreachable at runtime; SUPPORTED_LEAGUES already guarantees nba/nfl

  const [log, reportedGames, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const row = log.find((r) => r.game_espn_id === id);
  if (!row) return null;

  const profile = buildStagedProfile(sport, log, reportedGames, espnSeasons).regular;
  const stats = performanceLine(sport, row, profile);
  const isHomeTeam = row.team_espn_id === game.home_team_espn_id;
  const teamColor = isHomeTeam ? game.home_color : game.away_color;

  return { league, game, player, row, profile, sport, stats, teamColor, isHomeTeam };
}

// The single place that maps loaded data onto PerformanceCard's props — the card route and the new
// page's opengraph-image both call this, so there is exactly one render path, never two to drift.
export function buildPerformanceCardElement(data: PerformanceCardData): ReactElement {
  const { league, game, player, row, stats, teamColor, isHomeTeam } = data;
  return createElement(PerformanceCard, {
    league,
    playerName: player.name,
    position: player.position ?? null,
    jersey: player.jersey ?? null,
    teamAbbr: row.team_abbr,
    teamColor,
    opponentAbbr: row.opponent_abbr,
    resultLetter: row.result === "W" || row.result === "L" ? row.result : null,
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    date: formatGameDate(game.date, league, { month: "short", day: "numeric", year: "numeric" }),
    stageLabel: gameRoundLabel(game),
    stats,
  });
}
```

Then refactor the route to use it:

```typescript
// src/app/[league]/games/[id]/players/[slug]/card/route.ts
import { ImageResponse } from "next/og";
import { loadPerformanceCardData, buildPerformanceCardElement } from "@/lib/performanceCardData";
import { CARD_FONTS } from "@/lib/cardFont";

export const revalidate = 300;

const SIZES: Record<string, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "og";
  const size = SIZES[format];
  if (!size) return new Response("Bad format", { status: 400 });

  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) return notFound();

  const element = buildPerformanceCardElement(data);
  const png = new ImageResponse(element, { ...size, fonts: CARD_FONTS });

  // ESPN corrects box scores shortly after a game — a game final for more than 2 hours is
  // treated as settled (day-long cache); anything newer gets a 5-minute cache. Design doc §6.
  const finalOver2Hours = data.game.completed && Date.now() - new Date(data.game.date).getTime() > 2 * 60 * 60 * 1000;
  const cacheControl = finalOver2Hours ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300";

  const headers = new Headers(png.headers);
  headers.set("cache-control", cacheControl);
  return new Response(png.body, { status: png.status, headers });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/performance-card-data.test.ts`
Expected: PASS (all 3 tests)

Then run the existing route test to confirm the refactor changed nothing observable:

Run: `npx tsx --test tests/performance-card-route.test.ts`
Expected: PASS (all 8 existing tests, unchanged)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/performanceCardData.ts src/app/\[league\]/games/\[id\]/players/\[slug\]/card/route.ts tests/performance-card-data.test.ts
git commit -m "refactor: extract loadPerformanceCardData/buildPerformanceCardElement so the card route has one render path other callers can share"
```

---

### Task 2: `performanceTags` pure function

**Files:**
- Create: `src/lib/performanceTags.ts`
- Test: `tests/performance-tags.test.ts`

**Interfaces:**
- Consumes: `PlayerLogRow`, `PlayerSport`, `cell()` and `StatSpec` from `src/lib/playerProfile.ts`; `PerformanceStat` from `src/lib/performanceLine.ts` (only for the `key`/`rate` lookup, not for display).
- Produces: `export function performanceTags(row: PlayerLogRow, priorRows: PlayerLogRow[], sport: PlayerSport, seasonComplete: boolean): string[]` — consumed by Task 3's page (and, if wired in, the card itself).

`priorRows` must be every row for the same player in the same `season_year` as `row`, excluding `row` itself (the caller — Task 3 — filters `profile.rows`/`profile.seasons` for this). `seasonComplete` is `true` iff that season's `SeasonLine.recorded === SeasonLine.games` — the caller computes this from the profile it already has (Task 2 does not take a whole `PlayerProfile`, keeping this function simple and independently testable).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/performance-tags.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceTags } from "../src/lib/performanceTags";
import type { PlayerLogRow, Stats } from "../src/lib/playerProfile";

function nbaRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: null,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Lakers", team_slug: "lakers", team_abbr: "LAL", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Celtics", opponent_slug: "celtics", opponent_abbr: "BOS", opponent_logo: null,
    team_score: 110, opponent_score: 108, result: "W", stats, ...overrides,
  };
}

function nflRow(overrides: Partial<PlayerLogRow> = {}): PlayerLogRow {
  const stats: Stats = { passing: { "C/ATT": "24/35", YDS: "312", TD: "3", INT: "1", RTG: "108.2" } };
  return {
    game_espn_id: "g1", date: "2026-01-15T00:00:00.000Z", season_year: 2025, round: null, week: 10,
    stage: "regular", season_type: 2, competition_type: "STD", is_home: true,
    team_espn_id: "1", team_name: "Chiefs", team_slug: "chiefs", team_abbr: "KC", team_logo: null,
    opponent_espn_id: "2", opponent_name: "Bills", opponent_slug: "bills", opponent_abbr: "BUF", opponent_logo: null,
    team_score: 27, opponent_score: 20, result: "W", stats, ...overrides,
  };
}

test("NBA: a season-high points game (strictly above every prior game this season) gets one tag naming the stat", () => {
  const prior = Array.from({ length: 5 }, () => nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "30", PTS: "26", REB: "8", AST: "6", STL: "1", BLK: "1", TO: "2", FG: "9-18", "3PT": "2-6", FT: "6-7", "+/-": "+1" } } }));
  const tags = performanceTags(nbaRow(), prior, "nba", true);
  assert.ok(tags.includes("Season high · PTS"));
});

test("NBA: exactly tying the prior max is NOT a season high (must be strictly higher)", () => {
  const prior = [nbaRow({ game_espn_id: "prior" })]; // same 34 PTS
  const tags = performanceTags(nbaRow(), prior, "nba", true);
  assert.ok(!tags.includes("Season high · PTS"));
});

test("NBA: a big night can earn multiple Season high tags at once", () => {
  const prior = Array.from({ length: 3 }, () => nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "28", PTS: "20", REB: "5", AST: "4", STL: "1", BLK: "0", TO: "2", FG: "8-15", "3PT": "1-4", FT: "3-4", "+/-": "+2" } } }));
  const tags = performanceTags(nbaRow(), prior, "nba", true); // 34 PTS, 11 REB, 9 AST, 2 STL, 1 BLK, all above prior
  assert.ok(tags.includes("Season high · PTS"));
  assert.ok(tags.includes("Season high · REB"));
  assert.ok(tags.includes("Season high · AST"));
  assert.ok(tags.includes("Season high · STL"));
});

test("NBA: FG% (a rate stat) and +/- never get a Season high tag, even when both are this season's best", () => {
  const prior = [nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "20", PTS: "10", REB: "3", AST: "2", STL: "0", BLK: "0", TO: "1", FG: "2-10", "3PT": "0-2", FT: "0-0", "+/-": "-10" } } })];
  const tags = performanceTags(nbaRow(), prior, "nba", true); // this row's FG% and +/- both beat the prior game's
  assert.ok(!tags.some((t) => t.includes("FG%")));
  assert.ok(!tags.some((t) => t.includes("+/-")));
});

test("an incomplete season (a game missing a box score) suppresses every Season high tag, even a real one", () => {
  const prior = [nbaRow({ game_espn_id: "prior", stats: { box: { MIN: "10", PTS: "2", REB: "1", AST: "0", STL: "0", BLK: "0", TO: "0", FG: "1-3", "3PT": "0-0", FT: "0-0", "+/-": "-5" } } })];
  const tags = performanceTags(nbaRow(), prior, "nba", false); // seasonComplete: false
  assert.equal(tags.filter((t) => t.startsWith("Season high")).length, 0);
});

test("NFL: interceptions THROWN (pass_int) never gets a Season high tag; interceptions MADE (int) can", () => {
  const prior = [nflRow({ game_espn_id: "prior", stats: { passing: { "C/ATT": "18/30", YDS: "200", TD: "1", INT: "0", RTG: "90.0" } } })];
  const thisGame = nflRow({ stats: { passing: { "C/ATT": "24/35", YDS: "312", TD: "3", INT: "2", RTG: "108.2" } } }); // 2 INTs thrown, a season high in INTs if it counted
  const tags = performanceTags(thisGame, prior, "nfl", true);
  assert.ok(!tags.some((t) => t.toLowerCase().includes("int")), `pass_int must never tag, got: ${tags.join(", ")}`);

  const defRow = nflRow({ team_name: "Jets", stats: { interceptions: { INT: "2" } } });
  const priorDef = [nflRow({ game_espn_id: "prior", stats: { interceptions: { INT: "0" } } })];
  const defTags = performanceTags(defRow, priorDef, "nfl", true);
  assert.ok(defTags.includes("Season high · INT"), `defensive int must tag, got: ${defTags.join(", ")}`);
});

test("NBA: a triple-double (>= 10 in at least 3 of PTS/REB/AST/STL/BLK) is tagged", () => {
  const row = nbaRow({ stats: { box: { MIN: "38", PTS: "22", REB: "11", AST: "10", STL: "1", BLK: "0", TO: "4", FG: "9-20", "3PT": "1-5", FT: "3-4", "+/-": "+2" } } });
  const tags = performanceTags(row, [], "nba", true);
  assert.ok(tags.includes("Triple-double"));
});

test("NBA: exactly 2 of 5 at or above 10 is NOT a triple-double", () => {
  const row = nbaRow({ stats: { box: { MIN: "30", PTS: "18", REB: "10", AST: "10", STL: "1", BLK: "0", TO: "3", FG: "7-15", "3PT": "1-3", FT: "3-4", "+/-": "0" } } });
  const tags = performanceTags(row, [], "nba", true);
  assert.ok(!tags.includes("Triple-double"));
});

test("NBA: a null category (an old blank-box-score row) can't be coerced to 0 to help OR to block a triple-double", () => {
  const row = nbaRow({ stats: { box: { MIN: null, PTS: "12", REB: "10", AST: "10", STL: null, BLK: null, TO: null, FG: null, "3PT": null, FT: null, "+/-": null } } });
  const tags = performanceTags(row, [], "nba", true);
  // 3 of 5 (PTS, REB, AST) are confirmed >= 10; STL/BLK being null must not block it.
  assert.ok(tags.includes("Triple-double"));
});

test("triple-double is NBA only: an NFL row is never checked for it", () => {
  const tags = performanceTags(nflRow(), [], "nfl", true);
  assert.ok(!tags.includes("Triple-double"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-tags.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/performanceTags'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/performanceTags.ts
import { cell, type PlayerLogRow, type PlayerSport } from "./playerProfile";

// One eligible stat: its tag label and how to read this game's raw value for it, independent of
// performanceLine/PlayerProfile entirely (performanceLine needs a whole season profile just to
// resolve which categories are "active" for an NFL position — this function only ever needs one
// row at a time, so it reads cell() directly rather than depending on that machinery). Verified
// against every StatSpec in src/lib/playerProfile.ts (all 9 NFL categories read, not guessed):
// excludes every spec with a `rate` property (fg_pct/3P%/FT%/YPC/punt-avg — percentages read as
// achievements poorly) and two named exceptions: NFL's pass_int (interceptions THROWN — a
// turnover, not an achievement; NFL's interceptions MADE, key "int", category "interceptions",
// stays eligible — same short label "INT" in the raw data, opposite meaning) and NBA's pm (+/- —
// not a counting achievement, and can be negative).
const ELIGIBLE_STATS: Record<PlayerSport, { key: string; label: string; read: (row: PlayerLogRow) => number | null }[]> = {
  nba: [
    { key: "pts", label: "PTS", read: (r) => cell(r.stats, "box", "PTS") },
    { key: "reb", label: "REB", read: (r) => cell(r.stats, "box", "REB") },
    { key: "ast", label: "AST", read: (r) => cell(r.stats, "box", "AST") },
    { key: "stl", label: "STL", read: (r) => cell(r.stats, "box", "STL") },
    { key: "blk", label: "BLK", read: (r) => cell(r.stats, "box", "BLK") },
  ],
  nfl: [
    { key: "pass_yds", label: "Pass YDS", read: (r) => cell(r.stats, "passing", "YDS") },
    { key: "pass_td", label: "Pass TD", read: (r) => cell(r.stats, "passing", "TD") },
    // pass_int deliberately absent — interceptions thrown, a turnover.
    { key: "rush_yds", label: "Rush YDS", read: (r) => cell(r.stats, "rushing", "YDS") },
    { key: "rush_td", label: "Rush TD", read: (r) => cell(r.stats, "rushing", "TD") },
    { key: "rec", label: "REC", read: (r) => cell(r.stats, "receiving", "REC") },
    { key: "rec_yds", label: "Rec YDS", read: (r) => cell(r.stats, "receiving", "YDS") },
    { key: "rec_td", label: "Rec TD", read: (r) => cell(r.stats, "receiving", "TD") },
    { key: "def_tot", label: "TKL", read: (r) => cell(r.stats, "defensive", "TOT") },
    { key: "def_sacks", label: "SCK", read: (r) => cell(r.stats, "defensive", "SACKS") },
    { key: "def_pd", label: "PD", read: (r) => cell(r.stats, "defensive", "PD") },
    { key: "int", label: "INT", read: (r) => cell(r.stats, "interceptions", "INT") }, // interceptions MADE — a defensive stat, not pass_int
    { key: "fgm", label: "FGM", read: (r) => cell(r.stats, "kicking", "FG", 0) },
    { key: "k_pts", label: "PTS", read: (r) => cell(r.stats, "kicking", "PTS") },
    { key: "punts", label: "PUNTS", read: (r) => cell(r.stats, "punting", "NO") },
    // fg_pct, rush_avg, punt_avg deliberately absent — all carry a `rate` property in playerProfile.ts.
  ],
  soccer: [], // out of scope this plan — never called with sport "soccer" (loadPerformanceCardData only ever resolves nba/nfl)
};

export function performanceTags(row: PlayerLogRow, priorRows: PlayerLogRow[], sport: PlayerSport, seasonComplete: boolean): string[] {
  const tags: string[] = [];

  if (seasonComplete) {
    for (const stat of ELIGIBLE_STATS[sport]) {
      const value = stat.read(row);
      if (value === null) continue;
      const priorMax = priorRows.reduce((max, r) => {
        const v = stat.read(r);
        return v !== null && v > max ? v : max;
      }, -Infinity);
      if (priorMax !== -Infinity && value > priorMax) {
        tags.push(`Season high · ${stat.label}`);
      }
    }
  }

  if (sport === "nba") {
    const cats = [cell(row.stats, "box", "PTS"), cell(row.stats, "box", "REB"), cell(row.stats, "box", "AST"), cell(row.stats, "box", "STL"), cell(row.stats, "box", "BLK")];
    const reached = cats.filter((v) => v !== null && v >= 10).length;
    if (reached >= 3) tags.push("Triple-double");
  }

  return tags;
}
```

This deliberately does not call `performanceLine` at all: `performanceLine` needs a full season `PlayerProfile` just to resolve which NFL categories are "active" for this player's position, and `performanceTags` only ever needs one row at a time — reusing it would mean constructing a fake profile for every comparison row in `priorRows`, which is both slower and, worse, would crash the moment `nflLine`/`nbaLine` dereferences a field a stub profile doesn't have. The `ELIGIBLE_STATS` table above is the single place both the eligibility rule and the tag label live, verified line-by-line against `playerProfile.ts`'s real spec tables above (Global Constraints) rather than inferred.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/performance-tags.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/performanceTags.ts tests/performance-tags.test.ts
git commit -m "feat: performanceTags — Season high / Triple-double, verified against the real stat-spec table"
```

---

### Task 3: The indexable performance page

**Files:**
- Create: `src/app/[league]/games/[id]/players/[slug]/page.tsx`
- Create: `src/app/[league]/games/[id]/players/[slug]/opengraph-image.tsx`
- Test: `tests/performance-page.test.ts`

**Interfaces:**
- Consumes: `loadPerformanceCardData`, `buildPerformanceCardElement` (Task 1); `performanceTags` (Task 2); `pageMeta` (`src/lib/metadata.ts`); `ImageActions` (`src/components/ImageActions.tsx`); `gameLeadersShown`, `hasNoBoxScore` (`src/lib/gamePage.ts`); `gameSections` (wherever `show` is computed in the existing game page — read `src/app/[league]/games/[id]/page.tsx` around its `show`/`noBoxScore` locals before writing this).
- Produces: nothing new later tasks depend on (this is the outermost consumer in this plan, aside from the sitemap in Task 4, which queries the database directly rather than importing from this page).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/performance-page.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let PerformancePage: (typeof import("../src/app/[league]/games/[id]/players/[slug]/page"))["default"];
let generateMetadata: (typeof import("../src/app/[league]/games/[id]/players/[slug]/page"))["generateMetadata"];

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ default: PerformancePage, generateMetadata } = await import("../src/app/[league]/games/[id]/players/[slug]/page"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic', 'G', '77')`);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p2', '2', 'Jayson Tatum', 'jayson-tatum', 'F', '0')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', $1)`, [JSON.stringify(NBA_LINE)]);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p2', '2', $1)`, [JSON.stringify(NBA_LINE)]);
  await q(
    `insert into game_details (league, game_espn_id, details) values ('nba', 'g1', $1)`,
    [JSON.stringify({ leaders: [{ team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: "34" }] })],
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a leader's page is indexed", async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(meta.robots && (meta.robots as { index?: boolean }).index, true);
});

test("a non-leader with a real stat line still renders (200) but is noindex", async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ league: "nba", id: "g1", slug: "jayson-tatum" }) });
  assert.equal(meta.robots && (meta.robots as { index?: boolean }).index, false);
  // The page component itself must not throw / return notFound() for this pair.
  const el = await PerformancePage({ params: Promise.resolve({ league: "nba", id: "g1", slug: "jayson-tatum" }) });
  assert.ok(el);
});

test("an unknown pair 404s the same way the card route does", async () => {
  await assert.rejects(
    () => PerformancePage({ params: Promise.resolve({ league: "nba", id: "g1", slug: "nobody" }) }),
    (e: unknown) => (e as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404",
  );
});
```

**Note for the implementer:** checked — no existing test in this repo exercises a page component's `notFound()` call directly (`tests/static-params.test.ts` only mentions it in a comment), so there is no in-repo precedent to copy. Assert on the thrown error's `digest` property instead of a generic `rejects`: `await assert.rejects(() => PerformancePage(...), (e: unknown) => (e as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404")` — this is the stable, documented signal Next 16's `notFound()` throws, not a guess.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-page.test.ts`
Expected: FAIL — `Cannot find module '.../page'`

- [ ] **Step 3: Write the implementation**

This page's `generateMetadata` mirrors the existing game page's own `generateMetadata` exactly
(`src/app/[league]/games/[id]/page.tsx:93`: `const details = game.completed ? await getGameDetails(league, id) : null;`)
— stored-only, no live-summary fallback, since a game without a stored box score has no card to index
anyway. Verified signatures (`src/lib/gamePage.ts`): `hasNoBoxScore(game: { completed: boolean }, playerBox: PlayerBoxLike[]): boolean`,
`gameSections(game: Status): { leaders: boolean; ... }`, `gameLeadersShown<T>(show: { leaders: boolean }, noBoxScore: boolean, leaders: readonly T[] | undefined): T[]`
— `GameRow` (what `loadPerformanceCardData` returns as `data.game`) already satisfies both `{ completed: boolean }`
and `Status` structurally, the same way the existing game page passes its own `game` straight into `gameSections(game)`
with no cast.

```tsx
// src/app/[league]/games/[id]/players/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { loadPerformanceCardData, type PerformanceCardData } from "@/lib/performanceCardData";
import { performanceTags } from "@/lib/performanceTags";
import { getGameDetails } from "@/lib/queries";
import { gameLeadersShown, gameSections, hasNoBoxScore } from "@/lib/gamePage";
import { ImageActions } from "@/components/ImageActions";
import { LEAGUE_LABEL } from "@/lib/leagues";

type Params = { league: string; id: string; slug: string };

// Stored-only, same as the game page's own generateMetadata (games/[id]/page.tsx) — a game with no
// stored box score has nothing to index here either way.
async function isIndexedLeader(data: PerformanceCardData): Promise<boolean> {
  const details = data.game.completed ? await getGameDetails(data.league, data.game.espn_id) : null;
  if (!details) return false;
  const noBoxScore = hasNoBoxScore(data.game, details.player_box);
  const show = gameSections(data.game);
  const leaders = gameLeadersShown(show, noBoxScore, details.leaders);
  return leaders.some((l) => l.athlete_id === data.player.espn_id);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) return {};
  const indexed = await isIndexedLeader(data);
  const title = `${data.player.name} vs ${data.row.opponent_abbr ?? "opponent"} — ${LEAGUE_LABEL[data.league]} Performance`;
  const description = `${data.player.name}'s full stat line from this ${LEAGUE_LABEL[data.league]} game: ${data.stats.map((s) => `${s.value} ${s.label}`).join(", ")}.`;
  return pageMeta(title, description, `/${data.league}/games/${id}/players/${slug}`, { noindex: !indexed, ownImage: true });
}

export default async function PerformancePage({ params }: { params: Promise<Params> }) {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) notFound();

  const priorRows = data.profile.rows.filter((r) => r.season_year === data.row.season_year && r.game_espn_id !== data.row.game_espn_id);
  const seasonEntry = data.profile.seasons.find((s) => s.season === data.row.season_year);
  const seasonComplete = seasonEntry ? seasonEntry.recorded === seasonEntry.games : false;
  const tags = performanceTags(data.row, priorRows, data.sport, seasonComplete);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <img
        src={`/${data.league}/games/${id}/players/${slug}/card?format=og`}
        alt={`${data.player.name} performance card`}
        width={1200}
        height={630}
        className="w-full rounded-xl border border-[var(--border)]"
      />
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {t}
            </span>
          ))}
        </div>
      )}
      <table className="mt-4 w-full text-sm">
        <tbody>
          {data.stats.map((s) => (
            <tr key={s.key} className="border-t border-[var(--border)]">
              <td className="py-2 text-[var(--text-muted)]" title={s.title}>{s.label}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{s.value}</td>
              <td className="py-2 text-right text-xs text-[var(--text-faint)]">{s.delta ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link href={`/${data.league}/games/${id}`} className="hover:text-[var(--accent)]">
          Back to the game
        </Link>
        <Link href={`/${data.league}/players/${slug}`} className="hover:text-[var(--accent)]">
          {data.player.name}'s full stats
        </Link>
      </div>
      <div className="mt-4">
        <ImageActions filename={`${id}-${slug}-card-${data.league}`} imageUrl={`/${data.league}/games/${id}/players/${slug}/card?format=og`} shareTitle={`${data.player.name} performance card`} />
      </div>
    </div>
  );
}
```

```tsx
// src/app/[league]/games/[id]/players/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { loadPerformanceCardData, buildPerformanceCardElement } from "@/lib/performanceCardData";
import { CARD_FONTS } from "@/lib/cardFont";

export const alt = "Player performance card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300; // matches games/[id]/opengraph-image.tsx's static revalidate, not the card route's dynamic 2-hour cache-control logic

export default async function Image({ params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const data = await loadPerformanceCardData(league, id, slug);
  if (!data) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0b1220", color: "#e8edf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }
  return new ImageResponse(buildPerformanceCardElement(data), { ...size, fonts: CARD_FONTS });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/performance-page.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Run the full suite, typecheck, and a live browser check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

Then, in the browser preview (if the local DB has real data — otherwise defer this check to the post-deploy live verification, consistent with this project's known local-preview limitation against production data): open a real leader's performance page and confirm the image renders, the stat table matches the box score, and a non-leader pair (any other box-score row's player) also renders fully rather than 404ing.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[league]/games/[id]/players/[slug]/page.tsx" "src/app/[league]/games/[id]/players/[slug]/opengraph-image.tsx" tests/performance-page.test.ts
git commit -m "feat: indexable performance page at /[league]/games/[id]/players/[slug], indexed only for the game's stored leaders"
```

---

### Task 4: Sitemap — list only indexed (leader) pairs

**Files:**
- Modify: `src/lib/sitemap.ts`
- Test: `tests/sitemap-performance-cards.test.ts`

**Interfaces:**
- Consumes: `SITEMAP_IDS`, `entry()`, `sitemapEntries()`, the `game_details` table's `details` jsonb column (holds `{ leaders: [{ athlete_id, ... }] }`), the same two-season window `games()` already uses.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sitemap-performance-cards.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let SITEMAP_IDS: string[];
let sitemapEntries: (id: string) => Promise<{ url: string }[]>;

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

before(async () => {
  db = await startTestDb();
  ({ SITEMAP_IDS, sitemapEntries } = await import("../src/lib/sitemap"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL'), ('nba','2','Boston Celtics','boston-celtics','BOS')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic')`);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p2', '2', 'Jayson Tatum', 'jayson-tatum')`); // never a leader
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', '{}')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p2', '2', '{}')`);
  await q(
    `insert into game_details (league, game_espn_id, details) values ('nba', 'g1', $1)`,
    [JSON.stringify({ leaders: [{ team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: "34" }] })],
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("SITEMAP_IDS includes a performances id for nba and nfl, none for a league with no leaders concept", () => {
  assert.ok(SITEMAP_IDS.includes("performances-nba"));
  assert.ok(SITEMAP_IDS.includes("performances-nfl"));
  assert.ok(!SITEMAP_IDS.includes("performances-epl"));
});

test("the performances sitemap lists the leader's page and not the non-leader's", async () => {
  const entries = await sitemapEntries("performances-nba");
  const paths = entries.map((e) => e.url);
  assert.ok(paths.some((p) => p.endsWith("/nba/games/g1/players/luka-doncic")));
  assert.ok(!paths.some((p) => p.endsWith("/nba/games/g1/players/jayson-tatum")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/sitemap-performance-cards.test.ts`
Expected: FAIL — `performances-nba` not in `SITEMAP_IDS` / empty entries

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/sitemap.ts — additions

// Leagues the performance-card page exists for (nba/nfl only — same set as
// SUPPORTED_LEAGUES in the card route and loadPerformanceCardData).
const PERFORMANCE_CARD_LEAGUES: League[] = ["nba", "nfl"];

// Update SITEMAP_IDS:
export const SITEMAP_IDS: string[] = [
  "core",
  "f1",
  "tennis",
  "beyond-the-scoreline",
  ...SEASON_PAGE_LEAGUES.map((l) => `pseasons-${l}`),
  ...ALL_LEAGUES.flatMap((l) => [`teams-${l}`, `players-${l}`, `games-${l}`]),
  ...LEAGUES.filter((l) => supportsMatchweeks(l)).map((l) => `weeks-${l}`),
  ...ALL_LEAGUES.filter((l) => supportsScoreAnalytics(l)).map((l) => `h2h-${l}`),
  ...PERFORMANCE_CARD_LEAGUES.map((l) => `performances-${l}`),
];

// One entry per (game, leader) pair with a stored stat line, for the last two seasons
// (same window games() already uses). jsonb_array_elements unpacks game_details.details->'leaders'
// so this never needs a second, separately-maintained leaders table.
async function performances(league: League): Promise<Entry[]> {
  const { rows } = await pool.query(
    `select g.espn_id as game_espn_id, p.slug, g.date
     from game_details gd
     cross join lateral jsonb_array_elements(gd.details->'leaders') as l
     join games g on g.league = gd.league and g.espn_id = gd.game_espn_id
     join players p on p.league = gd.league and p.espn_id = (l->>'athlete_id')
     where gd.league = $1
       and g.season_year >= (select max(season_year) from games where league = $1) - 1
       and exists (select 1 from player_game_stats s where s.league = $1 and s.game_espn_id = g.espn_id and s.player_espn_id = p.espn_id)
     order by g.date desc`,
    [league],
  );
  // game_details has no updated_at column (checked db/schema.sql — only `fetched_at`, and a leader
  // pair's underlying box score doesn't change once stored), so g.date is the right lastModified,
  // same as games()'s own entries above.
  return rows.map((r) => entry(`/${league}/games/${r.game_espn_id}/players/${r.slug}`, "monthly", 0.3, r.date));
}

// Update the dispatcher:
export async function sitemapEntries(id: string): Promise<Entry[]> {
  if (id === "core") return core();
  if (id === "f1") return f1();
  if (id === "tennis") return tennisPlayers();
  if (id === "beyond-the-scoreline") return beyondTheScoreline();
  const [kind, league] = id.split("-") as [string, League];
  if (!ALL_LEAGUES.includes(league)) return [];
  if (kind === "teams") return teams(league);
  if (kind === "players") return players(league);
  if (kind === "pseasons") return playerSport(league) ? playerSeasons(league) : [];
  if (kind === "games") return games(league);
  if (kind === "weeks") return supportsMatchweeks(league) ? weeks(league) : [];
  if (kind === "h2h") return supportsScoreAnalytics(league) ? h2h(league) : [];
  if (kind === "performances") return PERFORMANCE_CARD_LEAGUES.includes(league) ? performances(league) : [];
  return [];
}
```

**Note for the implementer:** `game_details.updated_at` is assumed to exist as a column (parallel to every other timestamped table in this schema) — check `db/schema.sql`'s `game_details` definition before using it in the query above; if that table has no `updated_at`, use `g.date` (the games table's) instead, matching the fallback style already used elsewhere in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/sitemap-performance-cards.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/sitemap.ts tests/sitemap-performance-cards.test.ts
git commit -m "feat: sitemap lists a performance page only for the game's stored leaders (nba/nfl)"
```

---

### Task 5: "View full breakdown" links on box-score rows and leader blocks

**Files:**
- Modify: `src/components/PlayerBoxScoreTable.tsx`
- Modify: `src/components/MatchLeaders.tsx`
- Test: extend `tests/performance-page.test.ts` is not the right place (these are presentational component changes, not data logic) — add a small rendering-free check instead, in a new `tests/performance-page-links.test.ts`, that these components produce the right `href`.

Given both components are server components with no existing render-to-string test in this repo (their existing usages are exercised through the game page's own tests, if any — check for `tests/*.test.ts` referencing `MatchLeaders` or `PlayerBoxScoreTable` before assuming none exists), the pragmatic test here is a plain function-level check on the URL-building logic itself, not a full component render. Extract the href-building into a one-line helper so it's testable without a DOM:

**Interfaces:**
- Produces: nothing later tasks consume; this is a leaf UI change.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/performance-page-links.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { performancePagePath } from "../src/lib/performanceCardData";

test("performancePagePath builds the new page's URL from a league, game id and player slug", () => {
  assert.equal(performancePagePath("nba", "g1", "luka-doncic"), "/nba/games/g1/players/luka-doncic");
  assert.equal(performancePagePath("nfl", "401872953", "josh-allen"), "/nfl/games/401872953/players/josh-allen");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/performance-page-links.test.ts`
Expected: FAIL — `performancePagePath` is not exported

- [ ] **Step 3: Write the implementation**

Add the helper to `src/lib/performanceCardData.ts` (from Task 1) rather than inventing a new file for one function:

```typescript
// added to src/lib/performanceCardData.ts
export function performancePagePath(league: "nba" | "nfl", gameId: string, slug: string): string {
  return `/${league}/games/${gameId}/players/${slug}`;
}
```

Then use it in both components. `PlayerBoxScoreTable.tsx`, inside the existing `slug && (league === "nba" || league === "nfl") && (...)` block (the one already wrapping `ImageActions`):

```tsx
{slug && (league === "nba" || league === "nfl") && (
  <>
    <ImageActions filename={`${gameId}-${slug}-card-${league}`} imageUrl={`/${league}/games/${gameId}/players/${slug}/card?format=og`} shareTitle={`${row.name} performance card`} />
    <Link href={performancePagePath(league, gameId, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
      View full breakdown
    </Link>
  </>
)}
```

(Add `import { performancePagePath } from "@/lib/performanceCardData";` at the top.)

`MatchLeaders.tsx`, inside the existing `showCardShare && slug && (...)` block:

```tsx
{showCardShare && slug && (
  <div className="mt-1.5 flex flex-wrap items-center gap-2">
    <ImageActions filename={`${gameId}-${slug}-card-${league}`} imageUrl={`/${league}/games/${gameId}/players/${slug}/card?format=og`} shareTitle={`${l.athlete} performance card`} />
    <Link href={performancePagePath(league, gameId!, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
      View full breakdown
    </Link>
  </div>
)}
```

(`gameId` is typed optional (`gameId?: string`) on `MatchLeaders`, but `showCardShare` is already defined as `gameId && (league === "nba" || league === "nfl")`, so inside this block it is guaranteed a `string` — the `!` matches the non-null assertion already implicitly relied on by `showCardShare`'s truthiness, or restructure `showCardShare` to narrow the type properly if the linter objects to the `!`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/performance-page-links.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/performanceCardData.ts src/components/PlayerBoxScoreTable.tsx src/components/MatchLeaders.tsx tests/performance-page-links.test.ts
git commit -m "feat: link every NBA/NFL box-score row and leader card to its new performance page"
```

---

### Task 6: Share button and link on Best games and Milestones

**Files:**
- Modify: `src/components/PlayerBestGames.tsx`
- Modify: `src/components/PlayerMilestones.tsx`

Both components already have every piece of data needed (`row.game_espn_id`, and — for `PlayerBestGames` — the player's own `slug`/`league` are already props of the parent `PlayerProfile`/`league` this component receives; for `PlayerMilestones`, `m.game` is a full `PlayerLogRow` with `game_espn_id`). No new data fetch, no new route — every game referenced by these rows already has this player's stat line by construction.

**Interfaces:**
- Consumes: `ImageActions`, `performancePagePath` (Task 5).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Confirm the exact props these two components receive today**

Before editing, re-read the current full contents of `src/components/PlayerBestGames.tsx` and `src/components/PlayerMilestones.tsx` — specifically, neither currently receives the player's own `slug` as a prop (both take `profile`/`league`/`game`, not `slug`), so this task also needs to thread `slug: string` through from each component's call site (`src/app/[league]/players/[slug]/page.tsx` and `src/app/[league]/players/[slug]/[season]/page.tsx` — check both for `<PlayerBestGames` / `<PlayerMilestones` usages) into these two components' prop types.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/performance-page-links.test.ts — add to the file from Task 5
test("performancePagePath is what Best games / Milestones rows should link to for a given historical game", () => {
  // Best games and Milestones both key off game_espn_id already present on every PlayerLogRow —
  // this just confirms the same helper produces a stable, correct path for that value.
  assert.equal(performancePagePath("nba", "0022400123", "luka-doncic"), "/nba/games/0022400123/players/luka-doncic");
});
```

(This is a thin confirmation — the real behavioral guarantee already lives in Task 1's and Task 4's tests; a full render test of `PlayerBestGames`/`PlayerMilestones` would need a component-testing setup this repo does not currently have, so this task relies on `tsc --noEmit` plus the existing player-page tests, if any exist, continuing to pass unchanged.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test tests/performance-page-links.test.ts`
Expected: PASS already (this assertion doesn't depend on new code) — this step is a no-op check; proceed to the real implementation.

- [ ] **Step 4: Write the implementation**

`PlayerBestGames.tsx`:

```tsx
import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import { normalizeStage } from "@/lib/stage";
import { TeamLogo } from "./TeamLogo";
import { formatSeasonLabel, type League } from "@/lib/queries";
import { formatStat, type PlayerLogRow, type PlayerProfile } from "@/lib/playerProfile";
import { fmtDate, ResultChip } from "./PlayerStatsShared";
import { ImageActions } from "./ImageActions";
import { performancePagePath } from "@/lib/performanceCardData";

export function statLine(profile: PlayerProfile, row: PlayerLogRow): string {
  return profile.profile.specs
    .filter((s) => s.log !== false && !s.rate)
    .map((s) => ({ s, v: s.value(row.stats) }))
    .filter(({ v }) => v !== null && v !== 0)
    .map(({ s, v }) => `${formatStat(s, v)} ${s.label}`)
    .join(" · ");
}

export function PlayerBestGames({ league, slug, profile }: { league: League; slug: string; profile: PlayerProfile }) {
  const showCardShare = league === "nba" || league === "nfl";
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {profile.best.map((row, i) => (
        <div key={row.game_espn_id} className="card flex flex-col gap-2 px-4 py-3 text-sm">
          <Link href={`/${league}/games/${row.game_espn_id}`} className="flex items-start gap-3">
            <span className="mt-0.5 w-5 shrink-0 text-lg font-bold tabular-nums text-[var(--text-faint)]">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <TeamLogo name={teamDisplayName(row.opponent_name)} logoUrl={row.opponent_logo} size={18} />
                <span className="truncate font-semibold">
                  {row.is_home ? "vs" : "at"} {teamDisplayName(row.opponent_name)}
                </span>
                <ResultChip row={row} />
              </span>
              <span className="mt-1 block font-medium tabular-nums">{statLine(profile, row) || "No figures recorded"}</span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {fmtDate(row.date, league)}
                {row.season_year ? ` · ${formatSeasonLabel(league, row.season_year)}` : ""}
                {row.round ? ` · ${normalizeStage(row.round)}` : row.week ? ` · Week ${row.week}` : ""}
              </span>
            </span>
          </Link>
          {showCardShare && (
            <div className="flex flex-wrap items-center gap-2 pl-8">
              <ImageActions filename={`${row.game_espn_id}-${slug}-card-${league}`} imageUrl={`/${league}/games/${row.game_espn_id}/players/${slug}/card?format=og`} shareTitle={`Performance card`} />
              <Link href={performancePagePath(league, row.game_espn_id, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                View full breakdown
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

`PlayerMilestones.tsx`:

```tsx
import Link from "next/link";
import { teamDisplayName } from "@/lib/teamName";
import type { League } from "@/lib/queries";
import type { PlayerProfile } from "@/lib/playerProfile";
import { fmtDate } from "./PlayerStatsShared";
import { ImageActions } from "./ImageActions";
import { performancePagePath } from "@/lib/performanceCardData";

export function PlayerMilestones({ league, slug, profile }: { league: League; slug: string; profile: PlayerProfile }) {
  const showCardShare = league === "nba" || league === "nfl";
  return (
    <ul className="card divide-y divide-[var(--border)] text-sm">
      {profile.milestones.map((m, i) => (
        <li key={`${m.label}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
          <span className="font-semibold">
            {m.label}
            {m.detail && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{m.detail}</span>}
          </span>
          {m.game && (
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/${league}/games/${m.game.game_espn_id}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                {m.game.is_home ? "vs" : "at"} {teamDisplayName(m.game.opponent_name)}, {fmtDate(m.game.date, league)}
              </Link>
              {showCardShare && (
                <>
                  <ImageActions filename={`${m.game.game_espn_id}-${slug}-card-${league}`} imageUrl={`/${league}/games/${m.game.game_espn_id}/players/${slug}/card?format=og`} shareTitle={`Performance card`} />
                  <Link href={performancePagePath(league, m.game.game_espn_id, slug)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
                    View full breakdown
                  </Link>
                </>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

Then update every call site (verified — three total, `slug` is already in scope at each since all three are `[slug]/page.tsx` routes):
- `src/app/[league]/players/[slug]/page.tsx:298` — `<PlayerBestGames league={league} profile={staged.counted} />` → add `slug={slug}`.
- `src/app/[league]/players/[slug]/page.tsx:337` — `<PlayerMilestones league={league} profile={profile} />` → add `slug={slug}`.
- `src/app/[league]/players/[slug]/[season]/page.tsx:174` — `<PlayerBestGames league={league} profile={staged.counted} />` → add `slug={slug}` (this route has no `PlayerMilestones` usage — season pages don't show career milestones, only the player's overall page does).

**Note for the implementer:** a milestone's pinned game may not have a stat line for every stat category (e.g. a "First game on record" milestone can point at a low-minutes appearance) — `ImageActions`'s `imageUrl` fetch will simply 404 through to the existing card route's own no-line-for-this-player-in-this-game guard in that case, which already fails silently in the UI (per `ImageActions`' own `catch` block: "a blocked cross-origin asset can fail the export; the page still works"). No special-casing needed here — the existing route's 404 and the button's existing failure handling already cover it.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean — pay particular attention to every existing call site of `PlayerBestGames`/`PlayerMilestones` now requiring the new `slug` prop; a missed call site is a type error, not a runtime failure, so `tsc` will catch it.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlayerBestGames.tsx src/components/PlayerMilestones.tsx "src/app/[league]/players/[slug]/page.tsx" "src/app/[league]/players/[slug]/[season]/page.tsx" tests/performance-page-links.test.ts
git commit -m "feat: Share card button and full-breakdown link on Best games and Milestones rows"
```

---

## Final check before considering this plan done

- [ ] Run the entire suite once more end to end: `npm test && npx tsc --noEmit`.
- [ ] Grep the diff for the two named exclusions (`pass_int`, `pm`) and confirm neither ever appears in a "Season high" tag in any test fixture.
- [ ] Confirm no task introduced soccer support, a "next opponent" teaser, or any tag beyond "Season high"/"Triple-double" (Global Constraints).
- [ ] Live-verify after deploy (this project's established pattern, see [production-hosting](../../../../../.claude/projects/-Users-ps-Claude-sports-stats-site/memory/production-hosting.md) if available, else just check the live site): a real leader's performance page unfurls correctly when its URL is pasted somewhere, a real non-leader's page renders fully but carries a noindex meta tag, and the sitemap for `performances-nba`/`performances-nfl` only lists leader pairs.
