/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// The top-up that stores per-player figures for matches in the series SportsDB does not archive (domestic,
// women's domestic, associate, youth), which the series page sums into its stats block. Mirrors
// tests/cricket-topup.test.ts for the archived competitions.

let db: TestDb;
let lib: typeof import("../scripts/lib/cricket-series-stats");

before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/cricket-series-stats");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  for (const t of ["cricket_series_player_stats", "cricket_series_matches", "cricket_series", "games"]) await db.pool.query(`delete from ${t}`);
});

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface P {
  id: string;
  name: string;
  runs?: number;
  wickets?: number;
}
const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
function player(p: P) {
  const linescores: any[] = [];
  if (p.runs !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("batted", 1), stat("ballsFaced", p.runs + 5), stat("runs", p.runs), stat("fours", 2), stat("sixes", 0), stat("notouts", 0)] }] } });
  if (p.wickets !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("overs", 4), stat("conceded", 30), stat("wickets", p.wickets), stat("bpo", 6)] }] } });
  return { athlete: { id: p.id, displayName: p.name }, linescores };
}
function summary(opts: { id: string; noFigures?: boolean }) {
  const home: P[] = [
    { id: "h1", name: "Ann Alpha", runs: 60 },
    { id: "h2", name: "Bea Alpha", runs: 20, wickets: 2 },
  ];
  const away: P[] = [
    { id: "a1", name: "Cat Bravo", runs: 45 },
    { id: "a2", name: "Dee Bravo", wickets: 3 },
  ];
  const strip = (ps: P[]) => (opts.noFigures ? ps.map((p) => ({ id: p.id, name: p.name })) : ps);
  const competitor = (homeAway: string, id: string, name: string) => ({ homeAway, team: { id, displayName: name }, score: "150/5", linescores: [] });
  return {
    header: { id: opts.id, competitions: [{ status: { type: { state: "post" }, summary: "Alpha won by 5 runs" }, competitors: [competitor("home", "10", "Alpha"), competitor("away", "20", "Bravo")] }] },
    gameInfo: { venue: { fullName: "Test Oval" } },
    rosters: [
      { team: { id: "10", displayName: "Alpha" }, roster: strip(home).map(player) },
      { team: { id: "20", displayName: "Bravo" }, roster: strip(away).map(player) },
    ],
  };
}

async function seedMatch(id: string, opts: { series?: string; daysAgo?: number; state?: string; text?: string; candidates?: string[]; checkedHoursAgo?: number } = {}) {
  const date = new Date(Date.now() - (opts.daysAgo ?? 1) * DAY).toISOString();
  const checked = opts.checkedHoursAgo === undefined ? null : new Date(Date.now() - opts.checkedHoursAgo * HOUR).toISOString();
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, description, status_state, status_summary, home, away, league_candidates, stats_checked_at)
     values ($1, $2, $3, 'Alpha v Bravo', '1st Match', $4, $5, '{"id":"10","name":"Alpha"}', '{"id":"20","name":"Bravo"}', $6, $7)`,
    [id, opts.series ?? "1554058", date, opts.state ?? "post", opts.text ?? "Alpha won by 5 runs", opts.candidates ?? [], checked]
  );
}
const rowsOf = async (id: string) => (await db.pool.query(`select series_espn_id, player_espn_id, team_espn_id, player_name, stats from cricket_series_player_stats where match_espn_id = $1 order by player_espn_id`, [id])).rows;
const checkedAt = async (id: string) => (await db.pool.query(`select stats_checked_at from cricket_series_matches where espn_id = $1`, [id])).rows[0].stats_checked_at as Date | null;
function fetcherFor(byId: Record<string, any>, calls: string[] = []) {
  return async (m: { espn_id: string }) => {
    calls.push(m.espn_id);
    const s = byId[m.espn_id];
    if (s instanceof Error) throw s;
    return s;
  };
}

test("a finished match in a series without a SportsDB competition gets its player rows and is marked checked", async () => {
  await seedMatch("m1");
  const result = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ m1: summary({ id: "m1" }) }) });
  assert.deepEqual({ eligible: result.eligible, attempted: result.attempted, written: result.written, noScorecard: result.noScorecard, failed: result.failed.length, rows: result.playerRows }, { eligible: 1, attempted: 1, written: 1, noScorecard: 0, failed: 0, rows: 4 });
  const rows = await rowsOf("m1");
  assert.equal(rows.length, 4);
  const h1 = rows.find((r) => r.player_espn_id === "h1");
  assert.deepEqual([h1.series_espn_id, h1.team_espn_id, h1.player_name, h1.stats.batting.runs], ["1554058", "10", "Ann Alpha", 60]);
  assert.equal(rows.find((r) => r.player_espn_id === "a2").stats.bowling.wickets, 3);
  assert.ok(await checkedAt("m1"));
  assert.equal(lib.topUpExitCode(result), 0);
  assert.match(lib.summaryLine(result, 15), /1 match\(es\) without figures; attempted 1 \(cap 15\), stored 1 \(4 player rows\)/);
});

test("matches archived under a competition, unfinished, closed without play or already stored are not candidates", async () => {
  await seedMatch("archived", { candidates: ["ipl"] });
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_state) values ('ipl', 'archived', now() - interval '1 day', 'Alpha v Bravo', '10', '20', 2026, true, 'post')`);
  await seedMatch("live", { state: "in" });
  await seedMatch("fixture", { state: "pre" });
  await seedMatch("washed", { text: "Match abandoned without a ball bowled" });
  await seedMatch("stored");
  await db.pool.query(`insert into cricket_series_player_stats (match_espn_id, series_espn_id, player_espn_id, player_name, team_espn_id, stats) values ('stored', '1554058', 'h1', 'Ann Alpha', '10', '{"batting":{"runs":1}}')`);
  await seedMatch("eligible");
  const calls: string[] = [];
  const result = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ eligible: summary({ id: "eligible" }) }, calls) });
  assert.deepEqual(calls, ["eligible"]);
  assert.equal(result.eligible, 1);
  assert.equal((await rowsOf("stored"))[0].stats.batting.runs, 1);
});

