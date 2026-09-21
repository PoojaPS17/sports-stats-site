/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let topup: typeof import("../scripts/lib/cricket-topup");
let importer: typeof import("../scripts/import-cricket-espn");
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  topup = await import("../scripts/lib/cricket-topup");
  importer = await import("../scripts/import-cricket-espn");
  queries = await import("../src/lib/queries");
});
after(async () => {
  globalThis.fetch = realFetch;
  await db?.stop();
});
beforeEach(async () => {
  globalThis.fetch = realFetch;
  for (const t of ["player_game_stats", "game_details", "cricket_series_matches", "games", "players", "teams"]) await db.pool.query(`delete from ${t}`);
});

const realFetch = globalThis.fetch;
const DAY = 86_400_000;

interface P {
  id: string;
  name: string;
  runs?: number;
  sixes?: number;
  wickets?: number;
}
const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
function player(team: string, p: P) {
  const linescores: any[] = [];
  if (p.runs !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("batted", 1), stat("ballsFaced", p.runs + 5), stat("runs", p.runs), stat("fours", 2), stat("sixes", p.sixes ?? 0), stat("notouts", 0)] }] } });
  if (p.wickets !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("overs", 4), stat("conceded", 30), stat("wickets", p.wickets), stat("bpo", 6)] }] } });
  return { athlete: { id: p.id, displayName: p.name }, position: { abbreviation: "BAT" }, linescores };
}
/** A two-team summary in the shape ESPN serves; each side lists its players with their figures. */
function summary(opts: { id: string; home: P[]; away: P[]; state?: string; text?: string; noFigures?: boolean }) {
  const strip = (ps: P[]) => (opts.noFigures ? ps.map((p) => ({ id: p.id, name: p.name })) : ps);
  const competitor = (homeAway: string, id: string, name: string, score: string, winner: boolean) => ({ homeAway, winner, score, team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, linescores: [] });
  return {
    header: {
      id: opts.id,
      description: "3rd T20I, Somewhere",
      competitions: [
        {
          date: "2026-08-26T09:00Z",
          status: { type: { state: opts.state ?? "post" }, summary: opts.text ?? "Alpha won by 5 runs" },
          competitors: [competitor("home", "10", "Alpha", "150/5", true), competitor("away", "20", "Bravo", "145/8", false)],
        },
      ],
    },
    gameInfo: { venue: { fullName: "Test Oval" } },
    rosters: [
      { team: { id: "10", displayName: "Alpha" }, roster: strip(opts.home).map((p) => player("10", p)) },
      { team: { id: "20", displayName: "Bravo" }, roster: strip(opts.away).map((p) => player("20", p)) },
    ],
  };
}
const HOME: P[] = [
  { id: "h1", name: "Ann Alpha", runs: 60, sixes: 3 },
  { id: "h2", name: "Bea Alpha", runs: 20, wickets: 2 },
];
const AWAY: P[] = [
  { id: "a1", name: "Cat Bravo", runs: 45, sixes: 1 },
  { id: "a2", name: "Dee Bravo", wickets: 3 },
];

