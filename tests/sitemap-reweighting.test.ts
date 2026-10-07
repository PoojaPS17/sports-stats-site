import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { absoluteUrl } from "../src/lib/site";

// The 2026-10-07 re-weighting: cricket (61% of impressions) gets its own small sitemaps with
// honest dates, and the bulk player files list only players and seasons of the current and
// previous season, so Googlebot's discovery budget goes to the pages that earn.

let db: TestDb;
let sitemap: typeof import("../src/lib/sitemap");

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const urls = async (id: string) => new Set((await sitemap.sitemapEntries(id)).map((e) => e.url));
const lastmod = async (id: string, path: string) => {
  const e = (await sitemap.sitemapEntries(id)).find((x) => x.url === absoluteUrl(path));
  assert.ok(e, `${id} lists ${path}`);
  return e.lastModified ? new Date(e.lastModified as string | Date).getTime() : null;
};
const near = (actual: number | null, expected: number, label: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 120_000, `${label}: ${actual && new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`);

async function series(id: string, opts: { updated?: string } = {}) {
  await db.pool.query(
    `insert into cricket_series (espn_id, name, kind, start_date, end_date, updated_at) values ($1, $1, 'domestic', $2, $3, $4)`,
    [id, ago(40), ago(1), opts.updated ?? ago(20)]
  );
}
async function match(id: string, seriesId: string, date: string, state: string, updated: string, candidates: string[] = []) {
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, updated_at, league_candidates) values ($1, $2, $3, $1, $4, $5, $6)`,
    [id, seriesId, date, state, updated, candidates]
  );
}
async function game(league: string, id: string, season: number, completed: boolean) {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ($1, $2, $3, $2, '1', '2', $4, $5)`,
    [league, id, completed ? ago(100) : ahead(100), season, completed]
  );
}
async function player(league: string, id: string, games: string[], seasons: number[] = []) {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ($1, $2, $2, $2)`, [league, id]);
  for (const g of games) {
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, stats) values ($1, $2, $3, $4)`, [
      league, g, id, JSON.stringify({ box: { MIN: "30", PTS: "10" }, match: { APP: "1" } }),
    ]);
  }
  for (const s of seasons) await db.pool.query(`insert into player_season_stats (league, season, player_espn_id) values ($1, $2, $3)`, [league, s, id]);
}

