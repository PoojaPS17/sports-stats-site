# Pre-launch data freshness (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make database-backed pages current: run the scrapers on the Oracle VM on an exact schedule, schedule the four scrapers that never ran, stop injuries/F1 data being wrong or empty, and alarm when a scraper goes stale.

**Architecture:** Systemd timers on the existing Oracle VM run a small bash job runner (`deploy/vm/scrape.sh`) that mirrors the old GitHub Actions steps. A `scrape_runs` heartbeat table records each scraper's last success; a stale check fails loudly when one misses its window. Injuries and F1 writers become library functions that take a `pg` Pool so they can be tested against a throwaway embedded Postgres.

**Tech Stack:** Node 20, TypeScript via `tsx`, `pg`, `embedded-postgres` (dev dependency, already present), Node's built-in test runner (`node:test`), bash, systemd.

**Spec:** `docs/superpowers/specs/2026-09-20-api-data-optimisation-design.md` (Phase A). Two findings during planning change the spec's Phase A and are recorded in the spec addendum: GitHub cron runs the scrapers about every 3 hours instead of every 15 minutes (measured 2026-09-20), and `sports-db.live` is already served by a Next.js app on the Oracle VM (`sportsdb-app.service`, checkout `/opt/sportsdb/repo`).

## Global Constraints

- Oracle Always Free only: one A1 VM ≤ 4 OCPU / 24 GB, ≤ 200 GB storage, outbound ≤ 10 TB/month, no other paid resources. This plan adds no resources; it uses the existing VM (aarch64, 4 cores, 23 GB RAM, 90 GB free disk, Node v20.20.2, git 2.43).
- Never lose or degrade data accuracy or completeness. Every write change is verified against a throwaway database first.
- Tests run against `embedded-postgres` in a temp directory, never the Oracle database.
- Nothing is committed or pushed, and nothing on the VM is changed, without the user's explicit approval (commit/push gate before Task 7; each VM command is shown first).
- Scripts run from the repo root (`process.cwd()`); `scripts/lib/env.ts` loads `.env.local`, else `.env`, else the process environment. `DATABASE_URL` must be set (`scripts/lib/db.ts` throws otherwise).
- Bash on macOS needs `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"`. Use Python for in-place edits on macOS (`sed -i` differs).
- GitHub workflows `scrape-rosters.yml`, `scrape-trending.yml`, `scrape-cricsheet.yml` stay on GitHub (low-freshness data); only `scrape.yml` moves to the VM.

## File Structure

| File | Responsibility |
|---|---|
| `tests/helpers/testDb.ts` | Start/stop a throwaway Postgres with `db/schema.sql` applied; sets `DATABASE_URL` |
| `tests/schema.test.ts` | Smoke test for the harness and schema idempotency |
| `db/schema.sql` (modify) | Add `scrape_runs` heartbeat table |
| `scripts/lib/heartbeat.ts` | `recordRun`, `findStale`, `MAX_AGE_MINUTES` |
| `tests/heartbeat.test.ts` | Heartbeat tests |
| `scripts/check-stale.ts` | CLI: exit 1 listing scrapers that missed their window |
| `scripts/lib/injuries.ts` | `replaceLeagueInjuries(pool, league, feed)` — atomic replace |
| `tests/injuries.test.ts` | Atomicity and safety tests |
| `scripts/fetch-injuries.ts` (modify) | Use the library, record heartbeat |
| `scripts/lib/f1-weekend.ts` | `upsertF1Weekend(pool, event, seasonYear)` incl. date/name fix |
| `tests/f1-weekend.test.ts` | F1 upsert update-on-conflict tests |
| `scripts/fetch-f1-scores.ts`, `scripts/fetch-f1-standings.ts`, `scripts/lib/f1.ts` (modify) | Use library, record heartbeat, report failed groups |
| `deploy/vm/scrape.sh` | Job runner: `tick`, `daily`, `hourly` |
| `tests/scrape-runner.test.ts` | Runner tests with a stub `npm`/`git` |
| `deploy/vm/systemd/*` | Service template and three timers |
| `deploy/vm/install.sh` | Install and enable units |
| `scripts/audit-freshness.ts` | Read-only report: age of every table's newest `updated_at`/`fetched_at` |
| `.github/workflows/scrape.yml` (modify, Task 8) | Remove `schedule:` after VM cut-over |

---

### Task 1: Test harness and freshness baseline

**Files:**
- Create: `tests/helpers/testDb.ts`, `tests/schema.test.ts`, `scripts/audit-freshness.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `startTestDb(): Promise<{ pool: Pool; url: string; stop(): Promise<void> }>` — also sets `process.env.DATABASE_URL = url`. Later tasks import scripts dynamically **after** calling it.
- Produces: npm scripts `test` and `audit:freshness`.

- [ ] **Step 1: Record the baseline (read-only, before any change)**

Create `scripts/audit-freshness.ts`:

```ts
// Read-only report: how old is the newest row of every table that stamps updated_at / fetched_at.
// Used as the "before" snapshot for the freshness work and re-run after each rollout step.
import { pool } from "./lib/db";

async function main() {
  const { rows: cols } = await pool.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name in ('updated_at', 'fetched_at')
     order by table_name`
  );
  const out: { table: string; newest: Date | null; ageHours: number | null }[] = [];
  for (const { table_name, column_name } of cols) {
    const { rows } = await pool.query(`select max(${column_name}) as newest from ${table_name}`);
    const newest: Date | null = rows[0]?.newest ?? null;
    out.push({ table: table_name, newest, ageHours: newest ? (Date.now() - newest.getTime()) / 3_600_000 : null });
  }
  out.sort((a, b) => (b.ageHours ?? 1e9) - (a.ageHours ?? 1e9));
  for (const r of out) {
    console.log(`${r.table.padEnd(28)} ${r.newest ? r.newest.toISOString() : "(empty)"}  ${r.ageHours === null ? "" : r.ageHours.toFixed(1) + " h old"}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[audit-freshness] failed:", err);
  process.exit(1);
});
```

Add to `package.json` scripts: `"audit:freshness": "tsx scripts/audit-freshness.ts"` and `"test": "tsx --test tests/*.test.ts"`.

Run: `npm run audit:freshness | tee /private/tmp/claude-501/-Users-ps-Claude-sports-stats-site/e456d8e9-cead-4299-a57f-cdfaa22e52a1/scratchpad/freshness-before.txt`
Expected: one line per table; `injuries` and `f1_*` show roughly 60+ hours old.

- [ ] **Step 2: Write the throwaway-database helper**

Create `tests/helpers/testDb.ts`:

```ts
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Pool } from "pg";

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