async function seedGame(league: string, id: string, opts: { daysAgo?: number; completed?: boolean; season?: number } = {}) {
  const date = new Date(Date.now() - (opts.daysAgo ?? 1) * DAY).toISOString();
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_state)
     values ($1, $2, $3, 'Alpha v Bravo', '10', '20', $4, $5, $6)`,
    [league, id, date, opts.season ?? 2026, opts.completed ?? true, opts.completed === false ? "pre" : "post"]
  );
}
const rowsOf = async (league: string, id: string) => (await db.pool.query(`select player_espn_id, stats from player_game_stats where league = $1 and game_espn_id = $2 order by player_espn_id`, [league, id])).rows;
const detailsOf = async (league: string, id: string) => (await db.pool.query(`select details, fetched_at from game_details where league = $1 and game_espn_id = $2`, [league, id])).rows[0];
function fetcherFor(byId: Record<string, any>, calls: string[] = []) {
  return async (g: { league: string; espn_id: string }) => {
    calls.push(`${g.league}/${g.espn_id}`);
    const s = byId[g.espn_id];
    if (s instanceof Error) throw s;
    return s;
  };
}

test("a completed game with no player rows gets its rows and its match report", async () => {
  await seedGame("wpl", "w1");
  const result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor({ w1: summary({ id: "w1", home: HOME, away: AWAY }) }) });
  assert.deepEqual({ eligible: result.eligible, attempted: result.attempted, written: result.written, noScorecard: result.noScorecard, failed: result.failed.length }, { eligible: 1, attempted: 1, written: 1, noScorecard: 0, failed: 0 });
  assert.equal(result.playerRows, 4);
  const rows = await rowsOf("wpl", "w1");
  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r.player_espn_id === "h1").stats.batting.runs, 60);
  const d = await detailsOf("wpl", "w1");
  assert.equal(d.details.scorecard.length, 2);
  assert.equal(d.details.scorecard[0].battingRows.length, 2);
  assert.equal((await db.pool.query(`select venue from games where espn_id = 'w1'`)).rows[0].venue, "Test Oval");
  assert.equal((await db.pool.query(`select count(*)::int as n from players where league = 'wpl'`)).rows[0].n, 4);
  assert.equal(topup.topUpExitCode(result), 0);
});

test("a game that already has player rows is left exactly as it is, and is not even fetched", async () => {
  await seedGame("wpl", "w1");
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('wpl', 'w1', 'h1', '10', '{"batting":{"runs":1}}')`);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('wpl', 'w1', '{"scorecard":[{"battingRows":[{"x":1}]}]}')`);
  const calls: string[] = [];
  const result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor({ w1: summary({ id: "w1", home: HOME, away: AWAY }) }, calls) });
  assert.equal(result.eligible, 0);
  assert.deepEqual(calls, []);
  assert.equal((await rowsOf("wpl", "w1"))[0].stats.batting.runs, 1);
  assert.equal((await detailsOf("wpl", "w1")).details.scorecard[0].battingRows[0].x, 1);
});

test("a match whose stored report is Cricsheet's is never touched; an ESPN-shaped one and a non-Cricsheet league are", async () => {
  const cricsheet = JSON.stringify({ scorecard: [{ teamId: "10", battingRows: [{ athleteId: "h1", name: "Ann", stats: ["1"] }], bowlingRows: [] }] });
  const espn = JSON.stringify({ scorecard: [{ teamId: "10", battingRows: [{ athleteId: "h1", name: "Ann", stats: ["1"], dismissal: "not out" }], bowlingRows: [] }] });
  for (const [league, id, details] of [
    ["ipl", "i-cs", cricsheet],
    ["odi", "o-cs", cricsheet],
    ["ipl", "i-espn", espn],
    ["wpl", "w-nodismissal", cricsheet], // ESPN-only league: a report there is ESPN's by definition
  ] as const) {
    await seedGame(league, id);
    await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3)`, [league, id, details]);
  }
  const calls: string[] = [];
  const byId = Object.fromEntries(["i-cs", "o-cs", "i-espn", "w-nodismissal"].map((id) => [id, summary({ id, home: HOME, away: AWAY })]));
  const result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor(byId, calls) });
  assert.deepEqual(calls.sort(), ["ipl/i-espn", "wpl/w-nodismissal"]);
  assert.equal(result.written, 2);
  assert.equal((await rowsOf("ipl", "i-cs")).length, 0);
  assert.equal((await rowsOf("odi", "o-cs")).length, 0);
  // the stored report of a match that had a scorecard is not replaced
  assert.equal((await detailsOf("ipl", "i-espn")).details.scorecard[0].battingRows.length, 1);
});

test("leagues outside the list and games not completed are ignored", async () => {
  await seedGame("nba", "n1");
  await seedGame("wpl", "w-live", { completed: false });
  const result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor({}) });
  assert.equal(result.eligible, 0);
});

test("a run is capped, newest games first; the summary line says how many wait", async () => {
  for (let i = 1; i <= 5; i++) await seedGame("wbbl", `b${i}`, { daysAgo: i });
  const byId = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`b${i}`, summary({ id: `b${i}`, home: HOME, away: AWAY })]));
  const calls: string[] = [];
  const first = await topup.topUpCricketPlayerStats({ cap: 2, fetchSummary: fetcherFor(byId, calls) });
  assert.deepEqual(calls, ["wbbl/b1", "wbbl/b2"]);
  assert.deepEqual({ eligible: first.eligible, attempted: first.attempted }, { eligible: 5, attempted: 2 });
  assert.match(topup.summaryLine(first, 2), /5 game\(s\) without player rows; attempted 2 \(cap 2\).*3 left for the next run/);
  // the next run picks up where it stopped, and a third finds nothing
  const second = await topup.topUpCricketPlayerStats({ cap: 10, fetchSummary: fetcherFor(byId) });
  assert.equal(second.attempted, 3);
  assert.equal((await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor(byId) })).eligible, 0);
});

