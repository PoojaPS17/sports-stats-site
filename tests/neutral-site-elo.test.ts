import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { ResultRow, TeamRef } from "../src/lib/analytics";

// Final review, Important 3: a game at a neutral site (the NBA Cup's Las Vegas semifinals, a Mexico City game) is no home
// game for either side, so our own Elo and win probability give the listed home side no home advantage there, as the
// Home and Away tables already leave the game out. A null or false flag is an ordinary home game, exactly as before.
let db: TestDb;
let analytics: typeof import("../src/lib/analytics");
let simulator: typeof import("../src/lib/simulator");
let queries: typeof import("../src/lib/queries");
let matchContext: typeof import("../src/lib/matchContext");

before(async () => {
  db = await startTestDb();
  analytics = await import("../src/lib/analytics");
  simulator = await import("../src/lib/simulator");
  queries = await import("../src/lib/queries");
  matchContext = await import("../src/lib/matchContext");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
  await db.pool.query(`delete from teams`);
});

const BASE = 1500;
const team = (id: string): TeamRef => ({ espn_id: id, name: `Team ${id}`, slug: `team-${id}`, abbreviation: null, logo_url: null, color: null });
const teams = new Map<string, TeamRef>(["1", "2"].map((id) => [id, team(id)]));
const one = (neutral?: boolean | null): ResultRow => ({
  espn_id: "g", date: "2026-01-01T00:00:00Z", season_year: 2026, round: null, stage: "regular", home_team_espn_id: "1", away_team_espn_id: "2", home_score: 110, away_score: 100,
  ...(neutral === undefined ? {} : { neutral_site: neutral }),
});
/** The home side's rating change from one 10-point win at equal ratings, worked out from the definition. */
const homeGain = (advantage: number) => {
  const p = analytics.ELO_PARAMS.nba;
  return p.k * (Math.log(1 + 10 / p.marginScale) + 1) * (1 - analytics.expectedScore(BASE + advantage, BASE));
};
const eloOf = (r: ResultRow) => analytics.computeElo("nba", [r], teams).ratings.get("1")!;

test("computeElo: a neutral-site game applies no home advantage, so the winner gains more than at home", () => {
  const p = analytics.ELO_PARAMS.nba;
  assert.ok(p.homeAdvantage > 0);
  assert.ok(Math.abs(eloOf(one(true)) - (BASE + homeGain(0))) < 1e-9, "neutral: expected score is the even one");
  assert.ok(Math.abs(eloOf(one(false)) - (BASE + homeGain(p.homeAdvantage))) < 1e-9);
  assert.ok(eloOf(one(true)) > eloOf(one(false)), "the home side beat a side it was not favoured over by the ground");
  // and the loser loses the same amount the winner gains
  const both = analytics.computeElo("nba", [one(true)], teams).ratings;
  assert.ok(Math.abs(both.get("1")! + both.get("2")! - 2 * BASE) < 1e-9);
});

test("computeElo: a null or absent neutral flag is an ordinary home game", () => {
  assert.equal(eloOf(one(null)), eloOf(one(false)));
  assert.equal(eloOf(one()), eloOf(one(false)));
});

test("homeWinProbability and matchProbabilities: a neutral game is the no-advantage value, null and false are unchanged", () => {
  const even = analytics.expectedScore(1600, 1500);
  const withAdvantage = analytics.homeWinProbability("nba", 1600, 1500);
  assert.equal(analytics.homeWinProbability("nba", 1600, 1500, true), even);
  assert.ok(withAdvantage > even);
  assert.equal(analytics.homeWinProbability("nba", 1600, 1500, false), withAdvantage);
  assert.equal(analytics.homeWinProbability("nba", 1600, 1500, null), withAdvantage);
  assert.equal(simulator.matchProbabilities("nba", 1500, 1500, true).homeWin, 0.5);
  assert.ok(simulator.matchProbabilities("nba", 1500, 1500).homeWin > 0.5);
  // football keeps its draw share; at equal ratings on neutral ground the two sides are level
  const epl = simulator.matchProbabilities("epl", 1500, 1500, true);
  assert.ok(Math.abs(epl.homeWin - epl.awayWin) < 1e-12);
});

