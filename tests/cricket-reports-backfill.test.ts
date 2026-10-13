/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let backfill: typeof import("../scripts/lib/cricket-reports-backfill");

before(async () => {
  db = await startTestDb();
  backfill = await import("../scripts/lib/cricket-reports-backfill");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  for (const t of ["player_game_stats", "game_details", "cricket_series_matches", "games", "players", "teams"]) await db.pool.query(`delete from ${t}`);
});

const DAY = 86_400_000;
const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
function player(id: string, name: string, runs?: number, wickets?: number) {
  const linescores: any[] = [];
  if (runs !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("batted", 1), stat("ballsFaced", runs + 5), stat("runs", runs), stat("fours", 2), stat("sixes", 1), stat("notouts", 0)] }] } });
  if (wickets !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("overs", 4), stat("conceded", 30), stat("wickets", wickets), stat("bpo", 6)] }] } });
  return { athlete: { id, displayName: name }, position: { abbreviation: "BAT" }, linescores };
}
function summary(id: string, withFigures = true) {
  const competitor = (homeAway: string, tid: string, name: string, score: string, winner: boolean) => ({ homeAway, winner, score, team: { id: tid, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, linescores: [] });
  const roster = (tid: string, name: string, ps: any[]) => ({ team: { id: tid, displayName: name }, roster: withFigures ? ps : ps.map((p) => ({ athlete: p.athlete, position: p.position, linescores: [] })) });
  return {
    header: { id, description: "3rd Match, Somewhere", competitions: [{ date: "2026-02-01T09:00Z", status: { type: { state: "post" }, summary: "Alpha won by 5 runs" }, competitors: [competitor("home", "10", "Alpha", "150/5", true), competitor("away", "20", "Bravo", "145/8", false)] }] },
    gameInfo: { venue: { fullName: "Test Oval" } },
    rosters: [roster("10", "Alpha", [player("h1", "Ann Alpha", 60), player("h2", "Bea Alpha", 20, 2)]), roster("20", "Bravo", [player("a1", "Cat Bravo", 45), player("a2", "Dee Bravo", undefined, 3)])],
  };
}
async function seedGame(league: string, id: string, opts: { daysAgo?: number; completed?: boolean; playerRows?: boolean } = {}) {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_state) values ($1, $2, $3, 'Alpha v Bravo', '10', '20', 2026, $4, 'post')`,
    [league, id, new Date(Date.now() - (opts.daysAgo ?? 1) * DAY).toISOString(), opts.completed ?? true]
  );
  if (opts.playerRows !== false) {
    await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values ($1, 'h1', '10', 'Ann Alpha', $2) on conflict do nothing`, [league, `ann-${league}`]);
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, 'h1', '10', '{"batting":{"runs":60}}')`, [league, id]);
  }
}
const fetcherFor = (byId: Record<string, any>, calls: string[] = []) => async (g: { league: string; espn_id: string }) => {
  calls.push(`${g.league}/${g.espn_id}`);
  if (byId[g.espn_id] instanceof Error) throw byId[g.espn_id];
  return byId[g.espn_id];
};
const detailsOf = async (league: string, id: string) => (await db.pool.query(`select details from game_details where league = $1 and game_espn_id = $2`, [league, id])).rows[0];
const playerRowCount = async (id: string) => (await db.pool.query(`select count(*)::int as n from player_game_stats where game_espn_id = $1`, [id])).rows[0].n;

test("a finished game with player figures and no report gets its report, and nothing else changes", async () => {
  await seedGame("wpl", "w1");
  const result = await backfill.backfillCricketReports({ fetchSummary: fetcherFor({ w1: summary("w1") }) });
  assert.deepEqual({ eligible: result.eligible, attempted: result.attempted, written: result.written, noScorecard: result.noScorecard.length, failed: result.failed.length }, { eligible: 1, attempted: 1, written: 1, noScorecard: 0, failed: 0 });
  const d = await detailsOf("wpl", "w1");
  assert.equal(d.details.scorecard.length, 2);
  assert.ok(d.details.scorecard[0].battingRows.length > 0);
  // the player figures that were already there are exactly as they were: not rewritten, none added
  assert.equal(await playerRowCount("w1"), 1);
  assert.equal((await db.pool.query(`select stats from player_game_stats where game_espn_id = 'w1'`)).rows[0].stats.batting.runs, 60);
});

test("a game that already has a report, an unfinished game and a league outside the four are not selected or fetched", async () => {
  await seedGame("wbbl", "has-report");
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('wbbl', 'has-report', '{"scorecard":[]}')`);
  await seedGame("wcwc", "live", { completed: false });
  await seedGame("ipl", "other-league");
  const calls: string[] = [];
  const result = await backfill.backfillCricketReports({ fetchSummary: fetcherFor({}, calls) });
  assert.equal(result.eligible, 0);
  assert.deepEqual(calls, []);
  assert.equal((await detailsOf("wbbl", "has-report")).details.scorecard.length, 0, "a stored report is never replaced, even an empty one");
});

test("a summary with no scorecard stores nothing, so the game is not marked final with an empty report", async () => {
  await seedGame("wt20wc", "empty");
  const result = await backfill.backfillCricketReports({ fetchSummary: fetcherFor({ empty: summary("empty", false) }) });
  assert.deepEqual(result.noScorecard, ["wt20wc/empty"]);
  assert.equal(result.written, 0);
  assert.equal(await detailsOf("wt20wc", "empty"), undefined);
});

test("a dry run reads and counts but writes nothing", async () => {
  await seedGame("wpl", "w1");
  const result = await backfill.backfillCricketReports({ dryRun: true, fetchSummary: fetcherFor({ w1: summary("w1") }) });
  assert.equal(result.written, 1);
  assert.equal(await detailsOf("wpl", "w1"), undefined);
  assert.match(backfill.reportSummaryLine(result, 100, true), /would store 1/);
});

test("a run is capped newest first, a failed game is reported without stopping the others, and a second run finishes the rest", async () => {
  for (let i = 1; i <= 4; i++) await seedGame("wbbl", `b${i}`, { daysAgo: i });
  const byId: Record<string, any> = { b1: summary("b1"), b2: new Error("gateway"), b3: summary("b3"), b4: summary("b4") };
  const calls: string[] = [];
  const first = await backfill.backfillCricketReports({ cap: 2, fetchSummary: fetcherFor(byId, calls) });
  assert.deepEqual(calls, ["wbbl/b1", "wbbl/b2"]);
  assert.deepEqual({ eligible: first.eligible, attempted: first.attempted, written: first.written, failed: first.failed.map((f) => f.id) }, { eligible: 4, attempted: 2, written: 1, failed: ["b2"] });
  assert.match(backfill.reportSummaryLine(first, 2, false), /4 completed game\(s\) without a stored report; attempted 2 \(cap 2\).*stored 1.*1 failed.*2 left for the next run.*failed: wbbl\/b2/);
  byId.b2 = summary("b2");
  const second = await backfill.backfillCricketReports({ cap: 10, fetchSummary: fetcherFor(byId) });
  assert.equal(second.attempted, 3);
  assert.equal(second.written, 3);
  assert.equal((await backfill.backfillCricketReports({ fetchSummary: fetcherFor(byId) })).eligible, 0);
});

test("--league narrows a run to one competition", async () => {
  await seedGame("wpl", "w1");
  await seedGame("wbbl", "b1");
  const calls: string[] = [];
  await backfill.backfillCricketReports({ leagues: ["wbbl"], fetchSummary: fetcherFor({ b1: summary("b1"), w1: summary("w1") }, calls) });
  assert.deepEqual(calls, ["wbbl/b1"]);
});
