// League leader boards against a real database: in-season boards are summed from the stored box scores (so they always
// agree with the player pages, which sum the same rows), a traded player is shown with every club of the season, ties
// are numbered as a competition and listed whole at the cutoff, and a season with no box scores keeps ESPN's rows.
// UCL (its own box-score rebuild into player_season_stats) and cricket keep their sources.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { buildStagedProfile, formatStat, playerSport } from "../src/lib/playerProfile";
import type { League } from "../src/lib/leagues";

let db: TestDb;
let queries: typeof import("../src/lib/queries");

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const team = (league: string, id: string, name: string) => q(`insert into teams (league, espn_id, name, slug) values ($1, $2, $3, $4)`, [league, id, name, name.toLowerCase().replace(/ /g, "-")]);
const player = (league: string, id: string, name: string, currentTeam: string) =>
  q(`insert into players (league, espn_id, team_espn_id, name, slug) values ($1, $2, $3, $4, $5)`, [league, id, currentTeam, name, name.toLowerCase().replace(/[^a-z0-9]+/g, "-")]);
async function game(league: string, id: string, date: string, season: number, o: { type?: number; completed?: boolean; round?: string | null } = {}) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type, round, home_score, away_score)
     values ($1, $2, $3, $2, '1', '2', $4, $5, $6, $7, 1, 0)`,
    [league, id, date, season, o.completed ?? true, o.type ?? null, o.round ?? null]
  );
}
const row = (league: string, gameId: string, playerId: string, teamId: string, stats: object) =>
  q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, $4, $5)`, [league, gameId, playerId, teamId, JSON.stringify(stats)]);
