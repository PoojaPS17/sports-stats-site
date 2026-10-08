// Audit 2026-10-08: the Ashes page's "Most runs: Ollie Pope (100); most wickets: Ben Stokes (6)" came from a tour match
// against the England Lions, and Pakistan in England's from a county XI warm-up, because the series block read only
// cricket_series_player_stats (the top-up's rows for matches SportsDB has no scorecard of) while the Tests live in
// player_game_stats. The leaders now read both, one source per match, and count a tour's internationals only.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { cricketSeriesDescription } from "../src/lib/cricketSeriesSeo";
import { cricketSeriesSoFar, seriesLeadersClause } from "../src/lib/cricketSeriesStats";
import { cricketSeriesCardModel } from "../src/lib/cricketShareCards";

let db: TestDb;
let data: typeof import("../src/lib/cricketSeriesStatsData");
before(async () => {
  db = await startTestDb();
  data = await import("../src/lib/cricketSeriesStatsData");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  for (const t of ["cricket_series_player_stats", "player_game_stats", "players", "cricket_series_matches", "cricket_series", "games"]) await db.pool.query(`delete from ${t}`);
});

const bat = (runs: number, notOut = false) => ({ runs, fours: 1, sixes: 0, notOut, ballsFaced: runs + 10 });
const bowl = (wickets: number, conceded: number) => ({ overs: 10, wickets, conceded });

async function match(id: string, series: string, opts: { cls?: string; candidates?: string[]; desc?: string | null } = {}) {
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, description, class_card, international_class_id, status_state, home, away, league_candidates)
     values ($1, $2, now() - interval '3 days', 'A v B', $3, 'x', $4, 'post', '{"id":"1","name":"A"}', '{"id":"2","name":"B"}', $5)`,
    [id, series, opts.desc === undefined ? "1st Test" : opts.desc, opts.cls ?? "0", opts.candidates ?? []]
  );
}
const archived = (league: string, id: string) =>
  db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_state) values ($1, $2, now() - interval '3 days', 'A v B', '1', '2', 2026, true, 'post')`, [league, id]);
