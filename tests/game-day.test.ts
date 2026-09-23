// A game's day. ESPN files a game under its US Eastern date; the site used to file by the UTC date,
// which put a Sunday-night NFL kickoff (00:20 UTC Monday) on Monday, Thursday night football on
// Friday, and about a third of NBA games (tip-off after 8 pm ET) a day late. Soccer matched ESPN on
// the UTC date and must stay UTC; cricket, tennis and F1 are untouched.
//
// The machine's own zone is pinned to something that is neither UTC nor Eastern, so a wrong answer
// here cannot accidentally be right: every assertion below is about the league's zone, never the
// zone the tests happen to run in. Node re-reads TZ when it is assigned, and each test file runs in
// its own process.
process.env.TZ = "Australia/Sydney";

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { dayTimeZone, formatGameDate, gameDayIso, gameStartDateIso } from "../src/lib/gameDay";
import { fmtDate } from "../src/components/PlayerStatsShared";
import { GameCard } from "../src/components/GameCard";
import type { GameRow } from "../src/lib/queries";

/* ---- dayTimeZone -------------------------------------------------------- */

test("only the NFL and the NBA measure their day in US Eastern; everything else is UTC", () => {
  assert.equal(dayTimeZone("nfl"), "America/New_York");
  assert.equal(dayTimeZone("nba"), "America/New_York");
  for (const league of ["epl", "laliga", "bundesliga", "seriea", "ucl", "ipl", "test", "odi", "t20i", "wpl"]) {
    assert.equal(dayTimeZone(league), "UTC", league);
  }
  // an unknown league is UTC rather than an error: a raw games.league value may be anything
  assert.equal(dayTimeZone("does-not-exist"), "UTC");
});

/* ---- gameDayIso --------------------------------------------------------- */

test("a Sunday-night NFL kickoff belongs to the Sunday, not the UTC Monday", () => {
  assert.equal(gameDayIso("2026-09-21T00:20:00Z", "nfl"), "2026-09-20");
  // a Sunday afternoon game is the same day either way
  assert.equal(gameDayIso("2026-09-20T17:00:00Z", "nfl"), "2026-09-20");
});

test("a late NBA tip belongs to the evening it started, and an early one is unmoved", () => {
  assert.equal(gameDayIso("2026-06-08T02:00:00Z", "nba"), "2026-06-07");
  assert.equal(gameDayIso("2026-06-07T23:30:00Z", "nba"), "2026-06-07");
});

test("soccer and unknown leagues keep the UTC day", () => {
  for (const league of ["epl", "laliga", "ucl", "not-a-league"]) {
    assert.equal(gameDayIso("2026-09-20T23:30:00Z", league), "2026-09-20", league);
    assert.equal(gameDayIso("2026-09-21T00:10:00Z", league), "2026-09-21", league);
  }
});

test("gameStartDateIso writes the instant with its league zone's offset, so the day it reads as is the league's", () => {
  // Sunday night: 8:20 PM EDT on the 20th, which is 00:20 UTC on the 21st
  assert.equal(gameStartDateIso("2026-09-21T00:20:00Z", "nfl"), "2026-09-20T20:20:00-04:00");
  // winter offset, and a midnight that a 12-hour clock would print as 24
  assert.equal(gameStartDateIso("2026-12-14T05:00:00Z", "nba"), "2026-12-14T00:00:00-05:00");
  assert.equal(gameStartDateIso(new Date("2026-03-08T07:30:00Z"), "nfl"), "2026-03-08T03:30:00-04:00");
  // every other league stays the same UTC instant it always was
  assert.equal(gameStartDateIso("2026-09-21T00:10:00Z", "epl"), "2026-09-21T00:10:00.000Z");
  // and it is the same instant either way
  for (const [iso, league] of [["2026-09-21T00:20:00Z", "nfl"], ["2026-11-01T05:30:00Z", "nba"], ["2026-11-01T06:30:00Z", "nba"]] as const) {
    assert.equal(new Date(gameStartDateIso(iso, league)).getTime(), new Date(iso).getTime(), `${league} ${iso}`);
  }
});

test("gameDayIso takes a Date as well as a string", () => {
  assert.equal(gameDayIso(new Date("2026-09-21T00:20:00Z"), "nfl"), "2026-09-20");
  assert.equal(gameDayIso(new Date("2026-09-21T00:20:00Z"), "epl"), "2026-09-21");
});

test("the Eastern day is right on both sides of the spring-forward change", () => {
  // Clocks go forward at 07:00 UTC on 8 March 2026. Until then Eastern midnight is 05:00 UTC...
  assert.equal(gameDayIso("2026-03-08T04:59:00Z", "nba"), "2026-03-07");
  assert.equal(gameDayIso("2026-03-08T05:00:00Z", "nba"), "2026-03-08");
  // ...and after it, 04:00 UTC.
  assert.equal(gameDayIso("2026-03-09T03:59:00Z", "nba"), "2026-03-08");
  assert.equal(gameDayIso("2026-03-09T04:00:00Z", "nba"), "2026-03-09");
});

