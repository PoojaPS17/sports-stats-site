// A cricket match is filed under its local day. `date` is a UTC instant, so the Boxing Day Test in
// Melbourne (10.30 local, "2025-12-25T23:30Z") printed Dec 25 and sat on the Dec 25 scores page;
// Cricinfo says Dec 26. games.local_date / end_date carry the local day(s) parsed at ingest, and
// every place that names a game's day reads them when present. nfl and nba keep their Eastern day.
// The machine's own zone is pinned to something that is neither UTC nor Eastern, as in game-day.test.ts.
process.env.TZ = "Australia/Sydney";

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { formatGameDate, formatGameDateRange, gameDayIso } from "../src/lib/gameDay";

let db: TestDb;
let games: typeof import("../scripts/lib/games");
let queries: typeof import("../src/lib/queries");
before(async () => {
  db = await startTestDb();
  games = await import("../scripts/lib/games");
  queries = await import("../src/lib/queries");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values
    ('test','1','England','england'), ('test','2','Australia','australia'),
    ('wbbl','896433','Hobart Hurricanes Women','hobart-hurricanes-women'), ('wbbl','896403','Sydney Sixers Women','sydney-sixers-women'),
    ('nba','1','Home NBA','home-nba'), ('nba','2','Away NBA','away-nba')`);
});
after(async () => {
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

// A finished WBBL match as ESPN's scoreboard lists it (real: 39th Match, 2024-11-23T23:00Z, Melbourne, Nov 24).
function wbblEvent(id: string, date: string, description: string) {
  return {
    id,
    date,
    name: "Hurricanes v Sixers",
    season: { year: 2024 },
    description,
    competitions: [
      {
        notes: [],
        competitors: [
          { homeAway: "home", winner: true, score: "150/4", team: { id: "896433", displayName: "Hobart Hurricanes Women", abbreviation: "HH-W" } },
          { homeAway: "away", winner: false, score: "149/8", team: { id: "896403", displayName: "Sydney Sixers Women", abbreviation: "SS-W" } },
        ],
        status: { summary: "Hobart Hurricanes Women won by 6 wickets", type: { state: "post", detail: "Final" } },
      },
    ],
  };
}
const dates = async (league: string, id: string) =>
  (await db.pool.query(`select local_date::text as local_date, end_date::text as end_date from games where league = $1 and espn_id = $2`, [league, id])).rows[0];

/** A Test row as import-cricket-espn writes it, before its local days are stored. */
async function insertTest(id: string, date: string) {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_state)
     values ('test', $1, $2, 'England v Australia', '1', '2', 2025, true, 'post')`,
    [id, date]
  );
}

/* ---- ingest ------------------------------------------------------------- */

test("upsertEvent stores the local day of a morning match that starts the day before in UTC", async () => {
  await games.upsertEvent("wbbl", wbblEvent("1", "2024-11-23T23:00Z", "39th Match, Women's Big Bash League at Melbourne, Nov 24 2024"));
  assert.deepEqual(await dates("wbbl", "1"), { local_date: "2024-11-24", end_date: null });
});

test("a Test's first and last day are stored from the summary feed's text", async () => {
  await insertTest("1455614", "2025-12-25T23:30:00Z");
  await games.storeCricketDates("test", "1455614", "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", [{ type: "matchdays", text: "26,27 December 2025 (5-day match)" }], "2025-12-25T23:30Z");
  assert.deepEqual(await dates("test", "1455614"), { local_date: "2025-12-26", end_date: "2025-12-27" });
});

