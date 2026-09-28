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

test("duplicatesSection finds the same fixture, player, tennis match and article stored twice, and a cricket score that disagrees", async () => {
  const { duplicatesSection } = await import("../src/lib/opsReport");
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, home_score, away_score) values
    ('nba','d1', '2026-09-20T02:00:00Z', 'A v B', '1', '2', true, 100, 90),
    ('nba','d2', '2026-09-20T02:00:00Z', 'A v B', '1', '2', true, 100, 90),
    ('ipl','c1', '2026-05-01T14:00:00Z', 'X v Y', '10', '11', true, 180, 170),
    ('nba','c2', '2026-05-01T14:00:00Z', 'X v Y', '10', '11', true, 90, 80)`);
  await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values
    ('ipl','p1','10','Rohit Sharma','rohit-sharma'), ('ipl','p2','10','rohit sharma','rohit-sharma-2'), ('ipl','p3','11','Rohit Sharma','rohit-sharma-3')`);
  await db.pool.query(`insert into tennis_matches (tour, espn_id, tournament_name, round, date, player1_espn_id, player2_espn_id, tournament_espn_id) values
    ('atp','t1','Open','R16','2026-09-01T10:00:00Z','a','b','189-2026'), ('atp','t2','Open','R16','2026-09-01T10:00:00Z','a','b','189-2026')`);
  // league_candidates scopes the join to games rows in the same sport; c1 (ipl) matches its games row,
  // c2 shares its espn_id with an nba games row purely by coincidence (a football/basketball id landing
  // on the same string as a cricket one) and must NOT be compared against it.
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, home, away, league_candidates) values
    ('c1','s1','2026-05-01T14:00:00Z','X v Y','{"id":"10","score":"181/5"}','{"id":"11","score":"170"}','{ipl}'),
    ('c2','s1','2026-05-01T14:00:00Z','X v Y','{"id":"10","score":"181/5"}','{"id":"11","score":"170"}','{bbl}')`);
  await db.pool.query(`insert into news_articles (league, article_id, headline, link) values
    ('nba','n1','H','https://e/x'), ('nba','n2','H2','https://e/x')`);
  const s = await duplicatesSection(db.pool);
  assert.ok(s.ok);
  assert.equal(s.data.games.count, 1);
  assert.equal(s.data.players.count, 1, "same name on the same team only; the other team's Rohit is a different player");
  assert.equal(s.data.tennisMatches.count, 1);
  assert.equal(s.data.cricketScoreMismatch.count, 1, "c2's league_candidates (bbl) does not include the nba games row it happens to share an id with, so it is not compared");
  assert.equal(s.data.newsArticles.count, 1);
  assert.ok(s.data.games.examples[0].includes("d1"));
});

test("scrapingSection counts finished games rewritten long after they finished", async () => {
  const { scrapingSection } = await import("../src/lib/opsReport");
  // scrapingSection and integritySection scan the whole games table with no per-test scoping (that's
  // the point: they're meant to see every row). This test file shares one long-lived db across all
  // tests in it, so earlier tests' fixtures (freshnessSection's g1, duplicatesSection's d1/d2/c1) are
  // still sitting in the table and would otherwise be picked up by this section's broad predicates.
  // Clear it so each test here starts from a clean table, same as if it had run alone.
  await db.pool.query(`delete from games`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, updated_at) values
    ('nfl','r1', now() - interval '10 days', 'Old', '1', '2', true, now() - interval '1 hour'),
    ('nfl','r2', now() - interval '10 days', 'Old settled', '1', '2', true, now() - interval '9 days'),
    ('nfl','r3', now() - interval '1 day', 'Fresh', '1', '2', true, now() - interval '1 hour')`);
  const s = await scrapingSection(db.pool);
  assert.ok(s.ok);
  assert.equal(s.data.refetchedFinished.count, 1);
  assert.ok(s.data.refetchedFinished.examples[0].includes("r1"));
  assert.equal(typeof s.data.tickAgeMinutes, "number");
});

