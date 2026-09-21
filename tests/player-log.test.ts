// fetchReportedGames: ESPN's NFL and NBA games played per season, straight from player_season_stats.
// fetchEspnSeasons: ESPN's whole NBA season line, from the stored categories.
// fetchPlayerLog: the no_box_score flag on an NBA game in which no player has a stat line.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { fetchEspnSeasons, fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";

let db: TestDb;

// ESPN's stored NBA season row (Knicks 2022 in the sample payload).
const ESPN_ROW = {
  averages: {
    labels: ["GP", "GS", "MIN", "FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
    values: ["26", "4", "24.5", "4.7-10.5", "44.5", "1.4-3.5", "40.2", "1.2-1.2", "96.8", "0.8", "2.2", "3.0", "4.0", "0.5", "0.8", "0.6", "1.5", "12.0"],
  },
  totals: {
    labels: ["FG", "FG%", "3PT", "3P%", "FT", "FT%", "OR", "DR", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
    values: ["122-274", "44.5", "37-92", "40.2", "30-31", "96.8", "21", "57", "78", "103", "12", "22", "15", "39", "311"],
  },
};

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
  const withCategories = (league: string, season: number, player: string, categories: object) =>
    db.pool.query(`insert into player_season_stats (league, season, player_espn_id, categories) values ($1, $2, $3, $4)`, [league, season, player, JSON.stringify(categories)]);
  await withCategories("nba", 2026, "e1", ESPN_ROW);
  await withCategories("nba", 2025, "e1", { averages: ESPN_ROW.averages });
  await withCategories("nba", 2024, "e1", { ...ESPN_ROW, averages: { ...ESPN_ROW.averages, values: ["0", ...ESPN_ROW.averages.values.slice(1)] } });
  // A season with ESPN's postseason line beside the regular-season one (the loader's postseason_ keys), and one with only a postseason line.
  await withCategories("nba", 2026, "e2", { ...ESPN_ROW, postseason_averages: { labels: ESPN_ROW.averages.labels, values: ["6", "6", "39.8", ...ESPN_ROW.averages.values.slice(3, 17), "22.7"] }, postseason_totals: ESPN_ROW.totals });
  await withCategories("nba", 2025, "e2", { postseason_averages: ESPN_ROW.averages, postseason_totals: ESPN_ROW.totals });
  await withCategories("nfl", 2026, "e1", ESPN_ROW);
  await withCategories("epl", 2026, "e1", ESPN_ROW);
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

test("fetchEspnSeasons returns the NBA seasons whose stored row ESPN's line can be read from, and no others", async () => {
  const map = await fetchEspnSeasons(db.pool, "nba", "e1");
  // 2025 has no totals, 2024 has GP 0: neither is a line.
  assert.deepEqual([...map.keys()], [2026]);
  assert.equal(map.get(2026)?.games, 26);
  assert.equal(map.get(2026)?.pts, 311);
  assert.equal(map.get(2026)?.fga, 274);
  // Rows without categories (the default) and players with no rows give nothing.
  assert.equal((await fetchEspnSeasons(db.pool, "nba", "p1")).size, 0);
  assert.equal((await fetchEspnSeasons(db.pool, "nba", "nobody")).size, 0);
});

test("fetchEspnSeasons also returns ESPN's postseason line per season, read from the postseason_ keys", async () => {
  const map = await fetchEspnSeasons(db.pool, "nba", "e2");
  // The regular-season map is unchanged: only 2026 has regular-season keys.
  assert.deepEqual([...map.keys()], [2026]);
  assert.equal(map.get(2026)?.games, 26);
  // The postseason map has its own seasons: 2026's postseason averages say 22.7 a game where the totals' 311 over 6 games is 51.8, so
  // that row is rejected as inconsistent; 2025 (a row with only postseason keys) reads.
  assert.deepEqual([...map.postseason.keys()], [2025]);
  assert.equal(map.postseason.get(2025)?.games, 26);
  // A player with only regular-season keys has no postseason line.
  assert.equal((await fetchEspnSeasons(db.pool, "nba", "e1")).postseason.size, 0);
});

test("fetchEspnSeasons returns an empty map for a league that is not the NBA without querying", async () => {
  const stub = {
    query: () => {
      throw new Error("must not query");
    },
  } as unknown as Parameters<typeof fetchEspnSeasons>[0];
  assert.equal((await fetchEspnSeasons(stub, "nfl", "e1")).size, 0);
  assert.equal((await fetchEspnSeasons(stub, "epl", "e1")).size, 0);
  assert.equal((await fetchEspnSeasons(stub, "epl", "e1")).postseason.size, 0);
  // Stored NFL and soccer rows with the same shape are never read.
  assert.equal((await fetchEspnSeasons(db.pool, "nfl", "e1")).size, 0);
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
