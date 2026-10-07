// The search page lists a cricketer or footballer once, with his other competitions beside him; the picker API keeps every page.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  for (const l of ["odi", "t20i", "test", "ipl", "laliga", "ucl", "europa", "nba"]) await q(`insert into teams (league, espn_id, name, slug) values ($1, 'h', 'Home', 'home'), ($1, 'a', 'Away', 'away')`, [l]);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values
    ('odi', '1', 'h', 'Vee Kay', 'vee-kay'), ('t20i', '1', 'h', 'Vee Kay', 'vee-kay'), ('test', '1', 'h', 'Vee Kay', 'vee-kay'), ('ipl', '1', 'h', 'Vee Kay', 'vee-kay'),
    ('laliga', '7', 'h', 'Kay Mbap', 'kay-mbap'), ('ucl', '7', 'h', 'Kay Mbap', 'kay-mbap'), ('europa', '7', 'h', 'Kay Mbap', 'kay-mbap'),
    ('nba', '1', 'h', 'Vee Kay', 'vee-kay'), ('nba', '9', 'h', 'Vee Kay', 'vee-kay-9')`);
  const stat = async (league: string, game: string, player: string) => {
    await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
             values ($1, $2, now(), 'x', 2025, 'h', 'a', 1, 0, true, 2, 'STD')`, [league, game]);
    await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, 'h', '{}')`, [league, game, player]);
  };
  // the ODI page has the most games, so it leads
  await stat("odi", "o1", "1"); await stat("odi", "o2", "1"); await stat("odi", "o3", "1");
  await stat("t20i", "t1", "1"); await stat("test", "s1", "1");
  await stat("ucl", "u1", "7"); await stat("ucl", "u2", "7"); await stat("laliga", "l1", "7");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("a cricketer is one row led by the page with most games, his other pages in the site's order", async () => {
  const r = (await queries.search("vee kay", 20, { fold: true })).filter((x) => x.league !== "nba");
  assert.equal(r.length, 1);
  assert.equal(r[0].league, "odi");
  assert.deepEqual(r[0].also, [{ league: "test", slug: "vee-kay" }, { league: "t20i", slug: "vee-kay" }, { league: "ipl", slug: "vee-kay" }]
    .sort((a, b) => ["ipl", "test", "odi", "t20i"].indexOf(a.league) - ["ipl", "test", "odi", "t20i"].indexOf(b.league)));
});

test("a footballer is one row, and a basketball namesake is not folded into the cricketer", async () => {
  const f = await queries.search("kay mbap", 20, { fold: true });
  assert.deepEqual(f.map((x) => [x.league, (x.also ?? []).map((a) => a.league)]), [["ucl", ["laliga", "europa"].sort((a, b) => ["laliga", "ucl", "europa"].indexOf(a) - ["laliga", "ucl", "europa"].indexOf(b))]]);
  const all = await queries.search("vee kay", 20, { fold: true });
  assert.equal(all.filter((x) => x.league === "nba").length, 2, "both NBA players stay, even with the same espn id as the cricketer");
});

test("the limit counts people, and unfolded search still lists every page", async () => {
  assert.equal((await queries.search("kay mbap", 1, { fold: true })).length, 1);
  assert.equal((await queries.search("kay mbap", 20)).length, 3);
  assert.equal((await queries.search("kay mbap", 20))[0].also, undefined);
});
