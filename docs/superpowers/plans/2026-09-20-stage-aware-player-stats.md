# Stage-aware player stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every NBA and NFL player-page total equal ESPN's headline (regular-season) numbers, with Playoffs and Play-In shown as their own tables, and stop pages that mean "regular season" from counting play-in, preseason or Cup-final games.

**Architecture:** `games` stores ESPN's season type and competition type (filled from both feeds) plus a generated `stage` column that is the single classification rule. Player profiles split rows by `stage`; pages that used `round is null` use `stage = 'regular'`. A backfill stores play-in games and types every existing NBA/NFL game; two read-only audit scripts prove the result.

**Tech Stack:** TypeScript, Next.js 16 (App Router), PostgreSQL 17 (`pg`), Node built-in test runner via `tsx --test`, `embedded-postgres` for throwaway test databases.

**Spec:** `docs/superpowers/specs/2026-09-20-stage-aware-player-stats-design.md`

## Global Constraints

- **`.env.local` in this worktree points at PRODUCTION.** Never run a scraper, backfill, audit or `next` command without an explicit throwaway `DATABASE_URL` in the same command. Tests are safe: `tests/helpers/testDb.ts` sets `DATABASE_URL` to a throwaway server. Implementers run only `npm test`, `npx tsc --noEmit` and `npm run lint`.
- Never lower data accuracy or completeness. Anything that changes what a page counts must have a test.
- Nothing is pushed. Commit only on branch `feat/stage-aware-player-stats`; the controller decides about merging.
- Tests: `tsx --test tests/*.test.ts` (Node built-in runner, `node:assert/strict`), throwaway Postgres from `tests/helpers/testDb.ts`. Import script modules with `await import(...)` inside `before()` after `startTestDb()` (they read `DATABASE_URL` at import).
- Match the surrounding code: comments explain why, not what; no new dependencies.
- The Next.js in this repo has breaking changes; read `node_modules/next/dist/docs/` before touching route or page conventions (Task 5 only edits existing page files and components).
- Stage vocabulary, exactly: `"regular" | "playoffs" | "playin" | "excluded" | "other"`.
- Soccer and cricket player pages keep a single table; only NBA and NFL split.

## File Structure

| File | Responsibility |
|---|---|
| `db/schema.sql` | New `games.season_type`, `games.competition_type`, generated `games.stage` |
| `src/lib/gameStage.ts` (new) | `GameStage` type, `isRegularSeasonGame`, `stageLabel` — pure |
| `scripts/lib/games.ts` | `parseStageFields`, fixed `parseRound`, ALLSTAR skip, upsert of the new columns |
| `scripts/lib/stage-backfill.ts` (new) | `seasonTypesFor`, `classifyUntypedGames` |
| `scripts/backfill-games.ts`, `scripts/backfill-game-stages.ts` (new), `scripts/audit-game-stages.ts` (new) | Backfill and read-only audit CLIs |
| `src/lib/playerLog.ts` (new) | `fetchPlayerLog(db, league, espnId)` shared by the app and the audit |
| `src/lib/playerProfile.ts` | `buildProfile` spec-rows parameter, `buildStagedProfile` |
| `src/lib/queries.ts` | `getPlayerLog` delegates; `GAME_SELECT` gains `g.stage` |
| Player page components and both player routes | Regular season / Playoffs / Play-In tables, stage-labelled game log |
| `src/lib/compare.ts` | `gamesLogged` counts regular-season games |
| `src/lib/analytics.ts`, `simulator.ts`, `matchContext.ts`, `matchweeks.ts` | `round is null` → stage-aware |
| `scripts/audit-player-totals.ts` (new) | Site regular-season totals vs ESPN's stored and live numbers |
| `tests/game-stage.test.ts`, `game-ingest.test.ts`, `stage-backfill.test.ts`, `player-stages.test.ts`, `regular-season.test.ts` (new) | Tests |

---

### Task 1: Stored season type, competition type and generated stage

**Files:**
- Modify: `db/schema.sql` (append after the `games` alters, before the next table)
- Create: `src/lib/gameStage.ts`
- Test: `tests/game-stage.test.ts`

**Interfaces:**
- Produces: columns `games.season_type int`, `games.competition_type text`, `games.stage text` (generated); `GameStage` type and `isRegularSeasonGame(g)` in `src/lib/gameStage.ts` (used by Tasks 4-7).

- [ ] **Step 1: Write the failing test**

`tests/game-stage.test.ts`:

```ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

let n = 0;
async function stageOf(league: string, seasonType: number | null, competitionType: string | null, round: string | null): Promise<string> {
  n += 1;
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_type, competition_type, round)
     values ($1, $2, now(), 'x', '1', '2', $3, $4, $5)`,
    [league, `g${n}`, seasonType, competitionType, round]
  );
  const { rows } = await db.pool.query(`select stage from games where league = $1 and espn_id = $2`, [league, `g${n}`]);
  return rows[0].stage;
}

test("NBA/NFL stage follows ESPN's season and competition type", async () => {
  assert.equal(await stageOf("nba", 2, "STD", null), "regular");
  assert.equal(await stageOf("nba", 3, "QTR", "East 1st Round - Game 3"), "playoffs");
  assert.equal(await stageOf("nba", 5, "STD", null), "playin");
  assert.equal(await stageOf("nba", 1, "STD", null), "excluded");
  assert.equal(await stageOf("nba", 2, "CC", null), "excluded");
  assert.equal(await stageOf("nba", 2, "ALLSTAR", null), "excluded");
  assert.equal(await stageOf("nfl", 3, "ALLSTAR", null), "excluded");
  assert.equal(await stageOf("nfl", 3, "FINAL", "Super Bowl LX"), "playoffs");
});

