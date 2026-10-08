import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// The production shape of 2026-10-08: the Rays swept the Yankees (ALDS games 4 and 5 still Scheduled 0-0), Cleveland and
// Chicago are 1-1 (their games 3-5 are live possibilities), and the ALCS lists "CLE/CHW at Tampa Bay Rays" at 04:00 UTC.
let db: TestDb;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let m: any;

const TEAMS: [string, string, string, string][] = [
  ["10", "Tampa Bay Rays", "tampa-bay-rays", "TB"],
  ["30", "New York Yankees", "new-york-yankees", "NYY"],
  ["4", "Cleveland Guardians", "cleveland-guardians", "CLE"],
  ["5", "Chicago White Sox", "chicago-white-sox", "CHW"],
  ["-2", "CLE/CHW", "cle-chw", "CLE/CHW"],
];

// id, minutes from now, name, home, away, round, state, completed, homeScore, awayScore, home_winner, away_winner, detail
type Row = [string, number, string, string, string, string, string, boolean, number | null, number | null, boolean | null, boolean | null, string];
const DAY = 24 * 60;
const ROWS: Row[] = [
  ["a1", -4 * DAY, "NYY at TB", "10", "30", "AL Division Series - Game 1", "post", true, 1, 0, true, false, "Final"],
  ["a2", -3 * DAY, "NYY at TB", "10", "30", "AL Division Series - Game 2", "post", true, 5, 2, true, false, "Final"],
  ["a3", -1 * DAY, "TB at NYY", "30", "10", "AL Division Series - Game 3", "post", true, 3, 4, false, true, "Final"],
  ["a4", 1 * DAY, "TB at NYY", "10", "30", "ALDS - Game 4 If Necessary", "pre", false, 0, 0, null, null, "Scheduled"],
  ["a5", 2 * DAY, "NYY at TB", "30", "10", "ALDS - Game 5 If Necessary", "pre", false, 0, 0, null, null, "Scheduled"],
  ["c1", -4 * DAY, "CHW at CLE", "4", "5", "AL Division Series - Game 1", "post", true, 0, 3, false, true, "Final"],
  ["c2", -3 * DAY, "CHW at CLE", "4", "5", "AL Division Series - Game 2", "post", true, 4, 3, true, false, "Final"],
  ["c3", -1 * DAY, "CLE at CHW", "5", "4", "AL Division Series - Game 3", "post", true, 9, 3, true, false, "Final"],
  ["c4", 1 * DAY, "CLE at CHW", "5", "4", "AL Division Series - Game 4", "pre", false, null, null, null, null, "Scheduled"],
  ["c5", 2 * DAY, "CHW at CLE", "4", "5", "ALDS - Game 5 If Necessary", "pre", false, null, null, null, null, "Scheduled"],
];