test("a result ESPN has no scorecard for yet is marked checked and retried an hour later, until three days after the match", async () => {
  await seedMatch("m1", { daysAgo: 1 });
  const first = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ m1: summary({ id: "m1", noFigures: true }) }) });
  assert.deepEqual([first.written, first.noScorecard, first.playerRows], [0, 1, 0]);
  assert.equal((await rowsOf("m1")).length, 0);
  assert.ok(await checkedAt("m1"));
  // Checked minutes ago: not again this run.
  const calls: string[] = [];
  const again = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ m1: summary({ id: "m1" }) }, calls) });
  assert.equal(again.eligible, 0);
  assert.deepEqual(calls, []);
  // Checked two hours ago: tried again, and the card is there now.
  await db.pool.query(`update cricket_series_matches set stats_checked_at = now() - interval '2 hours' where espn_id = 'm1'`);
  const later = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ m1: summary({ id: "m1" }) }, calls) });
  assert.deepEqual([later.written, calls], [1, ["m1"]]);
  // A match checked more than three days after it was played, still with no card, is left alone.
  await seedMatch("old", { daysAgo: 5, checkedHoursAgo: 2 });
  const gone = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ old: summary({ id: "old" }) }) });
  assert.equal(gone.eligible, 0);
  assert.match(lib.summaryLine(first, 15), /1 with no scorecard on ESPN yet/);
});

test("unchecked matches come first, newest first, the cap bounds a run and the window leaves older matches to a backfill", async () => {
  await seedMatch("d1", { daysAgo: 1, checkedHoursAgo: 2 });
  await seedMatch("d2", { daysAgo: 2 });
  await seedMatch("d3", { daysAgo: 3 });
  await seedMatch("d100", { daysAgo: 100 });
  const calls: string[] = [];
  const byId = Object.fromEntries(["d1", "d2", "d3", "d100"].map((id) => [id, summary({ id })]));
  const result = await lib.topUpCricketSeriesStats({ cap: 2, fetchSummary: fetcherFor(byId, calls) });
  assert.deepEqual(calls, ["d2", "d3"]);
  assert.deepEqual([result.eligible, result.attempted], [3, 2]);
  assert.match(lib.summaryLine(result, 2), /1 left for the next run/);
  // A wider window reaches the old match; never read, it comes before the one read two hours ago.
  const all = await lib.findSeriesStatsCandidates(10, 400);
  assert.deepEqual([all.total, all.matches.map((m) => m.espn_id)], [2, ["d100", "d1"]]);
});

test("a fetch that fails is reported, exits 1 and leaves the match a candidate", async () => {
  await seedMatch("bad");
  const result = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ bad: new Error("ESPN down") }) });
  assert.deepEqual([result.failed.length, result.failed[0].id, result.failed[0].error], [1, "bad", "ESPN down"]);
  assert.equal(lib.topUpExitCode(result), 1);
  assert.equal(await checkedAt("bad"), null);
  assert.match(lib.summaryLine(result, 15), /failed: bad/);
});

