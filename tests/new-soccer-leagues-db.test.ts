// MLS, the Saudi Pro League, the Europa League and Ligue 1 through the scraper and the matchweek
// builder: MLS playoff rounds from ESPN's season slugs, Messi's MLS rows split into the regular
// season and the playoffs, and the week hubs' URLs and playoff groups.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { GameRow } from "../src/lib/queries";
import playoffEvent from "./fixtures/espn-mls-playoff-event-20251101.json";
import cupFinal from "./fixtures/espn-mls-cup-final-20251206.json";
import messi from "./fixtures/espn-mls-messi-45843-stats.json";

let db: TestDb;
let games: typeof import("../scripts/lib/games");
let seasonRow: typeof import("../scripts/lib/season-row");
let seasonStats: typeof import("../scripts/lib/season-stats");
let matchweeks: typeof import("../src/lib/matchweeks");
const realFetch = globalThis.fetch;

before(async () => {
  db = await startTestDb();
  games = await import("../scripts/lib/games");
  seasonRow = await import("../scripts/lib/season-row");
  seasonStats = await import("../scripts/lib/season-stats");
  matchweeks = await import("../src/lib/matchweeks");
});
after(async () => {
  globalThis.fetch = realFetch;
  await (await import("../src/lib/db")).pool.end();
  await (await import("../scripts/lib/db")).pool.end();
  await db?.stop();
});

test("an MLS playoff game's round comes from ESPN's season slug, named by conference; the final is the MLS Cup", () => {
  assert.equal(games.parseRound("mls", playoffEvent), "East Round One");
  assert.equal(games.parseRound("mls", cupFinal), "MLS Cup");
  // The team-schedule feed names the stage instead of a slug.
  assert.equal(games.parseRound("mls", { seasonType: { name: "Western Conference Playoffs - Semifinals" } }), "West Semifinals");
  assert.equal(games.parseRound("mls", { seasonType: { name: "Eastern Conference Playoffs - Final" } }), "East Finals");
  assert.equal(games.parseRound("mls", { seasonType: { name: "Eastern Conference Playoffs - Wild Card" } }), "East Wild Card");
  // A regular-season game has no round, so it feeds the conference tables.
  assert.equal(games.parseRound("mls", { season: { year: 2026, slug: "regular-season" }, seasonType: { name: "Regular Season" } }), null);
  // The Saudi league is a plain league: its season-name slug is not a round.
  assert.equal(games.parseRound("saudi", { season: { year: 2026, slug: "2026-27-saudi-pro-league" } }), null);
});

