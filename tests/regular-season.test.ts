import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { summarizeTeamSeason } from "../src/lib/teamSummary";
import type { GameRow } from "../src/lib/queries";

// matchweeks, analytics and friends import the shared app pool, so they load after startTestDb() (see before()).
let buildMatchweeks: typeof import("../src/lib/matchweeks").buildMatchweeks;

function game(id: string, date: string, extra: Partial<GameRow> = {}): GameRow {
  return {
    league: "nba",
    espn_id: id,
    date,
    name: id,
    short_name: id,
    home_score: 100,
    away_score: 90,
    home_score_display: null,
    away_score_display: null,
    home_winner: true,
    away_winner: false,
    season_year: 2026,
    status_state: "post",
    status_detail: null,
    status_summary: null,
    round: null,
    completed: true,
    week: null,
    first_seen_date: null,
    home_team_espn_id: "1",
    away_team_espn_id: "2",
    home_name: "One",
    home_slug: "one",
    home_abbr: null,
    home_logo: null,
    home_color: null,
    away_name: "Two",
    away_slug: "two",
    away_abbr: null,
    away_logo: null,
    away_color: null,
    ...extra,
  };
}

test("NBA matchweeks leave out play-in and excluded games and keep playoff rounds", () => {
  const games = [
    game("r1", "2025-10-22T00:00:00Z", { stage: "regular" }),
    game("r2", "2025-10-30T00:00:00Z", { stage: "regular" }),
    game("r3", "2025-11-08T00:00:00Z", { stage: "regular" }),
    game("pi", "2026-04-15T00:00:00Z", { stage: "playin" }),
    game("pre", "2025-10-05T00:00:00Z", { stage: "excluded" }),
    game("po", "2026-04-25T00:00:00Z", { stage: "playoffs", round: "East 1st Round - Game 1" }),
  ];
  const weeks = buildMatchweeks("nba", games);
  const ids = weeks.flatMap((w) => w.games.map((g) => g.espn_id));
  assert.ok(!ids.includes("pi"), "play-in game is in no matchweek");
  assert.ok(!ids.includes("pre"), "excluded game is in no matchweek");
  const regularWeeks = weeks.filter((w) => !w.playoff);
  assert.deepEqual(
    regularWeeks.map((w) => w.games.map((g) => g.espn_id)),
    [["r1"], ["r2"], ["r3"]]
  );
  const playoffWeeks = weeks.filter((w) => w.playoff);
  assert.deepEqual(playoffWeeks.map((w) => w.games.map((g) => g.espn_id)), [["po"]]);
});

test("matchweeks fall back to round when a row has no stage", () => {
  const weeks = buildMatchweeks("nba", [
    game("r1", "2025-10-22T00:00:00Z"),
    game("po", "2026-04-25T00:00:00Z", { round: "East 1st Round - Game 1" }),
  ]);
  assert.deepEqual(weeks.filter((w) => !w.playoff).flatMap((w) => w.games.map((g) => g.espn_id)), ["r1"]);
  assert.deepEqual(weeks.filter((w) => w.playoff).flatMap((w) => w.games.map((g) => g.espn_id)), ["po"]);
});

// A team page's record is the regular season's: playoff, play-in and games that do not count leave it
// alone. Recent form is a trajectory, so it also takes playoff and play-in results and skips only
// games that do not count. A league without split stages (rounds are 'other') counts every completed
// game as before.
test("an NBA team's record is regular-season only; its form adds playoffs and the play-in", () => {
  const games = [
    game("po", "2026-04-25T00:00:00Z", { stage: "playoffs", round: "East 1st Round - Game 1", home_winner: false, away_winner: true }),
    game("pi", "2026-04-15T00:00:00Z", { stage: "playin", home_winner: false, away_winner: true }),
    game("r2", "2026-04-01T00:00:00Z", { stage: "regular", home_winner: false, away_winner: true }),
    game("r1", "2026-03-01T00:00:00Z", { stage: "regular" }),
    game("pre", "2025-10-05T00:00:00Z", { stage: "excluded", home_winner: false, away_winner: true }),
  ];
  const s = summarizeTeamSeason(games, "1");
  assert.deepEqual({ w: s.wins, l: s.losses, d: s.draws }, { w: 1, l: 1, d: 0 });
  // Newest first: playoff L, play-in L, r2 L, r1 W; the preseason game is skipped.
  assert.deepEqual(s.form, ["L", "L", "L", "W"]);
});

