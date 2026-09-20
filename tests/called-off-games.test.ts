import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { GameRow } from "../src/lib/queries";

// A game ESPN closed without playing is stored as not completed, status_state 'post', 0-0, with the reason in
// status_detail; the replay is a separate event. It is neither a fixture, nor a live game, nor a spotlight pick.
// These tests run against a real games table (a throwaway embedded Postgres), so they load the app's pool
// modules after startTestDb().
let db: TestDb;
let analytics: typeof import("../src/lib/analytics");
let queries: typeof import("../src/lib/queries");
let homeFeed: typeof import("../src/lib/homeFeed");
let gamesLive: typeof import("../src/lib/gamesLive");
let ics: typeof import("../src/lib/ics");
let cricketSeries: typeof import("../src/lib/cricketSeries");
let tennis: typeof import("../src/lib/tennis");
let pickSpotlight: typeof import("../src/components/SpotlightCard").pickSpotlight;

before(async () => {
  db = await startTestDb();
  analytics = await import("../src/lib/analytics");
  queries = await import("../src/lib/queries");
  homeFeed = await import("../src/lib/homeFeed");
  gamesLive = await import("../src/lib/gamesLive");
  ics = await import("../src/lib/ics");
  cricketSeries = await import("../src/lib/cricketSeries");
  tennis = await import("../src/lib/tennis");
  pickSpotlight = (await import("../src/components/SpotlightCard")).pickSpotlight;
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
  await db.pool.query(`delete from cricket_series_matches`);
  await db.pool.query(`delete from cricket_series`);
  await db.pool.query(`delete from tennis_matches`);
  await db.pool.query(`delete from players where league = 'atp'`);
});

const at = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

interface Seed {
  id: string;
  date: string;
  league?: string;
  home?: string;
  away?: string;
  /** Defaults to a game not yet played (no scores). */
  scores?: [number, number] | null;
  completed?: boolean;
  state?: string | null;
  detail?: string | null;
  seasonType?: number | null;
}

async function seed(games: Seed[]) {
  for (const league of new Set(games.map((g) => g.league ?? "nba"))) {
    await db.pool.query(
      `insert into teams (league, espn_id, name, slug) values ($1, '1', 'One', 'one'), ($1, '2', 'Two', 'two'), ($1, '3', 'Three', 'three') on conflict do nothing`,
      [league]
    );
  }
  for (const g of games) {
    const scores = g.scores ?? null;
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type, status_state, status_detail)
       values ($1, $2, $3, 'x', 2025, $4, $5, $6, $7, $8, $9, 'STD', $10, $11)`,
      [g.league ?? "nba", g.id, g.date, g.home ?? "1", g.away ?? "2", scores?.[0] ?? null, scores?.[1] ?? null, g.completed ?? scores !== null, g.seasonType ?? 2, g.state ?? null, g.detail ?? null]
    );
  }
}

/** A stored called-off game: 0-0, not completed, status_state 'post'. */
const calledOff = (id: string, date: string, detail: string, extra: Partial<Seed> = {}): Seed => ({ id, date, scores: [0, 0], completed: false, state: "post", detail, ...extra });

/* ------------------------------------------------------------------------ */
/* Power rankings                                                            */
/* ------------------------------------------------------------------------ */

test("a postponed game is not an opponent in a team's fixture-difficulty run", async () => {
  await seed([
    { id: "r1", date: at(-72), home: "1", away: "2", scores: [100, 90] },
    { id: "r2", date: at(-48), home: "1", away: "3", scores: [100, 90] },
    { id: "r3", date: at(-24), home: "2", away: "3", scores: [100, 90] },
    calledOff("pp", at(48), "Postponed", { home: "1", away: "2" }),
    { id: "next", date: at(120), home: "1", away: "3" },
  ]);
  const rankings = await analytics.getPowerRankings("nba");
  const runs = [...rankings.hardestRuns, ...rankings.easiestRuns];
  const one = rankings.hardestRuns.find((r) => r.team.espn_id === "1");
  assert.ok(one, "team One has a run");
  assert.deepEqual(one.opponents.map((o) => o.espn_id), ["next"]);
  for (const run of runs) assert.ok(!run.opponents.some((o) => o.espn_id === "pp"), `${run.team.name}'s run has no postponed game`);
  // Team Two's only future game was the postponed one, so it has no run at all.
  assert.equal(rankings.hardestRuns.find((r) => r.team.espn_id === "2"), undefined);
});

/* ------------------------------------------------------------------------ */
/* Ticker                                                                    */
/* ------------------------------------------------------------------------ */

