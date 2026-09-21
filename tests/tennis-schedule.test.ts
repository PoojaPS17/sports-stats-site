// Schedule times on tennis matches. ESPN's feed, seen 2026-09-21/22:
//  - a match later on a court has only an estimate of its start (the first match on each court has the real time);
//  - a match with no time yet is state "pre" with detail "M/d - 'TBD'" and a placeholder date (midnight Eastern);
//  - the SP Open doubles final, stopped at 4-3 in the first set, is still state "pre" with a partial score and a
//    start time in the past, and no called-off text at all.
// None of these may print as a plain start time. And a clock time always names its zone.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { idsFollowingOnCourt, tennisMatchCaption, tennisMatchStatus } from "../src/lib/tennisDisplay";
import { LocalTime } from "../src/components/LocalTime";
import type { TennisMatch, TennisSet } from "../src/lib/tennis";

const set = (games: number): TennisSet => ({ games, tiebreak: null, winner: false });
const side = (name: string, sets: TennisSet[]) => ({ ids: ["1"], names: [name], countries: [null], slugs: [null], seed: null, rank: null, score: null, sets });
const upcoming = (over: Partial<TennisMatch> = {}): TennisMatch => ({
  espn_id: "m1",
  tour: "wta",
  tournament_espn_id: "811-2026",
  tournament_name: "Korea Open",
  tournament_location: null,
  major: false,
  competition_type: "womens-singles",
  round: "Round 1",
  round_number: 1,
  court: "Center Court",
  date: "2026-09-22T08:00:00Z",
  day: "2026-09-22",
  completed: false,
  status_state: "pre",
  status_detail: "Tue, September 22nd at 4:00 AM EDT",
  winner_side: null,
  side1: side("Alina Charaeva", []),
  side2: side("Vivian Wolff", []),
  ...over,
});
// The components import lib/tennis, which opens the database pool: load them only once the test database is up.
let TennisMatchLine: typeof import("../src/components/TennisScores").TennisMatchLine;
let MatchBox: typeof import("../src/components/TennisTournamentExportCards").MatchBox;
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const line = (m: TennisMatch) => renderToStaticMarkup(TennisMatchLine({ match: m }) as ReactElement);

/* ---- a clock time names its zone ---- */

test("LocalTime with showZone prints the zone: the server fallback is the zone it was given", () => {
  const markup = renderToStaticMarkup(createElement(LocalTime, { iso: "2026-09-22T08:00:00Z", format: "time", showZone: true, serverTimeZone: "America/New_York" }));
  assert.match(text(markup), /^4:00\s?AM EDT$/);
  // and without it nothing changes
  assert.match(text(renderToStaticMarkup(createElement(LocalTime, { iso: "2026-09-22T08:00:00Z", format: "time", serverTimeZone: "America/New_York" }))), /^4:00\s?AM$/);
});

test("an upcoming tennis match shows its start with a zone label", () => {
  assert.match(text(line(upcoming())), /4:00\s?AM EDT/);
});

/* ---- suspended: state pre with a partial score ---- */

const suspended = (over: Partial<TennisMatch> = {}) =>
  upcoming({
    date: "2026-09-21T14:00:00Z",
    day: "2026-09-21",
    round: "Final",
    court: "Quadra 1",
    competition_type: "womens-doubles",
    status_detail: "Mon, September 21st at 10:00 AM EDT",
    side1: side("G. Dabrowski / L. Stefani", [set(4)]),
    side2: side("A. Rogers / A. Zamarripa", [set(3)]),
    ...over,
  });

test("tennisMatchStatus: state pre with a partial score is suspended, not a start time", () => {
  assert.deepEqual(tennisMatchStatus(suspended()), { kind: "called-off", label: "Suspended" });
  // no score yet: still upcoming
  assert.deepEqual(tennisMatchStatus(upcoming()), { kind: "upcoming", label: null });
  // a match in play with a score is live, and a finished one is a result
  assert.equal(tennisMatchStatus(suspended({ status_state: "in", status_detail: "1st Set" })).kind, "live");
  assert.equal(tennisMatchStatus(suspended({ status_state: "post", completed: true, winner_side: 1, status_detail: "Final" })).kind, "result");
  // rows from before the two sides were stored carry no sides at all
  const { side1: _s1, side2: _s2, ...bare } = suspended();
  void _s1;
  void _s2;
  assert.equal(tennisMatchStatus(bare).kind, "upcoming");
});

test("a suspended match shows 'Suspended' and its score on the page and the share image, and no start time", () => {
  const page = line(suspended());
  assert.match(text(page), /Suspended/);
  assert.doesNotMatch(page, /<time/);
  assert.doesNotMatch(text(page), /10:00/);
  assert.match(page, />4</);
  assert.equal(tennisMatchCaption(suspended()), "Suspended · Final · Quadra 1");
  assert.match(text(renderToStaticMarkup(MatchBox({ m: suspended(), caption: tennisMatchCaption(suspended()) }) as ReactElement)), /^SUSPENDED|Suspended/i);
});