/* ---- the queries that feed them ---------------------------------------------- */

async function seed(rows: { id: string; date: string; neutral: boolean | null; completed: boolean; hs?: number; as?: number }[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', '1', 'One', 'one'), ('nba', '2', 'Two', 'two')`);
  for (const g of rows) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state, neutral_site)
       values ('nba', $1, $2, 'x', 2026, '1', '2', $3, $4, $5, 2, 'STD', $6, $7)`,
      [g.id, g.date, g.hs ?? null, g.as ?? null, g.completed, g.completed ? "post" : "pre", g.neutral]
    );
  }
}

test("getEloRatings reads neutral_site from the games table", async () => {
  await seed([{ id: "n", date: "2026-01-01T00:00:00Z", neutral: true, completed: true, hs: 110, as: 100 }]);
  const { ratings } = await analytics.getEloRatings("nba");
  assert.ok(Math.abs(ratings.get("1")! - (BASE + homeGain(0))) < 1e-9);
  await db.pool.query(`update games set neutral_site = false`);
  const home = await analytics.getEloRatings("nba");
  assert.ok(Math.abs(home.ratings.get("1")! - (BASE + homeGain(analytics.ELO_PARAMS.nba.homeAdvantage))) < 1e-9);
});

test("the game page's context: a played neutral game moves Elo as a neutral game, and an upcoming one is priced without home advantage", async () => {
  // earlier games so both sides have a history (each context needs one to show a probability)
  await seed([
    { id: "h1", date: "2026-01-01T00:00:00Z", neutral: true, completed: true, hs: 100, as: 100 },
    { id: "played", date: "2026-01-05T00:00:00Z", neutral: true, completed: true, hs: 110, as: 100 },
    { id: "next", date: "2026-01-09T00:00:00Z", neutral: true, completed: false },
  ]);
  const played = (await matchContext.getMatchContext("nba", (await queries.getGameByEspnId("nba", "played"))!))!;
  // both earlier games are at a neutral site: the history the ratings are built from reads the flag too
  const rs = [
    { ...one(true), espn_id: "h1", date: "2026-01-01T00:00:00Z", home_score: 100, away_score: 100 },
    { ...one(true), espn_id: "played", date: "2026-01-05T00:00:00Z" },
  ];
  const expected = analytics.computeElo("nba", rs, teams).ratings;
  assert.equal(played.home.eloAfter, Math.round(expected.get("1")!));
  const asHome = analytics.computeElo("nba", rs.map((r) => ({ ...r, neutral_site: false })), teams).ratings.get("1")!;
  assert.notEqual(Math.round(asHome), Math.round(expected.get("1")!), "the fixture tells a neutral game from a home one");
  assert.equal((await queries.getGameByEspnId("nba", "played"))!.neutral_site, true, "the game page's own query carries the flag");

  const next = (await matchContext.getMatchContext("nba", (await queries.getGameByEspnId("nba", "next"))!))!;
  const before = analytics.computeElo("nba", rs, teams, 2026).ratings;
  const neutralP = simulator.matchProbabilities("nba", before.get("1")!, before.get("2")!, true);
  assert.deepEqual(next.probabilities, neutralP);
  assert.notDeepEqual(next.probabilities, simulator.matchProbabilities("nba", before.get("1")!, before.get("2")!, false));
});

test("the projection's win probabilities for the coming week price a neutral game without home advantage", async () => {
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
  await seed([{ id: "cup", date: soon, neutral: true, completed: false }]);
  const proj = await simulator.getSeasonProjection("nba");
  assert.ok(proj, "the projection is built");
  const g = proj!.upcoming.find((u) => u.game.espn_id === "cup");
  assert.ok(g, "the game is in the coming week");
  assert.equal(g!.homeWin, 0.5, "equal ratings, neutral ground");
  await db.pool.query(`update games set neutral_site = false`);
  const home = (await simulator.getSeasonProjection("nba"))!.upcoming.find((u) => u.game.espn_id === "cup")!;
  assert.ok(home.homeWin > 0.5);
});