before(async () => {
  db = await startTestDb();
  sitemap = await import("../src/lib/sitemap");

  // Cricket: one series with matches of every shape.
  await series("s1");
  await match("m-recent", "s1", ago(10), "post", ago(9));
  await match("m-old", "s1", ago(200), "post", ago(199));
  await match("m-ancient", "s1", ago(400), "post", ago(399));
  await match("m-soon", "s1", ahead(5), "pre", ago(1));
  await match("m-far", "s1", ahead(20), "pre", ago(1));
  await match("m-live", "s1", ago(1), "in", ago(0));
  // Finished a month ago and touched by a refetch today (a venue fill, a relabel): the page did not change today.
  await match("m-touched", "s1", ago(30), "post", ago(0));
  // Finished and last touched the day after it started, before the five-day clamp.
  await match("m-settled", "s1", ago(30), "post", ago(29));
  // Called off ahead of time: finished with a start date still ahead.
  await match("m-called-off", "s1", ahead(10), "post", ago(0));
  // An international with a scorecard under its league: listed in games-t20i, not here.
  await match("m-intl", "s1", ago(3), "post", ago(2), ["t20i"]);
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ('t20i', 'm-intl', $1, 'm-intl', '1', '2', 2026, true)`,
    [ago(3)]
  );

  // Series dates: s2's own row is old, its newest figure is its stats rows.
  await series("s2", { updated: ago(30) });
  await match("m-s2", "s2", ago(10), "post", ago(9));
  await db.pool.query(
    `insert into cricket_series_player_stats (match_espn_id, series_espn_id, player_espn_id, player_name, team_espn_id, updated_at) values ('m-s2', 's2', 'p', 'p', 't', $1)`,
    [ago(2)]
  );
  // s3: its only match is a fixture ahead, whose row was written today.
  await series("s3", { updated: ago(30) });
  await match("m-s3", "s3", ahead(30), "pre", ago(0));

  // NBA: three completed seasons plus next season's schedule already loaded.
  for (const [id, season, done] of [["g24", 2024, true], ["g25", 2025, true], ["g26", 2026, true], ["g27", 2027, false]] as const) await game("nba", id, season, done);
  await player("nba", "everyone", ["g24", "g25", "g26"]);
  await player("nba", "retired", ["g24"]);
  await player("nba", "stats-now", [], [2026]);
  await player("nba", "stats-then", [], [2023]);
  // Cricket player pages are exempt: a 2019 appearance keeps a t20i player listed.
  await game("t20i", "c19", 2019, true);
  await game("t20i", "c26", 2026, true);
  await player("t20i", "veteran", ["c19"]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("cricket series and matches have their own sitemaps, listed first, and leave core", async () => {
  assert.deepEqual(sitemap.SITEMAP_IDS.slice(0, 3), ["cricket-matches", "cricket-series", "core"]);
  assert.ok((await urls("cricket-series")).has(absoluteUrl("/cricket/series/s1")));
  assert.ok((await urls("cricket-matches")).has(absoluteUrl("/cricket/matches/m-recent")));
  const core = await urls("core");
  assert.ok(core.has(absoluteUrl("/cricket/series")), "the hub stays in core");
  for (const u of core) assert.ok(!/\/cricket\/(series|matches)\/./.test(u), `core still lists ${u}`);
});

test("the matches sitemap covers a year back and two weeks ahead, without archived internationals", async () => {
  const listed = await urls("cricket-matches");
  for (const id of ["m-recent", "m-old", "m-soon", "m-live"]) assert.ok(listed.has(absoluteUrl(`/cricket/matches/${id}`)), id);
  for (const id of ["m-ancient", "m-far", "m-intl"]) assert.ok(!listed.has(absoluteUrl(`/cricket/matches/${id}`)), `${id} listed`);
});

test("a finished match's lastmod is its last data change, clamped to five days after the start", async () => {
  near(await lastmod("cricket-matches", "/cricket/matches/m-touched"), Date.now() - 25 * DAY, "touched today -> start + 5 days");
  near(await lastmod("cricket-matches", "/cricket/matches/m-settled"), Date.now() - 29 * DAY, "settled early -> its own updated_at");
  near(await lastmod("cricket-matches", "/cricket/matches/m-live"), Date.now(), "live -> updated_at");
  near(await lastmod("cricket-matches", "/cricket/matches/m-soon"), Date.now() - DAY, "fixture -> updated_at");
  const calledOff = await lastmod("cricket-matches", "/cricket/matches/m-called-off");
  assert.ok(calledOff !== null && calledOff <= Date.now(), "a called-off match never claims a future lastmod");
});

test("a series' lastmod is the newest of its row, its matches and its figures, never ahead of now", async () => {
  near(await lastmod("cricket-series", "/cricket/series/s2"), Date.now() - 2 * DAY, "stats rows are the newest change");
  near(await lastmod("cricket-series", "/cricket/series/s1"), Date.now(), "a live match row is the newest change");
  const s3 = await lastmod("cricket-series", "/cricket/series/s3");
  assert.ok(s3 !== null && s3 <= Date.now() && s3 >= Date.now() - DAY, "the fixture's row date, not its start date");
});

test("player-season pages cover the current and previous completed season only", async () => {
  const listed = await urls("pseasons-nba");
  assert.ok(listed.has(absoluteUrl("/nba/players/everyone/2026")));
  assert.ok(listed.has(absoluteUrl("/nba/players/everyone/2025")));
  assert.ok(!listed.has(absoluteUrl("/nba/players/everyone/2024")), "two seasons back is left to the player page's links");
  assert.ok(!listed.has(absoluteUrl("/nba/players/everyone/2027")), "a scheduled season is not a played one");
});

test("player pages list players active in the current or previous season; cricket leagues keep everyone", async () => {
  const nba = await urls("players-nba");
  assert.ok(nba.has(absoluteUrl("/nba/players/everyone")));
  assert.ok(nba.has(absoluteUrl("/nba/players/stats-now")), "a season stat line in the window counts");
  assert.ok(!nba.has(absoluteUrl("/nba/players/retired")), "last game two seasons back");
  assert.ok(!nba.has(absoluteUrl("/nba/players/stats-then")), "a season stat line outside the window does not count");
  assert.ok((await urls("players-t20i")).has(absoluteUrl("/t20i/players/veteran")));
});