export interface TestDb {
  pool: Pool;
  url: string;
  stop(): Promise<void>;
}

/** Throwaway Postgres with db/schema.sql applied. Sets DATABASE_URL so scripts/lib/db.ts points at it. */
export async function startTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "sportsdb-test-"));
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: "postgres",
    password: "password",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("t");
  const url = `postgres://postgres:password@localhost:${port}/t`;
  process.env.DATABASE_URL = url;
  const pool = new Pool({ connectionString: url });
  await pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
  return {
    pool,
    url,
    async stop() {
      await pool.end();
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 3: Write the smoke test**

Create `tests/schema.test.ts`:

```ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db.stop();
});

test("schema applies and creates the core tables", async () => {
  const { rows } = await db.pool.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('games', 'injuries', 'f1_sessions')`
  );
  assert.equal(rows.length, 3);
});

test("schema is idempotent (migrate runs on every scrape)", async () => {
  await db.pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: 2 tests pass. If `onLog`/`onError` are rejected by the installed `embedded-postgres` types, delete those two lines and re-run (output is only noisier).

- [ ] **Step 5: Commit** (only after the user approves committing — see Global Constraints)

```bash
git add tests/helpers/testDb.ts tests/schema.test.ts scripts/audit-freshness.ts package.json
git commit -m "test: add throwaway-Postgres harness and freshness audit script"
```

---

### Task 2: Heartbeat table, helper and stale check

**Files:**
- Modify: `db/schema.sql` (append), `package.json`
- Create: `scripts/lib/heartbeat.ts`, `scripts/check-stale.ts`, `tests/heartbeat.test.ts`

**Interfaces:**
- Consumes: `startTestDb()` from Task 1.
- Produces: `recordRun(pool: Pool, scraper: string, opts?: { changed?: boolean }): Promise<void>`; `findStale(pool: Pool, limits?: Record<string, number>): Promise<{ scraper: string; ageMinutes: number | null }[]>`; `MAX_AGE_MINUTES: Record<string, number>`; npm script `check:stale`.

- [ ] **Step 1: Write the failing test**

Create `tests/heartbeat.test.ts`:

```ts
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let hb: typeof import("../scripts/lib/heartbeat");
before(async () => {
  db = await startTestDb();
  hb = await import("../scripts/lib/heartbeat");
});
after(async () => {
  await db.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from scrape_runs");
});

const LIMITS = { "job-a": 180, "job-b": 60 };

test("a scraper that never ran is stale with a null age", async () => {
  assert.deepEqual(await hb.findStale(db.pool, LIMITS), [
    { scraper: "job-a", ageMinutes: null },
    { scraper: "job-b", ageMinutes: null },
  ]);
});

test("fresh runs are not stale", async () => {
  await hb.recordRun(db.pool, "job-a");
  await hb.recordRun(db.pool, "job-b");
  assert.deepEqual(await hb.findStale(db.pool, LIMITS), []);
});

test("a run older than its limit is stale", async () => {
  await hb.recordRun(db.pool, "job-a");
  await hb.recordRun(db.pool, "job-b");
  await db.pool.query(`update scrape_runs set last_ok_at = now() - interval '4 hours' where scraper = 'job-a'`);
  const stale = await hb.findStale(db.pool, LIMITS);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].scraper, "job-a");
  assert.ok((stale[0].ageMinutes ?? 0) >= 239);
});

test("last_changed_at moves only when changed is true", async () => {
  await hb.recordRun(db.pool, "job-a");
  let row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.equal(row.last_changed_at, null);
  await hb.recordRun(db.pool, "job-a", { changed: true });
  row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.ok(row.last_changed_at instanceof Date);
  const first = row.last_changed_at as Date;
  await hb.recordRun(db.pool, "job-a", { changed: false });
  row = (await db.pool.query("select last_changed_at from scrape_runs where scraper = 'job-a'")).rows[0];
  assert.equal((row.last_changed_at as Date).getTime(), first.getTime());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/heartbeat.test.ts`
Expected: FAIL — `relation "scrape_runs" does not exist` (or module not found).

- [ ] **Step 3: Add the table**

Append to `db/schema.sql`:

```sql

-- One row per scheduled scraper: when it last finished successfully, and when it last
-- actually changed data. Written by scripts/lib/heartbeat.ts, read by scripts/check-stale.ts
-- so a scraper that stops running is noticed instead of silently leaving pages stale.
create table if not exists scrape_runs (
  scraper text primary key,
  last_ok_at timestamptz not null default now(),
  last_changed_at timestamptz
);
```

- [ ] **Step 4: Write the helper**

Create `scripts/lib/heartbeat.ts`:

```ts
import type { Pool } from "pg";

/** Longest a scraper may go without a successful run before check:stale fails, in minutes. */
export const MAX_AGE_MINUTES: Record<string, number> = {
  "fetch-injuries": 180,
  "fetch-f1-scores": 180,
  "fetch-f1-standings": 180,
};

/** Record a successful run. last_changed_at only moves when the caller knows rows really changed. */
export async function recordRun(pool: Pool, scraper: string, opts: { changed?: boolean } = {}): Promise<void> {
  await pool.query(
    `insert into scrape_runs (scraper, last_ok_at, last_changed_at)
     values ($1, now(), case when $2::boolean then now() end)
     on conflict (scraper) do update set
       last_ok_at = now(),
       last_changed_at = case when $2::boolean then now() else scrape_runs.last_changed_at end`,
    [scraper, opts.changed === true]
  );
}

export interface StaleScraper {
  scraper: string;
  /** Minutes since the last success; null when the scraper has never recorded a run. */
  ageMinutes: number | null;
}

export async function findStale(pool: Pool, limits: Record<string, number> = MAX_AGE_MINUTES): Promise<StaleScraper[]> {
  const { rows } = await pool.query(`select scraper, extract(epoch from (now() - last_ok_at)) / 60 as age from scrape_runs`);
  const ages = new Map<string, number>(rows.map((r) => [r.scraper as string, Number(r.age)]));
  const stale: StaleScraper[] = [];
  for (const [scraper, max] of Object.entries(limits)) {
    const age = ages.get(scraper);
    if (age === undefined) stale.push({ scraper, ageMinutes: null });
    else if (age > max) stale.push({ scraper, ageMinutes: Math.round(age) });
  }
  return stale;
}
```

- [ ] **Step 5: Write the CLI**

Create `scripts/check-stale.ts`:

```ts
// Fails (exit 1) when a scheduled scraper has not succeeded within its window (see MAX_AGE_MINUTES).
import { pool } from "./lib/db";
import { findStale } from "./lib/heartbeat";

async function main() {
  const stale = await findStale(pool);
  for (const s of stale) {
    console.error(`[check-stale] ${s.scraper}: ${s.ageMinutes === null ? "never ran" : `last success ${s.ageMinutes} min ago`}`);
  }
  if (stale.length === 0) console.log("[check-stale] all scrapers within their windows");
  await pool.end();
  if (stale.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[check-stale] failed:", err);
  process.exit(1);
});
```

Add to `package.json` scripts: `"check:stale": "tsx scripts/check-stale.ts"`.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test`
Expected: all tests pass (schema + heartbeat).

- [ ] **Step 7: Commit** (after approval)

```bash
git add db/schema.sql scripts/lib/heartbeat.ts scripts/check-stale.ts tests/heartbeat.test.ts package.json
git commit -m "feat: scrape_runs heartbeat table and stale-scraper check"
```

---

### Task 3: Atomic injuries replace

**Files:**
- Create: `scripts/lib/injuries.ts`, `tests/injuries.test.ts`
- Modify: `scripts/fetch-injuries.ts` (full rewrite below)

**Interfaces:**
- Consumes: `recordRun` (Task 2), `fetchInjuries(league)` from `scripts/lib/espn.ts`, `startTestDb`.
- Produces: `replaceLeagueInjuries(pool: Pool, league: string, feed: unknown): Promise<{ teams: number; count: number }>`. Throws (leaving stored rows untouched) when `feed.injuries` is not an array.

- [ ] **Step 1: Write the failing tests**

Create `tests/injuries.test.ts`:

```ts
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/injuries");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/injuries");
});
after(async () => {
  await db.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from injuries");
});

