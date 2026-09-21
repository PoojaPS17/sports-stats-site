import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { EloRow, ResultRow, TeamRef } from "../src/lib/analytics";

// The Elo change the game page shows is `eloAfter - elo`. On a season's first game the "after" run regresses
// every rating toward the mean (the yearly carry) but the "before" run, built only from earlier seasons, did not,
// so the displayed change mixed the off-season regression with the game's own effect. These tests pin both the
// pure `computeElo(..., asOfSeason)` and the game page's context built on it. They load the app's pool modules
// after startTestDb().
let db: TestDb;
let analytics: typeof import("../src/lib/analytics");
let queries: typeof import("../src/lib/queries");
let matchContext: typeof import("../src/lib/matchContext");

before(async () => {
  db = await startTestDb();
  analytics = await import("../src/lib/analytics");
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
const TOL = 1e-9;

const team = (id: string): TeamRef => ({ espn_id: id, name: `Team ${id}`, slug: `team-${id}`, abbreviation: null, logo_url: null, color: null });
const teams = new Map<string, TeamRef>(["A", "B", "C", "1", "2"].map((id) => [id, team(id)]));

let n = 0;
const result = (season: number | null, home: string, away: string, hs: number, as: number): ResultRow => {
  n++;
  return { espn_id: `g${n}`, date: new Date(Date.UTC(2020, 0, 1, 0, n)).toISOString(), season_year: season, round: null, stage: "regular", home_team_espn_id: home, away_team_espn_id: away, home_score: hs, away_score: as };
};

/** The pre-fix algorithm, copied verbatim, as the reference for "callers that pass no asOfSeason are unchanged". */
function oldComputeElo(league: string, results: ResultRow[], teamMap: Map<string, TeamRef>): { rows: EloRow[]; ratings: Map<string, number> } {
  const p = analytics.ELO_PARAMS[league] ?? analytics.ELO_PARAMS.default;
  const ratings = new Map<string, number>();
  const history = new Map<string, number[]>();
  const played = new Map<string, number>();
  const peak = new Map<string, number>();
  let currentSeason: number | null = null;
  const get = (id: string) => ratings.get(id) ?? BASE;
  for (const g of results) {
    if (g.season_year !== null && currentSeason !== null && g.season_year !== currentSeason) {
      for (const [id, r] of ratings) ratings.set(id, BASE + (r - BASE) * p.seasonCarry);
    }
    if (g.season_year !== null) currentSeason = g.season_year;
    const h = get(g.home_team_espn_id);
    const a = get(g.away_team_espn_id);
    const expHome = analytics.expectedScore(h + p.homeAdvantage, a);
    const margin = Math.abs(g.home_score - g.away_score);
    const actualHome = g.home_score > g.away_score ? 1 : g.home_score < g.away_score ? 0 : 0.5;
    const mov = Math.log(1 + margin / p.marginScale) + 1;
    const delta = p.k * mov * (actualHome - expHome);
    ratings.set(g.home_team_espn_id, h + delta);
    ratings.set(g.away_team_espn_id, a - delta);
    for (const id of [g.home_team_espn_id, g.away_team_espn_id]) {
      const r = ratings.get(id)!;
      if (!history.has(id)) history.set(id, []);
      history.get(id)!.push(r);
      played.set(id, (played.get(id) ?? 0) + 1);
      peak.set(id, Math.max(peak.get(id) ?? 0, r));
    }
  }
  const rows: EloRow[] = [];
  for (const [id, r] of ratings) {
    const t = teamMap.get(id);
    if (!t) continue;
    const hist = history.get(id) ?? [];
    const before = hist.length > 5 ? hist[hist.length - 6] : BASE;
    rows.push({ team: t, rating: r, trend: r - before, played: played.get(id) ?? 0, peak: peak.get(id) ?? r });
  }
  rows.sort((a, b) => b.rating - a.rating);
  return { rows, ratings };
}

/** A multi-season fixture with three teams, a null-season game and enough games for `trend` to look back five. */
function fixture(): ResultRow[] {
  return [
    result(2023, "A", "B", 110, 100),
    result(2023, "B", "C", 90, 95),
    result(2023, "C", "A", 101, 101),
    result(2023, "A", "C", 120, 80),
    result(2023, "B", "A", 99, 100),
    result(2023, "C", "B", 100, 90),
    result(2023, "A", "B", 105, 99),
    result(2024, "B", "A", 130, 100),
    result(2024, "C", "A", 88, 90),
    result(null, "A", "B", 10, 12),
    result(2024, "A", "C", 97, 100),
    result(2024, "B", "C", 108, 99),
    result(2025, "A", "B", 100, 110),
    result(2025, "C", "B", 70, 71),
    result(2025, "A", "C", 100, 90),
  ];
}

const expectSame = (actual: { rows: EloRow[]; ratings: Map<string, number> }, expected: { rows: EloRow[]; ratings: Map<string, number> }) => {
  assert.deepEqual([...actual.ratings], [...expected.ratings]);
  assert.deepEqual(actual.rows, expected.rows);
};

/* ---- computeElo, pure ---------------------------------------------------- */

test("computeElo with asOfSeason: the first game of a season is measured against ratings that already carry the off-season regression", () => {
  const p = analytics.ELO_PARAMS.nba;
  const g2025 = result(2025, "A", "B", 110, 100);
  const g2026 = result(2026, "A", "B", 110, 100);

  const raw = analytics.computeElo("nba", [g2025], teams).ratings;
  const before = analytics.computeElo("nba", [g2025], teams, 2026).ratings;
  const after = analytics.computeElo("nba", [g2025, g2026], teams).ratings;

  // Going into 2026, everyone has been pulled toward the mean by seasonCarry.
  for (const id of ["A", "B"]) assert.ok(Math.abs(before.get(id)! - (BASE + (raw.get(id)! - BASE) * p.seasonCarry)) < TOL, `${id} regressed`);

  // The game's own effect, by hand from the regressed ratings.
  const hR = before.get("A")!;
  const aR = before.get("B")!;
  const mov = Math.log(1 + 10 / p.marginScale) + 1;
  const expHome = analytics.expectedScore(hR + p.homeAdvantage, aR);
  const delta = p.k * mov * (1 - expHome);
  assert.ok(delta > 0);

  assert.ok(Math.abs(after.get("A")! - before.get("A")! - delta) < TOL, "home delta is the game's own effect");
  assert.ok(Math.abs(after.get("B")! - before.get("B")! + delta) < TOL, "away delta is the mirror");
  // Measured against the unregressed rating (the old comparison) the change is a different number.
  assert.ok(Math.abs(after.get("A")! - raw.get("A")! - delta) > 0.5, "the fix matters on this fixture");
});

test("computeElo with asOfSeason: a winner never shows a rating loss on a season opener", () => {
  // A dominates 2025, so the regression takes several points off A's rating going into 2026.
  const seasonOne = [1, 2, 3, 4, 5].map(() => result(2025, "A", "B", 130, 90));
  const opener = result(2026, "A", "B", 101, 100);
  const before = analytics.computeElo("nba", seasonOne, teams, 2026).ratings;
  const after = analytics.computeElo("nba", [...seasonOne, opener], teams).ratings;
  assert.ok(after.get("A")! > before.get("A")!, "the winner gained");
  assert.ok(after.get("B")! < before.get("B")!, "the loser lost");
  // ...whereas measuring against the unregressed ratings flips the sign.
  const raw = analytics.computeElo("nba", seasonOne, teams).ratings;
  assert.ok(after.get("A")! < raw.get("A")!, "the old comparison would have shown the winner losing points");
});

test("computeElo without asOfSeason is exactly what it was", () => {
  for (const league of ["nba", "epl", "nfl", "ipl"] as const) {
    expectSame(analytics.computeElo(league, fixture(), teams), oldComputeElo(league, fixture(), teams));
  }
  expectSame(analytics.computeElo("nba", [], teams), oldComputeElo("nba", [], teams));
});

test("computeElo with asOfSeason: the same season as the last result, null or no results means no regression", () => {
  const rs = fixture();
  const last = rs[rs.length - 1].season_year!;
  const expected = oldComputeElo("nba", rs, teams);
  expectSame(analytics.computeElo("nba", rs, teams, last), expected);
  expectSame(analytics.computeElo("nba", rs, teams, null), expected);
  expectSame(analytics.computeElo("nba", rs, teams, undefined), expected);
  const empty = analytics.computeElo("nba", [], teams, 2026);
  assert.equal(empty.ratings.size, 0);
  assert.deepEqual(empty.rows, []);
});

test("computeElo with asOfSeason: a trailing null-season result does not stand in for the last season played", () => {
  // currentSeason stays at the last dated season, so asOfSeason is compared against that.
  const rs = [result(2025, "A", "B", 110, 100), result(null, "A", "B", 100, 90)];
  expectSame(analytics.computeElo("nba", rs, teams, 2025), oldComputeElo("nba", rs, teams));
  const regressed = analytics.computeElo("nba", rs, teams, 2026).ratings;
  const raw = analytics.computeElo("nba", rs, teams).ratings;
  const carry = analytics.ELO_PARAMS.nba.seasonCarry;
  assert.ok(Math.abs(regressed.get("A")! - (BASE + (raw.get("A")! - BASE) * carry)) < TOL);
});

test("computeElo with asOfSeason: only the rating is regressed, never the games-played history, peak or trend", () => {
  const rs = fixture();
  const plain = analytics.computeElo("nba", rs, teams);
  const asOf = analytics.computeElo("nba", rs, teams, 2026);
  const carry = analytics.ELO_PARAMS.nba.seasonCarry;

  for (const id of ["A", "B", "C"]) {
    const before = plain.ratings.get(id)!;
    assert.ok(Math.abs(asOf.ratings.get(id)! - (BASE + (before - BASE) * carry)) < TOL, `${id} regressed once`);
    const p = plain.rows.find((r) => r.team.espn_id === id)!;
    const q = asOf.rows.find((r) => r.team.espn_id === id)!;
    assert.equal(q.played, p.played, `${id} played`);
    assert.equal(q.peak, p.peak, `${id} peak`);
    assert.equal(q.trend, p.trend, `${id} trend`);
    assert.ok(Math.abs(q.rating - (BASE + (p.rating - BASE) * carry)) < TOL, `${id} row rating`);
  }
  assert.ok(plain.rows.some((r) => r.played > 5), "the fixture has enough games for trend to look back five");
});

/* ---- getMatchContext ----------------------------------------------------- */

async function seedGames(rows: { id: string; date: string; season: number; home: string; away: string; hs: number; as: number }[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', '1', 'One', 'one'), ('nba', '2', 'Two', 'two')`);
  for (const g of rows) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state)
       values ('nba', $1, $2, 'x', $3, $4, $5, $6, $7, true, 2, 'STD', 'post')`,
      [g.id, g.date, g.season, g.home, g.away, g.hs, g.as]
    );
  }
}

/** The rating going into the opener and the opener's own effect, worked out here from the definition rather than through computeElo. */
function handOpener(games: number, margin: number, openerMargin: number) {
  const p = analytics.ELO_PARAMS.nba;
  let home = BASE;
  let away = BASE;
  for (let i = 0; i < games; i++) {
    const d = p.k * (Math.log(1 + margin / p.marginScale) + 1) * (1 - analytics.expectedScore(home + p.homeAdvantage, away));
    home += d;
    away -= d;
  }
  const hR = BASE + (home - BASE) * p.seasonCarry;
  const aR = BASE + (away - BASE) * p.seasonCarry;
  const delta = p.k * (Math.log(1 + openerMargin / p.marginScale) + 1) * (1 - analytics.expectedScore(hR + p.homeAdvantage, aR));
  return { hR, aR, delta };
}

test("the game page's Elo change on a season opener is the game's own effect, not the off-season regression", async () => {
  const prior = [1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, date: `2025-11-0${i}T00:00:00Z`, season: 2025, home: "1", away: "2", hs: 130, as: 90 }));
  await seedGames([...prior, { id: "open", date: "2026-10-22T00:00:00Z", season: 2026, home: "1", away: "2", hs: 101, as: 100 }]);
  const game = (await queries.getGameByEspnId("nba", "open"))!;
  const ctx = (await matchContext.getMatchContext("nba", game))!;

  const { hR, aR, delta } = handOpener(5, 40, 1);
  assert.equal(ctx.home.elo, Math.round(hR), "rating going in is the regressed one");
  assert.equal(ctx.away.elo, Math.round(aR));
  assert.equal(ctx.home.eloAfter, Math.round(hR + delta));
  assert.equal(ctx.away.eloAfter, Math.round(aR - delta));

  const homeChange = ctx.home.eloAfter! - ctx.home.elo!;
  const awayChange = ctx.away.eloAfter! - ctx.away.elo!;
  assert.equal(homeChange, Math.round(hR + delta) - Math.round(hR));
  assert.equal(awayChange, Math.round(aR - delta) - Math.round(aR));
  assert.ok(homeChange > 0, "the winner is shown gaining rating");
  assert.ok(awayChange < 0, "the loser is shown losing rating");
  assert.ok(Math.abs(homeChange + awayChange) <= 1, "the two changes cancel, give or take rounding");
});

test("the game page's Elo change in mid-season is unchanged", async () => {
  const early = [1, 2, 3].map((i) => ({ id: `p${i}`, date: `2026-10-2${i}T00:00:00Z`, season: 2026, home: "1", away: "2", hs: 110, as: 100 }));
  await seedGames([...early, { id: "later", date: "2026-11-05T00:00:00Z", season: 2026, home: "2", away: "1", hs: 100, as: 95 }]);
  const game = (await queries.getGameByEspnId("nba", "later"))!;
  const ctx = (await matchContext.getMatchContext("nba", game))!;
  const rs = [...early.map((g) => result(2026, g.home, g.away, g.hs, g.as)), result(2026, "2", "1", 100, 95)];
  const upTo = analytics.computeElo("nba", rs.slice(0, 3), teams).ratings;
  const through = analytics.computeElo("nba", rs, teams).ratings;
  assert.equal(ctx.home.elo, Math.round(upTo.get("2")!));
  assert.equal(ctx.home.eloAfter, Math.round(through.get("2")!));
});