test("a re-run with the same feed changes nothing; a feed with no date keeps what is stored", async () => {
  await insertTest("1455614", "2025-12-25T23:30:00Z");
  const args = ["test", "1455614", "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", null, "2025-12-25T23:30Z"] as const;
  await games.storeCricketDates(...args);
  await games.storeCricketDates(...args);
  assert.deepEqual(await dates("test", "1455614"), { local_date: "2025-12-26", end_date: "2025-12-27" });
  // a feed copy with no date in it: the UTC fallback must not overwrite the local day, nor drop the range
  await games.storeCricketDates("test", "1455614", "4th Test, England tour of Australia at Melbourne", undefined, "2025-12-25T23:30Z");
  assert.deepEqual(await dates("test", "1455614"), { local_date: "2025-12-26", end_date: "2025-12-27" });
});

test("a match with no date anywhere in its feed gets the UTC day once, and a later dated feed replaces it", async () => {
  await games.upsertEvent("wbbl", wbblEvent("2", "2024-11-23T23:00Z", "Final, Women's Big Bash League at Hobart"));
  assert.deepEqual(await dates("wbbl", "2"), { local_date: "2024-11-23", end_date: null });
  await games.upsertEvent("wbbl", wbblEvent("2", "2024-11-23T23:00Z", "Final, Women's Big Bash League at Hobart, Nov 24 2024"));
  assert.deepEqual(await dates("wbbl", "2"), { local_date: "2024-11-24", end_date: null });
});

test("a corrected parse replaces an old range", async () => {
  await insertTest("9", "2024-12-25T23:30:00Z");
  await games.storeCricketDates("test", "9", "4th Test, India tour of Australia at Melbourne, Dec 26-30 2024", null, "2024-12-25T23:30Z");
  assert.equal((await dates("test", "9")).end_date, "2024-12-30");
  await games.storeCricketDates("test", "9", "4th Test, India tour of Australia at Melbourne, Dec 26-29 2024", null, "2024-12-25T23:30Z");
  assert.equal((await dates("test", "9")).end_date, "2024-12-29");
});

