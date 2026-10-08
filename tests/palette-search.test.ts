// The builder's player search: one chip per person, namesakes told apart, ticked when any of the person's pages is added.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let followBlocks: typeof import("../src/lib/followBlocks");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  followBlocks = await import("../src/lib/followBlocks");
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  for (const [l, name] of [["test", "India"], ["odi", "India"], ["ipl", "Mumbai Indians"], ["t20i", "Indonesia"], ["nba", "Hawks"]]) {
    await q(`insert into teams (league, espn_id, name, slug) values ($1, 'ind', $2, 'ind'), ($1, 'a', 'Away', 'away')`, [l, name]);
  }
  // One Indian Rohit Sharma on four pages (one ESPN id), an Indonesian namesake (own id), two Indian men called Kay Same, one in Tests and one in ODIs.
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values
    ('test', '34102', 'ind', 'Rohit Sharma', 'rohit-sharma'), ('odi', '34102', 'ind', 'Rohit Sharma', 'rohit-sharma'), ('ipl', '34102', 'ind', 'Rohit Sharma', 'rohit-sharma'),
    ('t20i', '34102', 'a', 'Rohit Sharma', 'rohit-sharma'), ('t20i', '1542004', 'ind', 'Rohit Sharma', 'rohit-sharma-1542004'),
    ('test', '5', 'ind', 'Kay Same', 'kay-same'), ('odi', '6', 'ind', 'Kay Same', 'kay-same-6')`);
  const stat = async (league: string, game: string, player: string) => {
    await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
             values ($1, $2, now(), 'x', 2025, 'ind', 'a', 1, 0, true, 2, 'STD')`, [league, game]);
    await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, 'ind', '{}')`, [league, game, player]);
  };
  await stat("odi", "o1", "34102"); await stat("odi", "o2", "34102"); await stat("test", "s1", "34102"); await stat("ipl", "i1", "34102");
  await stat("t20i", "t1", "1542004");
  await stat("test", "s5", "5"); await stat("odi", "o6", "6");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("one person on four pages is one chip; the namesake is a second chip with a distinguishing label", async () => {
  const chips = followBlocks.searchResultsToPalette(await queries.search("rohit", 60, { fold: true }), 6);
  assert.equal(chips.length, 2);
  assert.deepEqual(chips.map((c) => c.block.label), ["Rohit Sharma (India): last five", "Rohit Sharma (Indonesia): last five"]);
  assert.equal(chips[0].block.id, "player-form:odi:rohit-sharma", "the page with most games leads");
  assert.deepEqual([...chips[0].ids].sort(), ["player-form:ipl:rohit-sharma", "player-form:odi:rohit-sharma", "player-form:t20i:rohit-sharma", "player-form:test:rohit-sharma"]);
  assert.deepEqual(chips[1].ids, ["player-form:t20i:rohit-sharma-1542004"]);
});

test("a chip is ticked by any page of that person and never by the namesake", async () => {
  const chips = followBlocks.searchResultsToPalette(await queries.search("rohit", 60, { fold: true }), 6);
  const ticked = (existing: string[]) => chips.map((c) => c.ids.some((id) => existing.includes(id)));
  assert.deepEqual(ticked(["player-form:ipl:rohit-sharma"]), [true, false]);
  assert.deepEqual(ticked(["player-form:t20i:rohit-sharma-1542004"]), [false, true]);
  assert.deepEqual(ticked([]), [false, false]);
});

test("same-name players with the same club get the competition added", async () => {
  const raw = await queries.search("kay same", 60, { fold: true });
  const chips = followBlocks.searchResultsToPalette(raw, 6);
  assert.equal(chips.length, 2, JSON.stringify(raw));
  assert.equal(new Set(chips.map((c) => c.block.label)).size, 2);
  assert.ok(chips.every((c) => /\(India, (Test|ODI)[^)]*\)/.test(c.block.label)), chips.map((c) => c.block.label).join("|"));
});

test("a lone player keeps the plain label and the list is capped", () => {
  const one = followBlocks.searchResultsToPalette([{ type: "player", league: "nba", name: "Luka Dončić", slug: "luka-doncic", subtitle: "Lakers" }], 6);
  assert.equal(one[0].block.label, "Luka Dončić: last five");
  const many = followBlocks.searchResultsToPalette(Array.from({ length: 9 }, (_, i) => ({ type: "player" as const, league: "nba", name: `P${i}`, slug: `p${i}`, subtitle: null })), 6);
  assert.equal(many.length, 6);
});