test("a team's next game still comes from every game, including the play-in", () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString();
  const s = summarizeTeamSeason([game("pi", future, { stage: "playin", completed: false, status_state: "pre", home_winner: null, away_winner: null })], "1");
  assert.equal(s.nextGame?.espn_id, "pi");
});

test("a league without split stages keeps counting round games in the record", () => {
  const games = [
    game("f", "2026-05-25T00:00:00Z", { league: "ipl", stage: "other", round: "Final" }),
    game("m1", "2026-04-01T00:00:00Z", { league: "ipl", stage: "regular" }),
  ];
  const s = summarizeTeamSeason(games, "1");
  assert.equal(s.wins, 2);
});

// The queries, against a real games table: stage is generated there.
let db: TestDb;
let analytics: typeof import("../src/lib/analytics");
let simulator: typeof import("../src/lib/simulator");
let queries: typeof import("../src/lib/queries");
let matchContext: typeof import("../src/lib/matchContext");
before(async () => {
  db = await startTestDb();
  buildMatchweeks = (await import("../src/lib/matchweeks")).buildMatchweeks;
  analytics = await import("../src/lib/analytics");
  simulator = await import("../src/lib/simulator");
  queries = await import("../src/lib/queries");
  matchContext = await import("../src/lib/matchContext");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

interface Seed {
  id: string;
  date: string;
  seasonType?: number | null;
  competitionType?: string;
  round?: string | null;
  scores?: [number, number] | null;
}

async function seed(league: string, games: Seed[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, '1', 'One', 'one'), ($1, '2', 'Two', 'two') on conflict do nothing`, [league]);
  for (const g of games) {
    const scores = g.scores === undefined ? [100, 90] : g.scores;
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, round)
       values ($1, $2, $3, 'x', 2025, '1', '2', $4, $5, $6, $7, $8, $9)`,
      [league, g.id, g.date, scores?.[0] ?? null, scores?.[1] ?? null, scores !== null, g.seasonType ?? null, g.competitionType ?? "STD", g.round ?? null]
    );
  }
}

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const NBA_GAMES: Seed[] = [
  { id: "pre", date: "2025-10-10T00:00:00Z", seasonType: 1 },
  { id: "r1", date: "2025-11-01T00:00:00Z", seasonType: 2 },
  { id: "r2", date: "2025-11-03T00:00:00Z", seasonType: 2, scores: [90, 100] },
  { id: "cc", date: "2025-12-16T00:00:00Z", seasonType: 2, competitionType: "CC" },
  { id: "pi", date: "2026-04-15T00:00:00Z", seasonType: 5, scores: [110, 100] },
  // Not played yet: one counts, the preseason one does not.
  { id: "up-reg", date: future(3), seasonType: 2, scores: null },
  { id: "up-pre", date: future(4), seasonType: 1, scores: null },
];

test("the computed NBA table counts the two regular-season games only", async () => {
  await seed("nba", NBA_GAMES);
  const table = await analytics.getComputedTable("nba", 2025, "overall");
  assert.equal(table.length, 2);
  for (const row of table) assert.equal(row.played, 2, `${row.team.name} played`);
  const one = table.find((r) => r.team.espn_id === "1")!;
  assert.deepEqual({ w: one.wins, l: one.losses }, { w: 1, l: 1 });
});

test("power rankings skip games that do not count but keep the play-in", async () => {
  const rankings = await analytics.getPowerRankings("nba");
  // r1, r2 and the play-in game; the preseason game and the Cup final are skipped.
  for (const row of rankings.rows) assert.equal(row.played, 3, `${row.team.name} played`);
  // Upcoming difficulty runs use the regular-season fixture only.
  assert.ok(rankings.hardestRuns.length > 0);
  for (const run of rankings.hardestRuns) {
    assert.deepEqual(run.opponents.map((o) => o.espn_id), ["up-reg"]);
  }
});

test("league records count the same games as Elo (no preseason, no Cup final)", async () => {
  const records = await analytics.getLeagueRecords("nba");
  assert.equal(records.gamesCovered, 3);
});

test("the season projection sees regular-season games only", async () => {
  const projection = await simulator.getSeasonProjection("nba");
  assert.ok(projection);
  // Two completed regular-season games, one to play; the preseason and Cup games are not in the season.
  assert.equal(projection.playedGames, 2);
  assert.equal(projection.remainingGames, 1);
  for (const t of projection.teams) assert.equal(t.played, 2);
});