test("the Eastern day is right on both sides of the fall-back change", () => {
  // Clocks go back at 06:00 UTC on 1 November 2026. Until then Eastern midnight is 04:00 UTC...
  assert.equal(gameDayIso("2026-11-01T03:59:00Z", "nfl"), "2026-10-31");
  assert.equal(gameDayIso("2026-11-01T04:00:00Z", "nfl"), "2026-11-01");
  // ...the 1 a.m. hour is then lived through twice, and both of them are still 1 November...
  assert.equal(gameDayIso("2026-11-01T05:59:00Z", "nfl"), "2026-11-01");
  assert.equal(gameDayIso("2026-11-01T06:00:00Z", "nfl"), "2026-11-01");
  // ...and from then on Eastern midnight is 05:00 UTC again.
  assert.equal(gameDayIso("2026-11-02T04:59:00Z", "nfl"), "2026-11-01");
  assert.equal(gameDayIso("2026-11-02T05:00:00Z", "nfl"), "2026-11-02");
});

/* ---- formatGameDate ----------------------------------------------------- */

const LONG: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
const SHORT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

test("formatGameDate keeps the caller's wording and only decides the zone", () => {
  assert.equal(formatGameDate("2026-09-21T00:20:00Z", "nfl", LONG), "Sunday, September 20, 2026");
  assert.equal(formatGameDate("2026-09-21T00:20:00Z", "epl", LONG), "Monday, September 21, 2026");
  assert.equal(formatGameDate("2026-06-08T02:00:00Z", "nba", SHORT), "Jun 7, 2026");
  assert.equal(formatGameDate("2026-06-08T02:00:00Z", "ucl", SHORT), "Jun 8, 2026");
  // the same instant, the same words, only the day differs
  assert.equal(formatGameDate("2026-09-20T23:30:00Z", "nba", SHORT), "Sep 20, 2026");
  assert.equal(formatGameDate("2026-09-20T23:30:00Z", "epl", SHORT), "Sep 20, 2026");
});

/* ---- the day query ------------------------------------------------------ */

let db: TestDb;
let queries: typeof import("../src/lib/queries");
// structuredData imports queries, so it too must be loaded only after startTestDb has set DATABASE_URL.
let structuredData: typeof import("../src/lib/structuredData");

