// The week hub for a 162-game season. The NFL's official week numbers and the NBA's seven-day
// buckets both make an honest hub; baseball's does neither. ESPN sends no week number for an MLB
// game, so the seven-day fallback would have produced about 27 anonymous "Week 14"s a reader could
// not place, for a sport that talks about its season in months: April, May, ... October.
//
// So MLB groups by calendar month (in the league's own Eastern day, as every other grouping here
// does) and then by postseason round, and the hub says "March/April" .. "September" with the rounds
// after them.
import { before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import type { GameRow } from "../src/lib/queries";

// matchweeks.ts imports the database module, which only reads DATABASE_URL: nothing here connects.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let buildMatchweeks: typeof import("../src/lib/matchweeks").buildMatchweeks;
let weekNoun: typeof import("../src/lib/matchweeks").weekNoun;
let supportsMatchweeks: typeof import("../src/lib/matchweeks").supportsMatchweeks;
before(async () => {
  ({ buildMatchweeks, weekNoun, supportsMatchweeks } = await import("../src/lib/matchweeks"));
});

let id = 0;
function game(date: string, over: Partial<GameRow> = {}): GameRow {
  id += 1;
  return {
    espn_id: `g${id}`,
    date,
    season_year: 2026,
    round: null,
    week: null,
    stage: "regular",
    completed: true,
    home_score: 4,
    away_score: 2,
    home_team_espn_id: "10",
    away_team_espn_id: "2",
    home_name: "New York Yankees",
    away_name: "Boston Red Sox",
    home_slug: "new-york-yankees",
    away_slug: "boston-red-sox",
    home_abbr: "NYY",
    away_abbr: "BOS",
    home_logo: null,
    away_logo: null,
    home_color: null,
    away_color: null,
    status_detail: "Final",
    ...over,
  } as unknown as GameRow;
}

test("MLB has a week hub, and it is called a month", async () => {
  assert.equal(supportsMatchweeks("mlb"), true);
  assert.equal(weekNoun("mlb"), "Month");
  assert.equal(weekNoun("nfl"), "Week");
  assert.equal(weekNoun("epl"), "Matchweek");
});

test("a regular season is grouped by calendar month, in order, each labelled by its month", async () => {
  const weeks = buildMatchweeks("mlb", [
    game("2026-03-27T23:05:00Z"),
    game("2026-04-02T23:05:00Z"),
    game("2026-04-20T23:05:00Z"),
    game("2026-05-11T23:05:00Z"),
    game("2026-09-28T23:05:00Z"),
  ]);
  assert.deepEqual(
    weeks.map((w) => [w.label, w.games.length, w.playoff]),
    [
      // March's two games open the season, so they share April's group rather than standing alone as
      // a three-game "month" — the way ESPN and MLB both bill opening week.
      ["March/April", 3, false],
      ["May", 1, false],
      ["September", 1, false],
    ],
  );
  assert.deepEqual(weeks.map((w) => w.shortLabel), ["Mar/Apr", "May", "Sep"]);
  assert.deepEqual(weeks.map((w) => w.index), [1, 2, 3]);
  assert.ok(weeks.every((w) => w.numbered === false), "a month is not a numbered round, so nothing claims it is");
});

test("a month is the league's own Eastern day, not the UTC instant", async () => {
  // 02:05 UTC on 1 May is 22:05 Eastern on 30 April: an April game, as every scoreboard files it.
  // The group reads "April", not "March/April", because this season has no March game in it.
  const weeks = buildMatchweeks("mlb", [game("2026-05-01T02:05:00Z"), game("2026-05-02T23:05:00Z")]);
  assert.deepEqual(weeks.map((w) => [w.label, w.games.length]), [["April", 1], ["May", 1]]);
});

test("the postseason follows the months, one group per round, in the order they are played", async () => {
  const weeks = buildMatchweeks("mlb", [
    game("2026-09-28T23:05:00Z"),
    game("2026-10-01T23:05:00Z", { stage: "playoffs", round: "NL Wild Card - Game 1" }),
    game("2026-10-02T23:05:00Z", { stage: "playoffs", round: "AL Wild Card - Game 3" }),
    game("2026-10-06T23:05:00Z", { stage: "playoffs", round: "AL Division Series - Game 1" }),
    game("2026-10-14T23:05:00Z", { stage: "playoffs", round: "NL Championship Series - Game 2" }),
    game("2026-10-28T23:05:00Z", { stage: "playoffs", round: "World Series - Game 4" }),
  ]);
  assert.deepEqual(
    weeks.map((w) => [w.label, w.games.length, w.playoff]),
    [
      ["September", 1, false],
      ["Wild Card", 2, true],
      ["Division Series", 1, true],
      ["Championship Series", 1, true],
      ["World Series", 1, true],
    ],
  );
});

test("spring training is in no month: an excluded game is in neither the months nor the rounds", async () => {
  const weeks = buildMatchweeks("mlb", [
    game("2026-03-01T20:05:00Z", { stage: "excluded" }),
    game("2026-04-02T23:05:00Z"),
    game("2026-07-14T23:05:00Z", { stage: "excluded", round: null }),
  ]);
  assert.deepEqual(weeks.map((w) => [w.label, w.games.length]), [["April", 1]], "the March game is spring training, so April stands alone");
});

test("the hub says why its groups are months, and never that a numbering failed", async () => {
  const { WeekIndex } = await import("../src/components/WeekHub");
  const weeks = buildMatchweeks("mlb", [game("2026-04-02T23:05:00Z"), game("2026-05-11T23:05:00Z")]);
  const html = renderToStaticMarkup(createElement(WeekIndex, { league: "mlb", season: 2026, weeks, seasons: [2026], isCurrentSeason: true }));
  assert.ok(html.includes("MLB Months"), "the hub is headed Months, not Weeks");
  assert.ok(html.includes("grouped by calendar month"));
  assert.ok(!html.includes("are not published for this season"), "a month is a deliberate grouping, not a failed reconstruction");
  assert.ok(html.includes(">April<") && html.includes(">May<"));
});

test("the NFL's weeks and the NBA's buckets are untouched", async () => {
  const nfl = buildMatchweeks("nfl", [game("2026-09-10T00:20:00Z", { week: 1 }), game("2026-09-17T00:20:00Z", { week: 2 })]);
  assert.deepEqual(nfl.map((w) => w.label), ["Week 1", "Week 2"]);
  const nba = buildMatchweeks("nba", [game("2026-10-21T23:30:00Z"), game("2026-11-05T23:30:00Z")]);
  assert.deepEqual(nba.map((w) => w.label), ["Week 1", "Week 3"]);
});