test("Messi's 2025 MLS line is the regular season; the playoffs row sits beside it as the postseason", async () => {
  const category = messi.categories[0] as never;
  const regular = seasonRow.seasonRow(category, 2025, "usa.1")!;
  const playoffs = seasonRow.soccerPostseasonRow(category, 2025, "usa.1")!;
  assert.deepEqual(regular.values.slice(0, 3), ["26", "9", "35"]);
  assert.deepEqual(playoffs.values.slice(0, 3), ["6", "5", "17"]);
  // 2023 has one row and no playoffs line.
  assert.deepEqual(seasonRow.seasonRow(category, 2023, "usa.1")!.values.slice(0, 3), ["4", "3", "13"]);
  assert.equal(seasonRow.soccerPostseasonRow(category, 2023, "usa.1"), null);

  globalThis.fetch = (async () => new Response(JSON.stringify(messi), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const n = await seasonStats.upsertPlayerSeasonStats("mls", "45843", "20232");
  assert.equal(n, 4, "2023 to 2026");
  const { rows } = await db.pool.query(`select season, categories, goals from player_season_stats where league = 'mls' and player_espn_id = '45843' order by season`);
  assert.deepEqual(rows.map((r) => r.season), [2023, 2024, 2025, 2026]);
  const y2025 = rows[2];
  assert.deepEqual(Object.keys(y2025.categories).sort(), ["offensive", "postseason_offensive"]);
  assert.equal(y2025.categories.offensive.values[0], "26");
  assert.equal(y2025.categories.postseason_offensive.values[0], "6");
  const gIndex = (y2025.categories.offensive.labels as string[]).indexOf("G");
  assert.equal(y2025.goals, Number(y2025.categories.offensive.values[gIndex]));
  assert.deepEqual(Object.keys(rows[0].categories), ["offensive"]);
});

function game(league: GameRow["league"], id: string, date: string, extra: Partial<GameRow> = {}): GameRow {
  return {
    league, espn_id: id, date, name: id, short_name: id, home_score: 2, away_score: 1, home_score_display: null, away_score_display: null,
    home_winner: true, away_winner: false, season_year: 2025, status_state: "post", status_detail: null, status_summary: null, round: null,
    completed: true, week: null, first_seen_date: null, home_team_espn_id: "1", away_team_espn_id: "2", home_name: "One", home_slug: "one",
    home_abbr: null, home_logo: null, home_color: null, away_name: "Two", away_slug: "two", away_abbr: null, away_logo: null, away_color: null,
    stage: extra.round ? "other" : "regular", ...extra,
  } as GameRow;
}

test("MLS matchweeks: the regular season is numbered and the playoffs are grouped by round", () => {
  const regular = [
    ...["1", "2", "3"].map((i) => game("mls", `r1-${i}`, "2025-03-01T00:00:00Z", { home_team_espn_id: `h${i}`, away_team_espn_id: `a${i}` })),
    ...["1", "2", "3"].map((i) => game("mls", `r2-${i}`, "2025-03-08T00:00:00Z", { home_team_espn_id: `h${i}`, away_team_espn_id: `a${i}` })),
  ];
  const playoffs = [
    game("mls", "p1", "2025-10-25T00:00:00Z", { round: "East Round One" }),
    game("mls", "p2", "2025-11-01T00:00:00Z", { round: "West Round One" }),
    game("mls", "p3", "2025-11-23T00:00:00Z", { round: "East Semifinals" }),
    game("mls", "p4", "2025-11-29T00:00:00Z", { round: "West Finals" }),
    game("mls", "p5", "2025-12-06T00:00:00Z", { round: "MLS Cup" }),
  ];
  const weeks = matchweeks.buildMatchweeks("mls", [...regular, ...playoffs]);
  assert.deepEqual(weeks.filter((w) => !w.playoff).map((w) => w.games.length), [3, 3]);
  assert.deepEqual(weeks.filter((w) => w.playoff).map((w) => w.label), ["Round One", "Conference Semifinals", "Conference Finals", "MLS Cup"]);
  assert.equal(weeks.find((w) => w.label === "Round One")!.games.length, 2);
});

test("the week hubs: the Europa League counts matchdays like the Champions League, the other three matchweeks", () => {
  assert.equal(matchweeks.weekPath("europa", 1), "/europa/matchday/1");
  assert.equal(matchweeks.weekPath("mls", 1), "/mls/matchweek/1");
  assert.equal(matchweeks.weekPath("saudi", 1), "/saudi/matchweek/1");
  assert.equal(matchweeks.weekPath("ligue1", 1), "/ligue1/matchweek/1");
  for (const l of ["mls", "saudi", "europa", "ligue1"] as const) assert.ok(matchweeks.supportsMatchweeks(l), l);
});

test("the games backfill scans MLS and the Saudi league from 2023, the European leagues from the usual window", () => {
  assert.deepEqual(seasonRow.gamesSeasonsToTry("mls", 2026), [2023, 2024, 2025, 2026]);
  assert.deepEqual(seasonRow.gamesSeasonsToTry("saudi", 2026), [2023, 2024, 2025, 2026]);
  assert.equal(seasonRow.gamesSeasonsToTry("ligue1", 2026)[0], 2015);
  assert.equal(seasonRow.gamesSeasonsToTry("europa", 2026)[0], 2015);
  assert.equal(seasonRow.gamesSeasonsToTry("epl", 2026)[0], 2015);
});