test("an NBA/NFL game with no known type keeps today's meaning: no round is regular, a round is playoffs", async () => {
  assert.equal(await stageOf("nba", null, null, null), "regular");
  assert.equal(await stageOf("nfl", null, null, "AFC Wild Card Playoffs"), "playoffs");
});

test("every other league: no round is regular, anything else is 'other'", async () => {
  assert.equal(await stageOf("epl", null, null, null), "regular");
  assert.equal(await stageOf("ucl", null, null, "Round of 16 - 1st Leg"), "other");
  assert.equal(await stageOf("ipl", null, null, "Match 12"), "other");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx tsx --test tests/game-stage.test.ts`
Expected: FAIL (`column "season_type" of relation "games" does not exist`).

- [ ] **Step 3: Add the columns**

Append to `db/schema.sql` after the last `alter table games ...` line (`first_seen_date`):

```sql
-- ESPN's own classification of a game, filled from both feeds (scoreboard `season.type`,
-- team schedule `seasonType.type`) for NBA and NFL only: 1 preseason, 2 regular season,
-- 3 postseason, 5 play-in. `competition_type` is the competition's abbreviation: STD normal,
-- ALLSTAR (NBA All-Star, NFL Pro Bowl), CC (NBA Cup final), playoff rounds RD16/QTR/SEMI/FINAL.
alter table games add column if not exists season_type int;
alter table games add column if not exists competition_type text;
-- The one rule for "what kind of game is this". ESPN's headline player totals count regular-season
-- games only: they leave out preseason, play-in, All-Star and the NBA Cup final. A game with no
-- known type falls back to the old `round is null` reading so nothing changes until it is typed.
-- Generated, so it can never drift from the columns it is derived from.
alter table games add column if not exists stage text generated always as (
  case
    when league not in ('nba', 'nfl') then case when round is null then 'regular' else 'other' end
    when competition_type in ('ALLSTAR', 'CC') then 'excluded'
    when season_type = 1 then 'excluded'
    when season_type = 2 then 'regular'
    when season_type = 3 then 'playoffs'
    when season_type = 5 then 'playin'
    when round is null then 'regular'
    else 'playoffs'
  end
) stored;
```

Create `src/lib/gameStage.ts`:

```ts
// The classification itself lives in the database (games.stage, a generated column); this is
// the TypeScript side of it. See db/schema.sql.
export type GameStage = "regular" | "playoffs" | "playin" | "excluded" | "other";

/** A game that counts toward regular-season tables and totals. Rows from a query that predates
 * `stage` fall back to the old reading: no round means regular season. */
export function isRegularSeasonGame(g: { stage?: GameStage | string | null; round: string | null }): boolean {
  return g.stage ? g.stage === "regular" : g.round == null;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass, including `tests/schema.test.ts` (schema stays idempotent).

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql src/lib/gameStage.ts tests/game-stage.test.ts
git commit -m "feat: store ESPN season and competition type on games, with a generated stage"
```

---

### Task 2: Ingestion — read the type from both feeds, fix `round`, skip All-Star

**Files:**
- Modify: `scripts/lib/games.ts` (`parseRound`, `upsertEvent`)
- Test: `tests/game-ingest.test.ts`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces: `parseStageFields(league, ev): { seasonType: number | null; competitionType: string | null }` exported from `scripts/lib/games.ts`; `upsertEvent` fills `season_type` and `competition_type`, never erases `season_type`, `competition_type` or `round` with null, and stores nothing for an `ALLSTAR` competition.

- [ ] **Step 1: Write the failing test**

`tests/game-ingest.test.ts`. Build two minimal event shapes: `scoreboard` puts the type at `ev.season.type`, `schedule` puts it at `ev.seasonType.type` (`ev.season` has only `year`). Both carry `competitions[0]` with `type.abbreviation`, two competitors (`homeAway`, `team: { id, displayName }`, `score`, `winner`), `status.type { state: "post", completed: true, detail: "Final" }` and, for playoff games, `notes: [{ type: "event", headline: "East 1st Round - Game 3" }]`.

```ts
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let games: typeof import("../scripts/lib/games");
before(async () => {
  db = await startTestDb();
  games = await import("../scripts/lib/games");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

function team(id: string, name: string, home: boolean, score: string) {
  return { homeAway: home ? "home" : "away", score, winner: home, team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() } };
}
function event(id: string, opts: { feed: "scoreboard" | "schedule"; type: number; comp: string; headline?: string; year?: number }) {
  return {
    id,
    date: "2026-04-20T00:00:00Z",
    name: "A at B",
    ...(opts.feed === "scoreboard" ? { season: { year: opts.year ?? 2026, type: opts.type } } : { season: { year: opts.year ?? 2026 }, seasonType: { type: opts.type } }),
    competitions: [
      {
        type: { abbreviation: opts.comp },
        competitors: [team("1", "Alpha", true, "100"), team("2", "Bravo", false, "90")],
        status: { type: { state: "post", completed: true, detail: "Final" } },
        ...(opts.headline ? { notes: [{ type: "event", headline: opts.headline }] } : {}),
      },
    ],
  };
}
const row = async (id: string) => (await db.pool.query(`select season_type, competition_type, round, stage from games where league = 'nba' and espn_id = $1`, [id])).rows[0];

test("parseStageFields reads the type from either feed", () => {
  assert.deepEqual(games.parseStageFields("nba", event("x", { feed: "scoreboard", type: 3, comp: "QTR" })), { seasonType: 3, competitionType: "QTR" });
  assert.deepEqual(games.parseStageFields("nba", event("x", { feed: "schedule", type: 5, comp: "STD" })), { seasonType: 5, competitionType: "STD" });
});

test("soccer's large season ids are not stored as a season type", () => {
  assert.deepEqual(games.parseStageFields("epl", event("x", { feed: "scoreboard", type: 12654, comp: "STD" })), { seasonType: null, competitionType: null });
});

test("a playoff game gets its round and stage from the scoreboard feed as well as the schedule feed", async () => {
  await games.upsertEvent("nba", event("s", { feed: "scoreboard", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  await games.upsertEvent("nba", event("t", { feed: "schedule", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  for (const id of ["s", "t"]) assert.deepEqual(await row(id), { season_type: 3, competition_type: "QTR", round: "East 1st Round - Game 3", stage: "playoffs" });
});

test("play-in, preseason and the Cup final are stored but are not regular season", async () => {
  await games.upsertEvent("nba", event("p", { feed: "schedule", type: 5, comp: "STD" }));
  await games.upsertEvent("nba", event("q", { feed: "scoreboard", type: 1, comp: "STD" }));
  await games.upsertEvent("nba", event("c", { feed: "scoreboard", type: 2, comp: "CC" }));
  assert.equal((await row("p")).stage, "playin");
  assert.equal((await row("q")).stage, "excluded");
  assert.equal((await row("c")).stage, "excluded");
  assert.equal((await row("p")).round, null);
});

test("an All-Star event is not stored, and its made-up teams are not added", async () => {
  const ev = event("a", { feed: "scoreboard", type: 2, comp: "ALLSTAR" });
  ev.competitions[0].competitors = [team("901", "Team Stripes", true, "100"), team("902", "Team Stars", false, "90")];
  await games.upsertEvent("nba", ev);
  assert.equal((await db.pool.query(`select 1 from games where espn_id = 'a'`)).rowCount, 0);
  assert.equal((await db.pool.query(`select 1 from teams where espn_id in ('901','902')`)).rowCount, 0);
});

test("a later, sparser feed never erases the type or the round", async () => {
  await games.upsertEvent("nba", event("k", { feed: "schedule", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  const sparse = event("k", { feed: "scoreboard", type: 3, comp: "QTR" });
  delete (sparse.season as any).type;
  delete (sparse.competitions[0] as any).type;
  await games.upsertEvent("nba", sparse);
  assert.deepEqual(await row("k"), { season_type: 3, competition_type: "QTR", round: "East 1st Round - Game 3", stage: "playoffs" });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx tsx --test tests/game-ingest.test.ts`
Expected: FAIL (`parseStageFields` is not a function).

- [ ] **Step 3: Implement**

In `scripts/lib/games.ts`, add above `parseRound`:

```ts
// ESPN's season type sits in a different field per feed: the scoreboard's `season.type`, the team
// schedule's `seasonType.type` (1 preseason, 2 regular, 3 post, 5 play-in). Soccer leagues put a
// large competition-specific id there instead, so the value is only meaningful (and only stored)
// for the NBA and NFL. The competition abbreviation (STD, ALLSTAR, CC, playoff rounds) is on both.
export function parseStageFields(league: League, ev: any): { seasonType: number | null; competitionType: string | null } {
  if (league !== "nba" && league !== "nfl") return { seasonType: null, competitionType: null };
  const raw = ev.seasonType?.type ?? ev.season?.type;
  const abbreviation = ev.competitions?.[0]?.type?.abbreviation;
  return {
    seasonType: typeof raw === "number" && Number.isInteger(raw) ? raw : null,
    competitionType: typeof abbreviation === "string" && abbreviation ? abbreviation : null,
  };
}
```

In `parseRound`, replace the two lines

```ts
  if (ev.seasonType?.type !== 3) return null;
```

with (keep the long comment above it, and append one sentence: "The scoreboard feed carries the same fact as `season.type`, and the Pro Bowl is tagged postseason but is not a playoff round."):

```ts
  const { seasonType, competitionType } = parseStageFields(league, ev);
  if (seasonType !== 3 || competitionType === "ALLSTAR") return null;
```

In `upsertEvent`, right after the `placeholder` early return and before `const status = comp.status;`, add:

```ts
  // The All-Star Game and the Pro Bowl are exhibitions between made-up sides: not part of any
  // season's record, and their "teams" would be added to the teams table.
  if (parseStageFields(league, ev).competitionType === "ALLSTAR") {
    console.log(`[upsertEvent] ${league} event ${ev.id}: all-star exhibition, skipped`);
    return;
  }
  const stageFields = parseStageFields(league, ev);
```

(Use one `stageFields` variable; drop the duplicate call in the `if`.) In the SQL: append `season_type, competition_type` to the end of the column list (after `updated_at`) and `$30, $31` to the end of the values list (after `now()`). In `on conflict do update set` add:

```sql
       season_type = coalesce(excluded.season_type, games.season_type),
       competition_type = coalesce(excluded.competition_type, games.competition_type),
```

and change `round = excluded.round` to `round = coalesce(excluded.round, games.round)`. Append `stageFields.seasonType, stageFields.competitionType` to the parameter array after `parseWeek(ev)`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/games.ts tests/game-ingest.test.ts
git commit -m "feat: read season and competition type from both feeds; keep them and round on re-scrape; skip All-Star exhibitions"
```

---

### Task 3: Backfill play-in games, type every existing game, audit script

**Files:**
- Create: `scripts/lib/stage-backfill.ts`, `scripts/backfill-game-stages.ts`, `scripts/audit-game-stages.ts`
- Modify: `scripts/backfill-games.ts`, `package.json` (scripts `backfill:game-stages`, `audit:game-stages`)
- Test: `tests/stage-backfill.test.ts`

**Interfaces:**
- Consumes: `upsertEvent` (Task 2), `fetchScoreboard(league, dateYYYYMMDD)` from `scripts/lib/espn.ts`.
- Produces: `seasonTypesFor(league): (number | undefined)[]`; `classifyUntypedGames(pool, league, fetchDay): Promise<{ dates: number; typed: number; stillUntyped: number }>` where `fetchDay: (league, yyyymmdd) => Promise<{ events?: any[] }>`.

- [ ] **Step 1: Write the failing test**

`tests/stage-backfill.test.ts`:

```ts
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/stage-backfill");
let games: typeof import("../scripts/lib/games");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/stage-backfill");
  games = await import("../scripts/lib/games");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

test("play-in games are requested for the NBA only", () => {
  assert.deepEqual(lib.seasonTypesFor("nba"), [undefined, 3, 5]);
  assert.deepEqual(lib.seasonTypesFor("nfl"), [undefined, 3]);
  assert.deepEqual(lib.seasonTypesFor("epl"), [undefined]);
});

function ev(id: string, date: string, type: number) {
  const t = (id2: string, home: boolean) => ({ homeAway: home ? "home" : "away", score: "1", winner: home, team: { id: id2, displayName: `T${id2}` } });
  return { id, date, name: "x", season: { year: 2026, type }, competitions: [{ type: { abbreviation: "STD" }, competitors: [t("1", true), t("2", false)], status: { type: { state: "post", completed: true } } }] };
}

test("classifies untyped games from that day's scoreboard, including a late game listed under the previous day", async () => {
  // Two games stored without a type (as the old backfill left them).
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed)
     values ('nba', 'a', '2025-10-05T18:00:00Z', 'x', '1', '2', true), ('nba', 'b', '2025-10-06T02:30:00Z', 'x', '1', '2', true), ('nba', 'c', '2025-10-08T02:30:00Z', 'x', '1', '2', true)`
  );
  const asked: string[] = [];
  const fetchDay = async (_l: string, day: string) => {
    asked.push(day);
    if (day === "20251005") return { events: [ev("a", "2025-10-05T18:00:00Z", 1), ev("b", "2025-10-06T02:30:00Z", 1)] };
    return { events: [] };
  };
  const res = await lib.classifyUntypedGames(db.pool, "nba", fetchDay);
  const { rows } = await db.pool.query(`select espn_id, season_type, stage from games order by espn_id`);
  assert.deepEqual(rows, [
    { espn_id: "a", season_type: 1, stage: "excluded" },
    { espn_id: "b", season_type: 1, stage: "excluded" },
    { espn_id: "c", season_type: null, stage: "regular" },
  ]);
  assert.equal(res.typed, 2);
  assert.equal(res.stillUntyped, 1);
  assert.ok(asked.includes("20251005"), "a game at 02:30 UTC on the 6th is on the 5th's scoreboard");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx tsx --test tests/stage-backfill.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`scripts/lib/stage-backfill.ts`:

```ts
import type { Pool } from "pg";
import type { League } from "./espn";
import { upsertEvent } from "./games";

// The default team-schedule call returns only the regular season; the postseason needs
// seasontype=3, and the NBA's play-in tournament (2020-21 on) needs seasontype=5. Preseason
// (1) is deliberately not requested: those games are not counted anywhere and would only add
// box scores to fetch.
export function seasonTypesFor(league: League): (number | undefined)[] {
  if (league === "nba") return [undefined, 3, 5];
  if (league === "nfl") return [undefined, 3];
  return [undefined];
}

const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Gives a season type to every stored NBA/NFL game that has none (games first stored by an
// earlier version of the scraper) by re-reading the scoreboard for its day. ESPN's scoreboard day
// runs on US time, so a late game is listed under the previous UTC date: both are asked.
export async function classifyUntypedGames(
  pool: Pick<Pool, "query">,
  league: League,
  fetchDay: (league: League, yyyymmdd: string) => Promise<{ events?: any[] }>
): Promise<{ dates: number; typed: number; stillUntyped: number }> {
  const { rows } = await pool.query(`select espn_id, date from games where league = $1 and season_type is null`, [league]);
  const wanted = new Set<string>(rows.map((r) => r.espn_id));
  const days = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.date);
    days.add(day(d));
    days.add(day(new Date(d.getTime() - 86_400_000)));
  }
  let typed = 0;
  for (const yyyymmdd of [...days].sort()) {
    if (wanted.size === 0) break;
    let data: { events?: any[] };
    try {
      data = await fetchDay(league, yyyymmdd);
    } catch (err) {
      console.error(`[classify-untyped] ${league} ${yyyymmdd} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
    for (const ev of data.events ?? []) {
      if (!wanted.has(String(ev.id))) continue;
      await upsertEvent(league, ev);
      wanted.delete(String(ev.id));
      typed += 1;
    }
  }
  const { rows: left } = await pool.query(`select count(*)::int as n from games where league = $1 and season_type is null`, [league]);
  return { dates: days.size, typed, stillUntyped: left[0].n };
}
```

(`upsertEvent` types only games the scoreboard says have a type; a game whose event lacks one stays untyped and is counted in `stillUntyped`. The `typed` counter counts games handled, so re-read `stillUntyped` from the database as above. In the test, game `c` is never returned so it stays untyped.)

`scripts/backfill-games.ts`: `import { seasonTypesFor } from "./lib/stage-backfill";`, replace the `const seasonTypes = league === "nba" ...` line with `const seasonTypes = seasonTypesFor(league);`, update the comment above it to mention seasontype=5 for the NBA play-in, and change the error text `${seasontype ? \` (postseason)\` : ""}` to `${seasontype ? \` (seasontype ${seasontype})\` : ""}`.

`scripts/backfill-game-stages.ts`:

```ts
// Gives a season type to every stored NBA/NFL game that lacks one, by re-reading that day's
// scoreboard. Safe to re-run; a game ESPN no longer lists stays untyped and is reported.
//   tsx scripts/backfill-game-stages.ts          # nba and nfl
//   tsx scripts/backfill-game-stages.ts nba
import { pool } from "./lib/db";
import { fetchScoreboard, type League } from "./lib/espn";
import { classifyUntypedGames } from "./lib/stage-backfill";

async function main() {
  const target = process.argv[2] as League | undefined;
  const leagues: League[] = target ? [target] : ["nba", "nfl"];
  let stillUntyped = 0;
  for (const league of leagues) {
    const res = await classifyUntypedGames(pool, league, (l, d) => fetchScoreboard(l, d));
    console.log(`[backfill-game-stages] ${league}: read ${res.dates} scoreboard days, ${res.stillUntyped} games still without a type`);
    stillUntyped += res.stillUntyped;
  }
  await pool.end();
  if (stillUntyped > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill-game-stages] failed:", err);
  process.exit(1);
});
```

The classification loop makes one request per distinct day; add a 100 ms pause inside the CLI's `fetchDay` wrapper (`await new Promise((r) => setTimeout(r, 100))` before returning) so it is polite to ESPN.

`scripts/audit-game-stages.ts` (read-only; `select` only):

```ts
// Read-only. For the NBA and NFL: how many stored games fall in each stage, and whether any
// completed game still has no season type. Exits 1 when one does.
import { pool } from "./lib/db";

async function main() {
  const { rows: byStage } = await pool.query(
    `select league, stage, season_type, competition_type, count(*)::int as games
     from games where league in ('nba', 'nfl') group by 1, 2, 3, 4 order by 1, 2, 3, 4`
  );
  console.table(byStage);
  const { rows: untyped } = await pool.query(
    `select league, count(*)::int as games, min(date)::date as first, max(date)::date as last
     from games where league in ('nba', 'nfl') and completed and season_type is null group by 1`
  );
  console.log("[audit-game-stages] completed games without a season type:", untyped.length ? untyped : "none");
  // Teams that exist only because of games that are not counted (e.g. preseason opponents from outside the league).
  const { rows: strays } = await pool.query(
    `select t.league, t.name, count(*)::int as games
     from teams t join games g on g.league = t.league and t.espn_id in (g.home_team_espn_id, g.away_team_espn_id)
     where t.league in ('nba', 'nfl')
     group by t.league, t.espn_id, t.name
     having bool_and(g.stage = 'excluded')
     order by 1, 2`
  );
  console.log("[audit-game-stages] teams whose every game is not counted (informational):", strays.length ? strays : "none");
  await pool.end();
  if (untyped.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[audit-game-stages] failed:", err);
  process.exit(1);
});
```

Add to `package.json` scripts (next to the other backfill/audit lines): `"backfill:game-stages": "tsx scripts/backfill-game-stages.ts"`, `"audit:game-stages": "tsx scripts/audit-game-stages.ts"`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add scripts package.json tests/stage-backfill.test.ts
git commit -m "feat: backfill play-in games, type stored games from the scoreboard, audit game stages"
```

---

### Task 4: Staged player profile

**Files:**
- Create: `src/lib/playerLog.ts`
- Modify: `src/lib/playerProfile.ts`, `src/lib/queries.ts` (`getPlayerLog`)
- Test: `tests/player-stages.test.ts`

**Interfaces:**
- Consumes: `games.stage`, `season_type`, `competition_type` (Task 1); `GameStage` (Task 1).
- Produces: `PlayerLogRow` gains `stage: GameStage`, `season_type: number | null`, `competition_type: string | null`; `fetchPlayerLog(db: { query: Pool["query"] }, league: League, espnId: string): Promise<PlayerLogRow[]>`; `buildProfile(sport, allRows, specRows = allRows)`; `StagedProfile` and `buildStagedProfile(sport, allRows): StagedProfile`:

```ts
export interface StagedProfile {
  /** True for NBA and NFL: the games are split by stage. Soccer keeps one table. */
  split: boolean;
  /** Regular season (career strip, season table, splits, milestones); for soccer, every appearance. */
  regular: PlayerProfile;
  playoffs: PlayerProfile | null;
  playin: PlayerProfile | null;
  /** Every counted game (regular season, playoffs, play-in): best games and recent form. */
  counted: PlayerProfile;
  /** Every appearance, newest first, including games that are not counted: the game log. */
  log: PlayerLogRow[];
}
```

- [ ] **Step 1: Write the failing test**

`tests/player-stages.test.ts` (pure; no database). Row factory builds a `PlayerLogRow` with `stats: { box: { MIN, PTS, REB: "5", AST: "5", ... } }` for NBA. Cases (assert every number):

1. NBA rows: 3 regular (pts 10, 20, 30, season_year 2026), 2 playoffs (pts 40, 50), 1 play-in (pts 25), 1 Cup final (`stage: "excluded"`, `competition_type: "CC"`), 1 preseason (`excluded`, `season_type: 1`), 1 regular DNP (`MIN "0"`, `PTS "0"`). Expect `regular.games === 3`, `regular.career.pts === 20`, `regular.seasons.length === 1 && regular.seasons[0].games === 3`, `playoffs.games === 2`, `playoffs.career.pts === 45`, `playin.games === 1`, `counted.games === 6`, `log.length === 8` (9 rows; the DNP is not an appearance, the excluded rows stay in the log), `regular.homeAway` games sum to 3, a `100th game` milestone absent and "First game on record" points at the earliest regular-season game.
2. NBA player with no playoffs and no play-in: `playoffs === null`, `playin === null`.
3. NFL: preseason (`excluded`) excluded from `regular`; playoffs separate; `regular.profile.specs` and `playoffs.profile.specs` list identical keys (columns match across tables).
4. Soccer rows with `stage: "regular"` and `"other"` (a Champions League knockout): `split === false`, `regular.games` counts all of them, `playoffs === null`.
5. `buildProfile(sport, rows)` with no third argument behaves exactly as before (regression: a call with only regular rows gives the same `career` as `buildStagedProfile(...).regular`).

- [ ] **Step 2: Run it and see it fail**

Run: `npx tsx --test tests/player-stages.test.ts`
Expected: FAIL (`buildStagedProfile` is not exported).

- [ ] **Step 3: Implement**

`src/lib/playerLog.ts` — move the SQL out of `getPlayerLog` unchanged except for the three added columns, so the app and the audit script share one query:

```ts
import type { Pool } from "pg";
import type { League } from "./leagues";
import type { PlayerLogRow } from "./playerProfile";

/** Every completed box-score row for a player with the game's context from the player's side.
 * Takes the connection so the read-only audit script can use its own pool. */
export async function fetchPlayerLog(db: Pick<Pool, "query">, league: League, playerEspnId: string): Promise<PlayerLogRow[]> {
  const { rows } = await db.query(
    `select pgs.game_espn_id, g.date, g.season_year, g.round, g.week, g.stage, g.season_type, g.competition_type, pgs.stats,
            ... (the rest of the existing getPlayerLog select, from-clause and where-clause verbatim)
     order by g.date desc`,
    [league, playerEspnId]
  );
  return rows;
}
```

`getPlayerLog` in `queries.ts` becomes `return fetchPlayerLog(pool, league, playerEspnId);` (keep its doc comment).

`playerProfile.ts`: add `import type { GameStage } from "./gameStage";`; add to `PlayerLogRow`: `stage: GameStage; season_type: number | null; competition_type: string | null;`. Change `buildProfile` to `buildProfile(sport, allRows, specRows = allRows)` and its first line to `const profile = sportProfile(sport, specRows);` (doc: NFL picks columns from the rows it is given; the staged tables pass the regular-season rows so every table has the same columns). Add `StagedProfile` (above) and:

```ts
// NBA and NFL: ESPN's headline totals are regular-season games only, so the regular season, the
// playoffs and the play-in are separate tables. Preseason, All-Star and Cup-final games are in
// the game log but in no total.
export function buildStagedProfile(sport: PlayerSport, allRows: PlayerLogRow[]): StagedProfile {
  if (sport === "soccer") {
    const regular = buildProfile(sport, allRows);
    return { split: false, regular, playoffs: null, playin: null, counted: regular, log: regular.rows };
  }
  const of = (...stages: GameStage[]) => allRows.filter((r) => stages.includes(r.stage));
  const regularRows = of("regular", "other");
  const playoffRows = of("playoffs");
  const playinRows = of("playin");
  const countedRows = [...regularRows, ...playoffRows, ...playinRows];
  const specRows = regularRows.length > 0 ? regularRows : countedRows;
  const build = (rows: PlayerLogRow[]) => buildProfile(sport, rows, specRows);
  const regular = build(regularRows);
  const playoffs = build(playoffRows);
  const playin = build(playinRows);
  return {
    split: true,
    regular,
    playoffs: playoffs.games > 0 ? playoffs : null,
    playin: playin.games > 0 ? playin : null,
    counted: build(countedRows),
    log: allRows.filter(regular.profile.played).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass. `tsc` will flag every place that builds a `PlayerLogRow` by hand; there should be none outside tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/player-stages.test.ts
git commit -m "feat: split player game logs into regular season, playoffs and play-in"
```

---

### Task 5: Player pages show the three tables

**Files:**
- Modify: `src/app/[league]/players/[slug]/page.tsx`, `src/app/[league]/players/[slug]/[season]/page.tsx`, `src/components/PlayerGameLogTable.tsx`, `src/components/PlayerSeasonTable.tsx`, `src/lib/gameStage.ts` (add `stageLabel`)
- Read first: `node_modules/next/dist/docs/` (only if a route convention is touched; none is expected)

**Interfaces:**
- Consumes: `buildStagedProfile`, `StagedProfile` (Task 4).
- Produces: `stageLabel(row: { stage?: string | null; season_type?: number | null; competition_type?: string | null }): string | null` in `src/lib/gameStage.ts`: `"Play-In"` for `playin`, `"Preseason"` for season type 1, `"NBA Cup final"` for competition type `CC`, `"All-Star"` for `ALLSTAR`, otherwise null (playoff rows keep their round label).

Behaviour (spec section "Player pages"):

- [ ] **Step 1: Implement `stageLabel`** with a unit test appended to `tests/game-stage.test.ts` (pure function; add the cases above).

- [ ] **Step 2: Player page.** Replace `loadProfile` with `loadStaged` returning `StagedProfile | null` built with `buildStagedProfile`. Use:
  - `staged.regular` for the career strip, export card, season-by-season "Regular season" table, home/away, by-result, opponents, milestones, goal-minutes, `profileSummary`, related opponents, and the `games === 0` check (a player with only playoff games shows the empty state for regular season but still shows the Playoffs table);
  - `staged.counted` for Best games and Recent form;
  - a new `<PlayerSeasonTable profile={staged.playoffs} ... />` section headed "Playoffs" and, when `staged.playin`, a "Play-In" section, each with a one-line description ("Playoff games only; ESPN lists these separately from the regular season." / "Play-in tournament games, listed separately from the regular season and the playoffs.");
  - the section header for the main table becomes "Regular season" (NBA/NFL); soccer keeps "Season by season";
  - the Game log receives `staged.log`.
  Update the closing footnote for split sports: "Regular-season figures are summed from the {n} {LEAGUE} regular-season games on record here since {date}. Playoff and play-in games are shown separately; preseason, All-Star and NBA Cup final games are listed in the game log but not counted, matching ESPN." Keep the soccer wording as is.
- [ ] **Step 3: Season page.** Build `buildStagedProfile(sport, log.filter((r) => r.season_year === season))`; same section mapping (regular season strip/best/splits, Playoffs and Play-In sections, game log). Metadata figures come from `staged.regular` (`generateMetadata` too). Section header wording "Regular season" for split sports.
- [ ] **Step 4: `PlayerGameLogTable`.** New props `{ league, rows: PlayerLogRow[], specs, gamesLabel, season? }` (or keep `profile` for specs and add `rows`): group by `season_year` (newest first, latest open); add a Stage column for split sports showing, in order: `stageLabel(row)`, the normalised round, `Week n`; dim rows whose `stage === "excluded"` and give them `title="Not counted in season totals"`; group header reads `{season} · {n} games logged`. Keep the existing column set otherwise.
- [ ] **Step 5: `PlayerSeasonTable`** accepts an optional `careerLabel` (default "Career on record"; the Playoffs table passes "Career playoffs", Play-In "Career play-in") and an optional `showRecord` unchanged.
- [ ] **Step 6: Verify.** `npx tsc --noEmit && npm run lint && npm test`. The controller does the visual check on a local rehearsal database afterwards (do not run the dev server or build here).
- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: player pages show regular season, playoffs and play-in as separate tables"
```

---

### Task 6: Comparison pages count regular-season games

**Files:**
- Modify: `src/lib/compare.ts` (`countGameLog` and whatever feeds `gamesLogged`)
- Test: `tests/compare-games.test.ts` (or extend an existing compare test if one exists)

Read `src/lib/compare.ts` first. `countGameLog` counts every stored box-score row for a player, while the compared numbers come from ESPN's regular-season season stats, so a player with playoff games shows a games-logged count that does not match their per-game averages.

- [ ] **Step 1:** Write a failing test for the counting logic (extract it into a small pure function taking `{ stage }[]` if it is inline): for NBA/NFL only rows with `stage` `regular` count; soccer counts all rows. Use `getPlayerLog`'s rows via `fetchPlayerLog` (Task 4) so the stage is present.
- [ ] **Step 2:** Run it, see it fail. Implement. Run `npm test && npx tsc --noEmit`.
- [ ] **Step 3:** Also confirm `getPlayerGameLog` (`src/lib/queries.ts`, unused) is still unused with a repository-wide search; if so delete it so nothing can later re-introduce an unstaged log. Report the search result in your report.
- [ ] **Step 4: Commit** `fix: compare pages count regular-season games only`.

---

### Task 7: "Regular season" on derived pages means `stage = 'regular'`

**Files:**
- Modify: `src/lib/queries.ts` (`GAME_SELECT` gains `g.stage`; `GameRow` gains `stage?: GameStage | null`), `src/lib/analytics.ts`, `src/lib/simulator.ts`, `src/lib/matchContext.ts`, `src/lib/matchweeks.ts`
- Test: `tests/regular-season.test.ts`

**Why:** once play-in, preseason and Cup-final games are stored (they have a null `round`), every query that reads `round is null` as "regular season" would count them. Policy: pages that *list* games (scoreboards, team schedules, game pages, ICS, sitemap) keep listing every game; pages that *compute* something from the regular season use `stage = 'regular'`; Elo skips `excluded` games (an exhibition or preseason game says nothing about strength) but keeps playoffs and play-in.

Replace exactly these (line numbers as of `70893bb`):

| Where | Now | Becomes |
|---|---|---|
| `analytics.ts` `getSeasonResults` (~L55) | `and round is null` | `and stage = 'regular'` |
| `analytics.ts` `getAllResults` (~L65) | no stage filter | add `and stage <> 'excluded'` |
| `analytics.ts` `getPowerRankings` upcoming (~L301) | `and round is null` | `and stage = 'regular'` |
| `simulator.ts` `getSeasonProjection` (~L142) | `g.round is null` | `g.stage = 'regular'` |
| `matchContext.ts` (~L64-87) | `round == null` on the game and on prior results | select `stage` in the results query and skip `excluded` there; `inTable` and `seasonBefore` use `isRegularSeasonGame` |
| `matchweeks.ts` `buildMatchweeks` non-soccer branch (~L266-267) | `!g.round` / `g.round` | `isRegularSeasonGame(g)` / `g.stage === "playoffs"` (fall back to `Boolean(g.round)` when `stage` is absent) |

`ResultRow` gains `stage`. Then search every other `from games` / `GAME_SELECT` consumer listed by `grep -rnE "from games|join games|GAME_SELECT" src scripts` and, in your report, give a one-line verdict for each (list-only, unaffected; or changed): in particular any team-record or "W-L" calculation built from `getTeamGamesBySeason` or `getSeasonLastResults` — those must count regular-season games only (`isRegularSeasonGame`).

- [ ] **Step 1: Failing tests** in `tests/regular-season.test.ts`:
  - `buildMatchweeks("nba", games)` (pure) with 3 regular games on 3 days, 1 game with `stage: "playin"`, 1 with `stage: "excluded"`, 1 with `stage: "playoffs"` and a round: the play-in and excluded games appear in no matchweek; the playoff game is in a playoff group; regular games are bucketed as before.
  - With the throwaway DB: insert NBA games (regular ×2, play-in, preseason, Cup final) and completed scores, then `getSeasonResults`-equivalent through the exported `getComputedTable`/whatever `analytics.ts` exports for the table (read the file; use the exported function that wraps `getSeasonResults`) and assert only the two regular games count. Do the same for `getAllResults` used by Elo (assert the preseason and Cup-final games are skipped, the play-in game kept).
  - `matchContext`: a play-in game's `inTable` is false (assert through the exported function's result shape).
- [ ] **Step 2:** Run, see them fail; implement; `npm test && npx tsc --noEmit && npm run lint`.
- [ ] **Step 3: Commit** `fix: regular-season pages use the stored game stage instead of round is null`.

---

### Task 8: Acceptance audit — site totals vs ESPN

**Files:**
- Create: `scripts/audit-player-totals.ts`
- Modify: `scripts/lib/season-stats.ts` (export `seasonRow` so the audit and the loader read ESPN's payload the same way), `package.json` (`"audit:player-totals": "tsx scripts/audit-player-totals.ts"`)
- Test: `tests/audit-player-totals.test.ts` (the pure comparison function)

Read-only (`select` only; the live mode calls ESPN's athlete `/stats`). Usage: `tsx scripts/audit-player-totals.ts [nba|nfl] [--live N] [--limit N]`.

For each NBA/NFL player with box-score rows, per season: build `buildStagedProfile(sport, await fetchPlayerLog(pool, league, id)).regular` and compare with ESPN's regular-season numbers:

- **Stored ESPN numbers** (default): `player_season_stats.categories` for that `(league, season, player)`.
- **Live** (`--live N`): N random players, fetched now with `fetchAthleteSeasonStats(league, id)` and read with `seasonRow`, so a stale stored row cannot hide a difference.

Compared figures — NBA: games played (`averages.GP`) and points per game (`averages.PTS`, compared at one decimal); NFL: games played where the categories carry it, plus passing, rushing and receiving yards and touchdowns totals. Output classes per season: `match`, `MISMATCH` (site games or figure differ from ESPN), `no box scores` (ESPN has the season, the database has none: a coverage gap, listed separately and never counted as a match), `no ESPN row`. Print a summary (`compared`, `matched`, `mismatched`, `coverage gaps`), the first 50 mismatches with both numbers, and exit 1 when any mismatch exists.

- [ ] **Step 1:** Write a failing test for `compareSeason(site, espn)` (pure, exported): equal games and figure → `match`; site 78 vs ESPN 70 games → `MISMATCH` with both values; site has no games → `no box scores`.
- [ ] **Step 2:** Run, see it fail; implement the function and the CLI; `npm test && npx tsc --noEmit`.
- [ ] **Step 3: Commit** `feat: audit that site regular-season totals equal ESPN's`.

---

## Controller steps after Task 8 (not delegated)

1. Final whole-branch review (most capable model).
2. Local rehearsal on a throwaway database (`DATABASE_URL=postgres://postgres:password@localhost:5433/sports`, from `npm run dev:db`): apply `db/schema.sql`, `seed:teams` for NBA and NFL, `backfill:games nba`, `backfill:games nfl`, `backfill:game-stages`, box scores from season 2024 (`backfill:game-stats nba 2024`, same for NFL), `backfill:player-stats nba`, then `audit:game-stages` and `audit:player-totals`. Expected: 0 untyped completed games, 0 mismatches. Fix anything found. Look at the Luka, Giannis and Curry pages in the browser preview.
3. Present the production runbook and the result to the user; nothing touches production without approval of each command shown first (merge, VM `git pull`, `npm run migrate`, `backfill:games nba nfl`, `backfill:game-stages`, `backfill:game-stats` for the new play-in games, `audit:game-stages`, `audit:player-totals`, deploy).
