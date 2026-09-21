// Card rows with no figures (a player in the XI who did not bat, bowl or catch) against a real database:
// the career query counts each as a match played and nothing else, and the refresh script writes them in.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { refreshMatchCards } from "../scripts/lib/cricket-cards-refresh";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const batted = { batting: { runs: 30, ballsFaced: 20, fours: 3, sixes: 1, notOut: true }, catches: 1, v: 3 };
const bowled = { bowling: { overs: 4, conceded: 28, wickets: 2 }, v: 3 };

async function addRow(league: string, game: string, player: string, stats: unknown) {
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, '1', $4::jsonb)`, [league, game, player, JSON.stringify(stats)]);
}

test("an empty row is a match played and nothing else in the career figures", async () => {
  await addRow("odi", "m1", "p1", batted);
  await addRow("odi", "m2", "p1", bowled);
  const before = await queries.getPlayerCricketCareer("odi", "p1");
  assert.equal(before?.matches, 2);

  // Three more games in the XI: one stored as the extractor does ({"v":3}), one as Cricsheet does ({}).
  await addRow("odi", "m3", "p1", { v: 3 });
  await addRow("odi", "m4", "p1", {});
  const after = await queries.getPlayerCricketCareer("odi", "p1");
  assert.deepEqual(after, { ...before, matches: 4 });
  // The figures the empty rows must not touch, spelled out.
  assert.equal(after?.inningsBatted, 1);
  assert.equal(after?.notOuts, 1);
  assert.equal(after?.average, null);
  assert.equal(after?.catches, 1);
  assert.equal(after?.inningsBowled, 1);
});

test("a player whose only rows are empty has a career of matches and nothing else", async () => {
  await addRow("odi", "m1", "p2", {});
  await addRow("odi", "m2", "p2", { v: 3 });
  const career = await queries.getPlayerCricketCareer("odi", "p2");
  assert.equal(career?.matches, 2);
  assert.equal(career?.inningsBatted, 0);
  assert.equal(career?.runs, 0);
  assert.equal(career?.average, null);
  assert.equal(career?.strikeRate, null);
  assert.equal(career?.highestScore, null);
  assert.equal(career?.economy, null);
  assert.equal(career?.catches, 0);
});

test("a Test's empty row is one match, not an innings", async () => {
  await addRow("test", "t1", "p3", { batting: { runs: 60, ballsFaced: 90, fours: 6, sixes: 0, notOut: false }, innings: [{ n: 1, batting: { runs: 60, ballsFaced: 90, fours: 6, sixes: 0, notOut: false } }], v: 3 });
  await addRow("test", "t2", "p3", { v: 3 });
  const career = await queries.getPlayerCricketCareer("test", "p3");
  assert.equal(career?.matches, 2);
  assert.equal(career?.inningsBatted, 1);
  assert.equal(career?.average, 60);
});

test("the comparison counts an empty row as a game and labels the fielding line catches and stumpings", async () => {
  // Its own players and rows: nothing here depends on what an earlier test stored.
  for (const id of ["c1", "c2"]) await db.pool.query(`insert into players (league, espn_id, name, slug) values ('odi', $1, $1, $1)`, [id]);
  await addRow("odi", "cm1", "c1", batted);
  await addRow("odi", "cm2", "c1", bowled);
  await addRow("odi", "cm3", "c1", { v: 3 });
  await addRow("odi", "cm4", "c1", {});
  await addRow("odi", "cm1", "c2", {});
  await addRow("odi", "cm2", "c2", { v: 3 });
  const compare = await import("../src/lib/compare");
  const cmp = await compare.getPlayerComparison("odi", "c1", "c2");
  // c1: two games with figures and two empty rows; c2: two empty rows.
  assert.equal(cmp?.a.gamesLogged, 4);
  assert.equal(cmp?.b.gamesLogged, 2);
  const [career] = cmp!.groups;
  assert.deepEqual(career.metrics.map((m) => m.label), ["Matches", "Catches & stumpings"]);
  const matches = career.metrics[0];
  assert.deepEqual([matches.a, matches.b], [4, 2]);
});

test("splits, leaders and centuries read an empty row as a match with nothing in it", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('t20i', '1', 'One', 'one'), ('t20i', '2', 'Two', 'two')`);
  for (const id of ["p8", "p9"]) await db.pool.query(`insert into players (league, espn_id, name, slug) values ('t20i', $1, $1, $1)`, [id]);
  for (const g of ["g1", "g2"]) {
    await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed, season_year, venue) values ('t20i', $1, now(), 'x', '1', '2', true, 2025, 'Ground')`, [g]);
  }
  await addRow("t20i", "g1", "p9", { v: 3 });
  await addRow("t20i", "g2", "p9", { batting: { runs: 104, ballsFaced: 60, fours: 9, sixes: 4, notOut: true }, v: 3 });
  await addRow("t20i", "g1", "p8", {});
  await addRow("t20i", "g2", "p8", { v: 3 });

  for (const dimension of ["team", "opponent", "venue"] as const) {
    const [split] = await queries.getPlayerCricketSplits("t20i", "p9", dimension);
    assert.equal(Number(split.matches), 2, dimension);
    assert.equal(Number(split.runs), 104, dimension);
    assert.equal(Number(split.wickets), 0, dimension);
  }
  const onlyEmpty = await queries.getPlayerCricketSplits("t20i", "p8", "venue");
  assert.deepEqual(onlyEmpty.map((r) => [Number(r.matches), Number(r.runs), Number(r.wickets)]), [[2, 0, 0]]);

  const runs = await queries.getCricketLeaders("t20i", "runs", 2025);
  assert.deepEqual(runs.map((r) => [r.name, r.value]), [["p9", 104]], "a player with nothing but empty rows is not on the board");
  const centuries = await queries.getCricketCenturies("t20i");
  assert.deepEqual(centuries.map((c) => [c.player_name, c.runs]), [["p9", 104]]);
});

/* ------------------------------------------------------------------------ */
/* refresh-cricket-cards                                                     */
/* ------------------------------------------------------------------------ */

const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
const line = (period: number, ...stats: [string, number][]) => ({ period, statistics: { categories: [{ stats: stats.map(([n, v]) => stat(n, v)) }] } });
const player = (id: string, starter: boolean, linescores: unknown[] = []) => ({ athlete: { id, displayName: `Player ${id}` }, starter, linescores });

const summary = {
  header: { competitions: [{ competitors: [{ team: { id: "1" }, linescores: [] }, { team: { id: "2" }, linescores: [] }] }] },
  rosters: [
    {
      team: { id: "1", displayName: "One" },
      roster: [
        player("10", true, [line(1, ["batted", 1], ["ballsFaced", 12], ["runs", 20], ["fours", 2], ["sixes", 1], ["notouts", 0], ["battingPosition", 1])]),
        // Not out at the far end without facing a ball.
        player("11", true, [line(1, ["batted", 1], ["ballsFaced", 0], ["runs", 0], ["fours", 0], ["sixes", 0], ["notouts", 1], ["battingPosition", 2])]),
        player("12", true),
      ],
    },
    { team: { id: "2", displayName: "Two" }, roster: [player("20", true, [line(1, ["overs", 4], ["conceded", 30], ["wickets", 1])])] },
  ],
};

const oldScorecard = [{ teamId: "1", teamName: "One", battingLabels: ["R"], battingRows: [{ athleteId: "10", name: "Player 10", stats: ["20"], dismissal: "b Player 20" }], bowlingLabels: [], bowlingRows: [] }];

async function seedMatch(league: string, id: string, report: unknown) {
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, now(), 'x', '1', '2', true)`, [league, id]);
  await addRow(league, id, "10", { batting: { runs: 20, ballsFaced: 12, fours: 2, sixes: 1, notOut: false }, v: 2 });
  await db.pool.query(`update player_game_stats set team_espn_id = '9' where league = $1 and game_espn_id = $2`, [league, id]);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3::jsonb)`, [league, id, JSON.stringify(report)]);
}
const stored = async (league: string, id: string) => (await db.pool.query(`select player_espn_id, team_espn_id, stats from player_game_stats where league = $1 and game_espn_id = $2 order by 1`, [league, id])).rows;
const report = async (league: string, id: string) => (await db.pool.query(`select details from game_details where league = $1 and game_espn_id = $2`, [league, id])).rows[0].details;

const refresh = (league: string, id: string, sum: unknown = summary, dryRun = false) => refreshMatchCards(db.pool, league, id, sum, { dryRun });

test("the refresh inserts the missing rows, updates the existing one, and keeps the side it was filed under", async () => {
  await seedMatch("ipl", "r1", { scorecard: oldScorecard, venue: "Ground", leaders: [{ athlete: "x" }] });
  const result = await refresh("ipl", "r1");
  assert.equal(result.skipped, null);
  assert.equal(result.inserted, 3);
  assert.equal(result.updated, 1);
  assert.equal(result.orphans, 3, "none of the inserted players has a players row yet");

  const rows = await stored("ipl", "r1");
  assert.deepEqual(rows.map((r) => r.player_espn_id), ["10", "11", "12", "20"]);
  assert.equal(rows[0].team_espn_id, "9", "an existing row keeps its team");
  assert.equal(rows[1].team_espn_id, "1");
  assert.equal(rows[0].stats.v, 3);
  assert.deepEqual(rows[2].stats, { v: 3 }, "the idle starter has a card with no figures");
  assert.equal(rows[1].stats.batting.notOut, true);
});

test("the refresh rebuilds the stored scorecard and leaves every other key of the report", async () => {
  const details = await report("ipl", "r1");
  assert.deepEqual(details.scorecard[0].battingRows.map((r: { athleteId: string }) => r.athleteId), ["10", "11"], "the 0* (0) batter is back");
  assert.deepEqual(details.scorecard[0].battingRows[1].stats, ["0", "0", "0", "0", "-"]);
  assert.equal(details.scorecard[0].battingRows[1].dismissal, "not out");
  assert.equal(details.venue, "Ground");
  assert.deepEqual(details.leaders, [{ athlete: "x" }]);
});

test("a dry run reads and reports but writes nothing", async () => {
  await seedMatch("ipl", "r2", { scorecard: oldScorecard, venue: "Ground" });
  const result = await refresh("ipl", "r2", summary, true);
  assert.deepEqual(result, { skipped: null, inserted: 3, updated: 1, duplicates: 0, orphans: 3, battingRows: { before: 1, after: 2 } });
  assert.equal((await stored("ipl", "r2")).length, 1);
  assert.deepEqual((await report("ipl", "r2")).scorecard, oldScorecard);
});

test("a match whose stored report is not ESPN's is never touched: not the cards, not the report", async () => {
  // Cricsheet's report has no dismissal text on its batting rows.
  const cricsheet = [{ teamId: "1", teamName: "One", battingLabels: ["R"], battingRows: [{ athleteId: "10", name: "Player 10", stats: ["20"] }], bowlingLabels: [], bowlingRows: [] }];
  await seedMatch("odi", "r3", { scorecard: cricsheet });
  const before = await stored("odi", "r3");
  const kept = await refresh("odi", "r3");
  assert.match(kept.skipped ?? "", /not ESPN/);
  assert.deepEqual([kept.inserted, kept.updated, kept.battingRows], [0, 0, null]);
  assert.deepEqual((await report("odi", "r3")).scorecard, cricsheet);
  assert.deepEqual(await stored("odi", "r3"), before, "the Cricsheet card is not overwritten by ESPN's figures");
  assert.equal((await refresh("odi", "r3", summary, true)).skipped !== null, true, "also in a dry run");

  // No stored report at all: not ESPN's either.
  await seedMatch("odi", "r4", {});
  await db.pool.query(`delete from game_details where league = 'odi' and game_espn_id = 'r4'`);
  assert.notEqual((await refresh("odi", "r4")).skipped, null);
  assert.equal((await stored("odi", "r4")).length, 1);
  assert.equal((await db.pool.query(`select 1 from game_details where league = 'odi' and game_espn_id = 'r4'`)).rowCount, 0);
});

test("a summary with no figures is refused and leaves the rows as they were", async () => {
  await seedMatch("bbl", "r5", { scorecard: oldScorecard });
  await assert.rejects(refresh("bbl", "r5", { header: summary.header, rosters: [{ team: { id: "1" }, roster: [player("10", true)] }] }), /no player figures/);
  assert.equal((await stored("bbl", "r5"))[0].stats.v, 2);
});

test("a summary with no competitors is refused, and so is a Test without its match class", async () => {
  await seedMatch("ipl", "r6", { scorecard: oldScorecard });
  await assert.rejects(refresh("ipl", "r6", { ...summary, header: { competitions: [{}] } }), /no competitors/);
  await assert.rejects(refresh("ipl", "r6", { rosters: summary.rosters }), /no competitors/);
  assert.equal((await stored("ipl", "r6"))[0].stats.v, 2);

  // The summary above carries competitors but no class: fine for a limited-overs league, not for a Test.
  await seedMatch("test", "r7", { scorecard: oldScorecard });
  await assert.rejects(refresh("test", "r7"), /no match class/);
  assert.equal((await stored("test", "r7"))[0].stats.v, 2);
  assert.deepEqual((await report("test", "r7")).scorecard, oldScorecard);

  const withClass = { ...summary, header: { competitions: [{ ...summary.header.competitions[0], class: { generalClassCard: "Test" } }] } };
  const done = await refresh("test", "r7", withClass);
  assert.equal(done.skipped, null);
  assert.equal((await stored("test", "r7")).length, 4);
});

test("a rebuilt report that would lose batting rows is not written, and the cards are left alone too", async () => {
  const three = [{ teamId: "1", teamName: "One", battingLabels: ["R"], battingRows: ["10", "11", "13"].map((id) => ({ athleteId: id, name: id, stats: ["1"], dismissal: "not out" })), bowlingLabels: [], bowlingRows: [] }];
  await seedMatch("ipl", "r8", { scorecard: three });
  const result = await refresh("ipl", "r8");
  assert.match(result.skipped ?? "", /fewer batting rows \(2, was 3\)/);
  assert.deepEqual((await report("ipl", "r8")).scorecard, three);
  assert.equal((await stored("ipl", "r8")).length, 1);
  assert.equal((await stored("ipl", "r8"))[0].stats.v, 2);
});

test("a rebuilt report with no innings totals is not written when the stored one had them", async () => {
  const totals = [{ ...oldScorecard[0], innings: [{ period: 1, runs: 150, wickets: 6, overs: 20, description: "" }] }];
  await seedMatch("ipl", "r9", { scorecard: totals });
  // `summary` has competitors, but no linescores on them, so the parse has batting rows and no totals.
  const result = await refresh("ipl", "r9");
  assert.match(result.skipped ?? "", /no innings totals/);
  assert.deepEqual((await report("ipl", "r9")).scorecard, totals);
  assert.equal((await stored("ipl", "r9")).length, 1);

  // With the totals present the same match refreshes.
  const withTotals = {
    ...summary,
    header: { competitions: [{ competitors: [{ team: { id: "1" }, linescores: [{ period: 1, isBatting: true, runs: 20, wickets: 0, overs: 2 }] }, { team: { id: "2" }, linescores: [] }] }] },
  };
  const ok = await refresh("ipl", "r9", withTotals);
  assert.equal(ok.skipped, null);
  assert.equal((await report("ipl", "r9")).scorecard[0].innings.length, 1);
});

test("a player already stored under another id (same name, same side) is not inserted a second time", async () => {
  await seedMatch("ipl", "r10", { scorecard: oldScorecard });
  // Cricsheet filed player 12 as cs-abc when the register had no Cricinfo id for him; the row is on side 1.
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('ipl', 'cs-abc', 'Player 12', 'player-12')`);
  await addRow("ipl", "r10", "cs-abc", {});
  const dry = await refresh("ipl", "r10", summary, true);
  assert.deepEqual([dry.inserted, dry.updated, dry.duplicates], [2, 1, 1]);
  const result = await refresh("ipl", "r10");
  assert.deepEqual([result.inserted, result.updated, result.duplicates], [2, 1, 1]);
  assert.deepEqual((await stored("ipl", "r10")).map((r) => r.player_espn_id), ["10", "11", "20", "cs-abc"]);
});

test("an inserted row counts as an orphan only when its player has no players row", async () => {
  await seedMatch("ipl", "r11", { scorecard: oldScorecard });
  for (const id of ["11", "12"]) await db.pool.query(`insert into players (league, espn_id, name, slug) values ('ipl', $1, $1, $1)`, [id]);
  const result = await refresh("ipl", "r11");
  assert.deepEqual([result.inserted, result.orphans], [3, 1]);
});