before(async () => {
  db = await startTestDb();
  m = {
    queries: await import("../src/lib/queries"),
    feed: await import("../src/lib/homeFeed"),
    ics: await import("../src/lib/ics"),
    data: await import("../src/lib/playoffSeriesData"),
    blocks: await import("../src/lib/blockLoaders"),
    sitemap: await import("../src/lib/sitemap"),
  };
  for (const [id, name, slug, abbr] of TEAMS) await q(`insert into teams (league, espn_id, name, slug, abbreviation) values ('mlb', $1, $2, $3, $4)`, [id, name, slug, abbr]);
  for (const r of ROWS) {
    await q(
      `insert into games (league, espn_id, date, name, short_name, home_team_espn_id, away_team_espn_id, round, season_year, status_state, completed, home_score, away_score, home_winner, away_winner, status_detail)
       values ('mlb', $1, now() + ($2 || ' minutes')::interval, $3, $3, $4, $5, $6, 2026, $7, $8, $9, $10, $11, $12, $13)`,
      [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12]]
    );
  }
  // The ALCS: both games at exactly 04:00 UTC, one side the "CLE/CHW" placeholder.
  for (const [id, days] of [["l1", 5], ["l2", 6]] as const) {
    await q(
      `insert into games (league, espn_id, date, name, short_name, home_team_espn_id, away_team_espn_id, round, season_year, status_state, completed, status_detail, home_score, away_score)
       values ('mlb', $1, date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + ($2 || ' days')::interval + interval '4 hours', 'CLE/CHW at Tampa Bay Rays', 'TBD @ TB', '10', '-2', 'AL Championship Series - Game ' || $3::text, 2026, 'pre', false, 'Scheduled', 0, 0)`,
      [id, days, days - 4]
    );
  }
  // Game 5 of the swept series sits alone on its day (the live series' games share days 1 and 2).
  await q(`update games set date = now() + interval '3 days' where espn_id = 'a5'`);
  m.data.clearSeriesIndex();
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

const ids = (rows: { espn_id: string }[]) => rows.map((r) => r.espn_id).sort();

test("the index lists exactly the swept series' unneeded games", async () => {
  const keys = await m.data.notNeededKeys();
  assert.deepEqual(keys.sort(), ["mlb:a4", "mlb:a5"]);
  const n = await m.data.getNotNeeded({ league: "mlb", espn_id: "a4" });
  assert.equal(n.score, "3-0");
  assert.equal(await m.data.getNotNeeded({ league: "mlb", espn_id: "c4" }), null, "the 1-2 series is live");
  assert.equal(await m.data.getNotNeeded({ league: "mlb", espn_id: "a3" }), null, "a played game");
  assert.equal(await m.data.getNotNeeded({ league: "nba", espn_id: "a4" }), null, "another league's id");
});

test("schedules leave the unneeded games out and keep the live series, and no row is deleted", async () => {
  const season = await m.queries.getTeamGamesBySeason("mlb", "30", 2026);
  assert.deepEqual(ids(season), ["a1", "a2", "a3"], "the Yankees' schedule ends with their elimination");
  const cle = await m.queries.getTeamGamesBySeason("mlb", "4", 2026);
  assert.deepEqual(ids(cle), ["c1", "c2", "c3", "c4", "c5"], "Cleveland's undecided series keeps games 4 and 5");
  const recent = await m.queries.getRecentAndUpcoming("mlb", 5, 10);
  assert.ok(!ids(recent).includes("a4") && !ids(recent).includes("a5"));
  assert.ok(ids(recent).includes("c4") && ids(recent).includes("c5"));
  const { rows } = await q(`select count(*)::int as n from games where espn_id in ('a4','a5')`);
  assert.equal(rows[0].n, 2, "the rows stay");
  const day = await q(`select (date at time zone 'America/New_York')::date::text as d from games where espn_id = 'a4'`);
  const byDate = await m.queries.getGamesByDate("mlb", day.rows[0].d);
  assert.ok(!ids(byDate).includes("a4"), "the scores page for that day");
});

test("the homepage feeds, the ticker and the featured pool skip the unneeded games", async () => {
  const upcoming = await m.feed.getUpcomingGames(50, 50, 30);
  assert.ok(!ids(upcoming).includes("a4") && ids(upcoming).includes("c4"));
  const featured = await m.queries.getFeaturedGames("mlb", 50);
  assert.ok(!ids(featured).includes("a4") && !ids(featured).includes("a5") && ids(featured).includes("c4"));
  const ticker = await m.queries.getTickerGames(50);
  assert.ok(!ids(ticker).includes("a4") && ids(ticker).includes("c4"));
  const next = await m.queries.getNextFixtureDate("mlb", 2026);
  const c4 = await q(`select date from games where espn_id = 'c4'`);
  assert.equal(next, new Date(c4.rows[0].date).toISOString(), "the next fixture is the live series' game, not a swept one");
});

test("a swept game whose slot has passed is not 'live'", async () => {
  await q(`update games set date = now() - interval '10 minutes' where espn_id in ('a4', 'c4')`);
  m.data.clearSeriesIndex();
  const live = await m.feed.getLiveGames();
  assert.ok(!ids(live).includes("a4"), "never started");
  assert.ok(ids(live).includes("c4"), "the live series' game is waited for as before");
  await q(`update games set date = now() + interval '1 day' where espn_id in ('a4', 'c4')`);
  m.data.clearSeriesIndex();
});

test("the team-next block says what the Yankees do next: nothing", async () => {
  const yankees = await m.blocks.loadBlock("team-next", { league: "mlb", team: "new-york-yankees" });
  assert.deepEqual(yankees.next, []);
  assert.equal(yankees.last.opponent, "Tampa Bay Rays");
  const cle = await m.blocks.loadBlock("team-next", { league: "mlb", team: "cleveland-guardians" });
  assert.deepEqual(cle.next.map((f: { id: string }) => f.id), ["c4", "c5"]);
});

test("the calendar feeds drop the unneeded games and keep the others", async () => {
  const yankees = await m.ics.buildTeamFeed("mlb", "new-york-yankees");
  assert.equal((yankees.ics.match(/BEGIN:VEVENT/g) ?? []).length, 3, "three played games and no 'if necessary' ones");
  const league = await m.ics.buildLeagueFeed("mlb");
  assert.ok(!league.ics.includes("mlb-a4") && !league.ics.includes("mlb-a5"), league.ics.slice(0, 200));
  assert.ok(league.ics.includes("mlb-c4"));
  const follows = await m.ics.buildFollowsFeed([{ kind: "team", league: "mlb", refId: "new-york-yankees" }]);
  assert.equal((follows.ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
});

test("the placeholder side reads 'Winner of CLE-CHW' while their series is open, and is the winner once it is decided", async () => {
  const rows = await m.queries.getTeamGamesBySeason("mlb", "10", 2026);
  const alcs = rows.find((g: { espn_id: string }) => g.espn_id === "l1");
  assert.equal(alcs.away_name, "Winner of CLE-CHW");
  assert.equal(alcs.away_logo, null);
  assert.equal(alcs.away_abbr, "CLE/CHW");
  const game = await m.queries.getGameByEspnId("mlb", "l1");
  assert.equal(game.away_name, "Winner of CLE-CHW");

  // Chicago wins game 4 and the series 3-1: the ALCS rows now name the White Sox, and game 5 is not needed.
  await q(`update games set status_state = 'post', completed = true, home_score = 2, away_score = 1, home_winner = true, away_winner = false, status_detail = 'Final' where espn_id = 'c4'`);
  m.data.clearSeriesIndex();
  const settled = await m.queries.getTeamGamesBySeason("mlb", "10", 2026);
  const l1 = settled.find((g: { espn_id: string }) => g.espn_id === "l1");
  assert.equal(l1.away_name, "Chicago White Sox");
  assert.equal(l1.away_slug, "chicago-white-sox");
  assert.equal(l1.away_team_espn_id, "5");
  const g1 = await m.queries.getGameByEspnId("mlb", "l1");
  assert.equal(g1.away_name, "Chicago White Sox");
  // The two series stay apart: a decided CLE-CHW series hides nothing in the ALCS (a different pair).
  assert.equal(await m.data.getNotNeeded({ league: "mlb", espn_id: "l1" }), null);
  assert.deepEqual((await m.data.notNeededKeys()).sort(), ["mlb:a4", "mlb:a5", "mlb:c5"]);
});

test("the sitemap lists the live series' games and days, not the swept series' ones", async () => {
  const games = (await m.sitemap.sitemapEntries("games-mlb")).map((e: { url: string }) => e.url);
  assert.ok(games.some((u: string) => u.endsWith("/mlb/games/c4")));
  assert.ok(games.some((u: string) => u.endsWith("/mlb/games/a3")), "a played game stays");
  assert.ok(!games.some((u: string) => u.endsWith("/mlb/games/a4") || u.endsWith("/mlb/games/a5")));
  const day = async (id: string) => (await q(`select to_char(date at time zone 'America/New_York', 'YYYY-MM-DD') as d from games where espn_id = $1`, [id])).rows[0].d;
  const core = (await m.sitemap.sitemapEntries("core")).map((e: { url: string }) => e.url);
  const [liveDay, sweptDay] = [await day("c4"), await day("a5")];
  assert.ok(core.some((u: string) => u.endsWith(`/mlb/scores/${liveDay}`)));
  assert.ok(!core.some((u: string) => u.endsWith(`/mlb/scores/${sweptDay}`)), "a day with only a swept series' game is not a game day");
});

test("the teams list and the teams sitemap leave the placeholder out, and its page is noindex", async () => {
  const teams = await m.queries.getAllTeams("mlb");
  assert.ok(!teams.some((t: { abbreviation: string }) => t.abbreviation === "CLE/CHW"));
  assert.equal(teams.length, 4);
  const entries = (await m.sitemap.sitemapEntries("teams-mlb")).map((e: { url: string }) => e.url);
  assert.ok(!entries.some((u: string) => u.includes("cle-chw")));
  assert.ok(entries.some((u: string) => u.endsWith("/mlb/teams/tampa-bay-rays")), entries.join(" "));
  const chips = await (await import("../src/lib/related")).getCurrentSeasonTeams("mlb");
  assert.deepEqual(chips.map((t: { slug: string }) => t.slug).sort(), ["chicago-white-sox", "cleveland-guardians", "new-york-yankees", "tampa-bay-rays"], "the league page's team chips");
});

test("the structured data of a game with a placeholder side names no team page for it", async () => {
  const { gameSchema } = await import("../src/lib/structuredData");
  // Back to an open series between Cleveland and Chicago.
  await q(`update games set status_state = 'pre', completed = false, home_score = null, away_score = null, home_winner = null, away_winner = null, status_detail = 'Scheduled' where espn_id = 'c4'`);
  m.data.clearSeriesIndex();
  const game = await m.queries.getGameByEspnId("mlb", "l2");
  const ld = gameSchema("mlb", game);
  assert.equal(ld.startDate, ld.startDate.slice(0, 10), "a day, not a made-up midnight clock time");
  assert.deepEqual(ld.awayTeam, { "@type": "SportsTeam", name: "Winner of CLE-CHW" });
  assert.ok(ld.homeTeam.url?.endsWith("/mlb/teams/tampa-bay-rays"));
});

test("a database error leaves pages whole: no game is hidden", async () => {
  const { pool } = await import("../src/lib/db");
  const original = pool.query.bind(pool);
  m.data.clearSeriesIndex();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (sql: string, ...rest: unknown[]) => {
    if (typeof sql === "string" && sql.includes("g.round ~*")) throw new Error("boom");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(sql, ...rest);
  };
  const errors = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await m.data.notNeededKeys(), []);
    const season = await m.queries.getTeamGamesBySeason("mlb", "30", 2026);
    assert.deepEqual(ids(season), ["a1", "a2", "a3", "a4", "a5"]);
  } finally {
    console.error = errors;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pool as any).query = original;
    m.data.clearSeriesIndex();
  }
});