test("a league without split stages: a round game stays out of the table, cricket keeps it", async () => {
  await seed("epl", [
    { id: "m1", date: "2025-09-01T00:00:00Z" },
    { id: "cup", date: "2025-09-08T00:00:00Z", round: "Final" },
  ]);
  const epl = await analytics.getComputedTable("epl", 2025, "overall");
  assert.equal(epl[0].played, 1);
  await seed("ipl", [
    { id: "m1", date: "2025-04-01T00:00:00Z" },
    { id: "f", date: "2025-05-25T00:00:00Z", round: "Final" },
  ]);
  const ipl = await analytics.getComputedTable("ipl", 2025, "overall");
  assert.equal(ipl[0].played, 2);
});

test("a play-in game is not in the table: no position or record context", async () => {
  const pi = await queries.getGameByEspnId("nba", "pi");
  assert.equal(pi?.stage, "playin");
  const ctx = await matchContext.getMatchContext("nba", pi!);
  assert.equal(ctx?.home.record, null);
  assert.equal(ctx?.away.record, null);
});

test("a regular-season game keeps its record, counted from regular-season games only", async () => {
  const r2 = await queries.getGameByEspnId("nba", "r2");
  const ctx = await matchContext.getMatchContext("nba", r2!);
  // Before r2: one win (r1). The preseason game before it and the play-in game after it are not counted.
  assert.deepEqual(ctx?.home.record, { before: "1-0", after: "1-1" });
});

test("a game that does not count leaves Elo alone", async () => {
  // The Cup final comes after r1 and r2, so both teams have Elo history going in: the only reason
  // there is no rating after it is that the game is skipped, not that the teams are new.
  const cc = await queries.getGameByEspnId("nba", "cc");
  assert.equal(cc?.stage, "excluded");
  assert.equal(cc?.completed, true);
  const ctx = await matchContext.getMatchContext("nba", cc!);
  assert.notEqual(ctx?.home.elo, null);
  assert.notEqual(ctx?.away.elo, null);
  assert.equal(ctx?.home.eloAfter, null);
  assert.equal(ctx?.away.eloAfter, null);
  assert.equal(ctx?.home.record, null);
});

test("a soccer league game is in the table but a round game is not", async () => {
  const league = await queries.getGameByEspnId("epl", "m1");
  const first = await matchContext.getMatchContext("epl", league!);
  assert.equal(first?.home.position?.before, null);
  assert.notEqual(first?.home.position?.after, null);
  const knockout = await queries.getGameByEspnId("epl", "cup");
  const ko = await matchContext.getMatchContext("epl", knockout!);
  assert.equal(ko?.home.position, null);
});

test("head-to-head totals skip games that do not count but the meetings list keeps them", async () => {
  await seed("nfl", [
    { id: "h-pre", date: "2025-08-10T00:00:00Z", seasonType: 1, scores: [40, 0] },
    { id: "h-reg", date: "2025-10-05T00:00:00Z", seasonType: 2, scores: [30, 10] },
    { id: "h-po", date: "2026-01-11T00:00:00Z", seasonType: 3, round: "AFC Wild Card Playoffs", scores: [17, 20] },
  ]);
  const h2h = await analytics.getHeadToHead("nfl", "one", "two");
  assert.ok(h2h);
  // The regular-season and playoff games count; the 40-0 preseason win is nowhere in the totals.
  assert.equal(h2h.meetings, 2);
  assert.deepEqual({ a: h2h.winsA, b: h2h.winsB, d: h2h.draws }, { a: 1, b: 1, d: 0 });
  assert.deepEqual({ a: h2h.goalsA, b: h2h.goalsB }, { a: 47, b: 30 });
  assert.equal(h2h.biggestWinA?.espn_id, "h-reg");
  assert.equal(h2h.firstSeason, 2025);
  // The list is every meeting on record, newest first.
  assert.deepEqual(h2h.games.map((g) => g.espn_id), ["h-po", "h-reg", "h-pre"]);
});

test("head-to-head in a league without split stages is unchanged", async () => {
  const h2h = await analytics.getHeadToHead("epl", "one", "two");
  assert.equal(h2h?.meetings, 2);
  assert.deepEqual(h2h?.games.map((g) => g.espn_id), ["cup", "m1"]);
});
