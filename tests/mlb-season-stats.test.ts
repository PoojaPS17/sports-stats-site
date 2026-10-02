// MLB player season stats and the leader boards built on them.
//
// The fixtures are real `athletes/{id}/stats` responses captured on 2026-10-02, trimmed to the
// categories the loader reads: Aaron Judge (33192), a batter, and Aaron Nola (33709), a pitcher.
// Note ESPN's own inconsistency — a batter's regular-season category is called "career-batting" and
// a pitcher's is called "pitching" — which is why the loader matches on both spellings. The
// postseason lines come back in the SAME response ("postseason-batting", "postseason-pitching"), so
// baseball needs no second request the way the NBA's playoffs line does.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { formatLeaderValue } from "../src/lib/leaders";

const judge = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-judge-33192-stats.json", import.meta.url), "utf8"));
const nola = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-nola-33709-stats.json", import.meta.url), "utf8"));

let db: TestDb;
let seasonStats: typeof import("../scripts/lib/season-stats");
let leaderQueries: typeof import("../src/lib/leaderQueries");
// queries.ts and leaderQueries.ts open src/lib/db.ts's pool at import time, so both are loaded only
// after startTestDb has pointed DATABASE_URL at the throwaway database.
let queries: typeof import("../src/lib/queries");
before(async () => {
  db = await startTestDb();
  seasonStats = await import("../scripts/lib/season-stats");
  leaderQueries = await import("../src/lib/leaderQueries");
  queries = await import("../src/lib/queries");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from player_season_stats");
  await db.pool.query("delete from players");
  await db.pool.query("delete from teams");
});

// `upsertPlayerSeasonStats` fetches; `storeAthleteSeasons` is the pure-input half the loader calls.
const store = (id: string, data: unknown, team: string | null = "10") => seasonStats.storeAthleteSeasons("mlb", id, team, data as { categories?: unknown[] }, 2023);

const seasonRow = async (id: string, season: number) =>
  (
    await db.pool.query(
      `select games_played, home_runs, rbi, batting_avg::float as batting_avg, strikeouts, era::float as era, pitching_wins, innings_pitched::float as innings_pitched
       from player_season_stats where league = 'mlb' and player_espn_id = $1 and season = $2`,
      [id, season],
    )
  ).rows[0];

test("a batter's season stores the columns the boards rank by", async () => {
  const n = await store("33192", judge);
  assert.ok(n >= 4, "2023 onwards, one row per season");
  const row = await seasonRow("33192", 2024);
  assert.ok(row, "2024 is stored");
  assert.ok(row.home_runs > 0 && row.rbi > 0, "home runs and runs batted in");
  assert.ok(row.batting_avg > 0.2 && row.batting_avg < 0.5, `a batting average as a number, got ${row.batting_avg}`);
  assert.ok(row.games_played > 100);
  // A batter has no pitching figures at all, rather than zeros.
  assert.equal(row.era, null);
  assert.equal(row.pitching_wins, null);
  assert.equal(row.innings_pitched, null);
});

test("nothing earlier than 2023 is stored, even though ESPN sends a whole career", async () => {
  await store("33192", judge);
  const { rows } = await db.pool.query(`select min(season) as first from player_season_stats where league = 'mlb'`);
  assert.equal(rows[0].first, 2023, "ESPN's response reaches back to 2016; HISTORY_START.mlb is 2023");
});

test("a pitcher's season stores innings, strikeouts, wins and an ERA, and no batting figures", async () => {
  await store("33709", nola);
  const row = await seasonRow("33709", 2024);
  assert.ok(row, "2024 is stored");
  assert.ok(row.strikeouts > 0);
  assert.ok(row.era > 0);
  assert.ok(row.innings_pitched > 0);
  assert.equal(row.home_runs, null, "a pitcher's own home runs are not in his pitching line");
  assert.equal(row.batting_avg, null);
});

test("the postseason line is stored beside the regular season, from the one response", async () => {
  await store("33192", judge);
  const { rows } = await db.pool.query(`select categories from player_season_stats where league = 'mlb' and player_espn_id = '33192' and season = 2024`);
  const keys = Object.keys(rows[0].categories);
  assert.ok(keys.some((k) => /batting/.test(k) && !/postseason/.test(k)), `a regular-season batting category, got ${keys.join(", ")}`);
  assert.ok(keys.includes("postseason_batting"), `a postseason batting category, got ${keys.join(", ")}`);

  await store("33709", nola);
  const { rows: p } = await db.pool.query(`select categories from player_season_stats where league = 'mlb' and player_espn_id = '33709' and season = 2024`);
  assert.ok(Object.keys(p[0].categories).includes("postseason_pitching"));
});