function feed(prefix: string, n: number) {
  return {
    injuries: [
      {
        id: "t1",
        injuries: Array.from({ length: n }, (_, i) => ({
          athlete: { id: `${prefix}${i}`, displayName: `${prefix} Player ${i}` },
          status: "Out",
          shortComment: "x",
          longComment: "y",
          date: "2026-09-20T00:00:00Z",
        })),
      },
    ],
  };
}

const count = async () => Number((await db.pool.query("select count(*) from injuries where league = 'nba'")).rows[0].count);

test("replaces a league's rows with the new feed", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 5));
  const res = await lib.replaceLeagueInjuries(db.pool, "nba", feed("new", 3));
  assert.deepEqual(res, { teams: 1, count: 3 });
  const names = (await db.pool.query("select player_name from injuries where league = 'nba' order by 1")).rows.map((r) => r.player_name);
  assert.deepEqual(names, ["new Player 0", "new Player 1", "new Player 2"]);
});

test("a reader never sees an empty or partial list while it replaces", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 200));
  const seen = new Set<number>();
  let running = true;
  const reader = (async () => {
    while (running) {
      seen.add(await count());
    }
  })();
  for (let i = 0; i < 5; i++) await lib.replaceLeagueInjuries(db.pool, "nba", feed(`n${i}`, 200));
  running = false;
  await reader;
  assert.deepEqual([...seen], [200]);
});

test("a malformed feed keeps the stored rows", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  await assert.rejects(() => lib.replaceLeagueInjuries(db.pool, "nba", { nope: true }), /malformed/);
  assert.equal(await count(), 4);
});

test("a genuinely empty injuries list clears the league (mirrors ESPN)", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  await lib.replaceLeagueInjuries(db.pool, "nba", { injuries: [] });
  assert.equal(await count(), 0);
});

