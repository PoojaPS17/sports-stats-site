// Which standings season is real, and which is "now": the MLB 2027 copy of 2026 (ESPN's root `season.year` runs a year ahead of
// its tables once the regular season ends), the NBA's preseason table, and a new season nobody has played.
// The pure rules (standingsSeasons.ts), the writer that stopped filing 2026 records under 2027, and the readers on a real database.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { classifySeasons, lastPlayedSeason, preseasonNote, visibleSeasons, type SeasonFact } from "../src/lib/standingsSeasons";
import { sortStandings } from "../src/lib/standingsOrder";
import { gameRoundLabel, finishedPillLabel } from "../src/lib/stage";
import { scheduleRowHeading } from "../src/lib/gameDisplay";

const fact = (season: number, over: Partial<SeasonFact> = {}): SeasonFact => ({ season, played: 0, flaggedPreseason: false, untyped: true, hasPreseasonGames: false, hasRealGames: false, ...over });

/* ----------------------------------------------------------------------- */
/* The rules                                                                */
/* ----------------------------------------------------------------------- */

test("MLB: 2027 holds 2026's records and no game exists for it, so it is a phantom and 2026 is current", () => {
  const out = classifySeasons("mlb", [fact(2025, { played: 4860, hasRealGames: true }), fact(2026, { played: 4858, hasRealGames: true }), fact(2027, { played: 4858 })], 2026);
  assert.deepEqual(out.map((s) => [s.season, s.phantom]), [[2027, true], [2026, false], [2025, false]]);
  assert.deepEqual(visibleSeasons(out).map((s) => s.season), [2026, 2025]);
  assert.equal(lastPlayedSeason(out), 2026);
});

test("NBA: a 2027 table of exhibition records is a preseason, not a phantom, whether the type is stored or read from the games", () => {
  const stored = classifySeasons("nba", [fact(2026, { played: 2460, hasRealGames: true }), fact(2027, { played: 34, flaggedPreseason: true, untyped: false, hasPreseasonGames: true })], 2026);
  assert.deepEqual(stored.map((s) => [s.season, s.preseason, s.phantom]), [[2027, true, false], [2026, false, false]]);
  // Rows stored before the column existed: the season has completed preseason games and no real one.
  const fromGames = classifySeasons("nba", [fact(2026, { played: 2460, hasRealGames: true }), fact(2027, { played: 34, hasPreseasonGames: true })], 2026);
  assert.deepEqual(fromGames.map((s) => [s.season, s.preseason, s.phantom]), [[2027, true, false], [2026, false, false]]);
  // The preseason is not "a season played": the last played one is still 2026.
  assert.equal(lastPlayedSeason(fromGames), 2026);
});

test("NBA: once a regular-season game is on record the season is the current one, whatever the old rows say", () => {
  const out = classifySeasons("nba", [fact(2026, { played: 2460, hasRealGames: true }), fact(2027, { played: 40, hasPreseasonGames: true, hasRealGames: true })], 2027);
  assert.deepEqual(out.map((s) => [s.season, s.preseason, s.phantom]), [[2027, false, false], [2026, false, false]]);
  // ESPN's own type flips to 2 at the same time.
  const typed = classifySeasons("nba", [fact(2027, { played: 2, flaggedPreseason: false, untyped: false, hasPreseasonGames: true, hasRealGames: true })], 2027);
  assert.equal(typed[0].preseason, false);
});

test("a league that stores no season type never has a preseason table (soccer and cricket send type 1 for an ordinary season)", () => {
  const out = classifySeasons("epl", [fact(2026, { played: 100, flaggedPreseason: true, untyped: false, hasRealGames: true })], 2026);
  assert.equal(out[0].preseason, false);
});

test("a new season with every team 0-0 is neither a phantom nor a preseason", () => {
  const out = classifySeasons("cwc", [fact(2023, { played: 90, hasRealGames: true }), fact(2027, { played: 0 })], 2023);
  assert.deepEqual(out.map((s) => [s.season, s.preseason, s.phantom]), [[2027, false, false], [2023, false, false]]);
  assert.equal(lastPlayedSeason(out), 2023);
});

test("with no game on record at all nothing is called a phantom (history can predate the games table)", () => {
  const out = classifySeasons("wcwc", [fact(1973, { played: 12 }), fact(2025, { played: 44 })], null);
  assert.ok(out.every((s) => !s.phantom));
});