const pss = (league: string, season: number, playerId: string, teamId: string, cols: { goals?: number; assists?: number; passing_yards?: number; rushing_yards?: number; pts_avg?: number; reb_avg?: number; ast_avg?: number; games_played?: number; categories?: object }) =>
  q(
    `insert into player_season_stats (league, season, player_espn_id, team_espn_id, categories, goals, assists, passing_yards, rushing_yards, pts_avg, reb_avg, ast_avg, games_played)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [league, season, playerId, teamId, JSON.stringify(cols.categories ?? {}), cols.goals ?? null, cols.assists ?? null, cols.passing_yards ?? null, cols.rushing_yards ?? null, cols.pts_avg ?? null, cols.reb_avg ?? null, cols.ast_avg ?? null, cols.games_played ?? null]
  );

const soccer = (g: number, a = 0, app = 1) => ({ match: { APP: String(app), SUBIN: "0", G: String(g), A: String(a) } });
const nfl = (cat: "passing" | "rushing" | "receiving", yds: number) => ({ [cat]: { YDS: String(yds) } });
const nba = (pts: number, min = "30", reb = 5, ast = 5) => ({ box: { MIN: min, PTS: String(pts), REB: String(reb), AST: String(ast) } });
const blank = { box: { MIN: "--", PTS: "0", REB: "0", AST: "0" } };

/** ESPN's stored NBA season row for a player: `games` played, points made of 2 x FGM + 3PM + FTM. */
function espnRow(games: number, o: { fg: [number, number]; tp: [number, number]; ft: [number, number]; reb: number; ast: number }) {
  const pts = 2 * o.fg[0] + o.tp[0] + o.ft[0];
  const labels = ["GP", "GS", "MIN", "PTS"];
  return {
    averages: { labels, values: [String(games), String(games), "30.0", (pts / games).toFixed(1)] },
    totals: {
      labels: ["FG", "3PT", "FT", "REB", "AST", "STL", "BLK", "TO", "PTS"],
      values: [`${o.fg[0]}-${o.fg[1]}`, `${o.tp[0]}-${o.tp[1]}`, `${o.ft[0]}-${o.ft[1]}`, String(o.reb), String(o.ast), "10", "5", "20", String(pts)],
    },
  };
}

/** What the player's own page shows for a season: the regular-season line built from the same box-score rows. */
async function pageLine(league: League, playerId: string, season: number) {
  const [log, reported, espn] = await Promise.all([queries.getPlayerLog(league, playerId), queries.getPlayerReportedGames(league, playerId), queries.getPlayerEspnSeasons(league, playerId)]);
  const staged = buildStagedProfile(playerSport(league)!, log, reported, espn);
  const line = staged.regular.seasons.find((s) => s.season === season)?.line;
  assert.ok(line, `${league} ${playerId} has a ${season} line`);
  return { line, specs: staged.regular.profile.specs };
}
const shown = (specs: { key: string; decimals?: number }[], line: Record<string, number | null>, key: string) => Number(formatStat(specs.find((s) => s.key === key)! as never, line[key]).replace(/,/g, ""));

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");

  // ---------------- EPL ----------------
  for (const [id, name] of [["1", "Manchester City"], ["2", "Arsenal"], ["3", "Chelsea"], ["4", "Tottenham"]]) await team("epl", id, name);
  // 2026: four completed games and one not yet finished (its rows are live and count nowhere).
  await game("epl", "e1", "2026-08-15T14:00:00Z", 2026);
  await game("epl", "e2", "2026-08-22T14:00:00Z", 2026);
  await game("epl", "e3", "2026-09-05T14:00:00Z", 2026);
  await game("epl", "e4", "2026-09-12T14:00:00Z", 2026);
  await game("epl", "e5", "2026-09-19T14:00:00Z", 2026, { completed: false });
  const eplPlayers: [string, string, string][] = [["h", "Haaland", "3"], ["a", "Ann Scorer", "2"], ["b", "Bob Scorer", "2"], ["c", "Cy Scorer", "4"], ["d", "Dee Scorer", "1"], ["t", "Trader", "4"], ["u", "Unused Sub", "1"]];
  for (const [id, name, current] of eplPlayers) await player("epl", id, name, current);
  await row("epl", "e1", "h", "1", soccer(2));
  await row("epl", "e2", "h", "1", soccer(1));
  await row("epl", "e4", "h", "1", soccer(2));
  await row("epl", "e5", "h", "1", soccer(3)); // a game in progress
  await row("epl", "e1", "a", "2", soccer(1, 2));
  await row("epl", "e2", "a", "2", soccer(1, 2));
  await row("epl", "e3", "a", "2", soccer(1, 1));
  await row("epl", "e1", "b", "2", soccer(1));
  await row("epl", "e2", "b", "2", soccer(1, 1));
  await row("epl", "e3", "b", "2", soccer(1));
  await row("epl", "e2", "c", "4", soccer(2, 1));
  await row("epl", "e4", "c", "4", soccer(1));
  await row("epl", "e1", "d", "1", soccer(2));
  await row("epl", "e1", "t", "2", soccer(1)); // Arsenal first,
  await row("epl", "e3", "t", "4", soccer(1, 3)); // then Tottenham
  await row("epl", "e1", "u", "1", soccer(0, 0, 0)); // an unused substitute is no appearance
  // ESPN's athlete totals lag: Haaland's stored row says 4 goals for Chelsea (his box scores say 5 for City).
  await pss("epl", 2026, "h", "3", { goals: 4 });
  // 2025: no box scores at all, so ESPN's rows are the source. Two players tie on goals; assists break it.
  await player("epl", "o1", "Old Timer", "2");
  await player("epl", "o2", "Older Timer", "2");
  await pss("epl", 2025, "o1", "2", { goals: 20, assists: 3 });
  await pss("epl", 2025, "o2", "2", { goals: 20, assists: 9 });
  // 2024: finished, with box scores; ESPN's final row says 7, the box scores (and the player page) say 6.
  await game("epl", "f1", "2025-01-10T14:00:00Z", 2024);
  await row("epl", "f1", "a", "2", soccer(6));
  await pss("epl", 2024, "a", "2", { goals: 7 });

  // ---------------- NFL ----------------
  await team("nfl", "1", "Home Team");
  await team("nfl", "2", "Away Team");
  await game("nfl", "n1", "2026-09-13T17:00:00Z", 2026, { type: 2 });
  await game("nfl", "n2", "2026-09-20T17:00:00Z", 2026, { type: 2 });
  await game("nfl", "npre", "2026-08-20T17:00:00Z", 2026, { type: 1 });
  await game("nfl", "npo", "2027-01-15T17:00:00Z", 2026, { type: 3, round: "Wild Card" });
  for (const [id, name, cur] of [["qb1", "Tyler Shough", "2"], ["qb2", "Pat Mahomes", "1"], ["qb3", "Ann Passer", "1"], ["rb1", "Traded Runner", "2"], ["-8801", " Team", "1"]] as const) await player("nfl", id, name, cur);
  await row("nfl", "n1", "qb1", "1", nfl("passing", 300));
  await row("nfl", "n2", "qb1", "1", nfl("passing", 362));
  await row("nfl", "npre", "qb1", "1", nfl("passing", 250));
  await row("nfl", "npo", "qb1", "1", nfl("passing", 400));
  await row("nfl", "n1", "qb2", "1", nfl("passing", 250));
  await row("nfl", "n2", "qb2", "1", nfl("passing", 316));
  await row("nfl", "n1", "qb3", "1", nfl("passing", 566));
  await row("nfl", "n1", "rb1", "1", nfl("rushing", 60));
  await row("nfl", "n2", "rb1", "2", nfl("rushing", 80));
  await row("nfl", "n1", "-8801", "1", nfl("passing", 9000));
  await pss("nfl", 2026, "qb1", "2", { passing_yards: 400 });
  await pss("nfl", 2026, "qb2", "1", { passing_yards: 250 });

  // ---------------- NBA ----------------
  for (const [id, name] of [["1", "Boston Celtics"], ["2", "Philadelphia 76ers"], ["3", "Chicago Bulls"], ["4", "Miami Heat"]]) await team("nba", id, name);
  for (let i = 1; i <= 10; i++) await game("nba", `b${i}`, `2026-01-${String(i).padStart(2, "0")}T00:00:00Z`, 2026, { type: 2 });
  await game("nba", "blank1", "2026-02-01T00:00:00Z", 2026, { type: 2 });
  await game("nba", "blank2", "2026-02-02T00:00:00Z", 2026, { type: 2 });
  await game("nba", "bpre", "2025-10-05T00:00:00Z", 2026, { type: 1 });
  await game("nba", "bpo", "2026-04-20T00:00:00Z", 2026, { type: 3, round: "First Round" });
  const nbaPlayers: [string, string, string][] = [["star", "Star Guard", "1"], ["chi", "Bulls Wing", "3"], ["trade", "Traded Forward", "4"], ["few", "Few Games", "1"], ["low", "Low Scorer", "1"]];
  for (const [id, name, cur] of nbaPlayers) await player("nba", id, name, cur);
  // Star: 10 games at 30 for Boston (the preseason and playoff lines are not counted). ESPN's row lags at 9 games.
  for (let i = 1; i <= 10; i++) await row("nba", `b${i}`, "star", "1", nba(30, "34", 8, 4));
  await row("nba", "bpre", "star", "1", nba(60));
  await row("nba", "bpo", "star", "1", nba(60));
  await pss("nba", 2026, "star", "1", { pts_avg: 25, reb_avg: 6, ast_avg: 3, games_played: 9, categories: espnRow(9, { fg: [90, 200], tp: [10, 30], ft: [25, 30], reb: 54, ast: 27 }) });
  // Bulls Wing: eight games with a line (20 points) and two games ESPN published no box score for; ESPN's row has all ten.
  for (let i = 1; i <= 8; i++) await row("nba", `b${i}`, "chi", "3", nba(20, "30", 4, 6));
  await row("nba", "blank1", "chi", "3", blank);
  await row("nba", "blank2", "chi", "3", blank);
  await pss("nba", 2026, "chi", "3", { pts_avg: 35, reb_avg: 9, ast_avg: 2, games_played: 10, categories: espnRow(10, { fg: [140, 280], tp: [40, 100], ft: [30, 40], reb: 90, ast: 20 }) });
  // Traded Forward: four games at 20 for Boston, then six at 30 for Philadelphia; ESPN's current-team row says Miami.
  for (let i = 1; i <= 4; i++) await row("nba", `b${i}`, "trade", "1", nba(20, "30", 5, 5));
  for (let i = 5; i <= 10; i++) await row("nba", `b${i}`, "trade", "2", nba(30, "30", 5, 5));
  await pss("nba", 2026, "trade", "4", { pts_avg: 26, reb_avg: 5, ast_avg: 5, games_played: 10 });
  // Few Games: five games at 40, below the 70% rule.
  for (let i = 1; i <= 5; i++) await row("nba", `b${i}`, "few", "1", nba(40));
  await pss("nba", 2026, "few", "1", { pts_avg: 40, reb_avg: 5, ast_avg: 5, games_played: 5 });
  // Low Scorer: a full season at 10 points, 4 assists (Star's 4 apg too).
  for (let i = 1; i <= 10; i++) await row("nba", `b${i}`, "low", "1", nba(10, "20", 2, 4));
  // 2020: no box scores in the database, so ESPN's rows are the source, with the games_played qualifier.
  await player("nba", "vet", "Veteran", "2");
  await player("nba", "vet2", "Part Timer", "2");
  await pss("nba", 2020, "vet", "2", { pts_avg: 28.5, reb_avg: 7, ast_avg: 5, games_played: 70 });
  await pss("nba", 2020, "vet2", "2", { pts_avg: 33, reb_avg: 7, ast_avg: 5, games_played: 20 });

  // ---------------- UCL: rebuilt from box scores into player_season_stats; the leaders keep reading that ----------------
  await team("ucl", "1", "Real Madrid");
  await team("ucl", "2", "Bayern");
  await game("ucl", "c1", "2026-09-16T19:00:00Z", 2026);
  await game("ucl", "c2", "2027-02-16T19:00:00Z", 2027);
  await player("ucl", "cp", "Champion Scorer", "1");
  await row("ucl", "c1", "cp", "1", soccer(9)); // the box scores say 9, the stored season row 7: UCL keeps the stored row
  await row("ucl", "c2", "cp", "1", soccer(1));
  await pss("ucl", 2026, "cp", "2", { goals: 7, assists: 2 });

  // ---------------- La Liga: the box-score season is newer than the stored one ----------------
  await team("laliga", "1", "Barcelona");
  await team("laliga", "2", "Sevilla");
  await player("laliga", "lp", "Liga Scorer", "1");
  await game("laliga", "l1", "2026-08-20T19:00:00Z", 2026);
  await row("laliga", "l1", "lp", "1", soccer(1));
  await pss("laliga", 2025, "lp", "1", { goals: 12 });

  // Between seasons: ESPN already stores next season's rows for the player, with no figure in any column.
  await pss("laliga", 2027, "lp", "1", {});
  await pss("nba", 2027, "star", "1", {});

  // ---------------- Serie A: the rows the player page drops, and a top scorer with no players row ----------------
  await team("seriea", "1", "Juventus");
  await team("seriea", "2", "Milan");
  await game("seriea", "s1", "2026-08-30T18:00:00Z", 2026);
  await game("seriea", "s2", "2026-09-06T18:00:00Z", 2026);
  await game("seriea", "s3", "2026-09-13T18:00:00Z", 2026);
  await player("seriea", "mt", "Missing Team", "1");
  await player("seriea", "rs", "Real Scorer", "1");
  await player("seriea", "ru", "Runner Up", "2");
  // 1 goal for a club the site knows, 3 for a club that is not in `teams`, 1 with no club at all: the page reads only the first.
  await row("seriea", "s1", "mt", "1", soccer(1));
  await row("seriea", "s2", "mt", "99", soccer(3));
  await row("seriea", "s3", "mt", null as never, soccer(1));
  await row("seriea", "s1", "rs", "1", soccer(2));
  await row("seriea", "s2", "ru", "2", soccer(4));
  await row("seriea", "s1", "nn", "1", soccer(6)); // no players row: cannot be shown

  // ---------------- NBA: an ESPN row and no box row in a season that has box scores ----------------
  await player("nba", "ghost", "Ghost Star", "1");
  await pss("nba", 2026, "ghost", "1", { pts_avg: 50, reb_avg: 20, ast_avg: 15, games_played: 30, categories: espnRow(30, { fg: [600, 1000], tp: [100, 200], ft: [200, 250], reb: 600, ast: 400 }) });

  // ---------------- Cricket: summed from scorecards, untouched ----------------
  await team("ipl", "1", "Mumbai");
  await team("ipl", "2", "Chennai");
  await player("ipl", "bat", "Opening Bat", "1");
  await game("ipl", "i1", "2026-04-01T14:00:00Z", 2026);
  await row("ipl", "i1", "bat", "1", { batting: { runs: "45", sixes: "2" } });
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

// ---------------------------------------------------------------------------
// Soccer
// ---------------------------------------------------------------------------
test("EPL goals: the board sums the stored box scores, so it shows Haaland's 5 when ESPN's stale row says 4, and the player page agrees", async () => {
  const board = await queries.getLeaders("epl", "goals", 10);
  assert.equal(board[0].name, "Haaland");
  assert.equal(board[0].value, 5);
  for (const r of board) {
    const { line } = await pageLine("epl", r.player_espn_id, 2026);
    assert.equal(line.g, r.value, `${r.name}: the board and the page`);
  }
  // The unused substitute and the game in progress are on no board.
  assert.ok(!names(board).includes("Unused Sub"));
});

test("EPL ties: equal goals share a competition rank, assists (then name) order them, and everyone tied at the cutoff is listed", async () => {
  const three = await queries.getLeaderBoard("epl", "goals", { limit: 3, ties: true });
  assert.deepEqual(three.rows.map((r) => [r.name, r.value, r.rank]), [["Haaland", 5, 1], ["Ann Scorer", 3, 2], ["Bob Scorer", 3, 2], ["Cy Scorer", 3, 2]]);
  const five = await queries.getLeaderBoard("epl", "goals", { limit: 5, ties: true });
  assert.deepEqual(five.rows.map((r) => [r.name, r.rank]), [["Haaland", 1], ["Ann Scorer", 2], ["Bob Scorer", 2], ["Cy Scorer", 2], ["Trader", 5], ["Dee Scorer", 5]], "Trader's 3 assists put him above Dee");
  assert.equal(five.omitted, 0);
  // The small cards (no tie inclusion) list exactly the limit.
  assert.deepEqual(names(await queries.getLeaders("epl", "goals", 3)), ["Haaland", "Ann Scorer", "Bob Scorer"]);
  const assists = await queries.getLeaderBoard("epl", "assists", { limit: 10, ties: true });
  assert.deepEqual(assists.rows.map((r) => [r.name, r.value, r.rank]), [["Ann Scorer", 5, 1], ["Trader", 3, 2], ["Bob Scorer", 1, 3], ["Cy Scorer", 1, 3]], "goals break the assist tie (3 each), then name");
});

test("EPL teams: the club the goals were scored for, not the player's current club; a traded player shows both, in order", async () => {
  const goals = await queries.getLeaderBoard("epl", "goals", { limit: 10, ties: true });
  const by = (n: string) => goals.rows.find((r) => r.name === n)!;
  assert.equal(by("Haaland").team_name, "Manchester City", "ESPN's stored row and his current club say Chelsea");
  assert.equal(by("Ann Scorer").team_name, "Arsenal");
  assert.equal(by("Cy Scorer").team_name, "Tottenham");
  assert.equal(by("Trader").team_name, "Arsenal / Tottenham");
  assert.equal(by("Trader").team_slug, "tottenham", "the link, where there is one, goes to the latest club");
});

test("a finished season with box scores is the box scores (what the player page shows), not ESPN's final row", async () => {
  const board = await queries.getLeaders("epl", "goals", 10, 2024);
  assert.deepEqual(board.map((r) => [r.name, r.value]), [["Ann Scorer", 6]]);
  assert.equal((await pageLine("epl", "a", 2024)).line.g, 6);
});

test("a season with no box scores keeps ESPN's rows (the boundary), with the same tie rules and the stored club", async () => {
  const board = await queries.getLeaderBoard("epl", "goals", { limit: 10, season: 2025, ties: true });
  assert.deepEqual(board.rows.map((r) => [r.name, r.value, r.rank, r.team_name]), [["Older Timer", 20, 1, "Arsenal"], ["Old Timer", 20, 1, "Arsenal"]]);
});

test("the board's season is the latest with box scores or stored figures; next season's empty rows do not win; UCL stays on its stored rows", async () => {
  assert.equal(await queries.getLeadersSeason("epl"), 2026);
  assert.equal(await queries.getLeadersSeason("laliga"), 2026, "box scores of 2026 exist, ESPN's row only for 2025 (and an empty 2027 row that must not win)");
  assert.equal(await queries.getLeadersSeason("nba"), 2026, "an empty 2027 row is no season with a board");
  assert.equal(await queries.getLeadersSeason("ucl"), 2026, "the 2027 box scores are not in player_season_stats yet");
  assert.deepEqual((await queries.getLeaders("laliga", "goals", 10)).map((r) => [r.name, r.value]), [["Liga Scorer", 1]]);
});

test("UCL and cricket keep their sources: UCL reads the stored season rows and their club, cricket sums the scorecards", async () => {
  const ucl = await queries.getLeaders("ucl", "goals", 10);
  assert.deepEqual(ucl.map((r) => [r.name, r.value, r.team_name, r.rank]), [["Champion Scorer", 7, "Bayern", 1]]);
  const cricket = await queries.getCricketLeaders("ipl", "runs", 2026, 10);
  assert.deepEqual(cricket.map((r) => [r.name, r.value]), [["Opening Bat", 45]]);
});

// ---------------------------------------------------------------------------
// NFL
// ---------------------------------------------------------------------------
test("NFL passing: regular-season box scores only, fresher than ESPN's row, pseudo-athletes out, ties ranked; the page agrees", async () => {
  const board = await queries.getLeaderBoard("nfl", "passing_yards", { limit: 10, ties: true });
  assert.deepEqual(board.rows.map((r) => [r.name, r.value, r.rank]), [["Tyler Shough", 662, 1], ["Ann Passer", 566, 2], ["Pat Mahomes", 566, 2]]);
  for (const r of board.rows) {
    const { line } = await pageLine("nfl", r.player_espn_id, 2026);
    assert.equal(line.pass_yds, r.value, r.name);
  }
});

test("NFL teams: the club of the games, and both clubs for a player who moved mid-season", async () => {
  const passing = (await queries.getLeaderBoard("nfl", "passing_yards", { limit: 10 })).rows;
  assert.equal(passing.find((r) => r.name === "Tyler Shough")!.team_name, "Home Team", "ESPN's row says Away Team");
  const rushing = (await queries.getLeaderBoard("nfl", "rushing_yards", { limit: 10 })).rows;
  assert.deepEqual(rushing.map((r) => [r.name, r.value, r.team_name]), [["Traded Runner", 140, "Home Team / Away Team"]]);
  assert.equal((await pageLine("nfl", "rb1", 2026)).line.rush_yds, 140);
});

// ---------------------------------------------------------------------------
// NBA
// ---------------------------------------------------------------------------
test("NBA points: the box-score average when it covers the games, ESPN's own row where its box scores are short; the page agrees", async () => {
  const board = (await queries.getLeaderBoard("nba", "pts_avg", { limit: 10, ties: true })).rows;
  assert.deepEqual(board.map((r) => [r.name, r.value]), [["Bulls Wing", 35], ["Star Guard", 30], ["Traded Forward", 26], ["Low Scorer", 10]]);
  // Star's ESPN row (9 games) lags his 10 logged games: the box scores win. Bulls Wing has 8 logged games and 2 with no box score: ESPN's row.
  for (const r of board) {
    const { line, specs } = await pageLine("nba", r.player_espn_id, 2026);
    assert.equal(shown(specs, line, "pts"), r.value, `${r.name}: the board and the page`);
  }
  assert.ok(!names(board).includes("Few Games"), "five games is under the 70% rule (7 of the 10 most anyone has played)");
});

test("NBA rebounds and assists follow the same rule", async () => {
  const reb = (await queries.getLeaderBoard("nba", "reb_avg", { limit: 10, ties: true })).rows;
  assert.deepEqual(reb.map((r) => [r.name, r.value]), [["Bulls Wing", 9], ["Star Guard", 8], ["Traded Forward", 5], ["Low Scorer", 2]]);
  const ast = (await queries.getLeaderBoard("nba", "ast_avg", { limit: 10, ties: true })).rows;
  assert.deepEqual(ast.map((r) => [r.name, r.value, r.rank]), [["Traded Forward", 5, 1], ["Low Scorer", 4, 2], ["Star Guard", 4, 2], ["Bulls Wing", 2, 4]], "a tie is ranked as one (the next rank skips), then by name; Bulls Wing is ESPN's 20 over 10 games");
  for (const r of reb) {
    const { line, specs } = await pageLine("nba", r.player_espn_id, 2026);
    assert.equal(shown(specs, line, "reb"), r.value, r.name);
  }
  for (const r of ast) {
    const { line, specs } = await pageLine("nba", r.player_espn_id, 2026);
    assert.equal(shown(specs, line, "ast"), r.value, r.name);
  }
});

test("NBA teams: the clubs of the season, both for a traded player, whatever ESPN's row says he plays for now", async () => {
  const board = (await queries.getLeaderBoard("nba", "pts_avg", { limit: 10, ties: true })).rows;
  const by = (n: string) => board.find((r) => r.name === n)!;
  assert.equal(by("Star Guard").team_name, "Boston Celtics");
  assert.equal(by("Traded Forward").team_name, "Boston Celtics / Philadelphia 76ers");
  assert.equal(by("Bulls Wing").team_name, "Chicago Bulls");
});

test("NBA seasons with no box scores keep ESPN's rows, and the qualifier still uses their games", async () => {
  const board = (await queries.getLeaderBoard("nba", "pts_avg", { limit: 10, season: 2020, ties: true })).rows;
  assert.deepEqual(board.map((r) => [r.name, r.value, r.team_name]), [["Veteran", 28.5, "Philadelphia 76ers"]], "20 games is under 70% of 70");
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
test("the Leaders page numbers ties as a competition and lists everyone tied at 10th; cricket keeps numbering by position", async () => {
  const page = await import("../src/app/[league]/leaders/page");
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const epl = text(renderToStaticMarkup(await page.default({ params: Promise.resolve({ league: "epl" }) })));
  // Goals board: Haaland 1, three players level on 3 (rank 2 each), then two level on 2 (rank 5).
  assert.match(epl, /1 .*Haaland.* 5 GLS.* 2 .*Ann Scorer.* 3 GLS.* 2 .*Bob Scorer.* 3 GLS.* 2 .*Cy Scorer.* 3 GLS.* 5 .*Trader.* 2 GLS.* 5 .*Dee Scorer.* 2 GLS/);
  assert.match(epl, /Arsenal \/ Tottenham/);
  const ipl = text(renderToStaticMarkup(await page.default({ params: Promise.resolve({ league: "ipl" }) })));
  assert.match(ipl, /1 .*Opening Bat.* 45 RUNS/);
});

// ---------------------------------------------------------------------------
// Fix round 1: the board and the page read one set of rows and show one figure
// ---------------------------------------------------------------------------
test("rows the player page drops (club not in teams, no club) are not on the board either: 1 goal on both", async () => {
  const board = (await queries.getLeaderBoard("seriea", "goals", { limit: 10, ties: true })).rows;
  const mt = board.find((r) => r.name === "Missing Team")!;
  assert.equal(mt.value, 1);
  assert.equal((await pageLine("seriea", "mt", 2026)).line.g, 1);
  assert.equal(mt.team_name, "Juventus");
});

test("a top player with no players row is left out and the ranks stay those of the full standing (no one is promoted to 1)", async () => {
  const board = (await queries.getLeaderBoard("seriea", "goals", { limit: 10, ties: true })).rows;
  assert.deepEqual(board.map((r) => [r.name, r.value, r.rank]), [["Runner Up", 4, 2], ["Real Scorer", 2, 3], ["Missing Team", 1, 4]]);
  const small = await queries.getLeaders("seriea", "goals", 2);
  assert.deepEqual(small.map((r) => [r.name, r.rank]), [["Runner Up", 2]]);
});

test("an NBA player with an ESPN row and no box rows in a season with box scores is on no board, and does not move the 70% cutoff", async () => {
  for (const column of ["pts_avg", "reb_avg", "ast_avg"]) {
    const board = (await queries.getLeaderBoard("nba", column, { limit: 10, ties: true })).rows;
    assert.ok(!names(board).includes("Ghost Star"), column);
    assert.ok(board.length > 0);
  }
  // His page has no 2026 season line (games come only from rows), so board and page agree.
  const [log, reported, espn] = await Promise.all([queries.getPlayerLog("nba", "ghost"), queries.getPlayerReportedGames("nba", "ghost"), queries.getPlayerEspnSeasons("nba", "ghost")]);
  assert.equal(buildStagedProfile("nba", log, reported, espn).regular.seasons.find((x) => x.season === 2026), undefined);
});

test("per-game figures print one decimal like the page (30.0, not 30) and totals stay plain", async () => {
  const { formatLeaderValue } = await import("../src/lib/leaders");
  assert.equal(formatLeaderValue(30, "PPG"), "30.0");
  assert.equal(formatLeaderValue(27.6, "RPG"), "27.6");
  assert.equal(formatLeaderValue(4, "APG"), "4.0");
  assert.equal(formatLeaderValue(662, "YDS"), "662");
  assert.equal(formatLeaderValue(5, "GLS"), "5");
  // Every NBA per-game category the boards define is one the formatter knows.
  for (const c of queries.LEADER_CATEGORIES.nba) assert.equal(formatLeaderValue(1, c.unit), "1.0", c.unit);
  const page = await import("../src/app/[league]/leaders/page");
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ league: "nba" }) }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Bulls Wing.* 35\.0 PPG/);
  assert.match(text, /Star Guard.* 30\.0 PPG/);
  assert.match(text, /Traded Forward.* 5\.0 APG/);
  // And the page cell of the same player prints the same text.
  const { line, specs } = await pageLine("nba", "star", 2026);
  assert.equal(formatStat(specs.find((x) => x.key === "pts") as never, line.pts), "30.0");
});
