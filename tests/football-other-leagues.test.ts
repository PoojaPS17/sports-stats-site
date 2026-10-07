// A footballer has a page per competition; the strip on each links to the others he has appearances in, joined on the ESPN id.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let FootballOtherLeagues: typeof import("../src/components/FootballOtherLeagues").FootballOtherLeagues;

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  ({ FootballOtherLeagues } = await import("../src/components/FootballOtherLeagues"));
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  for (const l of ["epl", "ucl", "europa", "laliga"]) {
    await q(`insert into teams (league, espn_id, name, slug) values ($1, 'h', 'Home', 'home'), ($1, 'a', 'Away', 'away')`, [l]);
  }
  await q(`insert into players (league, espn_id, name, slug) values
    ('epl', '1', 'Kay Ten', 'kay-ten'), ('ucl', '1', 'Kay Ten', 'kay-ten'), ('europa', '1', 'Kay Ten', 'kay-ten'), ('laliga', '1', 'Kay Ten', 'kay-ten'),
    ('epl', '2', 'Solo Man', 'solo-man'), ('nba', '1', 'Hoop Man', 'hoop-man')`);
  const game = (league: string, id: string, completed = true) =>
    q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
       values ($1, $2, now(), 'x', 2025, 'h', 'a', 1, 0, $3, 2, 'STD')`, [league, id, completed]);
  const row = (league: string, g: string, player: string, m: object) =>
    q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, 'h', $4)`, [league, g, player, JSON.stringify({ match: m })]);
  for (const [l, g, c] of [["epl", "e1", true], ["ucl", "u1", true], ["ucl", "u2", true], ["ucl", "u3", true], ["europa", "x1", false], ["laliga", "l1", true]] as const) await game(l, g, c);
  await row("epl", "e1", "1", { APP: "1", G: "1", A: "0" });
  await row("ucl", "u1", "1", { APP: "1", G: "2", A: "1" });
  await row("ucl", "u2", "1", { APP: "1", G: "0", A: "0" });
  await row("ucl", "u3", "1", { APP: "0", G: "0", A: "0" }); // unused substitute: not an appearance
  await row("europa", "x1", "1", { APP: "1", G: "5", A: "0" }); // game not completed: not counted
  await row("laliga", "l1", "1", { APP: "0" }); // only an unused-substitute row: league left out
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("lists the other competitions with appearances, in the site's order, counting what the page's log counts", async () => {
  const f = await queries.getPlayerOtherLeagues("epl", "1");
  assert.deepEqual(f.map((x) => [x.league, x.slug, x.apps, x.goals, x.assists]), [["ucl", "kay-ten", 2, 2, 1]]);
});

test("a one-competition player and a non-football league get nothing", async () => {
  assert.deepEqual(await queries.getPlayerOtherLeagues("epl", "2"), []);
  assert.deepEqual(await queries.getPlayerOtherLeagues("nba", "1"), []);
});

test("the strip links each competition, drops zero goals and assists, and renders nothing when there are none", () => {
  const html = renderToStaticMarkup(createElement(FootballOtherLeagues, { name: "Kay Ten", leagues: [{ league: "ucl", slug: "kay-ten", apps: 9, goals: 1, assists: 0 }, { league: "laliga", slug: "kay-ten", apps: 1, goals: 0, assists: 0 }] }));
  assert.match(html, /href="\/ucl\/players\/kay-ten"/);
  assert.match(html, /9 apps · 1 goal</);
  assert.match(html, />1 app</);
  assert.equal(renderToStaticMarkup(createElement(FootballOtherLeagues, { name: "Kay Ten", leagues: [] })), "");
});