test("the preseason note names the day the regular season starts, from the data it is given", () => {
  assert.equal(preseasonNote("Oct 20"), "Preseason records, the regular season starts Oct 20. Teams are ranked from then.");
  assert.doesNotMatch(preseasonNote(null), /starts \w/);
});

/* ----------------------------------------------------------------------- */
/* Ordering and labels                                                      */
/* ----------------------------------------------------------------------- */

test("a preseason table is ordered by record then name, ignoring ESPN's preseason seed", () => {
  const row = (name: string, wins: number, losses: number, seed: number) => ({
    team_espn_id: name, name, conference: "East", wins, losses, draws: null, no_result: null, win_percent: wins / Math.max(1, wins + losses), playoff_seed: seed, points: null, goals_for: null, goals_against: null, net_run_rate: null, rank: null, preseason: true,
  });
  const out = sortStandings("nba", [row("Zed", 1, 0, 9), row("Amy", 1, 0, 1), row("Lost", 0, 1, 3), row("Two", 2, 0, 15), row("Mid", 1, 1, 2)]);
  assert.deepEqual(out.map((r) => r.name), ["Two", "Amy", "Zed", "Mid", "Lost"]);
});

test("a preseason game says so on its pill, finished or not, and the schedule row", () => {
  assert.equal(gameRoundLabel({ round: null, stage: "excluded", season_type: 1 }), "Preseason");
  assert.equal(gameRoundLabel({ round: null, stage: "regular", season_type: 2 }), null);
  assert.equal(gameRoundLabel({ round: null, stage: "excluded", season_type: 1, competition_type: "ALLSTAR" }), null);
  assert.equal(finishedPillLabel("nba", { round: null, stage: "excluded", season_type: 1, status_detail: "Final" }), "Preseason · Final");
  assert.equal(finishedPillLabel("nba", { round: null, stage: "excluded", season_type: 1, status_detail: "Final/OT" }), "Preseason · Final/OT");
  assert.equal(finishedPillLabel("nba", { round: null, stage: "regular", season_type: 2, status_detail: "Final" }), "Final");
  const when = { completed: false, status_state: "pre", status_detail: "Thu, October 8th at 7:00 PM EDT", date: "2026-10-08T23:00:00Z", local_date: null };
  assert.match(scheduleRowHeading("nba", { ...when, season_type: 1 }), /^Thu, Oct 8 · Preseason · 7:00 PM ET$/);
  assert.match(scheduleRowHeading("nba", { ...when, season_type: 2 }), /^Thu, Oct 8 · 7:00 PM ET$/);
});

/* ----------------------------------------------------------------------- */
/* The writer                                                               */
/* ----------------------------------------------------------------------- */

let db: TestDb;
let standings: typeof import("../scripts/lib/standings");
let queries: typeof import("../src/lib/queries");
let analytics: typeof import("../src/lib/analytics");
let view: typeof import("../src/lib/standingsView");
before(async () => {
  db = await startTestDb();
  standings = await import("../scripts/lib/standings");
  queries = await import("../src/lib/queries");
  analytics = await import("../src/lib/analytics");
  view = await import("../src/lib/standingsView");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from standings");
  await db.pool.query("delete from games");
  await db.pool.query("delete from teams");
});

// The real MLB response of 2026-10-02: root season 2027, every table 2026 regular season (standings.season / seasonType).
const mlbFixture = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-standings-level3.json", import.meta.url), "utf8"));
interface EspnNode {
  standings?: object;
  children?: EspnNode[];
  [key: string]: unknown;
}
const withTableSeason = (data: EspnNode, season: number, seasonType: number) => ({
  ...data,
  children: (data.children ?? []).map(function stamp(node: EspnNode): EspnNode {
    return { ...node, ...(node.standings ? { standings: { ...node.standings, season, seasonType } } : {}), ...(node.children ? { children: node.children.map(stamp) } : {}) };
  }),
});
const storedSeasons = async (league: string) => (await db.pool.query(`select season, season_type, count(*)::int as n from standings where league = $1 group by 1, 2 order by 1`, [league])).rows;

test("the writer files ESPN's tables under the table's own season, not the root's year-to-be", async () => {
  assert.equal(mlbFixture.season.year, 2027, "the fixture is the response that made the phantom");
  await standings.upsertStandingsResponse("mlb", withTableSeason(mlbFixture, 2026, 2));
  assert.deepEqual(await storedSeasons("mlb"), [{ season: 2026, season_type: 2, n: 10 }]);
  // A second run changes nothing and invents no second season.
  await standings.upsertStandingsResponse("mlb", withTableSeason(mlbFixture, 2026, 2));
  assert.deepEqual(await storedSeasons("mlb"), [{ season: 2026, season_type: 2, n: 10 }]);
});

