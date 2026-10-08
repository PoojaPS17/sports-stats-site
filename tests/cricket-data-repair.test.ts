/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startTestDb, type TestDb } from "./helpers/testDb";

// The date sweep's second pass waits this long before it re-reads failed days; the test must not.
process.env.IMPORT_RECHECK_PAUSE_MS = "0";

let db: TestDb;
let importer: typeof import("../scripts/import-cricket-espn");
let repair: typeof import("../scripts/repair-cricket-empty-reports");
const realFetch = globalThis.fetch;

before(async () => {
  db = await startTestDb();
  importer = await import("../scripts/import-cricket-espn");
  repair = await import("../scripts/repair-cricket-empty-reports");
});
after(async () => {
  globalThis.fetch = realFetch;
  await db?.stop();
});
beforeEach(async () => {
  globalThis.fetch = realFetch;
  for (const t of ["player_game_stats", "game_details", "games", "players", "teams"]) await db.pool.query(`delete from ${t}`);
});

/* ------------------------------ fixtures ------------------------------ */

const stat = (name: string, value: number) => ({ name, value, displayValue: String(value) });
function player(id: string, name: string, runs?: number, wickets?: number) {
  const linescores: any[] = [];
  if (runs !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("batted", 1), stat("ballsFaced", runs + 5), stat("runs", runs), stat("fours", 2), stat("sixes", 0), stat("notouts", 0)] }] } });
  if (wickets !== undefined) linescores.push({ period: 1, statistics: { categories: [{ stats: [stat("overs", 4), stat("conceded", 30), stat("wickets", wickets), stat("bpo", 6)] }] } });
  return { athlete: { id, displayName: name }, position: { abbreviation: "BAT" }, linescores };
}
function summary(id: string, opts: { text?: string; state?: string; noFigures?: boolean; potm?: boolean } = {}) {
  const roster = (team: string, ps: [string, string, number?, number?][]) => ({
    team: { id: team, displayName: team === "10" ? "Alpha" : "Bravo" },
    roster: ps.map(([i, n, r, w]) => (opts.noFigures ? { athlete: { id: i, displayName: n }, linescores: [] } : player(i, n, r, w))),
  });
  const competitor = (homeAway: string, tid: string, name: string, score: string, winner: boolean) => ({ homeAway, winner, score, team: { id: tid, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() }, linescores: [] });
  return {
    header: {
      id,
      description: "3rd T20I, Somewhere",
      competitions: [
        {
          date: "2026-08-26T09:00Z",
          status: {
            type: { state: opts.state ?? "post" },
            summary: opts.text ?? "Alpha won by 5 runs",
            featuredAthletes: opts.potm ? [{ name: "playerOfTheMatch", athlete: { id: "h1", displayName: "Ann Alpha" } }] : [],
          },
          competitors: [competitor("home", "10", "Alpha", "150/5", true), competitor("away", "20", "Bravo", "145/8", false)],
        },
      ],
    },
    gameInfo: { venue: { fullName: "Test Oval" } },
    rosters: [
      roster("10", [["h1", "Ann Alpha", 60], ["h2", "Bea Alpha", 20, 2]]),
      roster("20", [["a1", "Cat Bravo", 45], ["a2", "Dee Bravo", undefined, 3]]),
    ],
  };
}
/** ESPN stub: summary URLs answer from `bodies`; a missing id answers with the 502 error body. */
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
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const [e, l] = [console.error, console.log];
  console.error = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
    console.log = l;
  }
};
const gameRows = async (id: string) => (await db.pool.query(`select league from games where espn_id = $1 order by league`, [id])).rows.map((r) => r.league);

/* --------------------------------- --ids --------------------------------- */

test("parseIdList accepts league:id lists and rejects anything else loudly", () => {
  assert.deepEqual(importer.parseIdList("odi:1126321, wt20i:1138196"), [
    { league: "odi", id: "1126321" },
    { league: "wt20i", id: "1138196" },
  ]);
  for (const bad of ["", "1126321", "odi:", "ipl:123", "odi:12a", "odi:1:2", "odi:1,odi:1"]) assert.throws(() => importer.parseIdList(bad), Error, bad);
});