// The manual backfill (scripts/backfill-cricket-series-stats.ts): the same pipeline scoped to one
// competition instead of to the last 45 days, with a dry run that measures how far back ESPN's cards go
// before anything is written. Production holds the Ranji Trophy across 52 editions with figures on one.
test("a series scope takes every edition of one competition and replaces the recency window", async () => {
  await seedMatch("new", { series: "8050-2026-27", daysAgo: 1 });
  await seedMatch("old", { series: "8050-2013-14", daysAgo: 4000 });
  await seedMatch("older", { series: "8050-2005", daysAgo: 7000 });
  // Another competition, inside the window: not this backfill's business.
  await seedMatch("other", { series: "8043-2026-27", daysAgo: 1 });
  const scoped = await lib.findSeriesStatsCandidates(10, undefined, "8050");
  assert.deepEqual([scoped.total, scoped.matches.map((m) => m.espn_id)], [3, ["new", "old", "older"]]);
  // A bare series id reduces to itself, so a non-editioned series is still reachable by its own id.
  await seedMatch("bilateral", { series: "24276", daysAgo: 500 });
  const bare = await lib.findSeriesStatsCandidates(10, undefined, "24276");
  assert.deepEqual(
    bare.matches.map((m) => m.espn_id),
    ["bilateral"]
  );
  // Without a scope the window still applies, so only the recent ones are candidates.
  const windowed = await lib.findSeriesStatsCandidates(10);
  assert.deepEqual(windowed.matches.map((m) => m.espn_id).sort(), ["new", "other"]);
});

test("a dry run writes nothing at all, so every match it measured is still a candidate for the real run", async () => {
  await seedMatch("m1", { series: "8050-2013-14", daysAgo: 4000 });
  await seedMatch("m2", { series: "8050-2013-14", daysAgo: 4001 });
  const byId = { m1: summary({ id: "m1" }), m2: summary({ id: "m2" }) };
  const dry = await lib.topUpCricketSeriesStats({ series: "8050", dryRun: true, fetchSummary: fetcherFor(byId) });
  // Counted exactly as a real run would count it...
  assert.deepEqual([dry.attempted, dry.written, dry.playerRows, dry.failed.length], [2, 2, 8, 0]);
  // ...but no rows, and crucially no stats_checked_at: a match 4000 days old is long past the three-day
  // settle window, so marking it checked would have dropped it from the candidate set permanently.
  assert.equal((await rowsOf("m1")).length, 0);
  assert.equal(await checkedAt("m1"), null);
  assert.equal(await checkedAt("m2"), null);
  const real = await lib.topUpCricketSeriesStats({ series: "8050", fetchSummary: fetcherFor(byId) });
  assert.deepEqual([real.eligible, real.attempted, real.written, real.playerRows], [2, 2, 2, 8]);
  assert.equal((await rowsOf("m1")).length, 4);
  assert.ok(await checkedAt("m1"));
});

test("the decade breakdown reports the card rate per decade, newest first, so a backfill can see the cliff", async () => {
  const agoFor = (y: number) => (Date.now() - Date.UTC(y, 5, 1)) / DAY;
  await seedMatch("y2024", { series: "8050-2024-25", daysAgo: agoFor(2024) });
  await seedMatch("y2012", { series: "8050-2012-13", daysAgo: agoFor(2012) });
  await seedMatch("y2015", { series: "8050-2015-16", daysAgo: agoFor(2015) });
  // The 1990s: ESPN answers with no scorecard, and one request fails — what the table is meant to surface.
  await seedMatch("y1995", { series: "8050-1995-96", daysAgo: agoFor(1995) });
  await seedMatch("y1996", { series: "8050-1996-97", daysAgo: agoFor(1996) });
  const result = await lib.topUpCricketSeriesStats({
    series: "8050",
    dryRun: true,
    fetchSummary: fetcherFor({
      y2024: summary({ id: "y2024" }),
      y2015: summary({ id: "y2015" }),
      y2012: summary({ id: "y2012" }),
      y1995: summary({ id: "y1995", noFigures: true }),
      y1996: new Error("ESPN 502"),
    }),
  });
  assert.deepEqual(
    result.byDecade.map((d) => [d.decade, d.attempted, d.withCard, d.noCard, d.failed]),
    [
      ["2020s", 1, 1, 0, 0],
      ["2010s", 2, 2, 0, 0],
      ["1990s", 2, 0, 1, 1],
    ]
  );
  const table = lib.decadeTable(result);
  assert.equal(table.length, 3);
  assert.match(table[0], /2020s\s+attempted\s+1\s+card\s+1 \(100%\)/);
  assert.match(table[2], /1990s\s+attempted\s+2\s+card\s+0 \(\s*0%\)\s+no card\s+1\s+failed\s+1/);
});

test("the nightly job still gets a decade breakdown and its summary line is unchanged", async () => {
  await seedMatch("m1");
  const result = await lib.topUpCricketSeriesStats({ fetchSummary: fetcherFor({ m1: summary({ id: "m1" }) }) });
  assert.equal(result.byDecade.length, 1);
  assert.match(
    lib.summaryLine(result, 15),
    /^\[topup-cricket-series-stats\] 1 match\(es\) without figures; attempted 1 \(cap 15\), stored 1 \(4 player rows\), 0 with no scorecard on ESPN yet, 0 failed$/
  );
});
