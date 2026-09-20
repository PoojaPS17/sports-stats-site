import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { absoluteUrl } from "../src/lib/site";
import { ALL_LEAGUES, type League } from "../src/lib/leagues";

// The /[league]/matchweek hub (/nfl/week, /ucl/matchday through the rewrites) is a real page: the current
// season's round-by-round index. It is listed in the sitemap and linked from the sub-nav, so it must answer
// 200 with its own canonical (it used to 307 to the current week). The same list is also served at
// /[league]/matchweek/<current season>, which must therefore name the hub as its canonical.
let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let matchweeks: typeof import("../src/lib/matchweeks");
let db: TestDb;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  matchweeks = await import("../src/lib/matchweeks");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', '1', 'One', 'one'), ('nba', '2', 'Two', 'two')`);
  // Two seasons of NBA regular-season games: 2026 is the current one, 2025 a past one.
  for (const [id, date, season] of [["a", "2025-10-22T00:00:00Z", 2025], ["b", "2026-10-22T00:00:00Z", 2026], ["c", "2026-10-30T00:00:00Z", 2026]] as const) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed)
       values ('nba', $1, $2, $1, '1', '2', $3, true)`,
      [id, date, season]
    );
  }
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const hubLeagues = (): League[] => ALL_LEAGUES.filter((l) => matchweeks.supportsMatchweeks(l));

test("the hub is listed in the core sitemap exactly once for every league that has matchweeks, and for no other", async () => {
  const urls = (await sitemapEntries("core")).map((e) => e.url);
  for (const league of ALL_LEAGUES) {
    const hub = absoluteUrl(matchweeks.weekIndexPath(league));
    const count = urls.filter((u) => u === hub).length;
    assert.equal(count, matchweeks.supportsMatchweeks(league) ? 1 : 0, `${league} hub ${hub}`);
  }
  assert.ok(hubLeagues().length >= 3, "sanity: football, NFL and NBA have matchweeks");
});

test("the hub paths use each sport's own word, so the rewrites in next.config.ts reach the route", () => {
  assert.equal(matchweeks.weekIndexPath("epl"), "/epl/matchweek");
  assert.equal(matchweeks.weekIndexPath("ucl"), "/ucl/matchday");
  assert.equal(matchweeks.weekIndexPath("nfl"), "/nfl/week");
  assert.equal(matchweeks.weekIndexPath("nba"), "/nba/week");
});

test("the weeks sitemap lists past seasons' indexes and the current season's weeks, but not the current season's duplicate of the hub", async () => {
  const urls = new Set((await sitemapEntries("weeks-nba")).map((e) => e.url));
  assert.ok(urls.has(absoluteUrl("/nba/week/2025")), "past season index");
  assert.ok(!urls.has(absoluteUrl("/nba/week/2026")), "the current season's index is the hub, which core lists");
  assert.ok(urls.has(absoluteUrl("/nba/week/1")), "a current-season week");
});

test("the current season's index page names the hub as its canonical; a past season's names itself", () => {
  const seasons = [2026, 2025, 2024];
  assert.equal(matchweeks.canonicalWeekIndexPath("nba", 2026, seasons), "/nba/week");
  assert.equal(matchweeks.canonicalWeekIndexPath("nba", 2025, seasons), "/nba/week/2025");
  assert.equal(matchweeks.canonicalWeekIndexPath("epl", 2026, seasons), "/epl/matchweek");
  assert.equal(matchweeks.canonicalWeekIndexPath("ucl", 2024, seasons), "/ucl/matchday/2024");
});