test("--ids writes the match under the requested format key, one result line per id, and a stored match is left alone", async () => {
  stubEspn({ "9001": summary("9001", { potm: true }), "9002": summary("9002") });
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('t20i', '9002', now(), 'kept', '10', '20', true)`);
  const result = await quiet(() =>
    importer.importByIds(
      [
        { league: "wt20i", id: "9001" },
        { league: "t20i", id: "9002" },
      ],
      false,
      0
    )
  );
  assert.equal(result.failed.length, 0);
  assert.match(result.lines[0], /^wt20i:9001 WRITTEN 2026-08-26 Alpha v Bravo/);
  assert.match(result.lines[1], /^t20i:9002 already stored, left alone/);
  assert.deepEqual(await gameRows("9001"), ["wt20i"]);
  const g = (await db.pool.query(`select name, home_score, away_winner, venue from games where espn_id = '9001'`)).rows[0];
  assert.deepEqual([g.name, g.home_score, g.away_winner, g.venue], ["Alpha v Bravo", 150, false, "Test Oval"]);
  assert.equal((await db.pool.query(`select count(*)::int n from player_game_stats where game_espn_id = '9001' and league = 'wt20i'`)).rows[0].n, 4);
  assert.equal((await db.pool.query(`select details->'leaders'->0->>'athlete' a from game_details where game_espn_id = '9001'`)).rows[0].a, "Ann Alpha");
  assert.equal((await db.pool.query(`select name from games where espn_id = '9002'`)).rows[0].name, "kept");
});

test("--ids --dry-run reports what it would write and writes nothing", async () => {
  stubEspn({ "9001": summary("9001") });
  const result = await quiet(() => importer.importByIds([{ league: "odi", id: "9001" }], true, 0));
  assert.match(result.lines[0], /^odi:9001 WOULD WRITE 2026-08-26 Alpha v Bravo — Alpha won by 5 runs; 4 player cards/);
  for (const t of ["games", "players", "teams", "player_game_stats", "game_details"]) assert.equal((await db.pool.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, t);
});

test("--ids: a match with no ball bowled (abandoned, or squads and no figures) is skipped and is not a failure; an unfinished or unreadable one is a failure", async () => {
  stubEspn({ "9003": summary("9003", { text: "Match abandoned without a ball bowled" }), "9004": summary("9004", { noFigures: true }), "9005": summary("9005", { state: "in" }) });
  const result = await quiet(() =>
    importer.importByIds(
      [
        { league: "odi", id: "9003" },
        { league: "odi", id: "9004" },
        { league: "odi", id: "9005" },
        { league: "odi", id: "9006" },
      ],
      false,
      0
    )
  );
  assert.match(result.lines[0], /^odi:9003 SKIPPED abandoned\/cancelled without a ball bowled/);
  assert.match(result.lines[1], /^odi:9004 SKIPPED no ball bowled/);
  assert.match(result.lines[2], /^odi:9005 FAILED not finished/);
  assert.match(result.lines[3], /^odi:9006 FAILED .*unavailable/);
  assert.deepEqual(result.failed, ["odi:9005", "odi:9006"]);
  assert.equal((await db.pool.query(`select count(*)::int n from games`)).rows[0].n, 0);
});

/* ------------------------- date sweep: failed days ------------------------- */

test("the date sweep names the days whose header feed stayed down instead of passing them as quiet days", async () => {
  const event = { id: "7001", status: "post", date: "2026-08-02T10:00Z", name: "Alpha v Bravo", class: { internationalClassId: 3 } };
  globalThis.fetch = (async (input: any) => {
    const day = /dates=(\d+)/.exec(String(input))?.[1];
    if (day === "20260801") return new Response("<html>502</html>", { status: 502 });
    if (day === "20260802") return new Response(JSON.stringify({ sports: [{ leagues: [{ id: "1", events: [event] }] }] }));
    return new Response(JSON.stringify({ sports: [] }));
  }) as typeof fetch;
  const { found, failedDays } = await quiet(() => importer.discover(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-03T00:00:00Z"), undefined));
  assert.deepEqual(failedDays, ["20260801"]);
  assert.deepEqual([...found.keys()], ["7001"]);
  assert.match(importer.failedDaysMessage(failedDays) ?? "", /failed for 1 day\(s\).*20260801.*--ids/);
  assert.equal(importer.failedDaysMessage([]), null);
});

test("a day that fails once and recovers on the second pass is not reported", async () => {
  let calls = 0;
  globalThis.fetch = (async (input: any) => {
    if (/dates=20260801/.test(String(input)) && calls++ < 1) return new Response("<html>502</html>", { status: 502 });
    return new Response(JSON.stringify({ sports: [] }));
  }) as typeof fetch;
  const { failedDays } = await quiet(() => importer.discover(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-01T00:00:00Z"), undefined));
  assert.deepEqual(failedDays, []);
});

/* ------------------- empty ipl / bbl report repair (script) ------------------- */

const EMPTY = { city: null, venue: null, events: [], leaders: [], lineups: [], officials: [], scorecard: [], attendance: null, linescores: null, player_box: [], team_stats: [], win_probability: [] };
async function seedEmptyReport(league: string, id: string) {
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, now(), 'Alpha v Bravo', '10', '20', true)`, [league, id]);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3)`, [league, id, JSON.stringify(EMPTY)]);
}
const fetcher = (byId: Record<string, any>) => async (g: { espn_id: string }) => {
  const s = byId[g.espn_id];
  if (s instanceof Error) throw s;
  return s;
};

test("the ipl/bbl repair stores the scorecard, leaves player rows alone, and --dry-run writes nothing", async () => {
  await seedEmptyReport("ipl", "1");
  await seedEmptyReport("bbl", "2");
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('ipl', '1', 'h1', '10', '{"batting":{"runs":7}}')`);
  const f = fetcher({ "1": summary("1", { potm: true }), "2": summary("2") });
  const dry = await quiet(() => repair.repairEmptyReports([{ league: "ipl", id: "1" }], true, f, 0));
  assert.equal(dry[0].outcome, "would repair");
  assert.match(dry[0].detail, /2 innings sides, 3 batting rows, 2 bowling rows, player of the match/);
  assert.equal((await db.pool.query(`select jsonb_array_length(details->'scorecard') n from game_details where league = 'ipl'`)).rows[0].n, 0);
  const real = await quiet(() =>
    repair.repairEmptyReports(
      [
        { league: "ipl", id: "1" },
        { league: "bbl", id: "2" },
      ],
      false,
      f,
      0
    )
  );
  assert.deepEqual(real.map((l) => l.outcome), ["repaired", "repaired"]);
  const d = (await db.pool.query(`select details from game_details where league = 'ipl' and game_espn_id = '1'`)).rows[0].details;
  assert.equal(d.scorecard.length, 2);
  assert.equal(d.leaders[0].athlete, "Ann Alpha");
  assert.equal((await db.pool.query(`select stats->'batting'->>'runs' r from player_game_stats where league = 'ipl'`)).rows[0].r, "7");
  // a second run finds a scorecard and leaves it
  const again = await quiet(() => repair.repairEmptyReports([{ league: "ipl", id: "1" }], false, f, 0));
  assert.equal(again[0].outcome, "already has a scorecard");
  assert.equal(repair.hasFailures([...real, ...again]), false);
});

