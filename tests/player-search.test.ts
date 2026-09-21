// Search lists same-name players with games on record first (a roster-only namesake must not take the bare slug's place in the
// results), and a player page with no games points to the namesake who has some.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let playerPage: typeof import("../src/app/[league]/players/[slug]/page");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  playerPage = await import("../src/app/[league]/players/[slug]/page");
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  await q(`insert into teams (league, espn_id, name, slug) values ('nfl', 'c1', 'Cleveland Browns', 'cleveland-browns'), ('nfl', 'v1', 'Minnesota Vikings', 'minnesota-vikings'), ('nfl', 'j1', 'Jefferson Bears', 'jefferson-bears')`);
  // The roster-only linebacker was inserted first and holds the bare slug; the receiver has the id suffix.
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position) values
    ('nfl', 'lb1', 'c1', 'Justin Jefferson', 'justin-jefferson', 'LB'),
    ('nfl', 'wr1', 'v1', 'Justin Jefferson', 'justin-jefferson-wr1', 'WR'),
    ('nfl', 'wr2', 'v1', 'Van Jefferson', 'van-jefferson', 'WR'),
    ('nfl', 'lb2', 'c1', 'Adam Jefferson', 'adam-jefferson', 'LB')`);
  await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
           values ('nfl', 'g1', now(), 'x', 2025, 'v1', 'c1', 20, 10, true, 2, 'STD'), ('nfl', 'g2', now(), 'x', 2025, 'v1', 'c1', 20, 10, true, 2, 'STD')`);
  for (const [game, player] of [["g1", "wr1"], ["g2", "wr1"], ["g1", "wr2"]]) {
    await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nfl', $1, $2, 'v1', '{}')`, [game, player]);
  }
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("search puts players and clubs with games on record first, then orders by name", async () => {
  const results = await queries.search("jefferson");
  assert.deepEqual(
    results.map((r) => `${r.type}:${r.slug}`),
    ["team:jefferson-bears", "player:justin-jefferson-wr1", "player:van-jefferson", "player:adam-jefferson", "player:justin-jefferson"]
  );
});

test("search applies its limit after the ordering, so the namesake with games survives a tight limit", async () => {
  const results = await queries.search("justin jefferson", 1);
  assert.deepEqual(results.map((r) => r.slug), ["justin-jefferson-wr1"]);
});

test("a player page with no games looks up the same-name player who has some", async () => {
  const other = await queries.getSameNamePlayerWithGames("nfl", "Justin Jefferson", "lb1");
  assert.equal(other?.slug, "justin-jefferson-wr1");
  assert.equal(other?.position, "WR");
  assert.equal(other?.team_name, "Minnesota Vikings");
  // The receiver's namesake has no games, so there is nothing to point to; another name never matches.
  assert.equal(await queries.getSameNamePlayerWithGames("nfl", "Justin Jefferson", "wr1"), null);
  assert.equal(await queries.getSameNamePlayerWithGames("nfl", "Van Jefferson", "wr2"), null);
  assert.equal(await queries.getSameNamePlayerWithGames("nba", "Justin Jefferson", "lb1"), null);
});

const pageText = async (slug: string) => {
  const result = await outcome(() => playerPage.default({ params: Promise.resolve({ league: "nfl", slug }) }));
  assert.ok(typeof result === "object" && "value" in result, `/nfl/players/${slug} rendered`);
  return renderToStaticMarkup(result.value);
};

test("the bare-slug page with no games links to the namesake who has games; the page with games has no such line", async () => {
  const empty = await pageText("justin-jefferson");
  assert.match(empty, /No games on record for Justin Jefferson/);
  assert.match(empty, /Looking for the other Justin Jefferson\?/);
  assert.match(empty, /href="\/nfl\/players\/justin-jefferson-wr1"/);
  assert.match(empty, /Justin Jefferson \(WR, Minnesota Vikings\)/);
  // A no-games player with no namesake who has games gets no such line.
  const alone = await pageText("adam-jefferson");
  assert.match(alone, /No games on record for Adam Jefferson/);
  assert.doesNotMatch(alone, /Looking for/);
  const withGames = await pageText("justin-jefferson-wr1");
  assert.doesNotMatch(withGames, /Looking for the other/);
  // An NFL player page with figures carries the source disclosure, and the career header is the NFL's own wording.
  assert.match(withGames, /Figures are summed from ESPN box scores; ESPN occasionally leaves a stat unrecorded or uncorrected \(for example a tackle credited to the wrong game\)\./);
  assert.match(withGames, /Regular season since 2015/);
  assert.match(withGames, /Games before 2015 are not on this site, so these are not career totals\./);
  assert.doesNotMatch(withGames, /Career/);
});
