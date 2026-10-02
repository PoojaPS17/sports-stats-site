// The ops report's per-league checks and MLB. Most of them read the leagues out of the data (the
// freshness list is `group by league`, the missing-box-score count likewise), so baseball joins them
// as soon as it has rows. The one that names its leagues is the standings sanity check, and the
// football rule it carries is wrong for baseball: 162 games, no ties, and no points column at all.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let opsReport: typeof import("../src/lib/opsReport");
before(async () => {
  db = await startTestDb();
  opsReport = await import("../src/lib/opsReport");
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('mlb', '10', 'New York Yankees', 'new-york-yankees'), ('mlb', '2', 'Boston Red Sox', 'boston-red-sox')`);
});
after(async () => {
  await db?.stop();
});

const standingsRow = (teamId: string, wins: number, losses: number, draws: number | null) =>
  db.pool.query(`insert into standings (league, season, team_espn_id, conference, wins, losses, draws) values ('mlb', 2026, $1, 'American League', $2, $3, $4)`, [teamId, wins, losses, draws]);

const unwrap = <T>(s: { ok: boolean; data?: T }): T => {
  assert.ok(s.ok, "the section ran");
  return s.data as T;
};

test("a plausible MLB table is reported as sound", async () => {
  await db.pool.query(`delete from standings`);
  await standingsRow("10", 93, 68, 0);
  await standingsRow("2", 82, 79, 0);
  const data = unwrap(await opsReport.integritySection(db.pool)) as { standingsSumMismatch: { count: number; examples: string[] } };
  assert.equal(data.standingsSumMismatch.count, 0);
});

test("an MLB row with more than a season of games, or with a tie, is a finding", async () => {
  await db.pool.query(`delete from standings`);
  await standingsRow("10", 120, 68, 0); // 188 games: impossible
  await standingsRow("2", 81, 80, 1); // baseball has no ties
  const data = unwrap(await opsReport.integritySection(db.pool)) as { standingsSumMismatch: { count: number; examples: string[] } };
  assert.equal(data.standingsSumMismatch.count, 2);
  assert.deepEqual(data.standingsSumMismatch.examples.sort(), ["mlb 10", "mlb 2"]);
});

test("freshness and the missing-box-score count pick MLB up from the data, with no list to edit", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type)
     values ('mlb', 'f1', now() - interval '3 days', 'x', '10', '2', 2026, true, 2)`,
  );
  const fresh = unwrap(await opsReport.freshnessSection(db.pool)) as { leagues: { league: string; completedLast7Days: number }[] };
  assert.equal(fresh.leagues.find((l) => l.league === "mlb")?.completedLast7Days, 1);

  const integrity = unwrap(await opsReport.integritySection(db.pool)) as { completedNoBoxScore: { league: string; count: number }[] };
  assert.equal(integrity.completedNoBoxScore.find((l) => l.league === "mlb")?.count, 1, "a finished MLB game with no box score is a finding, as for the NBA and NFL");
});
