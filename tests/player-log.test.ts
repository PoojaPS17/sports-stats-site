// fetchReportedGames: ESPN's NFL and NBA games played per season, straight from player_season_stats.
// fetchPlayerLog: the no_box_score flag on an NBA game in which no player has a stat line.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";

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
  await insert("nba", 2024, "p1", 0);
  await insert("nba", 2023, "p1", null);
  await insert("nba", 2025, "p2", 61);
  await insert("epl", 2025, "p1", 38);
  await seedGames();
});

const box = (min: string | null, pts: string) => ({ box: { ...(min === null ? {} : { MIN: min }), PTS: pts, REB: "0", AST: "0" } });

/** Seven games (blank, min, pts, zeros, decimal, own, solo) in each of nba and nfl; p1 is in every one, teammates carry the stat lines. */
async function seedGames() {
  const games: { id: string; stats: Record<string, object> }[] = [
    // Nobody has a minutes line or points: ESPN published no box score.
    { id: "blank", stats: { p1: box("--", "0"), p2: box("--", "0"), p3: box("--", "0") } },
    // A teammate has a numeric minutes line (a sub-minute "0" counts).
    { id: "min", stats: { p1: box("--", "0"), p2: box("0", "0") } },
    // A teammate has points but no minutes cell.
    { id: "pts", stats: { p1: box("--", "0"), p2: box(null, "7") } },
    // Points that are zero or a dash do not count.
    { id: "zeros", stats: { p1: box("--", "0"), p2: box("--", "--"), p3: box(null, "0") } },
    // A teammate's minutes cell has a decimal: still a numeric MIN, the same reading as `cell()` in playerProfile.ts.
    { id: "decimal", stats: { p1: box("--", "0"), p2: box("12.5", "0") } },
    // p1 himself has the line.
    { id: "own", stats: { p1: box("31", "12") } },
    // p1 alone in the game, blank.
    { id: "solo", stats: { p1: box("--", "0") } },
  ];
  for (const league of ["nba", "nfl"]) {
    await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, '1', 'One', 'one'), ($1, '2', 'Two', 'two')`, [league]);
    for (const g of games) {
      await db.pool.query(
        `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
         values ($1, $2, now(), 'x', 2025, '1', '2', 100, 90, true, 2, 'STD')`,
        [league, g.id]
      );
      for (const [player, stats] of Object.entries(g.stats)) {
        await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, '1', $4)`, [league, g.id, player, JSON.stringify(stats)]);
      }
    }
  }
}

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

test("fetchReportedGames returns the same figures for an NBA player, skipping a null or zero figure", async () => {
  assert.deepEqual([...(await fetchReportedGames(db.pool, "nba", "p1")).entries()], [[2025, 70]]);
  assert.deepEqual([...(await fetchReportedGames(db.pool, "nba", "p2")).entries()], [[2025, 61]]);
  assert.equal((await fetchReportedGames(db.pool, "nba", "nobody")).size, 0);
});

test("fetchReportedGames returns an empty map for a league that is neither the NFL nor the NBA without querying", async () => {
  const stub = {
    query: () => {
      throw new Error("must not query");
    },
  } as unknown as Parameters<typeof fetchReportedGames>[0];
  assert.equal((await fetchReportedGames(stub, "epl", "p1")).size, 0);
  assert.equal((await fetchReportedGames(stub, "bundesliga", "p1")).size, 0);
});

test("fetchPlayerLog flags an NBA row in a game where nobody has a numeric MIN or PTS above zero", async () => {
  const log = await fetchPlayerLog(db.pool, "nba", "p1");
  const flag = Object.fromEntries(log.map((r) => [r.game_espn_id, r.no_box_score]));
  assert.deepEqual(flag, { blank: true, min: false, pts: false, zeros: true, decimal: false, own: false, solo: true });
});

test("fetchPlayerLog never flags a row of another league, even in a game with no stat lines", async () => {
  const log = await fetchPlayerLog(db.pool, "nfl", "p1");
  assert.equal(log.length, 7);
  assert.ok(log.every((r) => r.no_box_score === false));
});