test("the ipl/bbl repair reports a missing game, an ESPN outage and a summary with no scorecard as problems, and keeps going", async () => {
  await seedEmptyReport("ipl", "1");
  await seedEmptyReport("ipl", "3");
  await seedEmptyReport("bbl", "4");
  const f = fetcher({ "1": new Error("ESPN down"), "3": summary("3", { noFigures: true }), "4": summary("4") });
  const lines = await quiet(() =>
    repair.repairEmptyReports(
      [
        { league: "ipl", id: "1" },
        { league: "ipl", id: "3" },
        { league: "ipl", id: "99" },
        { league: "bbl", id: "4" },
      ],
      false,
      f,
      0
    )
  );
  assert.deepEqual(lines.map((l) => l.outcome), ["failed", "no scorecard on ESPN", "no game row", "repaired"]);
  assert.equal(repair.hasFailures(lines), true);
  assert.equal((await db.pool.query(`select jsonb_array_length(details->'scorecard') n from game_details where league = 'ipl' and game_espn_id = '1'`)).rows[0].n, 0);
  assert.throws(() => repair.parseKeys("odi:1"));
  assert.equal(repair.KNOWN_EMPTY_REPORTS.length, 6);
});

/* ----------------- empty cwc / t20wc report repair (SQL file) ----------------- */

