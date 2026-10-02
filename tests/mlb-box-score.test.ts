// MLB box scores: two statistics categories per team, told apart correctly, stored as two keys of
// one player's stat line; and the score by innings rather than by quarter.
//
// The fixture is the real `summary?event=401907973` response of 2026-10-02 (Phillies at Braves, NL
// Wild Card game three), trimmed to the box score and the linescores. Its two categories per team
// carry `type: "batting"` and `type: "pitching"` and NO `name` at all — which is why the loader
// cannot read `category.name` alone: both would land under the NBA's "box" key and the pitching
// line would overwrite the batting one.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { extractGameDetails, parseAmericanPlayerBox } from "../src/lib/matchDetail";
import { MatchFacts, periodLabels } from "../src/components/MatchFacts";
import type { GameRow } from "../src/lib/queries";

const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-summary-401907973.json", import.meta.url), "utf8"));

let db: TestDb;
let gameStats: typeof import("../scripts/lib/game-stats");
before(async () => {
  db = await startTestDb();
  gameStats = await import("../scripts/lib/game-stats");
});
after(async () => {
  await db?.stop();
});

test("the two unnamed categories are read as batting and pitching, not both as one box score", () => {
  const perPlayer = gameStats.extractPlayerStats("mlb", summary);
  const schwarber = perPlayer.get("33712");
  assert.ok(schwarber, "a batter is in the map");
  assert.deepEqual(Object.keys(schwarber.stats), ["batting"]);
  assert.equal(schwarber.stats.batting.AB, "2");
  assert.equal(schwarber.stats.batting.H, "2");
  assert.equal(schwarber.stats.batting.R, "1");
  assert.equal(schwarber.stats.batting.HR, "0");
  assert.equal(schwarber.stats.batting.BB, "1");
  assert.equal(schwarber.stats.batting["H-AB"], "2-2");
  assert.equal(schwarber.stats.batting.AVG, ".400");

  const nola = perPlayer.get("33709");
  assert.ok(nola, "a pitcher is in the map");
  assert.deepEqual(Object.keys(nola.stats), ["pitching"]);
  assert.equal(nola.stats.pitching.IP, "1.2");
  assert.equal(nola.stats.pitching.ER, "3");
  assert.equal(nola.stats.pitching.K, "1");
  assert.equal(nola.stats.pitching.ERA, "16.20");
  assert.equal(nola.stats.pitching["PC-ST"], "38-19");
  // Both halves of the pitching line survive even though batting uses the same labels (H, R, BB, K, HR)
  // — they are separate keys, so nothing collides.
  assert.equal(nola.stats.pitching.H, "2");
  assert.equal(nola.stats.pitching.BB, "2");
});

test("every player of the game is stored, batting and pitching lines in one row each", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('mlb', '22', 'Philadelphia Phillies', 'philadelphia-phillies'), ('mlb', '15', 'Atlanta Braves', 'atlanta-braves')`);
  const perPlayer = gameStats.extractPlayerStats("mlb", summary);
  const n = await gameStats.storeGameStats("mlb", "401907973", perPlayer, true);
  assert.equal(n, 25, "ten and nine batters, three and three pitchers");
  const { rows } = await db.pool.query(`select player_espn_id, stats from player_game_stats where league = 'mlb' and game_espn_id = '401907973' order by player_espn_id`);
  assert.equal(rows.length, 25);
  const keys = new Set(rows.flatMap((r) => Object.keys(r.stats)));
  assert.deepEqual([...keys].sort(), ["batting", "pitching"]);
  // A starting batter is marked as such, the way the NBA's and NFL's starters are.
  const { rows: starter } = await db.pool.query(`select stats->'batting'->>'GS' as gs from player_game_stats where league = 'mlb' and player_espn_id = '33712'`);
  assert.equal(starter[0].gs, "1");
});

test("the match page's box score shows a Batting table and a Pitching table", () => {
  const box = parseAmericanPlayerBox(summary);
  assert.equal(box.length, 2);
  assert.deepEqual(box[0].categories.map((c) => c.name), ["Batting", "Pitching"]);
  assert.deepEqual(box[0].categories[1].labels, ["IP", "H", "R", "ER", "BB", "K", "HR", "PC-ST", "ERA", "PC"]);
});

// ---- the score by innings ----

test("a baseball game's periods are innings, numbered, and extras keep counting", () => {
  assert.deepEqual(periodLabels("mlb", 9), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(periodLabels("mlb", 11), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  // A game stopped early (rain) has fewer, and still reads as innings.
  assert.deepEqual(periodLabels("mlb", 6), ["1", "2", "3", "4", "5", "6"]);
  // The other sports are untouched.
  assert.deepEqual(periodLabels("nba", 5), ["Q1", "Q2", "Q3", "Q4", "OT"]);
  assert.deepEqual(periodLabels("nfl", 4), ["Q1", "Q2", "Q3", "Q4"]);
  assert.deepEqual(periodLabels("epl", 2), ["1H", "2H"]);
});

test("the innings are read off the header's linescores and rendered, visitors first", () => {
  const details = extractGameDetails("american", summary, "15", "22");
  assert.deepEqual(details.linescores, { home: ["3", "0", "0", "2", "0", "0"], away: ["0", "0", "0", "0", "0", "1"] });

  const game = {
    espn_id: "401907973",
    date: "2026-10-02T00:00:00Z",
    home_name: "Atlanta Braves",
    away_name: "Philadelphia Phillies",
    home_abbr: "ATL",
    away_abbr: "PHI",
    home_score: 5,
    away_score: 1,
    home_score_display: null,
    away_score_display: null,
    completed: false,
  } as unknown as GameRow;
  const html = renderToStaticMarkup(createElement(MatchFacts, { league: "mlb", game, details }));
  assert.ok(html.includes("Score by period"));
  // Visitors on the top line, as every baseball box score prints it.
  assert.ok(html.indexOf("PHI") < html.indexOf("ATL"), "PHI above ATL");
  assert.ok(!html.includes(">Q1<"), "innings, not quarters");
  assert.ok(html.includes(">6<"), "a sixth inning column");
});