test("the ticker leaves out a postponed game but keeps a fixture and a result", async () => {
  await seed([
    { id: "result", date: at(-24), scores: [100, 90] },
    { id: "fixture", date: at(48) },
    calledOff("pp", at(24), "Postponed"),
    calledOff("cx", at(30), "Canceled"),
  ]);
  const ids = (await queries.getTickerGames(12)).map((g) => g.espn_id);
  assert.deepEqual(ids, ["result", "fixture"]);
});

test("the ticker keeps a finished cricket match that was abandoned: it is a result, not a called-off fixture", async () => {
  await seed([
    { id: "ab", league: "ipl", date: at(-24), completed: true, state: "post", detail: "Abandoned", scores: null },
    calledOff("pp", at(24), "Postponed", { league: "ipl" }),
  ]);
  const ids = (await queries.getTickerGames(12)).map((g) => g.espn_id);
  assert.deepEqual(ids, ["ab"]);
});

test("the ticker keeps a game in play whose status text says suspended: live wins over called off", async () => {
  await seed([
    { id: "rain", league: "ipl", date: at(-1), state: "in", detail: "Suspended" },
    calledOff("pp", at(24), "Postponed", { league: "ipl" }),
  ]);
  const ids = (await queries.getTickerGames(12)).map((g) => g.espn_id);
  assert.deepEqual(ids, ["rain"]);
});

test("the ticker still fills its limit when a called-off game sits ahead of the fixtures", async () => {
  await seed([
    { id: "result", date: at(-24), scores: [100, 90] },
    calledOff("pp", at(12), "Postponed"),
    { id: "f1", date: at(24) },
    { id: "f2", date: at(48) },
    { id: "f3", date: at(72) },
  ]);
  const ids = (await queries.getTickerGames(3)).map((g) => g.espn_id);
  assert.deepEqual(ids, ["result", "f1", "f2"]);
});

/* ------------------------------------------------------------------------ */
/* Live games                                                                */
/* ------------------------------------------------------------------------ */

test("getLiveGames does not show a postponed game whose start has passed", async () => {
  await seed([
    calledOff("pp", at(-2), "Postponed"),
    calledOff("cx", at(-2), "Canceled"),
    { id: "normal", date: at(-2), state: "pre" },
    { id: "in-play", date: at(-1), state: "in", detail: "3rd Quarter" },
  ]);
  const ids = (await homeFeed.getLiveGames()).map((g) => g.espn_id);
  assert.deepEqual(ids, ["normal", "in-play"]);
});

test("gamesLive asks ESPN for a game past its start but not for a called-off one", async () => {
  const stub = async (calls: string[], rows: GameRow[]) => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      calls.push(String(input));
      return { ok: false } as Response;
    }) as typeof fetch;
    try {
      await gamesLive.overlayLiveGames(rows);
    } finally {
      globalThis.fetch = real;
    }
  };
  const row = (extra: Partial<GameRow>): GameRow => ({ league: "nba", espn_id: "g", date: at(-1), completed: false, status_state: "pre", status_detail: null, ...extra }) as GameRow;

  const called: string[] = [];
  await stub(called, [row({ status_state: "post", status_detail: "Postponed", home_score: 0, away_score: 0 })]);
  assert.deepEqual(called, [], "a postponed game triggers no scoreboard fetch");

  const normal: string[] = [];
  await stub(normal, [row({})]);
  assert.equal(normal.length, 1, "a normal game past its start triggers one");
  assert.match(normal[0], /basketball\/nba\/scoreboard/);

  const inPlay: string[] = [];
  await stub(inPlay, [row({ status_state: "in" })]);
  assert.equal(inPlay.length, 1, "a game stored as in play still triggers one");
});

/* ------------------------------------------------------------------------ */
/* Spotlight                                                                 */
/* ------------------------------------------------------------------------ */

function spot(id: string, hours: number, extra: Partial<GameRow> = {}): GameRow {
  return { league: "nba", espn_id: id, date: at(hours), completed: false, status_state: "pre", status_detail: null, ...extra } as GameRow;
}
const done = (id: string, hours: number) => spot(id, hours, { completed: true, status_state: "post", status_detail: "Final", home_score: 100, away_score: 90 });
const pp = (id: string, hours: number) => spot(id, hours, { status_state: "post", status_detail: "Postponed", home_score: 0, away_score: 0 });

test("the spotlight skips a future postponed game and falls back to the recent result", () => {
  assert.equal(pickSpotlight([pp("pp", 12), done("result", -20)])?.espn_id, "result");
  assert.equal(pickSpotlight([pp("pp", 48), done("result", -20)])?.espn_id, "result");
});