const SQL_DIR = resolve(__dirname, "../db/repairs");
const FILL = readFileSync(resolve(SQL_DIR, "2026-10-08-fill-empty-tournament-scorecards.sql"), "utf8");
// The rollback file names the 58 production ids; the fixtures use synthetic ones (c0..c7, t0..t49), so swap the list.
const SYNTHETIC_IDS = [...Array.from({ length: 8 }, (_, i) => `('cwc', 'c${i}')`), ...Array.from({ length: 50 }, (_, i) => `('t20wc', 't${i}')`)].join(",\n    ");
const UNDO_FILE = readFileSync(resolve(SQL_DIR, "2026-10-08-fill-empty-tournament-scorecards-rollback.sql"), "utf8");
const UNDO = UNDO_FILE.replace(/from \(values[\s\S]*?\) as ids/, `from (values\n    ${SYNTHETIC_IDS}\n) as ids`);

/** A minimal psql: skips \set / \echo and takes the `\if :{?dry}` branch that applies; everything else runs as one simple query on one connection. */
async function runPsql(file: string, dry: boolean) {
  const sql: string[] = [];
  let inIf = false;
  let branch: "if" | "else" = "if";
  for (const line of file.split("\n")) {
    const t = line.trim();
    if (t.startsWith("\\if")) {
      inIf = true;
      branch = "if";
      continue;
    }
    if (t.startsWith("\\else")) {
      branch = "else";
      continue;
    }
    if (t.startsWith("\\endif")) {
      inIf = false;
      continue;
    }
    if (t.startsWith("\\")) continue;
    if (inIf && (branch === "if") !== dry) continue;
    sql.push(line);
  }
  const client = await db.pool.connect();
  try {
    return await client.query(sql.join("\n"));
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const card = (teams: string[]) => ({
  ...EMPTY,
  venue: "Real Ground",
  scorecard: teams.map((t) => ({ teamId: t, teamName: t, battingRows: [{ name: "A", athleteId: `p${t}`, stats: ["1"] }], bowlingRows: [] })),
  leaders: [{ label: "Player of the Match", team_id: teams[0] }],
});
async function seedTwin(tourney: string, format: string, id: string, opts: { swap?: boolean; full?: boolean; twinTeams?: string[]; noTwin?: boolean } = {}) {
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, now(), 'x', '10', '20', true)`, [tourney, id]);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3)`, [tourney, id, JSON.stringify(opts.full ? card(["10", "20"]) : EMPTY)]);
  if (opts.noTwin) return;
  const [h, a] = opts.swap ? ["20", "10"] : ["10", "20"];
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, now(), 'x', $3, $4, true)`, [format, id, h, a]);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3)`, [format, id, JSON.stringify(card(opts.twinTeams ?? ["10", "20"]))]);
}
/** The 58 the file expects: 8 cwc and 50 t20wc, every third one with its home and away swapped on the twin. */
async function seedFiftyEight() {
  for (let i = 0; i < 8; i++) await seedTwin("cwc", "odi", `c${i}`, { swap: i % 3 === 0 });
  for (let i = 0; i < 50; i++) await seedTwin("t20wc", "t20i", `t${i}`, { swap: i % 3 === 0 });
}
const emptyCount = async () => (await db.pool.query(`select count(*)::int n from game_details where league in ('cwc','t20wc') and jsonb_array_length(details->'scorecard') = 0`)).rows[0].n;