test("a game whose fetch fails is reported, writes nothing, and exits non-zero without stopping the others", async () => {
  await seedGame("wpl", "bad", { daysAgo: 1 });
  await seedGame("wpl", "good", { daysAgo: 2 });
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(" "));
  let result;
  try {
    result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor({ bad: new Error("cricket summary bad unavailable: ESPN error body"), good: summary({ id: "good", home: HOME, away: AWAY }) }) });
  } finally {
    console.error = realError;
  }
  assert.equal(result.written, 1);
  assert.deepEqual(result.failed.map((f) => f.id), ["bad"]);
  assert.equal(topup.topUpExitCode(result), 1);
  assert.match(topup.summaryLine(result, 40), /1 failed.*wpl\/bad/);
  assert.match(errors.join("\n"), /wpl bad failed: .*unavailable/);
  assert.equal((await rowsOf("wpl", "bad")).length, 0);
  assert.equal((await rowsOf("wpl", "good")).length, 4);
  // it stays a candidate, so tomorrow's run retries it
  assert.equal((await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor({ bad: summary({ id: "bad", home: HOME, away: AWAY }) }) })).written, 1);
});

test("a match ESPN has squads but no figures for is not a failure; it is retried until it has been settled for three days", async () => {
  await seedGame("wcwc", "nofig", { daysAgo: 10 });
  await seedGame("wcwc", "recent", { daysAgo: 1 });
  const byId = { nofig: summary({ id: "nofig", home: HOME, away: AWAY, noFigures: true }), recent: summary({ id: "recent", home: HOME, away: AWAY, noFigures: true }) };
  const first = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor(byId) });
  assert.deepEqual({ noScorecard: first.noScorecard, failed: first.failed.length, written: first.written }, { noScorecard: 2, failed: 0, written: 0 });
  assert.equal(topup.topUpExitCode(first), 0);
  const calls: string[] = [];
  const second = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor(byId, calls) });
  // the old match's report was fetched more than three days after it was played: settled. The recent one may still be hydrating.
  assert.deepEqual(calls, ["wcwc/recent"]);
  assert.equal(second.eligible, 1);
});

test("leaders after a top-up equal the sum of the scorecards on the game pages", async () => {
  const games = [
    { id: "g1", home: [{ id: "h1", name: "Ann Alpha", runs: 60, sixes: 3 }, { id: "h2", name: "Bea Alpha", wickets: 2 }], away: [{ id: "a1", name: "Cat Bravo", runs: 45, sixes: 1 }, { id: "a2", name: "Dee Bravo", wickets: 3 }] },
    { id: "g2", home: [{ id: "h1", name: "Ann Alpha", runs: 101, sixes: 5 }], away: [{ id: "a1", name: "Cat Bravo", runs: 7 }, { id: "a2", name: "Dee Bravo", wickets: 1 }] },
    { id: "g3", home: [{ id: "h1", name: "Ann Alpha", runs: 12 }, { id: "h2", name: "Bea Alpha", wickets: 4 }], away: [{ id: "a1", name: "Cat Bravo", runs: 0 }] },
  ];
  for (const [i, g] of games.entries()) await seedGame("wpl", g.id, { daysAgo: i + 1 });
  const result = await topup.topUpCricketPlayerStats({ fetchSummary: fetcherFor(Object.fromEntries(games.map((g) => [g.id, summary({ id: g.id, home: g.home, away: g.away })]))) });
  assert.equal(result.failed.length, 0);

  // what a visitor adds up from the game pages: the R column of every batting row / the W column of every bowling row
  const fromPages = { runs: new Map<string, number>(), wickets: new Map<string, number>() };
  for (const g of games) {
    const { details } = await detailsOf("wpl", g.id);
    for (const team of details.scorecard) {
      const r = team.battingLabels.indexOf("R");
      const w = team.bowlingLabels.indexOf("W");
      for (const row of team.battingRows) fromPages.runs.set(row.athleteId, (fromPages.runs.get(row.athleteId) ?? 0) + Number(row.stats[r]));
      for (const row of team.bowlingRows) fromPages.wickets.set(row.athleteId, (fromPages.wickets.get(row.athleteId) ?? 0) + Number(row.stats[w]));
    }
  }
  for (const key of ["runs", "wickets"] as const) {
    const board = await queries.getCricketLeaders("wpl", key, 2026, 10);
    const expected = [...fromPages[key]].filter(([, v]) => v > 0);
    assert.equal(board.length, expected.length);
    for (const row of board) assert.equal(row.value, fromPages[key].get(row.player_espn_id), `${key} for ${row.name}`);
  }
  assert.equal((await queries.getCricketLeaders("wpl", "runs", 2026, 1))[0].value, 173);
});

