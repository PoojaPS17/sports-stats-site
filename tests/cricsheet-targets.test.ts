// Which stored games the Cricsheet importer's cards-only mode picks up, and what --rewrite-cards adds.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { selectCardsOnlyGames } from "../scripts/lib/cricsheet-targets";

let db: TestDb;
before(async () => {
  db = await startTestDb();
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('ipl', '1', 'One', 'one'), ('ipl', '2', 'Two', 'two')`);
  const game = async (id: string, rows: boolean, report: unknown) => {
    await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('ipl', $1, now(), 'x', '1', '2', true)`, [id]);
    if (rows) await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('ipl', $1, 'p', '1', '{}')`, [id]);
    if (report !== undefined) await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('ipl', $1, $2::jsonb)`, [id, JSON.stringify(report)]);
  };
  const espnReport = { scorecard: [{ battingRows: [{ athleteId: "p", stats: ["1"], dismissal: "not out" }] }] };
  const cricsheetReport = { scorecard: [{ battingRows: [{ athleteId: "p", stats: ["1"] }] }] };
  await game("empty", false, undefined);
  await game("espn", true, espnReport);
  await game("cricsheet", true, cricsheetReport);
  await game("noreport", true, undefined);
  await game("emptyreport", true, { scorecard: [] });
  await game("noscorecard", true, {});
  // The first team entry has no batting rows: Cricsheet's is found in the second, so is ESPN's.
  await game("cricsheet-later", true, { scorecard: [{ battingRows: [] }, ...cricsheetReport.scorecard] });
  await game("espn-later", true, { scorecard: [{ battingRows: [] }, ...espnReport.scorecard] });
  // A league Cricsheet does not feed: a report with no dismissal is ESPN's (stored before fe9fbff), never a target.
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('wpl', '1', 'One', 'one'), ('wpl', '2', 'Two', 'two')`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ('wpl', 'old-espn', now(), 'x', '1', '2', true)`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('wpl', 'old-espn', 'p', '1', '{}')`);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('wpl', 'old-espn', $1::jsonb)`, [JSON.stringify(cricsheetReport)]);
});
after(async () => {
  await db?.stop();
});

test("by default only games with no player rows are queued", async () => {
  assert.deepEqual((await selectCardsOnlyGames(db.pool, "ipl", false)).map((g) => g.espn_id), ["empty"]);
});

test("--rewrite-cards also queues games whose stored report was built from Cricsheet, and nothing ESPN-fed", async () => {
  const ids = (await selectCardsOnlyGames(db.pool, "ipl", true)).map((g) => g.espn_id).sort();
  assert.deepEqual(ids, ["cricsheet", "cricsheet-later", "empty"]);
});

test("the selection carries the team columns the importer reads", async () => {
  const [g] = await selectCardsOnlyGames(db.pool, "ipl", false);
  assert.deepEqual(g, { espn_id: "empty", home_id: "1", home_name: "One", home_abbr: null, away_id: "2", away_name: "Two", away_abbr: null });
});

test("--rewrite-cards adds nothing in a league Cricsheet does not feed", async () => {
  assert.deepEqual(await selectCardsOnlyGames(db.pool, "wpl", true), []);
});
