// A cricketer has a page per competition; the strip on each links to the others he has match figures in, joined on the ESPN id.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let CricketOtherFormats: typeof import("../src/components/CricketOtherFormats").CricketOtherFormats;
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  ({ CricketOtherFormats } = await import("../src/components/CricketOtherFormats"));
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  await q(`insert into players (league, espn_id, name, slug) values
    ('t20i', '1', 'Vee Kay', 'vee-kay'), ('odi', '1', 'Vee Kay', 'vee-kay'), ('test', '1', 'Vee Kay', 'vee-kay'), ('ipl', '1', 'Vee Kay', 'vee-kay'),
    ('odi', '2', 'Solo Man', 'solo-man')`);
  const row = (league: string, game: string, player: string, stats: object) =>
    q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, 'x', $4)`, [league, game, player, JSON.stringify(stats)]);
  await row("t20i", "a", "1", { innings: [{ batting: { runs: 50 } }] });
  await row("odi", "b", "1", { innings: [{ batting: { runs: 100 } }, { batting: { runs: 20 }, bowling: { wickets: 5, overs: 4, conceded: 20 } }] });
  await row("odi", "c", "1", { innings: [{ batting: { runs: 7 } }] });
  // ipl and test have a players row for him but no match figures, so they are left out; another player's figures are not his
  await row("odi", "d", "2", { innings: [{ batting: { runs: 9 } }] });
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("lists the other competitions with figures, in the site's order, never the page's own", async () => {
  const f = await queries.getPlayerOtherFormats("t20i", "1");
  assert.deepEqual(f.map((x) => [x.league, x.slug, x.matches, x.runs, x.wickets]), [["odi", "vee-kay", 2, 127, 5]]);
});

test("a one-competition player and a non-cricket league get nothing", async () => {
  assert.deepEqual(await queries.getPlayerOtherFormats("odi", "2"), []);
  assert.deepEqual(await queries.getPlayerOtherFormats("nba", "1"), []);
});

test("the strip links each format and renders nothing when there are none", () => {
  const html = renderToStaticMarkup(createElement(CricketOtherFormats, { name: "Vee Kay", formats: [{ league: "odi", slug: "vee-kay", matches: 2, runs: 127, wickets: 5 }] }));
  assert.match(html, /href="\/odi\/players\/vee-kay"/);
  assert.match(html, /2 matches · 127 runs · 5 wkts/);
  assert.equal(renderToStaticMarkup(createElement(CricketOtherFormats, { name: "Vee Kay", formats: [] })), "");
});
