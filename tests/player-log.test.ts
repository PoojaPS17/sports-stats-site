// fetchReportedGames: ESPN's NFL games played per season, straight from player_season_stats.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { fetchReportedGames } from "../src/lib/playerLog";

let db: TestDb;

before(async () => {
  db = await startTestDb();
  const insert = (league: string, season: number, player: string, gp: number | null) =>
    db.pool.query(`insert into player_season_stats (league, season, player_espn_id, games_played) values ($1, $2, $3, $4)`, [league, season, player, gp]);
  await insert("nfl", 2025, "p1", 16);
  await insert("nfl", 2024, "p1", 17);
  await insert("nfl", 2023, "p1", null);
  await insert("nfl", 2022, "p1", 0);
  await insert("nfl", 2025, "p2", 9);
  await insert("nba", 2025, "p1", 70);
});

after(async () => {
  await db?.stop();
});

test("fetchReportedGames maps each season to ESPN's games played, skipping a null or zero figure and other players", async () => {
  const map = await fetchReportedGames(db.pool, "nfl", "p1");
  assert.deepEqual([...map.entries()].sort((a, b) => a[0] - b[0]), [[2024, 17], [2025, 16]]);
});

test("fetchReportedGames is empty for a player with no season rows", async () => {
  assert.equal((await fetchReportedGames(db.pool, "nfl", "nobody")).size, 0);
});

test("fetchReportedGames returns an empty map for any league but the NFL without querying", async () => {
  const stub = {
    query: () => {
      throw new Error("must not query");
    },
  } as unknown as Parameters<typeof fetchReportedGames>[0];
  assert.equal((await fetchReportedGames(stub, "nba", "p1")).size, 0);
  assert.equal((await fetchReportedGames(stub, "epl", "p1")).size, 0);
});