test("nba rows never get a local day", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ('nba', 'n1', '2026-06-08T02:00:00Z', 'x', '1', '2', 2026, true)`
  );
  assert.deepEqual(await dates("nba", "n1"), { local_date: null, end_date: null });
});

/* ---- the owner backfill -------------------------------------------------- */

test("the international backfill dates the rows that have none, skips Cricsheet's noon rows, and can be re-run", async () => {
  const backfill = await import("../scripts/lib/cricket-date-backfill");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('odi','1','England','england'), ('odi','2','Australia','australia') on conflict do nothing`);
  await insertTest("1455614", "2025-12-25T23:30:00Z");
  await insertTest("nodate", "2025-03-04T09:30:00Z");
  await insertTest("done", "2025-12-25T23:30:00Z");
  await db.pool.query(`update games set local_date = '2025-12-26' where espn_id = 'done'`);
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values
       ('odi', 'cricsheet', '2025-12-26T12:00:00Z', 'x', '1', '2', 2025, true), ('odi', 'espn-odi', '2025-11-23T23:00:00Z', 'x', '1', '2', 2025, true)`
  );
  const asked: string[] = [];
  const feed: Record<string, unknown> = {
    "1455614": { header: { description: "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025" }, notes: [{ type: "matchdays", text: "26,27 December 2025 (5-day match)" }] },
    nodate: { header: { description: "Only Test, X tour of Y at Z" }, notes: [] },
    "espn-odi": { header: { description: "3rd ODI, X tour of Y at Perth, Nov 24 2025" }, notes: [] },
  };
  const deps = { fetchSummary: async (id: string) => (asked.push(id), feed[id] ?? Promise.reject(new Error("no such match"))), sleep: async () => {} };
  const out = await backfill.backfillCricketDates(["test", "odi"], {}, deps as never);
  assert.deepEqual(out, { candidates: 3, dated: 2, fallback: 1, failed: 0 });
  assert.deepEqual(asked.sort(), ["1455614", "espn-odi", "nodate"], "the finished row and the Cricsheet noon row are not fetched");
  assert.deepEqual(await dates("test", "1455614"), { local_date: "2025-12-26", end_date: "2025-12-27" });
  assert.deepEqual(await dates("test", "nodate"), { local_date: "2025-03-04", end_date: null });
  assert.deepEqual(await dates("odi", "espn-odi"), { local_date: "2025-11-24", end_date: null });
  assert.deepEqual(await dates("odi", "cricsheet"), { local_date: null, end_date: null });
  // a second run has nothing left to do
  asked.length = 0;
  assert.equal((await backfill.backfillCricketDates(["test", "odi"], {}, deps as never)).candidates, 0);
  assert.deepEqual(asked, []);
  // a request that fails is counted, and the row stays for the next run
  await insertTest("gone", "2025-05-05T05:00:00Z");
  const failed = await backfill.backfillCricketDates(["test"], {}, deps as never);
  assert.deepEqual([failed.candidates, failed.failed], [1, 1]);
  assert.equal((await dates("test", "gone")).local_date, null);
});

/* ---- the day query ------------------------------------------------------ */

test("a Test at 2025-12-25T23:30Z with local day Dec 26 is on the Dec 26 scores page and not Dec 25", async () => {
  await insertTest("1455614", "2025-12-25T23:30:00Z");
  await games.storeCricketDates("test", "1455614", "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", null, "2025-12-25T23:30Z");
  assert.deepEqual((await queries.getGamesByDate("test", "2025-12-26")).map((g) => g.espn_id), ["1455614"]);
  assert.deepEqual(await queries.getGamesByDate("test", "2025-12-25"), []);
  // and the row a page gets carries the days
  const [row] = await queries.getGamesByDate("test", "2025-12-26");
  assert.equal(row.local_date, "2025-12-26");
  assert.equal(row.end_date, "2025-12-27");
  const byId = await queries.getGameByEspnId("test", "1455614");
  assert.equal(byId?.local_date, "2025-12-26");
});

test("a cricket row not yet backfilled keeps its UTC day; nba keeps its Eastern day", async () => {
  await insertTest("old", "2025-12-25T23:30:00Z");
  assert.deepEqual((await queries.getGamesByDate("test", "2025-12-25")).map((g) => g.espn_id), ["old"]);
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ('nba', 'late', '2026-06-08T02:00:00Z', 'x', '1', '2', 2026, true)`
  );
  assert.deepEqual((await queries.getGamesByDate("nba", "2026-06-07")).map((g) => g.espn_id), ["late"]);
  assert.deepEqual(await queries.getGamesByDate("nba", "2026-06-08"), []);
});

/* ---- the label ---------------------------------------------------------- */

test("gameDayIso and formatGameDate use the stored local day when given, and are unchanged when not", () => {
  assert.equal(gameDayIso("2025-12-25T23:30:00Z", "test", "2025-12-26"), "2025-12-26");
  assert.equal(gameDayIso("2025-12-25T23:30:00Z", "test", null), "2025-12-25");
  assert.equal(gameDayIso("2026-06-08T02:00:00Z", "nba"), "2026-06-07");
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  assert.equal(formatGameDate("2025-12-25T23:30:00Z", "test", short, "2025-12-26"), "Dec 26, 2025");
  assert.equal(formatGameDate("2025-12-25T23:30:00Z", "test", short), "Dec 25, 2025");
  // a full timestamp reads as its day too
  assert.equal(formatGameDate("2025-12-25T23:30:00Z", "test", short, "2025-12-26T00:00:00.000Z"), "Dec 26, 2025");
});