test("the draw tile (no caption) says Suspended too, so a stopped match is not just a score", () => {
  assert.match(text(renderToStaticMarkup(MatchBox({ m: suspended() }) as ReactElement)), /Suspended/);
  // and a settled or plain upcoming tile gets no extra line
  assert.doesNotMatch(text(renderToStaticMarkup(MatchBox({ m: upcoming() }) as ReactElement)), /Suspended|Postponed/);
});

/* ---- a time not yet set ---- */

const tbd = (over: Partial<TennisMatch> = {}) => upcoming({ date: "2026-09-22T04:00:00Z", status_detail: "M/d - 'TBD'", court: null, ...over });

test("a match with no time yet says so and does not print the midnight placeholder", () => {
  assert.deepEqual(tennisMatchStatus(tbd()), { kind: "upcoming", label: "Time TBD" });
  const page = line(tbd());
  assert.match(text(page), /Time TBD/);
  assert.doesNotMatch(page, /<time/);
  assert.equal(tennisMatchCaption(tbd()), "Time TBD · Round 1");
});

/* ---- later on a court ---- */

test("idsFollowingOnCourt: every match after the first on the same tournament, court and day", () => {
  const r = (id: string, date: string, court: string | null = "Center Court", tournament: string | null = "811-2026", day: string | null = "2026-09-22") => ({ id, tournament, court, day, date });
  const got = idsFollowingOnCourt([
    r("a", "2026-09-22T08:00:00Z"),
    r("b", "2026-09-22T09:40:00Z"),
    r("c", "2026-09-22T11:20:00Z"),
    r("d", "2026-09-22T08:00:00Z", "Grandstand"), // first on its own court
    r("e", "2026-09-22T09:00:00Z", "Center Court", "1009-2026"), // same court name, another tournament
    r("f", "2026-09-23T08:00:00Z", "Center Court", "811-2026", "2026-09-23"), // next day, first again
    r("g", "2026-09-22T12:00:00Z", null), // no court: nothing to follow
    r("h", "2026-09-22T08:00:00Z"), // same start as the first: not later
  ]);
  assert.deepEqual([...got].sort(), ["b", "c"]);
});

test("a match later on its court is shown as an estimate, with what it follows", () => {
  const first = line(upcoming());
  const later = line(upcoming({ after_court_match: true, date: "2026-09-22T09:40:00Z" }));
  assert.doesNotMatch(text(first), /Est\./);
  assert.match(text(later), /Est\. 5:40\s?AM EDT/);
  assert.match(later, /title="Followed by/);
  assert.equal(tennisMatchCaption(upcoming({ after_court_match: true, date: "2026-09-22T09:40:00Z" })), "Est. 09:40 UTC · Round 1 · Center Court");
  assert.equal(tennisMatchCaption(upcoming()), "08:00 UTC · Round 1 · Center Court");
});

/* ---- the query flags the same matches ---- */

let db: TestDb;
let tennis: typeof import("../src/lib/tennis");
before(async () => {
  db = await startTestDb();
  tennis = await import("../src/lib/tennis");
  ({ TennisMatchLine } = await import("../src/components/TennisScores"));
  ({ MatchBox } = await import("../src/components/TennisTournamentExportCards"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from tennis_matches`);
  const ins = (id: string, court: string | null, date: string, day: string, tournament = "811-2026") =>
    db.pool.query(
      `insert into tennis_matches (tour, espn_id, player1_espn_id, player2_espn_id, tournament_name, round, date, completed, status_state, tournament_espn_id, competition_type, court, day, side1, side2)
       values ('wta', $1, '1', '2', 'Korea Open', 'Round 1', $2, false, 'pre', $5, 'womens-singles', $3, $4::date,
               '{"ids":["1"],"names":["A"],"countries":[null],"seed":null,"rank":null,"score":null,"sets":[]}',
               '{"ids":["2"],"names":["B"],"countries":[null],"seed":null,"rank":null,"score":null,"sets":[]}')`,
      [id, date, court, day, tournament]
    );
  await ins("a", "Center Court", "2026-09-22T08:00:00Z", "2026-09-22");
  await ins("b", "Center Court", "2026-09-22T09:40:00Z", "2026-09-22");
  await ins("c", "Grandstand", "2026-09-22T08:00:00Z", "2026-09-22");
  await ins("d", null, "2026-09-22T09:00:00Z", "2026-09-22");
  await ins("e", "Center Court", "2026-09-23T08:00:00Z", "2026-09-23");
});

test("getTennisDay flags exactly the matches that follow another on their court that day", async () => {
  const day = await tennis.getTennisDay("2026-09-22");
  assert.deepEqual(day.filter((m) => m.after_court_match).map((m) => m.espn_id), ["b"]);
  assert.deepEqual((await tennis.getTennisDay("2026-09-23")).filter((m) => m.after_court_match), []);
  assert.equal((await tennis.getTennisMatch("b"))?.after_court_match, true);
});