/* ---------------------------------- reconcile --------------------------------- */

async function seedListing(id: string, opts: { intl?: string; state?: string; summary?: string; daysAgo?: number; series?: string } = {}) {
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, international_class_id, status_state, status_summary)
     values ($1, $2, $3, 'Alpha v Bravo', $4, $5, $6)`,
    [id, opts.series ?? "1499999", new Date(Date.now() - (opts.daysAgo ?? 3) * DAY).toISOString(), opts.intl ?? "10", opts.state ?? "post", opts.summary ?? "Alpha won by 5 runs"]
  );
}
/** ESPN stub: summary URLs answer from `bodies` (a missing id answers with the 502 error body). */
function stubEspn(bodies: Record<string, unknown>) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    urls.push(url);
    const id = /event=(\d+)/.exec(url)?.[1] ?? "";
    const body = bodies[id] ?? { code: 2502, detail: "http error: bad gateway" };
    return new Response(JSON.stringify(body), { status: bodies[id] ? 200 : 502 });
  }) as typeof fetch;
  return urls;
}

test("reconcile imports a finished international the listing knows and games lacks, with its scorecard", async () => {
  await seedListing("1549195", { intl: "10" });
  const urls = stubEspn({ "1549195": summary({ id: "1549195", home: HOME, away: AWAY }) });
  const result = await importer.reconcileMissingInternationals({});
  assert.deepEqual(result.imported, ["wt20i/1549195"]);
  assert.equal(result.failed.length, 0);
  assert.equal(urls.length, 1);
  const g = (await db.pool.query(`select league, completed, home_score, venue from games where espn_id = '1549195'`)).rows;
  assert.deepEqual(g.map((r) => [r.league, r.completed, r.home_score]), [["wt20i", true, 150]]);
  assert.equal((await rowsOf("wt20i", "1549195")).length, 4);
  assert.ok((await detailsOf("wt20i", "1549195")).details.scorecard.length > 0);
});

test("reconcile leaves abandoned-without-a-ball, unfinished, already-imported and pre-2015 matches alone", async () => {
  await seedListing("1", { summary: "Match abandoned without a ball bowled" });
  await seedListing("2", { state: "pre" });
  await seedListing("3", { state: "in" });
  await seedListing("4");
  await seedGame("wt20i", "4"); // already imported
  await db.pool.query(`update games set home_score = 99 where espn_id = '4'`);
  await seedListing("5", { daysAgo: 5000 }); // before the site's archive
  await seedListing("6", { intl: "0" }); // a domestic card
  const urls = stubEspn({});
  const result = await importer.reconcileMissingInternationals({});
  assert.deepEqual({ eligible: result.eligible, attempted: result.attempted }, { eligible: 0, attempted: 0 });
  assert.deepEqual(urls, []);
  assert.equal((await db.pool.query(`select home_score from games where espn_id = '4'`)).rows[0].home_score, 99);
});

test("reconcile also catches a Test and an ODI, oldest first, capped, and says how many are left", async () => {
  await seedListing("11", { intl: "1", daysAgo: 5 });
  await seedListing("12", { intl: "2", daysAgo: 4 });
  await seedListing("13", { intl: "9", daysAgo: 3 });
  const s = (id: string) => summary({ id, home: HOME, away: AWAY });
  stubEspn({ "11": s("11"), "12": s("12"), "13": s("13") });
  const result = await importer.reconcileMissingInternationals({ cap: 2 });
  // the two newest are chosen, written oldest first
  assert.deepEqual(result.imported, ["odi/12", "wodi/13"]);
  assert.equal(result.eligible, 3);
  assert.match(importer.reconcileSummaryLine(result, 2), /1 left for the next run/);
});

test("reconcile logs each id that still fails with its error and reports a failure; nothing half-written", async () => {
  await seedListing("1549195");
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(" "));
  let result;
  try {
    stubEspn({}); // every path answers with ESPN's 502 error body
    result = await importer.reconcileMissingInternationals({});
  } finally {
    console.error = realError;
  }
  assert.equal(result.imported.length, 0);
  assert.deepEqual(result.failed.map((f) => f.id), ["wt20i/1549195"]);
  assert.match(result.failed[0].error, /1549195.*bad gateway/);
  assert.match(errors.join("\n"), /wt20i 1549195 failed/);
  assert.match(importer.reconcileSummaryLine(result, 40), /failed 1 \(wt20i\/1549195\)/);
  assert.equal((await db.pool.query(`select count(*)::int as n from games where espn_id = '1549195'`)).rows[0].n, 0);
});