test("a second run over the same response changes nothing", async () => {
  await store("33192", judge);
  const { rows: first } = await db.pool.query(`select updated_at from player_season_stats where league = 'mlb' and player_espn_id = '33192' and season = 2024`);
  await store("33192", judge);
  const { rows: second } = await db.pool.query(`select updated_at from player_season_stats where league = 'mlb' and player_espn_id = '33192' and season = 2024`);
  assert.deepEqual(first[0].updated_at, second[0].updated_at, "the upsert's is-distinct-from guard held");
});

// ---- the boards ----

test("MLB's boards are home runs, RBI, batting average, strikeouts and ERA", () => {
  assert.deepEqual(
    queries.LEADER_CATEGORIES.mlb.map((c) => c.column),
    ["home_runs", "rbi", "batting_avg", "strikeouts", "era"],
  );
  assert.equal(queries.LEADER_CATEGORIES.mlb.find((c) => c.column === "era")?.asc, true, "the ERA board is lowest first");
  assert.ok(!queries.LEADER_CATEGORIES.mlb.find((c) => c.column === "home_runs")?.asc);
});

test("a board figure prints as baseball prints it", () => {
  assert.equal(formatLeaderValue(0.312, "AVG"), ".312");
  assert.equal(formatLeaderValue(1, "AVG"), "1.000");
  assert.equal(formatLeaderValue(2.4, "ERA"), "2.40");
  assert.equal(formatLeaderValue(54, "HR"), "54");
  assert.equal(formatLeaderValue(1234, "YDS"), "1,234", "the other sports' units are unchanged");
});

async function board(column: string, season = 2026) {
  return (await leaderQueries.getLeaderBoard("mlb", column, { limit: 5, season })).rows.map((r) => [r.name, r.value, r.rank]);
}

async function seed(rows: { id: string; name: string; hr?: number; rbi?: number; avg?: number; k?: number; era?: number; ip?: number; gp?: number }[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('mlb', '10', 'New York Yankees', 'new-york-yankees')`);
  for (const r of rows) {
    await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values ('mlb', $1, '10', $2, $3)`, [r.id, r.name, r.name.toLowerCase().replace(/\s+/g, "-")]);
    await db.pool.query(
      `insert into player_season_stats (league, season, player_espn_id, team_espn_id, home_runs, rbi, batting_avg, strikeouts, era, innings_pitched, games_played)
       values ('mlb', 2026, $1, '10', $2, $3, $4, $5, $6, $7, $8)`,
      [r.id, r.hr ?? null, r.rbi ?? null, r.avg ?? null, r.k ?? null, r.era ?? null, r.ip ?? null, r.gp ?? null],
    );
  }
}

test("the home-run board is highest first", async () => {
  await seed([
    { id: "1", name: "Big Bat", hr: 52, rbi: 120, gp: 160 },
    { id: "2", name: "Second Bat", hr: 44, rbi: 130, gp: 158 },
    { id: "3", name: "Third Bat", hr: 44, rbi: 90, gp: 150 },
  ]);
  assert.deepEqual(await board("home_runs"), [
    ["Big Bat", 52, 1],
    ["Second Bat", 44, 2],
    ["Third Bat", 44, 2],
  ]);
});

test("the ERA board is LOWEST first, which is what an ERA board is", async () => {
  await seed([
    { id: "1", name: "Ace", era: 2.1, k: 240, ip: 200, gp: 32 },
    { id: "2", name: "Second Starter", era: 3.4, k: 180, ip: 190, gp: 31 },
    { id: "3", name: "Batting Practice", era: 6.8, k: 60, ip: 120, gp: 24 },
  ]);
  assert.deepEqual(await board("era"), [
    ["Ace", 2.1, 1],
    ["Second Starter", 3.4, 2],
    ["Batting Practice", 6.8, 3],
  ]);
  // Strikeouts, on the same rows, still read highest first.
  assert.deepEqual((await board("strikeouts")).map(([n]) => n), ["Ace", "Second Starter", "Batting Practice"]);
});

test("a batting average needs a qualifying share of the season's games, and an ERA of its innings", async () => {
  await seed([
    { id: "1", name: "Everyday Player", avg: 0.31, gp: 150 },
    { id: "2", name: "Ten Game Cameo", avg: 0.55, gp: 10 },
    { id: "3", name: "Ace", era: 2.4, ip: 200, gp: 32 },
    { id: "4", name: "One Good Outing", era: 0.9, ip: 12, gp: 3 },
  ]);
  const avg = await board("batting_avg");
  assert.deepEqual(avg.map(([n]) => n), ["Everyday Player"], "a .550 cameo does not lead the league");
  const era = await board("era");
  assert.deepEqual(era.map(([n]) => n), ["Ace"], "nor does a 0.90 ERA over twelve innings");
});
