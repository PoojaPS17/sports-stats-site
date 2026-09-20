// An NFL regular season ESPN counts games for (player_season_stats.games_played) but that has no box-score row for the
// player (ESPN's box scores omit a player with no stat line) is a season on the player page, with ESPN's games and no
// figures of its own. NBA and soccer are untouched, and so are the playoffs.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { buildProfile, buildStagedProfile, reportedForSeason, type PlayerLogRow, type Stats } from "../src/lib/playerProfile";
import { fetchPlayerLog, fetchReportedGames } from "../src/lib/playerLog";
import { careerStripStats, recordText } from "../src/components/PlayerStatsShared";
import type { GameStage } from "../src/lib/gameStage";

const passing = (yds: number): Stats => ({ passing: { "C/ATT": "20/30", YDS: String(yds), TD: "2", INT: "0", RTG: "100.0" } });

function nflGame(id: string, date: string, season: number, stage: GameStage = "regular", result: "W" | "L" = "W"): PlayerLogRow {
  return {
    game_espn_id: id,
    date,
    season_year: season,
    round: null,
    week: null,
    stage,
    season_type: stage === "playoffs" ? 3 : 2,
    competition_type: "STD",
    is_home: true,
    team_espn_id: "1",
    team_name: "Home FC",
    team_slug: "home-fc",
    team_abbr: "HOM",
    team_logo: null,
    opponent_espn_id: "2",
    opponent_name: "Away FC",
    opponent_slug: "away-fc",
    opponent_abbr: "AWY",
    opponent_logo: null,
    team_score: 24,
    opponent_score: 17,
    result,
    stats: passing(200),
  };
}

// Rows in 2019 (two games) and 2021 (one); ESPN counts games in 2019, 2020 (no row at all) and 2021.
const ROWS: PlayerLogRow[] = [nflGame("a1", "2019-09-08", 2019), nflGame("a2", "2019-09-15", 2019, "regular", "L"), nflGame("c1", "2021-09-12", 2021)];
const STORED = new Map([[2019, 16], [2020, 5], [2021, 17]]);

test("a stored season with no rows becomes a season with ESPN's games and no figures of its own", () => {
  const p = buildProfile("nfl", ROWS, ROWS, STORED);
  assert.deepEqual(p.seasons.map((s) => s.season), [2021, 2020, 2019]);
  const s = p.seasons[1];
  assert.equal(s.games, 5);
  assert.equal(s.gamesSource, "espn");
  assert.equal(s.recorded, 0);
  assert.equal(s.unrecorded, 0);
  assert.equal(s.record, null);
  assert.equal(s.lineSource, "box");
  assert.deepEqual(s.teams, []);
  // Every total is ESPN's zero; an average has no value to give.
  assert.equal(s.line.pass_yds, 0);
  assert.equal(s.line.pass_td, 0);
  assert.equal(s.line.pass_att, 0);
  assert.equal(s.line.pass_rtg, null);
  assert.equal(p.games, 16 + 5 + 17);
  assert.equal(p.gamesFromEspn, true);
});

test("the seasons that have rows are exactly what they were without the added one", () => {
  const withGap = buildProfile("nfl", ROWS, ROWS, STORED);
  const without = buildProfile("nfl", ROWS, ROWS, new Map([[2019, 16], [2021, 17]]));
  assert.deepEqual(withGap.seasons.filter((s) => s.season !== 2020), without.seasons);
  // Nothing else on the profile reads the added season: totals, splits, best games, milestones and the log are the rows'.
  assert.deepEqual(withGap.career, without.career);
  assert.equal(withGap.rows.length, 3);
  assert.equal(withGap.recorded, 3);
  assert.equal(withGap.unrecorded, 0);
  assert.deepEqual(withGap.homeAway, without.homeAway);
  assert.deepEqual(withGap.opponents, without.opponents);
  assert.deepEqual(withGap.best, without.best);
  assert.deepEqual(withGap.milestones, without.milestones);
  assert.deepEqual(withGap.teams, without.teams);
});