test("a row the database rejects rolls the whole replace back", async () => {
  await lib.replaceLeagueInjuries(db.pool, "nba", feed("old", 4));
  const bad = feed("bad", 3);
  (bad.injuries[0].injuries[2] as any).status = "Out";
  (bad.injuries[0].injuries[2] as any).athlete = { id: "z", displayName: "Bad" };
  (bad.injuries[0].injuries[2] as any).date = "not-a-timestamp";
  await assert.rejects(() => lib.replaceLeagueInjuries(db.pool, "nba", bad));
  assert.equal(await count(), 4);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/injuries.test.ts`
Expected: FAIL — cannot find module `../scripts/lib/injuries`.

- [ ] **Step 3: Write the library**

Create `scripts/lib/injuries.ts`:

```ts
import type { Pool } from "pg";

/**
 * Replace a league's injury rows with ESPN's current list, in one transaction so a page render
 * never catches the table empty or half-written. A feed without an `injuries` array is treated
 * as a bad response (throw, keep what is stored); an empty array is ESPN saying "none" and clears the league.
 */
export async function replaceLeagueInjuries(pool: Pool, league: string, feed: unknown): Promise<{ teams: number; count: number }> {
  const teams = (feed as { injuries?: unknown } | null)?.injuries;
  if (!Array.isArray(teams)) {
    throw new Error(`injuries feed for ${league} is malformed (no injuries array) - keeping stored rows`);
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from injuries where league = $1", [league]);
    let count = 0;
    for (const team of teams) {
      const teamId = team.id;
      for (const injury of team.injuries ?? []) {
        const athlete = injury.athlete;
        if (!teamId || !athlete?.displayName || !injury.status) continue;
        await client.query(
          `insert into injuries (league, team_espn_id, player_espn_id, player_name, status, short_comment, long_comment, reported_date)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            league,
            teamId,
            // The injuries feed doesn't carry an athlete id directly on this object in
            // every case - fall back to a name-scoped synthetic id so a row is still
            // storable rather than silently dropped.
            injury.athlete?.id ?? `name:${athlete.displayName}`,
            athlete.displayName,
            injury.status,
            injury.shortComment ?? null,
            injury.longComment ?? null,
            injury.date ?? null,
          ]
        );
        count++;
      }
    }
    await client.query("commit");
    return { teams: teams.length, count };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test tests/injuries.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Rewrite the script to use it**

Replace the contents of `scripts/fetch-injuries.ts` with:

```ts
// Real per-team injury reports — ESPN's own /injuries endpoint. Cricket has no
// equivalent (404s, same gap as its /teams and /roster endpoints). EPL/La Liga's
// endpoint responds but has come back empty in every check so far; it's included
// anyway on the same honest-data principle as everywhere else in this project — if
// ESPN starts populating it, this picks it up with no code change, and if not, the
// page just shows nothing for those leagues rather than us guessing.
import { pool } from "./lib/db";
import { fetchInjuries, type League } from "./lib/espn";
import { recordRun } from "./lib/heartbeat";
import { replaceLeagueInjuries } from "./lib/injuries";

const LEAGUES: League[] = ["nba", "nfl", "epl", "laliga"];

async function main() {
  let failed = 0;
  for (const league of LEAGUES) {
    try {
      const { teams, count } = await replaceLeagueInjuries(pool, league, await fetchInjuries(league));
      console.log(`[fetch-injuries] ${league}: ${teams} teams, ${count} injury reports`);
    } catch (err) {
      failed++;
      console.error(`[fetch-injuries] ${league} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed === 0) await recordRun(pool, "fetch-injuries");
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[fetch-injuries] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit -p . && npx eslint scripts/fetch-injuries.ts scripts/lib/injuries.ts tests`
Expected: no errors.

- [ ] **Step 7: Commit** (after approval)

```bash
git add scripts/lib/injuries.ts scripts/fetch-injuries.ts tests/injuries.test.ts
git commit -m "fix: replace injuries atomically and keep rows on a bad feed"
```

---

### Task 4: F1 weekend upsert keeps session dates and names current

**Files:**
- Create: `scripts/lib/f1-weekend.ts`, `tests/f1-weekend.test.ts`
- Modify: `scripts/fetch-f1-scores.ts`, `scripts/fetch-f1-standings.ts`, `scripts/lib/f1.ts:66-96` (`upsertF1StandingsForSeason`)

**Interfaces:**
- Consumes: `recordRun` (Task 2), `uniqueSlugFor(league, espnId, name)` from `scripts/lib/players.ts` (uses the global pool; in tests `DATABASE_URL` points at the test database, so both agree), `startTestDb`.
- Produces: `upsertF1Weekend(pool: Pool, event: any, seasonYear: number | null): Promise<{ sessions: number; results: number }>`. `upsertF1StandingsForSeason(pool, year)` now returns `Promise<{ rows: number; failedGroups: number }>` (backfill callers ignore the value).

- [ ] **Step 1: Write the failing test**

Create `tests/f1-weekend.test.ts`:

```ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/f1-weekend");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/f1-weekend");
});
after(async () => {
  await db.stop();
});

function weekend(o: { name: string; qualDate: string; qualState: string; winner: boolean }) {
  return {
    id: "evt1",
    name: o.name,
    shortName: "GP",
    date: "2026-09-18T10:00:00Z",
    endDate: "2026-09-20T18:00:00Z",
    competitions: [
      {
        id: "s-qual",
        date: o.qualDate,
        type: { abbreviation: "Qual" },
        status: { type: { state: o.qualState, detail: o.qualState, completed: o.qualState === "post" } },
        circuit: { fullName: "Test Circuit", address: { city: "Testville", country: "Testland" } },
        competitors: [
          { id: "d1", order: 1, winner: o.winner, athlete: { displayName: "Driver One" }, vehicle: { manufacturer: "Team A", number: "1" } },
          { id: "d2", order: 2, winner: false, athlete: { displayName: "Driver Two" }, vehicle: { manufacturer: "Team B", number: "2" } },
        ],
      },
    ],
  };
}

test("first save stores the event, session and results", async () => {
  const res = await lib.upsertF1Weekend(db.pool, weekend({ name: "Test Grand Prix", qualDate: "2026-09-19T14:00:00Z", qualState: "pre", winner: false }), 2026);
  assert.deepEqual(res, { sessions: 1, results: 2 });
});

test("a rescheduled session and a renamed event reach the database on the next run", async () => {
  await lib.upsertF1Weekend(db.pool, weekend({ name: "Test Grand Prix 2026", qualDate: "2026-09-19T16:30:00Z", qualState: "post", winner: true }), 2026);
  const session = (await db.pool.query("select date, status_state, completed from f1_sessions where espn_id = 's-qual'")).rows[0];
  assert.equal(session.date.toISOString(), "2026-09-19T16:30:00.000Z");
  assert.equal(session.status_state, "post");
  assert.equal(session.completed, true);
  const event = (await db.pool.query("select name, season_year from f1_events where espn_id = 'evt1'")).rows[0];
  assert.equal(event.name, "Test Grand Prix 2026");
  assert.equal(event.season_year, 2026);
  const winner = (await db.pool.query("select winner from f1_session_results where driver_espn_id = 'd1'")).rows[0];
  assert.equal(winner.winner, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/f1-weekend.test.ts`
Expected: FAIL — cannot find module `../scripts/lib/f1-weekend`.

- [ ] **Step 3: Write the library (moved from `fetch-f1-scores.ts`, with `date`, `name`, `short_name`, `season_year`, `session_type` now updated on conflict)**

Create `scripts/lib/f1-weekend.ts`:

```ts
import type { Pool } from "pg";
import { uniqueSlugFor } from "./players";

async function upsertDriver(pool: Pool, athleteId: string, name: string) {
  if (!athleteId || !name) return;
  const slug = await uniqueSlugFor("f1", athleteId, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug)
     values ('f1', $1, $2, $3)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [athleteId, name, slug]
  );
}

/**
 * Save one race weekend as ESPN's scoreboard returns it: the event, its sessions and each
 * session's classification. Session dates, event names and season year are refreshed on every run
 * so a rescheduled session or a corrected name reaches the site.
 */
export async function upsertF1Weekend(pool: Pool, event: any, seasonYear: number | null): Promise<{ sessions: number; results: number }> {
  const circuit = event.competitions?.[0]?.circuit;
  await pool.query(
    `insert into f1_events (espn_id, name, short_name, date, end_date, season_year, circuit_name, circuit_city, circuit_country, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (espn_id) do update set
       name = excluded.name, short_name = excluded.short_name,
       date = excluded.date, end_date = excluded.end_date,
       season_year = coalesce(excluded.season_year, f1_events.season_year),
       circuit_name = excluded.circuit_name, circuit_city = excluded.circuit_city,
       circuit_country = excluded.circuit_country, updated_at = now()`,
    [
      event.id,
      event.name,
      event.shortName ?? null,
      event.date,
      event.endDate ?? null,
      seasonYear,
      circuit?.fullName ?? null,
      circuit?.address?.city ?? null,
      circuit?.address?.country ?? null,
    ]
  );

  let sessions = 0;
  let results = 0;
  for (const comp of event.competitions ?? []) {
    await pool.query(
      `insert into f1_sessions (espn_id, event_espn_id, session_type, date, status_state, status_detail, completed, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (espn_id) do update set
         session_type = excluded.session_type, date = excluded.date,
         status_state = excluded.status_state, status_detail = excluded.status_detail,
         completed = excluded.completed, updated_at = now()`,
      [
        comp.id,
        event.id,
        comp.type?.abbreviation ?? null,
        comp.date,
        comp.status?.type?.state ?? null,
        comp.status?.type?.detail ?? null,
        Boolean(comp.status?.type?.completed),
      ]
    );
    sessions++;

    for (const c of comp.competitors ?? []) {
      const name = c.athlete?.displayName ?? c.athlete?.fullName;
      if (!c.id || !name) continue;
      await upsertDriver(pool, c.id, name);
      await pool.query(
        `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (session_espn_id, driver_espn_id) do update set
           position = excluded.position, winner = excluded.winner,
           constructor_name = coalesce(excluded.constructor_name, f1_session_results.constructor_name),
           car_number = coalesce(excluded.car_number, f1_session_results.car_number)`,
        [comp.id, c.id, c.order ?? null, Boolean(c.winner), c.vehicle?.manufacturer ?? null, c.vehicle?.number ?? null]
      );
      results++;
    }
  }
  return { sessions, results };
}
```

Note: `session_type` was `not null` in the schema; the original insert already passed `comp.type?.abbreviation ?? null`, so behaviour is unchanged for a missing type (the insert fails as before).

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test tests/f1-weekend.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Rewrite `fetch-f1-scores.ts`**

Replace its contents with:

```ts
// Recurring fetch of the current/most-recent race weekend — like tennis, F1's
// scoreboard endpoint always returns "whichever event is currently on" regardless of
// any date param (confirmed by testing), so this can't reach past weekends; see
// backfill-f1-events.ts for historical seasons.
import { pool } from "./lib/db";
import { fetchF1Scoreboard } from "./lib/f1";
import { upsertF1Weekend } from "./lib/f1-weekend";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const data = await fetchF1Scoreboard();
  const league = data.leagues?.[0];
  const event = data.events?.[0];
  if (!event) {
    console.log("[fetch-f1-scores] no current event found");
    await recordRun(pool, "fetch-f1-scores");
    await pool.end();
    return;
  }
  const { sessions, results } = await upsertF1Weekend(pool, event, league?.season?.year ?? null);
  console.log(`[fetch-f1-scores] ${event.name}: ${sessions} sessions, ${results} results`);
  await recordRun(pool, "fetch-f1-scores");
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-scores] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Make the standings helper report failures, and record the heartbeat**

In `scripts/lib/f1.ts`, change the signature and body of `upsertF1StandingsForSeason` so it returns `{ rows, failedGroups }`:

```ts
export async function upsertF1StandingsForSeason(pool: import("pg").Pool, seasonYear: number): Promise<{ rows: number; failedGroups: number }> {
  const data = await fetchF1Standings(seasonYear);
  let total = 0;
  let failedGroups = 0;
  for (const item of data.items ?? []) {
```

Inside the loop, after `count++` add nothing; after the `console.log` line inside `try` add `total += count;`; in the `catch` add `failedGroups++;` before/after the existing `console.error`; after the `for` loop end add `return { rows: total, failedGroups };`. (Keep every other line as is.)

Replace `scripts/fetch-f1-standings.ts` with:

```ts
// Recurring fetch of the current season's Driver and Constructor standings. See
// backfill-f1-standings.ts for every past season — this only ever covers the current
// year, run on a schedule the same way fetch-f1-scores.ts is.
import { pool } from "./lib/db";
import { upsertF1StandingsForSeason } from "./lib/f1";
import { recordRun } from "./lib/heartbeat";

async function main() {
  const seasonYear = new Date().getUTCFullYear();
  const { failedGroups } = await upsertF1StandingsForSeason(pool, seasonYear);
  if (failedGroups === 0) await recordRun(pool, "fetch-f1-standings");
  await pool.end();
  if (failedGroups > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[fetch-f1-standings] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 7: Type-check, lint, run all tests**

Run: `npx tsc --noEmit -p . && npx eslint scripts tests && npm test`
Expected: no type or lint errors; every test passes.

- [ ] **Step 8: Commit** (after approval)

```bash
git add scripts/lib/f1-weekend.ts scripts/fetch-f1-scores.ts scripts/fetch-f1-standings.ts scripts/lib/f1.ts tests/f1-weekend.test.ts
git commit -m "fix: refresh F1 session dates and names; record scraper heartbeats"
```

---

### Task 5: VM job runner (`tick`, `daily`, `hourly`)

**Files:**
- Create: `deploy/vm/scrape.sh`, `tests/scrape-runner.test.ts`

**Interfaces:**
- Consumes: npm scripts `check:live`, `seed:teams`, `fetch:all`, `fetch:tennis-daily`, `fetch:cricket-series`, `migrate`, `fetch:tennis-rankings`, `import:cricket-espn`, `fetch:fixtures`, `seed:f1-teams`, `fetch:injuries`, `fetch:f1-scores`, `fetch:f1-standings`, `check:stale`.
- Produces: `deploy/vm/scrape.sh <tick|daily|hourly>`; exit 0 when every step succeeded, 1 when any step failed (all remaining steps still run), 2 for an unknown job. Honours `SCRAPE_DIR` (default `/opt/sportsdb/scrapers`).

- [ ] **Step 1: Write the failing test (stub `npm` and `git` record every call)**

Create `tests/scrape-runner.test.ts`:

```ts
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const RUNNER = resolve(process.cwd(), "deploy/vm/scrape.sh");
let bin: string;
let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "scrape-runner-"));
  bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "package-lock.json"), "{}");
  // Stub npm: log the call and the scope env, emulate check:live's outputs, fail on demand.
  writeFileSync(
    join(bin, "npm"),
    `#!/bin/sh
echo "npm $* | MODE=\${SCRAPE_MODE-} LEAGUES=\${SCRAPE_LEAGUES-} FORCE=\${FORCE_SCRAPE-}" >> "$STUB_LOG"
case "$*" in
  *check:live*) printf 'should_scrape=%s\\nmode=live\\nleagues=%s\\n' "$STUB_SHOULD" "$STUB_LEAGUES" >> "$GITHUB_OUTPUT" ;;
esac
case "$*" in *"$STUB_FAIL"*) [ -n "$STUB_FAIL" ] && exit 1 ;; esac
exit 0
`
  );
  writeFileSync(join(bin, "git"), `#!/bin/sh\necho "git $*" >> "$STUB_LOG"\n`);
  chmodSync(join(bin, "npm"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
});

function run(job: string, env: Record<string, string> = {}) {
  const log = join(dir, `${job}-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(log, "");
  const res = spawnSync("bash", [RUNNER, job], {
    env: { PATH: `${bin}:/usr/bin:/bin`, SCRAPE_DIR: dir, STUB_LOG: log, STUB_SHOULD: "false", STUB_LEAGUES: "", STUB_FAIL: "", ...env },
    encoding: "utf8",
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: res.status, calls, stderr: res.stderr };
}

test("idle tick: checks live games, then only the always-on tennis and cricket feeds", () => {
  const { status, calls } = run("tick");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((c) => c.split(" | ")[0]),
    ["npm run --silent check:live", "npm run --silent fetch:tennis-daily", "npm run --silent fetch:cricket-series -- --days 1 --ahead 2"]
  );
  assert.match(calls[0], /FORCE=false/);
});

test("live tick: scopes seed and fetch to the flagged leagues in live mode", () => {
  const { status, calls } = run("tick", { STUB_SHOULD: "true", STUB_LEAGUES: "nba,epl" });
  assert.equal(status, 0);
  assert.ok(calls.includes("npm run --silent seed:teams | MODE= LEAGUES=nba,epl FORCE="));
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=live LEAGUES=nba,epl FORCE="));
});

test("daily: updates code, migrates first, runs a full unscoped fetch, then the daily-only steps", () => {
  const { status, calls } = run("daily");
  assert.equal(status, 0);
  const steps = calls.map((c) => c.split(" | ")[0]);
  assert.equal(steps[0], "git pull --ff-only --quiet");
  assert.equal(steps[1], "npm run --silent migrate");
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=full LEAGUES= FORCE="));
  for (const s of ["fetch:fixtures", "import:cricket-espn", "fetch:tennis-rankings", "seed:f1-teams"]) {
    assert.ok(steps.some((x) => x.includes(s)), `daily should run ${s}`);
  }
  assert.ok(steps.includes("npm run --silent fetch:cricket-series -- --days 10 --ahead 90"));
});

test("hourly: injuries, F1 scores and standings, then the stale check last", () => {
  const { status, calls } = run("hourly");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((c) => c.split(" | ")[0]),
    ["npm run --silent fetch:injuries", "npm run --silent fetch:f1-scores", "npm run --silent fetch:f1-standings", "npm run --silent check:stale"]
  );
});

test("a failing step does not stop later steps, but the job exits 1", () => {
  const { status, calls } = run("hourly", { STUB_FAIL: "fetch:injuries" });
  assert.equal(status, 1);
  assert.equal(calls.length, 4);
});

test("unknown job exits 2", () => {
  assert.equal(run("nonsense").status, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test tests/scrape-runner.test.ts`
Expected: FAIL — `deploy/vm/scrape.sh` does not exist (spawn exits 127).

- [ ] **Step 3: Write the runner**

Create `deploy/vm/scrape.sh` and `chmod +x` it:

```bash
#!/usr/bin/env bash
# Scheduled scraper jobs for the Oracle VM. Mirrors .github/workflows/scrape.yml step for step
# (GitHub's cron ran it about every 3 hours instead of every 15 minutes); systemd timers call
# `scrape.sh <tick|daily|hourly>`. A failing step is recorded but never stops later, independent
# steps; the job exits 1 if any step failed so systemd and journalctl show it.
set -uo pipefail

cd "${SCRAPE_DIR:-/opt/sportsdb/scrapers}"

failed=0

# run <npm-script> [-- args]: run one scraper step, remember a failure, keep going.
run() {
  echo "[scrape] $(date -u +%H:%M:%S) npm run $*"
  npm run --silent "$@" || { echo "[scrape] FAILED: $*" >&2; failed=1; }
}

# The daily job pulls the latest main so scraper fixes reach the VM without a manual deploy.
update_code() {
  local before after
  before="$(cksum package-lock.json)"
  git pull --ff-only --quiet || { echo "[scrape] git pull failed" >&2; failed=1; return; }
  after="$(cksum package-lock.json)"
  if [ "$before" != "$after" ]; then
    echo "[scrape] package-lock.json changed - npm ci"
    npm ci --no-audit --no-fund || { echo "[scrape] npm ci failed" >&2; failed=1; }
  fi
}

# Two scoreboard requests per league decide whether the real fetch runs, and for which leagues.
job_tick() {
  local out should_scrape mode leagues
  out="$(mktemp)"
  GITHUB_OUTPUT="$out" FORCE_SCRAPE=false run check:live
  should_scrape="$(sed -n 's/^should_scrape=//p' "$out")"
  mode="$(sed -n 's/^mode=//p' "$out")"
  leagues="$(sed -n 's/^leagues=//p' "$out")"
  rm -f "$out"
  if [ "$should_scrape" = "true" ]; then
    SCRAPE_LEAGUES="$leagues" run seed:teams
    SCRAPE_MODE="$mode" SCRAPE_LEAGUES="$leagues" run fetch:all
  fi
  # Tennis and cricket run all day in every time zone, so these feeds are read on every tick.
  run fetch:tennis-daily
  run fetch:cricket-series -- --days 1 --ahead 2
}

# Full update of every league, plus the once-a-day sweeps.
job_daily() {
  update_code
  run migrate
  run seed:teams
  SCRAPE_MODE=full SCRAPE_LEAGUES= run fetch:all
  run fetch:tennis-daily
  run fetch:cricket-series -- --days 1 --ahead 2
  run fetch:cricket-series -- --days 10 --ahead 90
  run fetch:tennis-rankings
  run fetch:tennis-daily -- --calendar --days 1 --ahead 1
  run import:cricket-espn
  run fetch:fixtures
  run seed:f1-teams
}

# Feeds the old workflow never scheduled, then the alarm for any scraper that stopped.
job_hourly() {
  run fetch:injuries
  run fetch:f1-scores
  run fetch:f1-standings
  run check:stale
}

case "${1:-}" in
  tick) job_tick ;;
  daily) job_daily ;;
  hourly) job_hourly ;;
  *) echo "usage: scrape.sh <tick|daily|hourly>" >&2; exit 2 ;;
esac

exit "$failed"
```

- [ ] **Step 4: Run to verify it passes**

Run: `chmod +x deploy/vm/scrape.sh && npx tsx --test tests/scrape-runner.test.ts && bash -n deploy/vm/scrape.sh`
Expected: 6 tests pass; `bash -n` prints nothing.

- [ ] **Step 5: Commit** (after approval)

```bash
git add deploy/vm/scrape.sh tests/scrape-runner.test.ts
git commit -m "feat: VM scraper job runner (tick, daily, hourly)"
```

---

### Task 6: systemd units and installer

**Files:**
- Create: `deploy/vm/systemd/sportsdb-scrape@.service`, `deploy/vm/systemd/sportsdb-scrape-tick.timer`, `deploy/vm/systemd/sportsdb-scrape-daily.timer`, `deploy/vm/systemd/sportsdb-scrape-hourly.timer`, `deploy/vm/install.sh`

**Interfaces:**
- Consumes: `deploy/vm/scrape.sh` (Task 5); `/opt/sportsdb/scrape.env` (created in Task 8); checkout at `/opt/sportsdb/scrapers`.
- Produces: enabled timers `sportsdb-scrape-{tick,daily,hourly}.timer`.

- [ ] **Step 1: Write the service template**

`deploy/vm/systemd/sportsdb-scrape@.service`:

```ini
[Unit]
Description=SportsDB scraper job %i
After=network-online.target pgbouncer.service
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/opt/sportsdb/scrapers
EnvironmentFile=/opt/sportsdb/scrape.env
ExecStart=/opt/sportsdb/scrapers/deploy/vm/scrape.sh %i
TimeoutStartSec=4h
Nice=10
```

`NODE_ENV` is left unset on purpose: the scripts run through `tsx`, a dev dependency installed by `npm ci`.

- [ ] **Step 2: Write the three timers**

`sportsdb-scrape-tick.timer`:

```ini
[Unit]
Description=SportsDB live-game tick (every 15 minutes)

[Timer]
OnCalendar=*:0/15
AccuracySec=10s
Unit=sportsdb-scrape@tick.service

[Install]
WantedBy=timers.target
```

`sportsdb-scrape-daily.timer`:

```ini
[Unit]
Description=SportsDB daily full update (06:07 UTC)

[Timer]
OnCalendar=*-*-* 06:07:00 UTC
Persistent=true
Unit=sportsdb-scrape@daily.service

[Install]
WantedBy=timers.target
```

`sportsdb-scrape-hourly.timer`:

```ini
[Unit]
Description=SportsDB hourly feeds: injuries, F1, stale check

[Timer]
OnCalendar=*-*-* *:22:00
AccuracySec=30s
Unit=sportsdb-scrape@hourly.service

[Install]
WantedBy=timers.target
```

A running oneshot service is not started twice, so a slow run makes the next trigger a no-op instead of overlapping.

- [ ] **Step 3: Write the installer**

`deploy/vm/install.sh` (`chmod +x`):

```bash
#!/usr/bin/env bash
# Install and enable the scraper timers. Run on the VM: sudo bash deploy/vm/install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
install -m 644 "$here"/systemd/sportsdb-scrape@.service "$here"/systemd/sportsdb-scrape-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sportsdb-scrape-tick.timer sportsdb-scrape-daily.timer sportsdb-scrape-hourly.timer
systemctl list-timers 'sportsdb-scrape-*' --no-pager
```

- [ ] **Step 4: Validate locally**

Run: `bash -n deploy/vm/install.sh && (which systemd-analyze >/dev/null 2>&1 && systemd-analyze verify deploy/vm/systemd/*.timer || echo "systemd-analyze not on this machine; units are validated on the VM in Task 8")`
Expected: no syntax error. The unit files are verified on the VM in Task 8 with `systemd-analyze verify`.

- [ ] **Step 5: Commit** (after approval)

```bash
git add deploy/vm
git commit -m "feat: systemd timers for the VM scraper schedule"
```

---

### Task 7: Review gate, commit and push (needs the user's explicit approval)

- [ ] **Step 1: Full verification before asking**

Run: `npx tsc --noEmit -p . && npx eslint . && npm test`
Expected: no type errors, no lint errors, all tests pass. Show the user the output and `git diff --stat`.

- [ ] **Step 2: Ask for approval**

Tell the user exactly what will be committed (commits from Tasks 1–6), that it pushes to `origin/main`, and that nothing runs on the VM until Task 8. Wait for a clear yes. Then push: `git push origin main`.

---

### Task 8: VM cut-over (each command shown to the user first; all read/verify steps are reversible)

**Files:** none in the repo except the `scrape.yml` schedule removal at the end.

- [ ] **Step 1: Prepare the scraper checkout**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'sudo install -d -o ubuntu -g ubuntu /opt/sportsdb/scrapers && git clone https://github.com/PoojaPS17/sports-stats-site.git /opt/sportsdb/scrapers && cd /opt/sportsdb/scrapers && npm ci --no-audit --no-fund'
```
Expected: clone completes; `npm ci` installs (about 2–4 minutes, several hundred MB; the VM has 90 GB free).

- [ ] **Step 2: Create the scraper environment file from the app's, on the VM (no secret passes through this session)**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'grep "^DATABASE_URL=" /opt/sportsdb/repo/.env.production | install -m 600 /dev/stdin /opt/sportsdb/scrape.env && sed -E "s/=.*/=<hidden>/" /opt/sportsdb/scrape.env'
```
Expected: prints `DATABASE_URL=<hidden>`.

- [ ] **Step 3: Apply the schema (adds `scrape_runs`; additive, idempotent)**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'cd /opt/sportsdb/scrapers && set -a && . /opt/sportsdb/scrape.env && set +a && npm run --silent migrate'
```
Expected: `[migrate] schema applied`.

- [ ] **Step 4: Install the units and check them**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'cd /opt/sportsdb/scrapers && sudo systemd-analyze verify deploy/vm/systemd/sportsdb-scrape@.service deploy/vm/systemd/sportsdb-scrape-*.timer; sudo bash deploy/vm/install.sh'
```
Expected: no errors from `verify`; `list-timers` shows tick, daily and hourly timers with next-run times.

- [ ] **Step 5: Run the new hourly job once by hand and verify the data**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'sudo systemctl start sportsdb-scrape@hourly.service; journalctl -u sportsdb-scrape@hourly.service --no-pager -n 40'
npm run audit:freshness | head -20
```
Expected: journal shows the injuries, F1 and stale-check steps succeeding; `injuries` and `f1_*` are minutes old instead of days; `select * from scrape_runs` has three rows.

- [ ] **Step 6: Watch the tick timer for one hour**

```bash
ssh -i tools/oci/id_ed25519 ubuntu@129.225.84.102 'systemctl list-timers "sportsdb-scrape-*" --no-pager; journalctl -u "sportsdb-scrape@tick.service" --since "1 hour ago" --no-pager | grep -E "Started|Finished|Failed|FAILED|check-live" | tail -30'
```
Expected: a run every 15 minutes at :00/:15/:30/:45 (compare GitHub's ~3-hour median gap), each finishing in a few minutes with no `FAILED`.

- [ ] **Step 7: Retire the GitHub schedule for `scrape.yml` only (needs commit/push approval again)**

In `.github/workflows/scrape.yml` remove the whole `schedule:` block (both cron lines and their comments) but keep `workflow_dispatch: {}`. Leave `scrape-rosters.yml`, `scrape-trending.yml` and `scrape-cricsheet.yml` unchanged. Commit `chore: scrape schedule now runs from the Oracle VM`. Push only after approval.

- [ ] **Step 8: Re-measure after 24 hours**

Run `npm run audit:freshness | tee .../freshness-after.txt` and compare with `freshness-before.txt`. Success: injuries and F1 under 2 hours old, `games`/`standings` updated within the last 30 minutes on a match day, `check:stale` passing.

Rollback: `sudo systemctl disable --now sportsdb-scrape-tick.timer sportsdb-scrape-daily.timer sportsdb-scrape-hourly.timer` on the VM and restore the `schedule:` block in `scrape.yml`.

---

## Self-review against the spec

- **A1 baseline:** Task 1 (`audit-freshness`) is the freshness baseline. The page ↔ database ↔ ESPN comparison is delivered by the Task 3 audit (systematic-debugging) that follows this plan, because it needs the findings from this plan's fixes to separate old mismatches from new ones.
- **A2 scheduling:** Tasks 5, 6, 8 (moved from GitHub to VM timers; hourly injuries/F1, `seed:f1-teams` in daily; `fetch:tennis-scores` intentionally not scheduled).
- **A3 heartbeat + stale check:** Tasks 2–4 and the `hourly` job's last step.
- **A4 concurrency:** systemd runs a oneshot service once at a time (Task 6 note); GitHub workflows that remain (rosters, trending, cricsheet) keep their default behaviour.
- **A5 injuries atomic:** Task 3.
- **A6 audit + `f1_sessions.date` fix:** date/name fix in Task 4; the wider audit follows.
- Types checked: `recordRun`, `findStale`, `replaceLeagueInjuries`, `upsertF1Weekend`, `upsertF1StandingsForSeason` signatures match across tasks.
