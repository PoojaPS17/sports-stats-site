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

test("buildSection reports the commit and build time the config exposed", async () => {
  const { buildSection } = await import("../src/lib/opsReport");
  process.env.NEXT_PUBLIC_BUILD_COMMIT = "abc1234";
  process.env.NEXT_PUBLIC_BUILD_TIME = "2026-09-28T10:00:00.000Z";
  const s = buildSection();
  assert.ok(s.ok);
  assert.deepEqual(s.data, { commit: "abc1234", builtAt: "2026-09-28T10:00:00.000Z" });
});

test("heartbeatsSection flags a scraper past its limit and one that never ran", async () => {
  const { heartbeatsSection } = await import("../src/lib/opsReport");
  await db.pool.query(`insert into scrape_runs (scraper, last_ok_at) values
    ('scrape-tick', now() - interval '10 minutes'),
    ('fetch-injuries', now() - interval '5 hours')`);
  const s = await heartbeatsSection(db.pool);
  assert.ok(s.ok);
  const byName = Object.fromEntries(s.data.map((h) => [h.scraper, h]));
  assert.equal(byName["scrape-tick"].stale, false);
  assert.equal(byName["fetch-injuries"].stale, true);
  assert.equal(byName["fetch-injuries"].limitMinutes, 120);
  assert.equal(byName["fetch-f1-scores"].ageMinutes, null, "a limit with no row reports null age");
  assert.equal(byName["fetch-f1-scores"].stale, true);
});

test("opsReport never throws for one broken section", async () => {
  const { opsReport } = await import("../src/lib/opsReport");
  const report = await opsReport(db.pool);
  assert.equal(report.build.ok, true);
  assert.equal(report.heartbeats.ok, true);
  assert.equal(typeof report.generatedAt, "string");
});

test("freshnessSection reports the newest stamp per table and per league", async () => {
  const { freshnessSection } = await import("../src/lib/opsReport");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba','1','A','a'), ('nba','2','B','b')`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, updated_at) values
    ('nba','g1', now() - interval '2 days', 'A v B', '1', '2', true, now() - interval '2 days'),
    ('nba','g2', now() + interval '1 day', 'B v A', '2', '1', false, now())`);
  const s = await freshnessSection(db.pool);
  assert.ok(s.ok);
  const games = s.data.tables.find((t) => t.table === "games");
  assert.ok(games && games.newest && games.ageHours !== null && games.ageHours < 1);
  const nba = s.data.leagues.find((l) => l.league === "nba");
  assert.ok(nba);
  assert.ok(nba.newestCompleted && nba.newestScheduled);
  assert.equal(nba.completedLast7Days, 1);
});

test("volumeSection compares the last day with the previous week", async () => {
  const { volumeSection } = await import("../src/lib/opsReport");
  for (let d = 1; d <= 7; d++) {
    await db.pool.query(`insert into game_views (league, game_espn_id, viewed_at) values ('nba','g1', now() - ($1 || ' days')::interval)`, [d]);
  }
  // The brief's original fixture put a second row exactly at "now() - interval '1 day'" to probe the
  // 24h boundary, expecting it to land inside the window. It cannot: the row's timestamp is fixed at
  // insert time, but the section query's own now() runs strictly later, so by query time the row is
  // always slightly *more* than 24h old and falls into the prev7d bucket instead, deterministically
  // (verified by running the original fixture: last24h came back 1, not 2, every time). Two rows well
  // inside the window (1h and 2h ago) test the same "last24h counts recent rows" behaviour without
  // depending on a race between two now() calls.
  await db.pool.query(`insert into game_views (league, game_espn_id, viewed_at) values
    ('nba','g1', now() - interval '1 hour'),
    ('nba','g1', now() - interval '2 hours')`);
  const s = await volumeSection(db.pool);
  assert.ok(s.ok);
  const views = s.data.find((t) => t.table === "game_views");
  assert.ok(views);
  assert.equal(views.last24h, 2, "both recent rows fall inside the 24h window");
  assert.ok(views.dailyMean7d > 0);
});