test("the spotlight still prefers a normal game inside 36 hours, and a live game over everything", () => {
  assert.equal(pickSpotlight([pp("pp", 6), spot("soon", 20), done("result", -20)])?.espn_id, "soon");
  assert.equal(pickSpotlight([pp("pp", 6), spot("soon", 20), done("result", -20), spot("live", -1, { status_state: "in" })])?.espn_id, "live");
});

/* ------------------------------------------------------------------------ */
/* Calendar feed                                                             */
/* ------------------------------------------------------------------------ */

test("a postponed game is a cancelled calendar event, not a confirmed fixture", () => {
  const row = (extra: Partial<GameRow>): GameRow =>
    ({ league: "nba", espn_id: "g", date: at(48), completed: false, status_state: "pre", status_detail: null, round: null, status_summary: null, home_name: "One", away_name: "Two", home_team_espn_id: "1", away_team_espn_id: "2", ...extra }) as GameRow;
  const off = ics.gameEvent("nba", row({ status_state: "post", status_detail: "Postponed", home_score: 0, away_score: 0 }));
  assert.equal(off.status, "CANCELLED");
  assert.match(off.summary, /\(Postponed\)$/);
  assert.match(off.description ?? "", /Postponed/);
  const cx = ics.gameEvent("nba", row({ status_state: "post", status_detail: "Canceled" }));
  assert.match(cx.summary, /\(Cancelled\)$/);
  const normal = ics.gameEvent("nba", row({}));
  assert.equal(normal.status, undefined);
  assert.equal(normal.summary, "Two at One");
});

/** The VEVENT of one game as serialized in a feed, so the STATUS and SEQUENCE lines are what a calendar app reads. */
function feedLines(g: Partial<GameRow>): string[] {
  const row = { league: "nba", espn_id: "g", date: at(48), completed: false, status_state: "pre", status_detail: null, round: null, status_summary: null, home_name: "One", away_name: "Two", home_team_espn_id: "1", away_team_espn_id: "2", ...g } as GameRow;
  return ics.buildIcs("t", "d", [ics.gameEvent("nba", row)]).split("\r\n");
}

test("the serialized feed marks a postponed game STATUS:CANCELLED with SEQUENCE:1", () => {
  const lines = feedLines({ status_state: "post", status_detail: "Postponed", home_score: 0, away_score: 0 });
  assert.ok(lines.includes("STATUS:CANCELLED"));
  assert.ok(lines.includes("SEQUENCE:1"));
  assert.ok(lines.some((l) => l.startsWith("SUMMARY:") && l.endsWith("(Postponed)")));
  assert.ok(!lines.includes("STATUS:CONFIRMED"));
});

test("the serialized feed keeps a normal fixture CONFIRMED at SEQUENCE:0 and a result CONFIRMED at SEQUENCE:1", () => {
  const fixture = feedLines({});
  assert.ok(fixture.includes("STATUS:CONFIRMED"));
  assert.ok(fixture.includes("SEQUENCE:0"));
  const result = feedLines({ completed: true, status_state: "post", status_detail: "Final", home_score: 100, away_score: 90 });
  assert.ok(result.includes("STATUS:CONFIRMED"));
  assert.ok(result.includes("SEQUENCE:1"));
});

test("a finished abandoned match stays a CONFIRMED event with its result, never cancelled", () => {
  const lines = feedLines({ league: "ipl", completed: true, status_state: "post", status_detail: "Abandoned", status_summary: "Match abandoned without a ball bowled", home_score: 0, away_score: 0 });
  assert.ok(lines.includes("STATUS:CONFIRMED"));
  assert.ok(!lines.some((l) => /CANCELLED|\(Abandoned\)/.test(l)));
  assert.ok(lines.some((l) => l.startsWith("DESCRIPTION:") && /Final: Match abandoned without a ball bowled/.test(l.replace(/\\/g, ""))));
});

test("a live game is never emitted as cancelled, even when its status text says suspended", () => {
  const lines = feedLines({ status_state: "in", status_detail: "Suspended" });
  assert.ok(lines.includes("STATUS:CONFIRMED"));
  assert.ok(!lines.some((l) => /CANCELLED|\(Suspended\)/.test(l)));
  assert.ok(lines.some((l) => l.startsWith("DESCRIPTION:") && /In progress/.test(l)));
});

/* ------------------------------------------------------------------------ */
/* Cricket series                                                            */
/* ------------------------------------------------------------------------ */