test("a table with no season of its own still falls back to the root's year", async () => {
  await standings.upsertStandingsResponse("mlb", mlbFixture);
  assert.deepEqual(await storedSeasons("mlb"), [{ season: 2027, season_type: null, n: 10 }]);
});

test("the season type is kept for the NBA, NFL and MLB only, and updates in place when the preseason ends", async () => {
  const nba = (seasonType: number) => ({ season: { year: 2027 }, children: [{ name: "Eastern Conference", standings: { season: 2027, seasonType, entries: [{ team: { id: "1" }, stats: [{ name: "wins", displayValue: "1" }, { name: "losses", displayValue: "0" }] }] } }] });
  await standings.upsertStandingsResponse("nba", nba(1));
  assert.deepEqual(await storedSeasons("nba"), [{ season: 2027, season_type: 1, n: 1 }]);
  await standings.upsertStandingsResponse("nba", nba(2));
  assert.deepEqual(await storedSeasons("nba"), [{ season: 2027, season_type: 2, n: 1 }]);
  // Football sends type 1 for an ordinary season: not stored.
  await standings.upsertStandingsResponse("epl", { season: { year: 2026 }, children: [{ name: "EPL", standings: { season: 2026, seasonType: 1, entries: [{ team: { id: "9" }, stats: [] }] } }] });
  assert.deepEqual(await storedSeasons("epl"), [{ season: 2026, season_type: null, n: 1 }]);
  // A historical backfill names its season and stores no type.
  await standings.upsertStandingsResponse("nba", nba(1), 2019);
  assert.deepEqual((await storedSeasons("nba")).find((r) => r.season === 2019), { season: 2019, season_type: null, n: 1 });
});

/* ----------------------------------------------------------------------- */
/* The readers                                                              */
/* ----------------------------------------------------------------------- */

async function team(league: string, id: string, name: string) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, $2, $3, $2) on conflict do nothing`, [league, id, name]);
}
async function table(league: string, season: number, rows: [string, string, number, number, number | null][], seasonType: number | null = null) {
  for (const [id, name, wins, losses, seed] of rows) {
    await team(league, id, name);
    await db.pool.query(
      `insert into standings (league, season, team_espn_id, conference, wins, losses, win_percent, playoff_seed, season_type) values ($1,$2,$3,'East',$4,$5,$6,$7,$8)`,
      [league, season, id, wins, losses, wins + losses ? wins / (wins + losses) : 0, seed, seasonType]
    );
  }
}
async function game(league: string, id: string, season: number, home: string, away: string, over: { completed?: boolean; season_type?: number; round?: string | null; date?: string } = {}) {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type, round, home_score, away_score, status_state, home_winner, away_winner)
     values ($1,$2,$3,'g',$4,$5,$6,$7,$8,$9,100,90,$10,true,false)`,
    [league, id, over.date ?? "2026-10-05T00:00:00Z", home, away, season, over.completed ?? true, over.season_type ?? 2, over.round ?? null, over.completed === false ? "pre" : "post"]
  );
}

test("MLB: the 2027 copy of 2026 is not listed, not current, and the standings view shows 2026", async () => {
  const rows: [string, string, number, number, number | null][] = [["1", "Rays", 98, 64, 1], ["2", "Yankees", 93, 68, 4]];
  await table("mlb", 2026, rows, 2);
  await table("mlb", 2027, rows);
  await game("mlb", "g1", 2026, "1", "2", { season_type: 3, round: "ALDS" });
  assert.deepEqual(await queries.getStandingsSeasons("mlb"), [2026]);
  assert.deepEqual((await queries.getStandings("mlb")).map((r) => r.season), [2026, 2026]);
  assert.equal(await queries.getMostRecentPlayedSeason("mlb"), 2026);
  const v = await view.currentStandingsView("mlb");
  assert.deepEqual([v.activeSeason, v.fallbackSeason, v.preseason, v.seasons], [2026, null, null, [2026]]);
  // The team's history lists no 2027 finish.
  assert.deepEqual((await analytics.getTeamHistory("mlb", "1")).filter((h) => h.played).map((h) => h.season), [2026]);
});