before(async () => {
  db = await startTestDb();
  // queries.ts builds its pool from DATABASE_URL at import time, which startTestDb has just set.
  queries = await import("../src/lib/queries");
  structuredData = await import("../src/lib/structuredData");
  const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
  await q(`insert into teams (league, espn_id, name, slug) values
             ('nfl', '1', 'Home NFL', 'home-nfl'), ('nfl', '2', 'Away NFL', 'away-nfl'),
             ('epl', '1', 'Home EPL', 'home-epl'), ('epl', '2', 'Away EPL', 'away-epl')`);
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values
       ('nfl', 'sunday-night', '2026-09-21T00:20:00Z', 'Sunday night', '1', '2', 2026, true),
       ('nfl', 'sunday-afternoon', '2026-09-20T17:00:00Z', 'Sunday afternoon', '1', '2', 2026, true),
       ('epl', 'late-kickoff', '2026-09-21T00:10:00Z', 'Late kickoff', '1', '2', 2026, true)`
  );
});

after(async () => {
  await db?.stop();
});

test("getGamesByDate returns an NFL day's games by their Eastern day", async () => {
  const sunday = await queries.getGamesByDate("nfl", "2026-09-20");
  assert.deepEqual(sunday.map((g) => g.espn_id), ["sunday-afternoon", "sunday-night"]);
  // the Sunday-night game is no longer filed under the Monday it kicks off on in UTC
  assert.deepEqual(await queries.getGamesByDate("nfl", "2026-09-21"), []);
});

test("getGamesByDate leaves soccer on the UTC day", async () => {
  const monday = await queries.getGamesByDate("epl", "2026-09-21");
  assert.deepEqual(monday.map((g) => g.espn_id), ["late-kickoff"]);
  assert.deepEqual(await queries.getGamesByDate("epl", "2026-09-20"), []);
});

/* ---- what the pages actually render ------------------------------------- */

const gameRow = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "nfl",
    espn_id: "g1",
    date: "2026-09-21T00:20:00Z",
    name: "Away at Home",
    short_name: null,
    home_score: 24,
    away_score: 17,
    home_score_display: null,
    away_score_display: null,
    home_winner: true,
    away_winner: false,
    season_year: 2026,
    status_state: "post",
    status_detail: "Final",
    status_summary: null,
    round: null,
    completed: true,
    home_team_espn_id: "1",
    away_team_espn_id: "2",
    home_name: "Home Team",
    home_slug: "home-team",
    home_abbr: "HOM",
    home_logo: null,
    home_color: null,
    away_name: "Away Team",
    away_slug: "away-team",
    away_abbr: "AWY",
    away_logo: null,
    away_color: null,
    ...over,
  }) as GameRow;

test("a game page's structured data starts the game on the same day its heading names", () => {
  const nfl = structuredData.gameSchema("nfl", gameRow(), null);
  assert.equal(nfl.startDate, "2026-09-20T20:20:00-04:00");
  assert.equal(nfl.startDate.slice(0, 10), gameDayIso("2026-09-21T00:20:00Z", "nfl"));
  const epl = structuredData.gameSchema("epl", gameRow({ date: "2026-09-21T00:10:00Z" }), null);
  assert.equal(epl.startDate.slice(0, 10), "2026-09-21");
});

test("a game card puts a Sunday-night NFL game on the Sunday, and a soccer game on its UTC day", () => {
  const nfl = renderToStaticMarkup(createElement(GameCard, { league: "nfl", game: gameRow() }));
  assert.match(nfl, /Sep 20/);
  assert.doesNotMatch(nfl, /Sep 21/);

  const epl = renderToStaticMarkup(createElement(GameCard, { league: "epl", game: gameRow({ league: "epl" }) }));
  assert.match(epl, /Sep 21/);
  assert.doesNotMatch(epl, /Sep 20/);
});

const fixture = { completed: false, status_state: "pre", status_detail: "Scheduled", home_score: null, away_score: null, home_winner: null, away_winner: null } as Partial<GameRow>;

test("an upcoming game card's screen-reader label and first-paint date are the league's own day", () => {
  const nfl = renderToStaticMarkup(createElement(GameCard, { league: "nfl", game: gameRow(fixture) }));
  assert.match(nfl, /aria-label="[^"]*Sunday, September 20"/);
  // the pill's fallback date, which is what a crawler and a visitor with no JavaScript read
  assert.match(nfl, />Sun, Sep 20</);

  const epl = renderToStaticMarkup(createElement(GameCard, { league: "epl", game: gameRow({ ...fixture, league: "epl" }) }));
  assert.match(epl, /aria-label="[^"]*Monday, September 21"/);
  assert.match(epl, />Mon, Sep 21</);
});

test("a game log's date is the league's own day", () => {
  assert.equal(fmtDate("2026-09-21T00:20:00Z", "nfl"), "Sep 20, 2026");
  assert.equal(fmtDate("2026-06-08T02:00:00Z", "nba"), "Jun 7, 2026");
  assert.equal(fmtDate("2026-09-21T00:10:00Z", "epl"), "Sep 21, 2026");
});

/* ---- the guard: no new unguarded game-date formatting ------------------- */

// Source with comments removed, so a call that is only shown in a note does not count.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

// Files allowed to format a date in the machine's own zone, with the reason each is not a game day:
//   - tennis, cricket and F1 have their own day rules and are out of this change (tennis already
//     uses America/New_York of its own accord; cricket and F1 pass timeZone: "UTC" explicitly)
//   - LocalTime is the one component that is meant to render in the visitor's zone, after hydration
//   - ExportFooter stamps the moment the picture was made, not a game's date
//   - PerformanceCard's own footer mirrors ExportFooter's stamp for the same reason (Satori/next-og
//     rejects ExportFooter's own `display: inline-flex` glyph span, so the card route cannot use
//     ExportFooter as-is — see task-5-report.md)
//   - Footer prints the current year
//   - gameDay.ts is where the zone is decided
const ALLOWLIST = new Set([
  "src/components/LocalTime.tsx",
  "src/components/ExportFooter.tsx",
  "src/components/PerformanceCard.tsx",
  "src/components/Footer.tsx",
  "src/lib/gameDay.ts",
]);
const OUT_OF_SCOPE = /(^|\/)(tennis|cricket|f1)/i;

test("no file under src formats a game date without saying which zone it is in", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    const rel = file.replace(/\\/g, "/");
    if (ALLOWLIST.has(rel) || OUT_OF_SCOPE.test(rel.replace(/^src\/(app|components|lib)\//, ""))) continue;
    const src = withoutComments(readFileSync(file, "utf8"));
    // every toLocaleDateString / toLocaleTimeString call, and any toLocaleString on a Date (the
    // same hazard; on a number it is only digit grouping), with the options object that follows it
    for (const re of [/toLocale(?:Date|Time)String\(([^;]*?)\)\s*[;,)}\n]/g, /new Date\([^;]*?\)\.toLocaleString\(([^;]*?)\)\s*[;,)}\n]/g]) {
      for (const m of src.matchAll(re)) {
        if (!/timeZone/.test(m[1])) offenders.push(`${rel}: ${m[0].trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `format a game date through formatGameDate/formatGameTime (lib/gameDay.ts), or pass an explicit timeZone:\n${offenders.join("\n")}`);
});

test("the guard would catch a new unguarded call, and is not fooled by a commented-out one", () => {
  const unguarded = `const d = new Date(game.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });`;
  const find = (src: string) => [...withoutComments(src).matchAll(/toLocale(?:Date|Time)String\(([^;]*?)\)\s*[;,)}\n]/g)].filter((m) => !/timeZone/.test(m[1]));
  assert.equal(find(unguarded).length, 1);
  assert.equal(find(`// ${unguarded}`).length, 0);
  assert.equal(find(`const d = formatGameDate(game.date, league, { month: "short", day: "numeric" });`).length, 0);
  assert.equal(find(unguarded.replace(`day: "numeric" }`, `day: "numeric", timeZone: "UTC" }`)).length, 0);
});
