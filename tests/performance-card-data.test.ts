// tests/performance-card-data.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let loadPerformanceCardData: (typeof import("../src/lib/performanceCardData"))["loadPerformanceCardData"];
let buildPerformanceCardElement: (typeof import("../src/lib/performanceCardData"))["buildPerformanceCardElement"];

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ loadPerformanceCardData, buildPerformanceCardElement } = await import("../src/lib/performanceCardData"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic', 'G', '77')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', $1)`, [JSON.stringify(NBA_LINE)]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a real triple loads the game, player, row, profile, sport and stats", async () => {
  const data = await loadPerformanceCardData("nba", "g1", "luka-doncic");
  assert.ok(data);
  assert.equal(data!.game.espn_id, "g1");
  assert.equal(data!.player.slug, "luka-doncic");
  assert.equal(data!.sport, "nba");
  assert.equal(data!.row.stats.box!.PTS, "34");
  const pts = data!.stats.find((s) => s.key === "pts");
  assert.equal(pts?.value, "34");
});

test("an unknown game, unknown player, a league outside NBA/NFL, or a player with no line in this game all return null", async () => {
  assert.equal(await loadPerformanceCardData("nba", "nope", "luka-doncic"), null);
  assert.equal(await loadPerformanceCardData("nba", "g1", "nobody"), null);
  assert.equal(await loadPerformanceCardData("epl", "g1", "luka-doncic"), null);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p2', '1', 'Bench Guy', 'bench-guy')`);
  assert.equal(await loadPerformanceCardData("nba", "g1", "bench-guy"), null);
});

test("buildPerformanceCardElement builds the same element the card route renders (same stats, same team accent)", async () => {
  const data = await loadPerformanceCardData("nba", "g1", "luka-doncic");
  const element = buildPerformanceCardElement(data!);
  assert.equal(element.type, (await import("../src/components/PerformanceCard")).PerformanceCard);
  assert.equal((element.props as { playerName: string }).playerName, "Luka Dončić");
});