test("the added season drops the career W-L, which no longer covers every game, and the strip reads ESPN's games", () => {
  const p = buildProfile("nfl", ROWS, ROWS, STORED);
  assert.equal(p.record, null);
  const strip = careerStripStats(p);
  assert.deepEqual(strip.slice(0, 2), [
    { label: "GP", value: "38" },
    { label: "W-L", value: "–" },
  ]);
  assert.equal(recordText(p.seasons[1].record, false), "–");
});

test("a stored figure of 0, or none, adds no season", () => {
  const zero = buildProfile("nfl", ROWS, ROWS, new Map([[2019, 2], [2020, 0], [2021, 1]]));
  assert.deepEqual(zero.seasons.map((s) => s.season), [2021, 2019]);
  const none = buildProfile("nfl", ROWS, ROWS, new Map());
  assert.deepEqual(none.seasons.map((s) => s.season), [2021, 2019]);
  assert.equal(none.gamesFromEspn, false);
  assert.equal(buildProfile("nfl", ROWS).games, 3);
});

test("a stored season older or newer than every row is still a season, and the order is newest first", () => {
  const p = buildProfile("nfl", ROWS, ROWS, new Map([[2016, 3], [2019, 16], [2023, 9]]));
  assert.deepEqual(p.seasons.map((s) => s.season), [2023, 2021, 2019, 2016]);
  assert.deepEqual(p.seasons.map((s) => s.games), [9, 1, 16, 3]);
});

test("a profile with no rows at all is left as it was, whatever is stored (its page has no teams or columns to show it with)", () => {
  const p = buildProfile("nfl", [], [], new Map([[2019, 16], [2020, 5]]));
  assert.deepEqual(p.seasons, []);
  assert.equal(p.games, 0);
  assert.equal(p.gamesFromEspn, false);
  const staged = buildStagedProfile("nfl", [], new Map([[2019, 16]]));
  assert.equal(staged.regular.games, 0);
  assert.equal(staged.counted.games, 0);
  assert.equal(staged.log.length, 0);
});

test("NBA and soccer ignore stored seasons that have no rows", () => {
  const box = (pts: number): Stats => ({ box: { MIN: "30", PTS: String(pts), REB: "5", AST: "5" } });
  const nbaRows = [{ ...nflGame("n1", "2025-01-10", 2025), stats: box(20) }, { ...nflGame("n2", "2025-01-17", 2025), stats: box(10) }];
  const map = new Map([[2024, 60], [2025, 2]]);
  const withMap = buildStagedProfile("nba", nbaRows, map).regular;
  const plain = buildStagedProfile("nba", nbaRows).regular;
  assert.deepEqual(withMap.seasons.map((s) => s.season), [2025]);
  assert.deepEqual(withMap.seasons, plain.seasons);
  assert.equal(withMap.games, 2);
  assert.deepEqual(buildProfile("nba", nbaRows, nbaRows, map).seasons, buildProfile("nba", nbaRows).seasons);

  const goal = (g: number): Stats => ({ match: { APP: "1", SUBIN: "0", G: String(g), A: "0", SHOT: "1", SOG: "1", FC: "0", FA: "0", YC: "0", RC: "0" } });
  const soccerRows = [{ ...nflGame("s1", "2025-01-10", 2025), stats: goal(1) }, { ...nflGame("s2", "2025-01-17", 2025), stats: goal(0) }];
  const soccer = buildStagedProfile("soccer", soccerRows, map).regular;
  assert.deepEqual(soccer.seasons.map((s) => s.season), [2025]);
  assert.equal(soccer.games, 2);
  assert.deepEqual(buildProfile("soccer", soccerRows, soccerRows, map).seasons, buildProfile("soccer", soccerRows).seasons);
});

test("staged NFL: the added season is in the regular-season table only, never in the playoffs, play-in or counted profiles", () => {
  const rows = [...ROWS, nflGame("po", "2022-01-15", 2021, "playoffs")];
  const s = buildStagedProfile("nfl", rows, STORED);
  assert.deepEqual(s.regular.seasons.map((x) => x.season), [2021, 2020, 2019]);
  assert.equal(s.regular.seasons[1].games, 5);
  assert.ok(s.playoffs);
  assert.deepEqual(s.playoffs.seasons.map((x) => [x.season, x.games, x.gamesSource]), [[2021, 1, "logged"]]);
  assert.equal(s.playoffs.games, 1);
  assert.equal(s.playin, null);
  assert.deepEqual(s.counted.seasons.map((x) => x.season), [2021, 2019]);
  assert.equal(s.counted.games, 4);
  // The game log has only real games.
  assert.equal(s.log.length, 4);
});