test("integritySection finds the classes of broken row the site has been bitten by", async () => {
  const { integritySection } = await import("../src/lib/opsReport");
  // Same shared-db reasoning as scrapingSection's test above: clear games first so this section's
  // whole-table predicates (completedNoScore etc.) see only this test's own fixtures, not the
  // scrapingSection test's r1/r2/r3 left behind in the table.
  await db.pool.query(`delete from games`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, home_score, away_score, season_year) values
    ('epl','i1', now() - interval '3 days', 'No score', '1', '2', true, null, null, 2026),
    ('epl','i2', now() - interval '3 days', 'No box', '1', '2', true, 2, 1, 2026),
    ('epl','i3', '2031-01-01T00:00:00Z', 'Far future', '1', '2', false, null, null, 2031)`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id) values ('epl','missing-game','p9')`);
  await db.pool.query(`insert into player_season_stats (league, season, player_espn_id) values ('epl', 2026, 'nobody')`);
  await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, draws, points) values ('epl', 2026, '1', 3, 1, 1, 10)`);
  await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, draws, points, games_behind) values ('epl', 2026, '2', 2, 2, 2, 9, '6')`);
  await db.pool.query(`insert into f1_events (espn_id, name, date) values ('e1','GP', now() - interval '5 days')`);
  await db.pool.query(`insert into f1_sessions (espn_id, event_espn_id, session_type, date, completed) values ('s1','e1','Race', now() - interval '5 days', true)`);
  const s = await integritySection(db.pool);
  assert.ok(s.ok);
  assert.equal(s.data.completedNoScore.count, 1);
  assert.equal(s.data.completedNoBoxScore.find((l) => l.league === "epl")?.count, 2, "i1 and i2 finished 3 days ago with no box score");
  assert.equal(s.data.gamesFarFromToday.count, 1);
  assert.equal(s.data.orphanGameStats.count, 1);
  assert.equal(s.data.orphanSeasonStats.count, 1);
  assert.equal(s.data.standingsSumMismatch.count, 1);
  assert.equal(s.data.f1SessionsNoResult.count, 1);
});

test("backupSection reports absence honestly and reads a dump directory", async () => {
  const { backupSection } = await import("../src/lib/opsReport");
  const { mkdtempSync, writeFileSync, utimesSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  assert.deepEqual(backupSection("/definitely/not/here"), { ok: true, data: { present: false, newest: null, previousBytes: null } });
  const dir = mkdtempSync(join(tmpdir(), "dumps-"));
  writeFileSync(join(dir, "sportsdb-20260927.dump"), "x".repeat(100));
  writeFileSync(join(dir, "sportsdb-20260928.dump"), "x".repeat(120));
  const old = new Date(Date.now() - 26 * 3_600_000);
  utimesSync(join(dir, "sportsdb-20260927.dump"), old, old);
  const s = backupSection(dir);
  assert.ok(s.ok && s.data.present && s.data.newest);
  assert.equal(s.data.newest.name, "sportsdb-20260928.dump");
  assert.equal(s.data.newest.bytes, 120);
  assert.equal(s.data.previousBytes, 100);
});

test("dbHealthSection reads sizes, dead rows and connections", async () => {
  const { dbHealthSection } = await import("../src/lib/opsReport");
  const s = await dbHealthSection(db.pool);
  assert.ok(s.ok);
  assert.ok(s.data.sizeBytes > 0);
  assert.ok(s.data.largestTables.length > 0 && s.data.largestTables.length <= 5);
  assert.ok(s.data.connections.max > 0);
});

test("viewsSection splits yesterday and today", async () => {
  const { viewsSection } = await import("../src/lib/opsReport");
  await db.pool.query(`delete from game_views`);
  await db.pool.query(`insert into game_views (league, game_espn_id, viewed_at, country, platform) values
    ('nba','g1', (date_trunc('day', now() at time zone 'utc') - interval '2 hours') at time zone 'utc', 'IN', 'ios'),
    ('nba','g1', (date_trunc('day', now() at time zone 'utc') - interval '3 hours') at time zone 'utc', 'IN', 'desktop'),
    ('nba','g2', (date_trunc('day', now() at time zone 'utc') - interval '4 hours') at time zone 'utc', 'US', 'android')`);
  const s = await viewsSection(db.pool);
  assert.ok(s.ok);
  assert.equal(s.data.yesterday.total, 3);
  assert.equal(s.data.yesterday.topGames[0].id, "g1");
  assert.equal(s.data.yesterday.topGames[0].views, 2);
  assert.equal(s.data.yesterday.byCountry.IN, 2);
  assert.equal(s.data.yesterday.byPlatform.android, 1);
});
