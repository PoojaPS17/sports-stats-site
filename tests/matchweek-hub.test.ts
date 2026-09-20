import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";
import { absoluteUrl } from "../src/lib/site";
import { ALL_LEAGUES, type League } from "../src/lib/leagues";

// The /[league]/matchweek hub (/nfl/week, /ucl/matchday through the rewrites) is a real page: the current
// season's round-by-round index. It is listed in the sitemap and linked from the sub-nav, so it must answer
// 200 with its own canonical (it used to 307 to the current week). The same list is also served at
// /[league]/matchweek/<current season>, which must therefore name the hub as its canonical.
//
// The sitemap and the pages must agree: a URL is listed only if the page behind it renders, and a page that
// canonicals to another must not point at a 404. Each such rule below is tested from both sides.
//
// Fixture: NBA has 2025 and 2026 regular seasons plus a 2024 with only a preseason game (season_type 1 is
// excluded from rounds, so 2024 has games but no weeks). NFL has only a 2026 preseason game: seasons, no weeks.
// The other leagues have no games.
let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let matchweeks: typeof import("../src/lib/matchweeks");
let hubModule: typeof import("../src/app/[league]/matchweek/page");
let seasonModule: typeof import("../src/app/[league]/matchweek/[n]/page");
let weekModule: typeof import("../src/app/[league]/matchweek/[n]/[week]/page");
let WeekIndex: typeof import("../src/components/WeekHub").WeekIndex;
let db: TestDb;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  matchweeks = await import("../src/lib/matchweeks");
  hubModule = await import("../src/app/[league]/matchweek/page");
  seasonModule = await import("../src/app/[league]/matchweek/[n]/page");
  weekModule = await import("../src/app/[league]/matchweek/[n]/[week]/page");
  ({ WeekIndex } = await import("../src/components/WeekHub"));
  await db.pool.query(
    `insert into teams (league, espn_id, name, slug) values ('nba', '1', 'One', 'one'), ('nba', '2', 'Two', 'two'), ('nfl', '1', 'One', 'one'), ('nfl', '2', 'Two', 'two')`
  );
  const games: [string, string, string, number, number][] = [
    ["nba", "a", "2025-10-22T00:00:00Z", 2025, 2],
    ["nba", "b", "2026-10-22T00:00:00Z", 2026, 2],
    ["nba", "c", "2026-10-30T00:00:00Z", 2026, 2],
    ["nba", "pre24", "2024-10-05T00:00:00Z", 2024, 1],
    ["nfl", "pre26", "2026-08-10T00:00:00Z", 2026, 1],
  ];
  for (const [league, id, date, season, seasonType] of games) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type)
       values ($1, $2, $3, $2, '1', '2', $4, true, $5)`,
      [league, id, date, season, seasonType]
    );
  }
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const hubLeagues = (): League[] => ALL_LEAGUES.filter((l) => matchweeks.supportsMatchweeks(l));
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const canonicalOf = (m: { alternates?: unknown }) => (m.alternates as { canonical?: string } | undefined)?.canonical;

test("the hub paths use each sport's own word, so the rewrites in next.config.ts reach the route", () => {
  assert.equal(matchweeks.weekIndexPath("epl"), "/epl/matchweek");
  assert.equal(matchweeks.weekIndexPath("ucl"), "/ucl/matchday");
  assert.equal(matchweeks.weekIndexPath("nfl"), "/nfl/week");
  assert.equal(matchweeks.weekIndexPath("nba"), "/nba/week");
});

test("the hub is listed in the core sitemap only for a league whose hub page renders", async () => {
  const urls = (await sitemapEntries("core")).map((e) => e.url);
  assert.ok(hubLeagues().length >= 3, "sanity: football, NFL and NBA have matchweeks");
  for (const league of ALL_LEAGUES) {
    const hub = absoluteUrl(matchweeks.weekIndexPath(league));
    const listed = urls.filter((u) => u === hub).length;
    const page = await outcome(() => hubModule.default(params({ league })));
    const renders = typeof page === "object" && "value" in page;
    // A league with no games at all, or only games no round contains, 404s: it must not be listed.
    assert.equal(listed, renders ? 1 : 0, `${league} hub ${hub}: listed ${listed}x, page ${renders ? "renders" : JSON.stringify(page)}`);
    if (league === "nba") assert.equal(renders, true);
    if (league === "nfl" || league === "epl") assert.equal(renders, false, `${league} has no rounds`);
  }
});

test("the hub page renders the season index and does not redirect", async () => {
  const page = await outcome(() => hubModule.default(params({ league: "nba" })));
  assert.ok(typeof page === "object" && "value" in page, `nba hub outcome: ${JSON.stringify(page, (_k, v) => (v instanceof Error ? v.message : v))}`);
  assert.ok(isValidElement(page.value));
  assert.equal(page.value.type, WeekIndex);
  assert.equal((page.value.props as { season: number }).season, 2026);
  assert.equal((page.value.props as { isCurrentSeason: boolean }).isCurrentSeason, true);
});

test("a league with no games, or only excluded ones, is a 404 for the hub", async () => {
  for (const league of ["nfl", "epl", "ucl"] as const) assert.equal(await outcome(() => hubModule.default(params({ league }))), "not-found", league);
});

test("the season index page renders for a season with rounds and is a 404 for one without", async () => {
  for (const n of ["2026", "2025"]) {
    const page = await outcome(() => seasonModule.default(params({ league: "nba", n })));
    assert.ok(typeof page === "object" && "value" in page, `nba ${n}`);
    assert.equal((page.value as { type: unknown }).type, WeekIndex);
  }
  // 2024 has a game but no round; 2027 has nothing.
  assert.equal(await outcome(() => seasonModule.default(params({ league: "nba", n: "2024" }))), "not-found", "2024: games but no weeks");
  assert.equal(await outcome(() => seasonModule.default(params({ league: "nba", n: "2027" }))), "not-found", "2027");
});

test("the weeks sitemap lists a past season's index only if that page renders, and no current-season duplicate of the hub", async () => {
  const urls = new Set((await sitemapEntries("weeks-nba")).map((e) => e.url));
  assert.ok(urls.has(absoluteUrl("/nba/week/2025")), "past season with rounds");
  assert.ok(!urls.has(absoluteUrl("/nba/week/2024")), "past season with games but no rounds is a 404");
  assert.ok(!urls.has(absoluteUrl("/nba/week/2026")), "the current season's index is the hub, which core lists");
  assert.ok(urls.has(absoluteUrl("/nba/week/1")), "a current-season week");
  assert.ok(!urls.has(absoluteUrl("/nba/week/2026/1")), "current-season weeks are listed in their short form");
});

test("the current season's index page names the hub as its canonical; a past season's names itself", async () => {
  const current = await seasonModule.generateMetadata(params({ league: "nba", n: "2026" }));
  assert.equal(canonicalOf(current), absoluteUrl("/nba/week"));
  const past = await seasonModule.generateMetadata(params({ league: "nba", n: "2025" }));
  assert.equal(canonicalOf(past), absoluteUrl("/nba/week/2025"));
});

test("canonicalWeekIndexPath: the latest season is the hub, older ones their own address", () => {
  const seasons = [2026, 2025, 2024];
  assert.equal(matchweeks.canonicalWeekIndexPath("nba", 2026, seasons), "/nba/week");
  assert.equal(matchweeks.canonicalWeekIndexPath("nba", 2025, seasons), "/nba/week/2025");
  assert.equal(matchweeks.canonicalWeekIndexPath("epl", 2026, seasons), "/epl/matchweek");
  assert.equal(matchweeks.canonicalWeekIndexPath("ucl", 2024, seasons), "/ucl/matchday/2024");
});

test("a week under the current season's year names the short form; under a past season, itself", async () => {
  const current = await weekModule.generateMetadata(params({ league: "nba", n: "2026", week: "1" }));
  assert.equal(canonicalOf(current), absoluteUrl("/nba/week/1"));
  const past = await weekModule.generateMetadata(params({ league: "nba", n: "2025", week: "1" }));
  assert.equal(canonicalOf(past), absoluteUrl("/nba/week/2025/1"));
  // The short form itself is self-canonical.
  const short = await (await import("../src/app/[league]/matchweek/[n]/page")).generateMetadata(params({ league: "nba", n: "1" }));
  assert.equal(canonicalOf(short), absoluteUrl("/nba/week/1"));
});