test("a multi-day match reads as a range the way Cricinfo prints it", () => {
  const d = "2025-12-25T23:30:00Z";
  assert.equal(formatGameDateRange(d, "test", "2025-12-26", "2025-12-30"), "Dec 26-30, 2025");
  assert.equal(formatGameDateRange(d, "test", "2024-02-29", "2024-03-03"), "Feb 29 - Mar 3, 2024");
  assert.equal(formatGameDateRange(d, "test", "2021-12-30", "2022-01-03"), "Dec 30, 2021 - Jan 3, 2022");
  // one day: the usual label with its weekday; no end date or an end on the first day: the same
  assert.equal(formatGameDateRange(d, "test", "2025-12-26", null), "Fri, Dec 26, 2025");
  assert.equal(formatGameDateRange(d, "test", "2025-12-26", "2025-12-26"), "Fri, Dec 26, 2025");
  // a game with no stored day is its UTC day, as before
  assert.equal(formatGameDateRange(d, "test", null, null), "Thu, Dec 25, 2025");
});

/* ---- the backfill's command line ------------------------------------------ */

test("backfill:cricket-dates reads its arguments: every league given, the limit not taken for a league, a typo refused", async () => {
  const { parseDateBackfillArgs } = await import("../scripts/lib/cricket-date-backfill");
  const all = ["test", "wodi", "wt20i", "odi", "t20i"];
  assert.deepEqual(parseDateBackfillArgs(["wodi"]), { ok: true, leagues: ["wodi"], limit: undefined });
  assert.deepEqual(parseDateBackfillArgs(["wodi", "wt20i"]), { ok: true, leagues: ["wodi", "wt20i"], limit: undefined });
  assert.deepEqual(parseDateBackfillArgs(["--limit", "20", "test"]), { ok: true, leagues: ["test"], limit: 20 });
  assert.deepEqual(parseDateBackfillArgs(["test", "--limit", "20"]), { ok: true, leagues: ["test"], limit: 20 });
  assert.deepEqual(parseDateBackfillArgs([]), { ok: true, leagues: all, limit: undefined });
  assert.deepEqual(parseDateBackfillArgs(["--limit", "5"]), { ok: true, leagues: all, limit: 5 });
  // a typo must reach the usage guard, first or last, with or without --limit
  assert.equal(parseDateBackfillArgs(["tets"]).ok, false);
  assert.equal(parseDateBackfillArgs(["tets", "wodi"]).ok, false);
  assert.equal(parseDateBackfillArgs(["wodi", "tets"]).ok, false);
  assert.equal(parseDateBackfillArgs(["--limit", "5", "tets"]).ok, false);
  // a bad limit, a missing limit value, an unknown flag
  assert.equal(parseDateBackfillArgs(["test", "--limit", "0"]).ok, false);
  assert.equal(parseDateBackfillArgs(["test", "--limit", "x"]).ok, false);
  assert.equal(parseDateBackfillArgs(["test", "--limit"]).ok, false);
  assert.equal(parseDateBackfillArgs(["test", "--dry-run"]).ok, false);
});

test("storing the same dates again writes nothing, so the live scrape makes no row version per poll", async () => {
  await insertTest("noop", "2025-12-25T23:30:00Z");
  const args = ["test", "noop", "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", null, "2025-12-25T23:30Z"] as const;
  await games.storeCricketDates(...args);
  const xmin = async () => (await db.pool.query(`select xmin::text as x from games where league = 'test' and espn_id = 'noop'`)).rows[0].x;
  const first = await xmin();
  await games.storeCricketDates(...args);
  await games.storeCricketDates(...args);
  assert.equal(await xmin(), first, "the row was not rewritten");
  assert.deepEqual(await dates("test", "noop"), { local_date: "2025-12-26", end_date: "2025-12-27" });
  // a feed with no date, against a row that already has one, is also a no-op
  await games.storeCricketDates("test", "noop", "4th Test, England tour of Australia at Melbourne", null, "2025-12-25T23:30Z");
  assert.equal(await xmin(), first);
  // and a real change still lands
  await games.storeCricketDates("test", "noop", "4th Test, England tour of Australia at Melbourne, Dec 26-29 2025", null, "2025-12-25T23:30Z");
  assert.equal((await dates("test", "noop")).end_date, "2025-12-29");
  assert.notEqual(await xmin(), first);
});
