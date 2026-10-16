// A cricketer's page lists his latest matches, each linking its scorecard: one row per match, every innings in it, newest first.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { cricketMatchLogCells, cricketMatchLogOvers, groupMatchLog } from "../src/lib/cricketMatchLog";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let CricketMatchLog: typeof import("../src/components/CricketMatchLog").CricketMatchLog;

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  ({ CricketMatchLog } = await import("../src/components/CricketMatchLog"));
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  await q(`insert into teams (league, espn_id, name, slug) values ('test', 'ind', 'India', 'india'), ('test', 'aus', 'Australia', 'australia'), ('test', 'eng', 'England', 'england')`);
  const game = (id: string, date: string, home: string, away: string, summary: string) =>
    q(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, status_summary, completed) values ('test', $1, $2, 'x', $3, $4, $5, true)`, [id, date, home, away, summary]);
  await game("g1", "2026-01-10T04:00:00Z", "ind", "aus", "India won by 5 wickets");
  await game("g2", "2026-03-05T04:00:00Z", "eng", "ind", "Match drawn");
  await game("g3", "2026-05-01T04:00:00Z", "ind", "eng", "India won by an innings");
  await game("g4", "2026-06-01T04:00:00Z", "aus", "eng", "Not his match");
  const row = (g: string, player: string, team: string, stats: object) =>
    q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', $1, $2, $3, $4)`, [g, player, team, JSON.stringify(stats)]);
  // a match with two innings of batting and bowling, a batted-only match, a match he only fielded in; and another player's
  await row("g1", "p1", "ind", { innings: [{ n: 1, batting: { runs: 45, notOut: false }, bowling: { wickets: 3, conceded: 50, overs: 12 } }, { n: 2, batting: { runs: 12, notOut: true } }] });
  await row("g2", "p1", "ind", { innings: [{ n: 1, batting: { runs: 101, notOut: true } }] });
  await row("g3", "p1", "ind", { catches: 2 });
  await row("g4", "p2", "aus", { batting: { runs: 9, notOut: false } });
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("one row per match, newest first, with the opponent and the result", async () => {
  const log = await queries.getPlayerCricketMatchLog("test", "p1");
  assert.deepEqual(log.map((r) => [r.game_espn_id, r.opponent, r.result]), [
    ["g3", "England", "India won by an innings"],
    ["g2", "England", "Match drawn"],
    ["g1", "Australia", "India won by 5 wickets"],
  ]);
});

test("every innings of a match is kept in order, and a match he only fielded in still counts", async () => {
  const log = await queries.getPlayerCricketMatchLog("test", "p1");
  const byId = new Map(log.map((r) => [r.game_espn_id, r]));
  assert.deepEqual(cricketMatchLogCells(byId.get("g1")!.innings), { batting: "45 & 12*", bowling: "3/50" });
  assert.deepEqual(cricketMatchLogCells(byId.get("g2")!.innings), { batting: "101*", bowling: "—" });
  assert.deepEqual(cricketMatchLogCells(byId.get("g3")!.innings), { batting: "—", bowling: "—" });
  assert.equal(cricketMatchLogOvers(byId.get("g1")!.innings), "12 ov");
});

test("the limit counts matches, not innings; another player's matches and non-cricket leagues give nothing", async () => {
  assert.deepEqual((await queries.getPlayerCricketMatchLog("test", "p1", 1)).map((r) => r.game_espn_id), ["g3"]);
  assert.deepEqual((await queries.getPlayerCricketMatchLog("test", "p1", 2)).map((r) => r.game_espn_id), ["g3", "g2"]);
  assert.deepEqual((await queries.getPlayerCricketMatchLog("test", "p2")).map((r) => r.game_espn_id), ["g4"]);
  assert.deepEqual(await queries.getPlayerCricketMatchLog("test", "nobody"), []);
  assert.deepEqual(await queries.getPlayerCricketMatchLog("nba", "p1"), []);
});

test("groupMatchLog folds innings rows into matches in the order given and skips innings with no figures", () => {
  const base = { date: "2026-01-01T00:00:00Z", local_date: null, opponent: "X", result: null };
  const blank = { runs: null, notOut: null, wickets: null, conceded: null, overs: null };
  const rows = groupMatchLog([
    { ...base, game_espn_id: "a", ...blank, runs: 4, notOut: false },
    { ...base, game_espn_id: "a", ...blank, wickets: 2, conceded: 30, overs: 6.2 },
    { ...base, game_espn_id: "b", ...blank },
  ]);
  assert.deepEqual(rows.map((r) => [r.game_espn_id, r.innings.length]), [["a", 2], ["b", 0]]);
  assert.equal(cricketMatchLogOvers(rows[0].innings), "6.2 ov");
});

test("each row links its scorecard on the league's own path, and an empty log renders nothing", async () => {
  const log = await queries.getPlayerCricketMatchLog("test", "p1");
  const html = renderToStaticMarkup(createElement(CricketMatchLog, { league: "test", rows: log }));
  assert.match(html, /href="\/test\/games\/g1"/);
  assert.match(html, /v Australia/);
  assert.match(html, /45 &amp; 12\*/);
  assert.match(html, /India won by 5 wickets/);
  assert.equal(renderToStaticMarkup(createElement(CricketMatchLog, { league: "test", rows: [] })), "");
});