test("the season page reads one season: it is handed that season's stored figure alone, so it lists no other", () => {
  assert.deepEqual([...reportedForSeason(STORED, 2019).entries()], [[2019, 16]]);
  assert.equal(reportedForSeason(STORED, 2018).size, 0);
  const forSeason = (season: number) => buildStagedProfile("nfl", ROWS.filter((r) => r.season_year === season), reportedForSeason(STORED, season)).regular;
  // A season with rows: just itself, as before.
  assert.deepEqual(forSeason(2019).seasons.map((s) => [s.season, s.games]), [[2019, 16]]);
  assert.equal(forSeason(2019).games, 16);
  // A stored season with no rows: no rows to build a season from, so the page keeps showing ESPN's stored season stats.
  assert.equal(forSeason(2020).games, 0);
  assert.deepEqual(forSeason(2020).seasons, []);
});

// ---------------------------------------------------------------------------
// End to end on the throwaway database: what the player page and the season page read.
// ---------------------------------------------------------------------------
let db: TestDb;
let getPlayerSeasons: typeof import("../src/lib/queries").getPlayerSeasons;

before(async () => {
  db = await startTestDb();
  ({ getPlayerSeasons } = await import("../src/lib/queries"));
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nfl', '1', 'One', 'one'), ('nfl', '2', 'Two', 'two')`);
  for (const [id, season] of [["g19", 2019], ["g21", 2021]] as const) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
       values ('nfl', $1, $2, 'x', $3, '1', '2', 24, 17, true, 2, 'STD')`,
      [id, `${season}-10-06T18:00:00Z`, season]
    );
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nfl', $1, 'p1', '1', $2)`, [id, JSON.stringify(passing(250))]);
  }
  const season = (year: number, player: string, gp: number | null) =>
    db.pool.query(`insert into player_season_stats (league, season, player_espn_id, team_espn_id, games_played) values ('nfl', $1, $2, '1', $3)`, [year, player, gp]);
  await season(2019, "p1", 16);
  await season(2020, "p1", 5);
  await season(2021, "p1", 17);
  await season(2022, "p1", 0);
  await season(2019, "lineman", 16);
});

after(async () => {
  await db?.stop();
});

test("database: the player page's profile has the stored season, and the season page's guard lists it, so the link is never a 404", async () => {
  const [log, reported, seasons] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "p1"), fetchReportedGames(db.pool, "nfl", "p1"), getPlayerSeasons("nfl", "p1")]);
  const regular = buildStagedProfile("nfl", log, reported).regular;
  assert.deepEqual(regular.seasons.map((s) => [s.season, s.games, s.gamesSource, s.recorded]), [[2021, 17, "espn", 1], [2020, 5, "espn", 0], [2019, 16, "espn", 1]]);
  assert.equal(regular.games, 38);
  // The [season] page shows a season only when it is a log season or a stored one (`seasons.includes(season)`).
  const pageSeasons = new Set([...log.map((r) => r.season_year), ...seasons]);
  for (const s of regular.seasons) assert.ok(pageSeasons.has(s.season), `season ${s.season} must have a page`);
  // A stored figure of 0 is neither a season of the profile nor a stored figure.
  assert.equal(reported.has(2022), false);
});

test("database: a player with a stored season and no rows has a stored season but no profile seasons", async () => {
  const [log, reported] = await Promise.all([fetchPlayerLog(db.pool, "nfl", "lineman"), fetchReportedGames(db.pool, "nfl", "lineman")]);
  assert.equal(log.length, 0);
  assert.equal(reported.get(2019), 16);
  assert.deepEqual(buildStagedProfile("nfl", log, reported).regular.seasons, []);
  assert.deepEqual(await getPlayerSeasons("nfl", "lineman"), [2019]);
});