test("MLB: once a 2027 game is played the season exists, with its own table", async () => {
  const rows: [string, string, number, number, number | null][] = [["1", "Rays", 98, 64, 1], ["2", "Yankees", 93, 68, 4]];
  await table("mlb", 2026, rows, 2);
  await table("mlb", 2027, [["1", "Rays", 1, 0, null], ["2", "Yankees", 0, 1, null]], 2);
  await game("mlb", "g1", 2026, "1", "2", { season_type: 3, round: "ALDS" });
  await game("mlb", "g2", 2027, "1", "2", { season_type: 2, date: "2027-04-01T00:00:00Z" });
  assert.deepEqual(await queries.getStandingsSeasons("mlb"), [2027, 2026]);
  assert.deepEqual((await queries.getStandings("mlb")).map((r) => [r.name, r.season]), [["Rays", 2027], ["Yankees", 2027]]);
});

test("NBA: the 2027 preseason table is current but labelled, with no positions, and leaves 2026 as the last played season", async () => {
  await table("nba", 2026, [["1", "Hawks", 50, 32, 4], ["2", "Celtics", 60, 22, 1]], 2);
  await table("nba", 2027, [["1", "Hawks", 0, 1, 15], ["2", "Celtics", 1, 0, 1]], 1);
  await game("nba", "r1", 2026, "2", "1", { season_type: 2 });
  await game("nba", "p1", 2027, "2", "1", { season_type: 1, date: "2026-10-05T00:00:00Z" });
  await game("nba", "f1", 2027, "2", "1", { season_type: 2, completed: false, date: "2026-10-20T23:30:00Z" });
  await game("nba", "f2", 2027, "1", "2", { season_type: 2, completed: false, date: "2026-10-22T23:30:00Z" });
  const rows = await queries.getStandings("nba");
  assert.deepEqual(rows.map((r) => [r.name, r.season, r.preseason]), [["Celtics", 2027, true], ["Hawks", 2027, true]]);
  assert.equal(await queries.getMostRecentPlayedSeason("nba"), 2026);
  assert.equal(await analytics.getCurrentSeason("nba"), 2026, "a preseason game does not start the season");
  const v = await view.currentStandingsView("nba");
  assert.deepEqual([v.activeSeason, v.fallbackSeason, v.seasons], [2027, null, [2027, 2026]]);
  assert.equal(v.preseason, "Preseason records, the regular season starts Oct 20. Teams are ranked from then.");
  assert.deepEqual((await analytics.getTeamHistory("nba", "1")).filter((h) => h.played).map((h) => h.season), [2026]);
  // The explicit season address is labelled the same way.
  assert.ok((await queries.getStandingsBySeason("nba", 2027)).every((r) => r.preseason));
  assert.ok((await queries.getStandingsBySeason("nba", 2026)).every((r) => !r.preseason));
});

test("NBA: the same table is read as a preseason from its games alone while its rows carry no stored type", async () => {
  await table("nba", 2026, [["1", "Hawks", 50, 32, 4]], 2);
  await table("nba", 2027, [["1", "Hawks", 0, 1, 15]]);
  await game("nba", "r1", 2026, "1", "1", { season_type: 2 });
  await game("nba", "p1", 2027, "1", "1", { season_type: 1 });
  assert.ok((await queries.getStandings("nba")).every((r) => r.preseason && r.season === 2027));
});

test("NBA: after the first regular-season game the table is an ordinary ranked one", async () => {
  await table("nba", 2026, [["1", "Hawks", 50, 32, 4], ["2", "Celtics", 60, 22, 1]], 2);
  await table("nba", 2027, [["1", "Hawks", 0, 1, 2], ["2", "Celtics", 1, 0, 1]], 2);
  await game("nba", "r1", 2026, "1", "2", { season_type: 2 });
  await game("nba", "p1", 2027, "1", "2", { season_type: 1, date: "2026-10-05T00:00:00Z" });
  await game("nba", "r2", 2027, "2", "1", { season_type: 2, date: "2026-10-20T23:30:00Z" });
  const v = await view.currentStandingsView("nba");
  assert.deepEqual([v.activeSeason, v.preseason], [2027, null]);
  assert.ok(v.standings.every((r) => !r.preseason));
  assert.equal(await analytics.getCurrentSeason("nba"), 2027);
});

test("a new season with every team 0-0 still falls back to the last season with games", async () => {
  await table("bbl", 2025, [["1", "Heat", 10, 4, null]]);
  await table("bbl", 2026, [["1", "Heat", 0, 0, null]]);
  await game("bbl", "g1", 2025, "1", "1");
  const v = await view.currentStandingsView("bbl");
  assert.deepEqual([v.activeSeason, v.fallbackSeason, v.seasons], [2025, 2025, [2026, 2025]]);
});
