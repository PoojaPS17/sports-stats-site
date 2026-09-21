// Telling a Cricsheet-built stored report from an ESPN one. The `dismissal` marker only means Cricsheet in a
// league Cricsheet feeds: an ESPN report stored before fe9fbff has no dismissal either. The JS and SQL forms must agree.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { CRICSHEET_LEAGUES, CRICSHEET_REPORT_SQL, isCricsheetLeague, isCricsheetReport, isEspnReport } from "../scripts/lib/cricsheet-report";

const bare = { athleteId: "1", stats: ["1"] };
const withDismissal = { athleteId: "1", stats: ["1"], dismissal: "not out" };
const team = (...rows: unknown[]) => ({ teamId: "1", battingRows: rows });

// [name, scorecard, Cricsheet-built in a Cricsheet league, ESPN with rows to rebuild in a Cricsheet league, has batting rows at all]
const cases: [string, unknown, boolean, boolean, boolean][] = [
  ["no dismissal on the first batting row", [team(bare)], true, false, true],
  ["a dismissal on it", [team(withDismissal)], false, true, true],
  ["the first team has no batting rows, the second has bare ones", [team(), team(bare)], true, false, true],
  ["the first team has no batting rows, the second has dismissals", [team(), team(withDismissal)], false, true, true],
  ["no team has batting rows", [team(), team()], false, false, false],
  ["an empty scorecard", [], false, false, false],
  ["no scorecard", undefined, false, false, false],
  ["a scorecard that is not a list", { not: "a list" }, false, false, false],
];

test("the Cricsheet leagues are one list", () => {
  assert.deepEqual([...CRICSHEET_LEAGUES], ["odi", "t20i", "ipl", "bbl"]);
  assert.equal(isCricsheetLeague("ipl"), true);
  assert.equal(isCricsheetLeague("test"), false);
  assert.equal(isCricsheetLeague("constructor"), false);
});

test("in a Cricsheet league a report without dismissals is Cricsheet's, from the first entry that has batting rows", () => {
  for (const league of CRICSHEET_LEAGUES) {
    for (const [name, scorecard, cricsheet, espn] of cases) {
      assert.equal(isCricsheetReport(league, scorecard), cricsheet, `${league}: ${name}`);
      assert.equal(isEspnReport(league, scorecard), espn, `${league}: ${name} (espn)`);
    }
  }
});

test("in any other league a stored report is ESPN's, dismissals or not", () => {
  for (const league of ["test", "wodi", "wt20i", "cwc", "t20wc", "wpl", "wbbl", "wcwc", "wt20wc"]) {
    for (const [name, scorecard, , , hasRows] of cases) {
      assert.equal(isCricsheetReport(league, scorecard), false, `${league}: ${name}`);
      // Rebuildable whenever it has batting rows: an ESPN report from before fe9fbff has none with a dismissal.
      assert.equal(isEspnReport(league, scorecard), hasRows, `${league}: ${name} (espn)`);
    }
  }
});

let db: TestDb;
before(async () => {
  db = await startTestDb();
});
after(async () => {
  await db?.stop();
});

test("the SQL form agrees with the JS one, league by league", async () => {
  const leagues = [...CRICSHEET_LEAGUES, "test", "wbbl"];
  let n = 0;
  const expected = new Map<string, boolean>();
  for (const league of leagues) {
    for (const [, scorecard] of cases) {
      const id = `g${n++}`;
      // The array-shaped cases only: `undefined` is no details key at all, and a non-list is stored as it is.
      await db.pool.query(`insert into game_details (league, game_espn_id, details) values ($1, $2, $3::jsonb)`, [league, id, JSON.stringify(scorecard === undefined ? {} : { scorecard })]);
      expected.set(`${league}/${id}`, isCricsheetReport(league, scorecard));
    }
  }
  const { rows } = await db.pool.query(`select d.league, d.game_espn_id, (${CRICSHEET_REPORT_SQL}) as cricsheet from game_details d`);
  assert.equal(rows.length, expected.size);
  for (const r of rows) assert.equal(r.cricsheet, expected.get(`${r.league}/${r.game_espn_id}`), `${r.league} ${r.game_espn_id}`);
});