const pgs = (league: string, game: string, player: string, team: string, stats: object) =>
  db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1, $2, $3, $4, $5)`, [league, game, player, team, JSON.stringify(stats)]);
const sps = (match: string, series: string, player: string, name: string, team: string, stats: object) =>
  db.pool.query(`insert into cricket_series_player_stats (match_espn_id, series_espn_id, player_espn_id, player_name, team_espn_id, stats) values ($1, $2, $3, $4, $5, $6)`, [match, series, player, name, team, JSON.stringify(stats)]);
const player = (league: string, id: string, name: string) =>
  db.pool.query(`insert into players (league, espn_id, name, slug) values ($1, $2, $3, $4)`, [league, id, name, name.toLowerCase().replace(/ /g, "-")]);

async function seedTour() {
  await player("test", "brook", "Harry Brook");
  await player("test", "robinson", "Ollie Robinson");
  // Two Tests archived under "test", with their per-player rows there.
  for (const id of ["t1", "t2"]) {
    await match(id, "tour", { cls: "1", candidates: ["test"] });
    await archived("test", id);
  }
  await pgs("test", "t1", "brook", "1", { v: 3, batting: bat(100), innings: [{ n: 1, batting: bat(60) }, { n: 3, batting: bat(40) }] });
  await pgs("test", "t2", "brook", "1", { v: 3, batting: bat(115, true), innings: [{ n: 2, batting: bat(115, true) }] });
  await pgs("test", "t1", "robinson", "1", { v: 3, bowling: bowl(11, 80), innings: [{ n: 1, bowling: bowl(5, 40) }, { n: 3, bowling: bowl(6, 40) }] });
  // A warm-up against a county XI (class 0), stored by the top-up: a bigger score and more wickets than any Test.
  await match("w1", "tour", { cls: "0", desc: null });
  await sps("w1", "tour", "zaib", "Saif Zaib", "996", { batting: bat(160), bowling: bowl(9, 30) });
}

test("a tour's leaders are its Tests from player_game_stats, not the warm-up the top-up stored", async () => {
  await seedTour();
  const s = await data.getCricketSeriesStats("tour");
  assert.equal(s.matches, 2);
  assert.equal(s.officialOnly, true);
  assert.deepEqual([s.batting[0].name, s.batting[0].runs, s.batting[0].innings, s.batting[0].highScore], ["Harry Brook", 215, 3, "115*"]);
  assert.deepEqual([s.bowling[0].name, s.bowling[0].wickets, s.bowling[0].best], ["Ollie Robinson", 11, "6/40"]);
  assert.ok(!s.batting.some((b) => b.name === "Saif Zaib"));
  assert.equal(seriesLeadersClause(s), "Most runs: Harry Brook (215); most wickets: Ollie Robinson (11).");
  assert.equal(seriesLeadersClause(s, true), "Most runs: Harry Brook (215); most wickets: Ollie Robinson (11), in the series' 2 international matches.");
});

test("a match held in both tables counts once, from player_game_stats", async () => {
  await seedTour();
  // The top-up also stored the first Test (it did, for 132 production matches); different numbers, so a double count or a wrong winner shows.
  await sps("t1", "tour", "brook", "Harry Brook", "1", { batting: bat(999) });
  const s = await data.getCricketSeriesStats("tour");
  assert.equal(s.batting[0].runs, 215);
});

test("an archived match with no player_game_stats rows yet falls back to the top-up's rows", async () => {
  await seedTour();
  await match("t3", "tour", { cls: "1", candidates: ["test"] });
  await archived("test", "t3");
  await sps("t3", "tour", "brook", "Harry Brook", "1", { batting: bat(5) });
  const s = await data.getCricketSeriesStats("tour");
  assert.equal(s.matches, 3);
  assert.equal(s.batting[0].runs, 220);
});

test("a series with no international matches (domestic, A-team) counts every match and states no scope", async () => {
  await match("d1", "dom", { desc: "1st Match" });
  await match("d2", "dom", { desc: "2nd Match" });
  await sps("d1", "dom", "p1", "Ann Alpha", "1", { batting: bat(50), bowling: bowl(1, 20) });
  await sps("d2", "dom", "p1", "Ann Alpha", "1", { batting: bat(30) });
  const s = await data.getCricketSeriesStats("dom");
  assert.deepEqual([s.matches, s.batting[0].runs, s.officialOnly], [2, 80, false]);
  assert.equal(seriesLeadersClause(s, true), "Most runs: Ann Alpha (80); most wickets: Ann Alpha (1).");
});

test("official internationals still waiting for a scorecard leave the tour with no leaders, never the warm-up's", async () => {
  await match("t1", "tour", { cls: "1", candidates: ["test"] });
  await archived("test", "t1");
  await match("w1", "tour", { cls: "0", desc: null });
  await sps("w1", "tour", "zaib", "Saif Zaib", "996", { batting: bat(160) });
  const s = await data.getCricketSeriesStats("tour");
  assert.deepEqual([s.matches, s.batting.length, s.bowling.length], [0, 0, 0]);
});

test("the tour's matches in other formats merge by player id across competitions", async () => {
  await player("odi", "brook", "Harry Brook");
  await match("o1", "tour", { cls: "2", candidates: ["odi"], desc: "1st ODI" });
  await archived("odi", "o1");
  await pgs("odi", "o1", "brook", "1", { batting: bat(30) });
  await match("t1", "tour", { cls: "1", candidates: ["test"] });
  await archived("test", "t1");
  await pgs("test", "t1", "brook", "1", { v: 3, batting: bat(70), innings: [{ n: 1, batting: bat(70) }] });
  const s = await data.getCricketSeriesStats("tour");
  assert.deepEqual([s.matches, s.batting.length, s.batting[0].runs, s.batting[0].name], [2, 1, 100, "Harry Brook"]);
});

test("the series description keeps the scope note while it fits and drops it before the players", () => {
  const s = { name: "PAK in ENG 2026", formats: [], teams: [] };
  const scoped = "Most runs: Harry Brook (215); most wickets: Ollie Robinson (21), in the series' 3 international matches.";
  const plain = "Most runs: Harry Brook (215); most wickets: Ollie Robinson (21).";
  const long = cricketSeriesDescription(s, false, [scoped, plain]);
  assert.ok(long.length <= 160, long);
  assert.ok(long.endsWith(scoped));
  const tight = cricketSeriesDescription({ ...s, name: "Pakistan tour of England and a long tournament name" }, false, [scoped, plain]);
  assert.ok(tight.endsWith(plain));
  assert.equal(cricketSeriesDescription(s, false, plain), `${s.name}: fixtures, results and live scores. ${plain}`);
});

test("the paragraph and the share card say the figures are the internationals'", async () => {
  await seedTour();
  const stats = await data.getCricketSeriesStats("tour");
  assert.match(cricketSeriesSoFar({ leader: null, lastResult: null, nextFixture: null, stats, finished: true }), /in the series' 2 international matches\.$/);
  const card = cricketSeriesCardModel({ name: "T", kind: "international", formats: ["Test"], start_date: null, end_date: null, match_count: 3, completed_count: 3 } as never, stats, null);
  assert.deepEqual(card.facts.slice(0, 2).map((f) => [f.label, f.value]), [["Most runs (internationals)", "Harry Brook · 215"], ["Most wickets (internationals)", "Ollie Robinson · 11"]]);
});