/** A row of the cricket series listing: state pre / in / post plus ESPN's summary text. */
async function seedCricket(matches: { id: string; date: string; state: string | null; summary: string | null }[]) {
  await db.pool.query(`insert into cricket_series (espn_id, name, kind, match_count, completed_count) values ('S', 'Test Series', 'international', $1, $2)`, [
    matches.length,
    matches.filter((m) => m.state === "post").length,
  ]);
  for (const m of matches) {
    await db.pool.query(
      `insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, status_summary) values ($1, 'S', $2, $1, $3, $4)`,
      [m.id, m.date, m.state, m.summary]
    );
  }
}

test("the upcoming cricket list leaves out a postponed or cancelled match but keeps the fixtures around it", async () => {
  await seedCricket([
    { id: "fixture", date: at(24), state: "pre", summary: "Match scheduled to begin at 09:30" },
    { id: "plain", date: at(30), state: "pre", summary: null },
    { id: "no-state", date: at(36), state: null, summary: null },
    { id: "postponed", date: at(6), state: "pre", summary: "Match postponed" },
    { id: "cancelled", date: at(12), state: null, summary: "Match cancelled" },
    { id: "abandoned-pre", date: at(18), state: "pre", summary: "Match abandoned" },
  ]);
  const ids = (await cricketSeries.getUpcomingCricketMatches(10)).map((m) => m.espn_id);
  assert.deepEqual(ids, ["fixture", "plain", "no-state"]);
});

test("the upcoming cricket list still fills its limit when a called-off match sits ahead of the fixtures", async () => {
  await seedCricket([
    { id: "postponed", date: at(2), state: "pre", summary: "Match postponed" },
    { id: "f1", date: at(24), state: "pre", summary: null },
    { id: "f2", date: at(48), state: "pre", summary: null },
  ]);
  const ids = (await cricketSeries.getUpcomingCricketMatches(2)).map((m) => m.espn_id);
  assert.deepEqual(ids, ["f1", "f2"]);
});

test("a finished abandoned or no-result match and a match in play are not the upcoming list's business, and stay as stored", async () => {
  await seedCricket([
    { id: "abandoned", date: at(-30), state: "post", summary: "Match abandoned without a ball bowled" },
    { id: "rain", date: at(-2), state: "in", summary: "Play suspended due to rain" },
    { id: "fixture", date: at(24), state: "pre", summary: null },
  ]);
  const ids = (await cricketSeries.getUpcomingCricketMatches(10)).map((m) => m.espn_id);
  assert.deepEqual(ids, ["fixture"]);
  const live = (await cricketSeries.getLiveCricketMatches()).map((m) => m.espn_id);
  assert.deepEqual(live, ["rain"]);
  const rows = await cricketSeries.getCricketSeriesMatches("S");
  assert.equal(rows.find((m) => m.espn_id === "abandoned")?.status_state, "post");
});

test("a series counts a called-off match as neither played nor still to play", async () => {
  await seedCricket([
    { id: "done", date: at(-72), state: "post", summary: "A won by 5 runs" },
    { id: "abandoned", date: at(-48), state: "post", summary: "Match abandoned without a ball bowled" },
    { id: "postponed", date: at(-24), state: "pre", summary: "Match postponed" },
  ]);
  const s = await cricketSeries.getCricketSeries("S");
  assert.equal(s?.match_count, 3);
  assert.equal(s?.completed_count, 2);
  assert.equal(s?.called_off_count, 1);
});

/* ------------------------------------------------------------------------ */
/* Tennis                                                                    */
/* ------------------------------------------------------------------------ */

// The scraper stores ESPN's state "post" as completed, so a postponed match can sit in tennis_matches completed,
// with no winner. It is not a match the player lost.
test("a postponed tennis match is not counted as a played match or a loss in a player's rivals", async () => {
  for (const id of ["1", "2", "3"]) {
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('atp', $1, $1, $1)`, [id]);
  }
  const insert = (id: string, opp: string, winner: string | null, completed: boolean, detail: string) =>
    db.pool.query(
      `insert into tennis_matches (tour, espn_id, tournament_name, date, player1_espn_id, player2_espn_id, winner_espn_id, completed, status_state, status_detail)
       values ('atp', $1, 'T', now() - interval '1 day', '1', $2, $3, $4, 'post', $5)`,
      [id, opp, winner, completed, detail]
    );
  await insert("m1", "2", "1", true, "Final");
  await insert("m2", "2", "2", true, "Retired");
  await insert("m3", "2", null, true, "Postponed");
  await insert("m4", "3", null, false, "Canceled");
  const rivals = await tennis.getTennisPlayerRivals("atp", "1");
  assert.deepEqual(
    rivals.map((r) => [r.espn_id, r.matches, r.wins]),
    [["2", 2, 1]]
  );
});