test("the scorecard SQL repairs exactly the 58, from the twin, and leaves decoys alone", async () => {
  await seedFiftyEight();
  await seedTwin("t20wc", "t20i", "d-wrong-teams", { twinTeams: ["10", "30"] }); // twin is another pairing
  await seedTwin("cwc", "odi", "d-no-twin", { noTwin: true });
  await seedTwin("cwc", "odi", "d-already-full", { full: true });
  await seedEmptyReport("ipl", "d-ipl"); // out of scope for this file
  assert.equal(await emptyCount(), 60);
  await runPsql(FILL, false);
  assert.equal(await emptyCount(), 2);
  const fixed = (
    await db.pool.query(
      `select a.details = t.details as same from game_details a join game_details t on t.game_espn_id = a.game_espn_id and t.league = case a.league when 'cwc' then 'odi' else 't20i' end where a.league in ('cwc','t20wc') and a.game_espn_id ~ '^[ct][0-9]+$'`
    )
  ).rows;
  assert.equal(fixed.length, 58);
  assert.ok(fixed.every((r) => r.same));
  const untouched = (await db.pool.query(`select game_espn_id from game_details where jsonb_array_length(details->'scorecard') = 0 and league in ('cwc','t20wc','ipl') order by 1`)).rows.map((r) => r.game_espn_id);
  assert.deepEqual(untouched, ["d-ipl", "d-no-twin", "d-wrong-teams"]);
});

test("the scorecard SQL: dry run rolls everything back; a count other than 58 aborts with nothing changed", async () => {
  await seedFiftyEight();
  await runPsql(FILL, true);
  assert.equal(await emptyCount(), 58);
  await db.pool.query(`delete from game_details where league = 't20i' and game_espn_id = 't0'`); // 57 repairable
  await assert.rejects(() => runPsql(FILL, false), /expected 58 targets, found 57/);
  assert.equal(await emptyCount(), 58);
  await seedTwin("t20wc", "t20i", "extra", {}); // 58 repairable again plus t0 without a twin: 58 again, so it repairs
  await runPsql(FILL, false);
  assert.equal(await emptyCount(), 1); // t0 has no twin report any more and stays as it was
});

test("the scorecard SQL runs once and a second run aborts harmlessly; the rollback file restores the empty template", async () => {
  await seedFiftyEight();
  await runPsql(FILL, false);
  assert.equal(await emptyCount(), 0);
  await assert.rejects(() => runPsql(FILL, false), /expected 58 targets, found 0/);
  assert.equal(await emptyCount(), 0);
  await runPsql(UNDO, false);
  assert.equal(await emptyCount(), 58);
  const row = (await db.pool.query(`select details from game_details where league = 'cwc' and game_espn_id = 'c0'`)).rows[0].details;
  assert.deepEqual(row, EMPTY);
  // the formats' own reports were never touched
  assert.equal((await db.pool.query(`select count(*)::int n from game_details where league in ('odi','t20i') and jsonb_array_length(details->'scorecard') = 2`)).rows[0].n, 58);
});

test("the rollback does not clobber a report a scraper has refreshed since", async () => {
  await seedFiftyEight();
  await runPsql(FILL, false);
  await db.pool.query(`update game_details set details = jsonb_set(details, '{venue}', '"Newer"') where league = 'cwc' and game_espn_id = 'c1'`);
  await runPsql(UNDO, false);
  assert.equal(await emptyCount(), 57);
  assert.equal((await db.pool.query(`select details->>'venue' v from game_details where league = 'cwc' and game_espn_id = 'c1'`)).rows[0].v, "Newer");
});

test("the rollback file lists exactly 58 distinct ids (8 cwc, 50 t20wc)", () => {
  const ids = [...UNDO_FILE.matchAll(/\('(cwc|t20wc)', '(\d+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.equal(ids.length, 58);
  assert.equal(new Set(ids).size, 58);
  assert.equal(ids.filter((x) => x.startsWith("cwc:")).length, 8);
});

test("the missing-internationals id list, check and rollback files agree on the same 106 matches", () => {
  const list = readFileSync(resolve(SQL_DIR, "2026-10-08-missing-internationals.txt"), "utf8").trim().split(",");
  assert.equal(list.length, 106);
  assert.equal(new Set(list).size, 106);
  assert.doesNotThrow(() => importer.parseIdList(list.join(",")));
  for (const file of ["2026-10-08-missing-internationals-check.sql", "2026-10-08-missing-internationals-rollback.sql"]) {
    const sql = readFileSync(resolve(SQL_DIR, file), "utf8");
    const pairs = new Set([...sql.matchAll(/\('(odi|t20i|wodi|wt20i)', '(\d+)'\)/g)].map((m) => `${m[1]}:${m[2]}`));
    for (const id of list) assert.ok(pairs.has(id), `${file} lacks ${id}`);
  }
});
