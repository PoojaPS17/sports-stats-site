import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { tennisMatchCaption, tennisMatchStatus, setCell } from "../src/lib/tennisDisplay";
import { TennisMatchLine } from "../src/components/TennisScores";
import { MatchBox } from "../src/components/TennisTournamentExportCards";
import type { TennisMatch, TennisSet } from "../src/lib/tennis";
import { parseTennisEvent } from "../src/lib/tennisFeed";

// What ESPN's tennis listing (site.web.api.espn.com/apis/v2/scoreboard/header?sport=tennis&dates=YYYYMMDD) sends, seen
// 2026-08-24 to 2026-09-20: a finished match is state "post" / completed true / detail "Final"; a retirement is
// "post" / completed true / "Retired" with the opponent as winner; a walkover is "post" / completed true /
// "Walkover"; a match in play is "in" / "In Progress" ("2nd Set"); a scheduled one is "pre" with the start as its
// detail ("Sun, September 20th at 12:00 PM EDT"). No postponed, suspended or cancelled match was in that window; the
// scraper stores state "post" as completed, so a called-off match is recognised by its detail and having no winner.
const match = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-20T16:00:00Z",
  completed: false,
  status_state: "pre" as string | null,
  status_detail: "Sun, September 20th at 12:00 PM EDT" as string | null,
  winner_side: null as 1 | 2 | null,
  round: "Round of 16" as string | null,
  court: "Court 4" as string | null,
  ...over,
});
const finished = (detail = "Final") => match({ completed: true, status_state: "post", status_detail: detail, winner_side: 1 });
const live = (detail = "2nd Set") => match({ status_state: "in", status_detail: detail });
// as stored today: state "post", completed set by the scraper's "|| state === post", no winner
const off = (detail: string, completed = true) => match({ completed, status_state: "post", status_detail: detail, winner_side: null });

test("tennisMatchStatus: a scheduled match is upcoming and shows its start", () => {
  assert.deepEqual(tennisMatchStatus(match()), { kind: "upcoming", label: null });
  assert.deepEqual(tennisMatchStatus(match({ status_detail: null })), { kind: "upcoming", label: null });
});

test("tennisMatchStatus: a match in play is live and shows ESPN's own detail, including a rain stoppage", () => {
  assert.deepEqual(tennisMatchStatus(live()), { kind: "live", label: "2nd Set" });
  assert.deepEqual(tennisMatchStatus(live("Suspended")), { kind: "live", label: "Suspended" });
  assert.deepEqual(tennisMatchStatus(match({ status_state: "in", status_detail: null })), { kind: "live", label: "Live" });
});

test("tennisMatchStatus: a finished match is a result; retirements and walkovers say so and stay results", () => {
  assert.deepEqual(tennisMatchStatus(finished()), { kind: "result", label: "Final" });
  assert.deepEqual(tennisMatchStatus(finished("Retired")), { kind: "result", label: "Retired" });
  assert.deepEqual(tennisMatchStatus(finished("Walkover")), { kind: "result", label: "Walkover" });
  assert.deepEqual(tennisMatchStatus(match({ completed: true, status_state: "post", status_detail: null, winner_side: 2 })), { kind: "result", label: "Final" });
});

test("tennisMatchStatus: a called-off match shows why, with no start time, whether or not the scraper marked it completed", () => {
  for (const completed of [true, false]) {
    assert.deepEqual(tennisMatchStatus(off("Postponed", completed)), { kind: "called-off", label: "Postponed" });
    assert.deepEqual(tennisMatchStatus(off("Canceled", completed)), { kind: "called-off", label: "Cancelled" });
    assert.deepEqual(tennisMatchStatus(off("Suspended", completed)), { kind: "called-off", label: "Suspended" });
    assert.deepEqual(tennisMatchStatus(off("Abandoned", completed)), { kind: "called-off", label: "Abandoned" });
  }
  // called off before its slot arrived, still listed as pre
  assert.deepEqual(tennisMatchStatus(match({ status_detail: "Postponed" })), { kind: "called-off", label: "Postponed" });
});

test("tennisMatchStatus: a match with a winner is a result even if its text mentions a stoppage", () => {
  assert.equal(tennisMatchStatus(match({ completed: true, status_state: "post", status_detail: "Abandoned", winner_side: 1 })).kind, "result");
});

test("tennisMatchCaption: an upcoming match shows its start (UTC), a called-off one shows why and no time", () => {
  assert.equal(tennisMatchCaption(match()), "16:00 UTC · Round of 16 · Court 4");
  // a start just after midnight UTC is 00:xx, never 24:xx
  assert.equal(tennisMatchCaption(match({ date: "2026-09-21T00:30:00.000Z" })), "00:30 UTC · Round of 16 · Court 4");
  assert.equal(tennisMatchCaption(off("Postponed")), "Postponed · Round of 16 · Court 4");
  assert.equal(tennisMatchCaption(off("Canceled")), "Cancelled · Round of 16 · Court 4");
  assert.doesNotMatch(tennisMatchCaption(off("Postponed")), /UTC|\d\d:\d\d/);
  assert.equal(tennisMatchCaption(finished("Retired")), "Retired · Round of 16 · Court 4");
  assert.equal(tennisMatchCaption(finished()), "Final · Round of 16 · Court 4");
  assert.equal(tennisMatchCaption(live()), "2nd Set · Round of 16 · Court 4");
  assert.equal(tennisMatchCaption(live("Suspended")), "Suspended · Round of 16 · Court 4");
});

/* ---- the feed parser: state "post" alone must not make a called-off match completed ---- */

const event = (fullStatus: Record<string, unknown>, winner = false) => ({
  id: "189-2026",
  name: "US Open",
  competitionId: "9001",
  competitionType: { slug: "mens-singles" },
  date: "2026-09-20T16:00:00Z",
  status: fullStatus.type && (fullStatus.type as { state: string }).state,
  fullStatus,
  notes: [{ type: "Round of 16 - Court 4" }],
  competitors: [
    { id: "1", homeAway: "home", displayName: "A. Player", winner },
    { id: "2", homeAway: "away", displayName: "B. Player", winner: false },
  ],
});
const type = (state: string, completed: boolean, detail: string) => ({ type: { id: "0", name: "X", state, completed, description: detail, detail, shortDetail: detail } });

test("parseTennisEvent: a postponed match is not completed even though ESPN files it under state post", () => {
  const m = parseTennisEvent("851", event(type("post", false, "Postponed")));
  assert.equal(m?.completed, false);
  assert.equal(m?.statusDetail, "Postponed");
  assert.equal(parseTennisEvent("851", event(type("post", false, "Canceled")))?.completed, false);
});

test("parseTennisEvent: results, retirements, walkovers and live matches are unchanged", () => {
  assert.equal(parseTennisEvent("851", event(type("post", true, "Final"), true))?.completed, true);
  assert.equal(parseTennisEvent("851", event(type("post", true, "Retired"), true))?.completed, true);
  assert.equal(parseTennisEvent("851", event(type("post", true, "Walkover"), true))?.completed, true);
  // the scraper's fallback: state post without the completed flag is still a finished match
  assert.equal(parseTennisEvent("851", event(type("post", false, "Final"), true))?.completed, true);
  assert.equal(parseTennisEvent("851", event(type("in", false, "2nd Set")))?.completed, false);
  assert.equal(parseTennisEvent("851", event(type("in", false, "Suspended")))?.completed, false);
  assert.equal(parseTennisEvent("851", event(type("pre", false, "Sun, September 20th at 12:00 PM EDT")))?.completed, false);
});

/* ---- T8: tie-break points ---- */

// ESPN's feed gives both players' points for a tie-break set ("7-6(8-6)": tiebreak 8 on the winner's 7, 6 on the loser's 6). The
// convention (and ESPN's own scores page) shows only the loser's, "7-6(6)". A doubles match tie-break is the third
// "set" 1-0 with points 10-6, written [10-6] and never as a set score of 1-0 with superscripts.
const set = (games: number, tiebreak: number | null, winner: boolean): TennisSet => ({ games, tiebreak, winner });

test("setCell: a set tie-break shows only the loser's points, on the loser's games", () => {
  const w = set(7, 8, true);
  const l = set(6, 6, false);
  assert.deepEqual(setCell(w, l), { text: "7", sup: null });
  assert.deepEqual(setCell(l, w), { text: "6", sup: "6" });
  // a 7-point deciding-set tie-break, lost 12-14: the loser's 12
  assert.deepEqual(setCell(set(6, 12, false), set(7, 14, true)), { text: "6", sup: "12" });
  // no tie-break, nothing to show
  assert.deepEqual(setCell(set(6, null, true), set(4, null, false)), { text: "6", sup: null });
});

test("setCell: a set still being played shows each side's own tie-break points", () => {
  assert.deepEqual(setCell(set(6, 5, false), set(6, 3, false)), { text: "6", sup: "5" });
  assert.deepEqual(setCell(set(6, 3, false), set(6, 5, false)), { text: "6", sup: "3" });
});

test("setCell: a match tie-break (1-0 with 10-6) is bracketed points for each side, no games", () => {
  assert.deepEqual(setCell(set(1, 10, true), set(0, 6, false)), { text: "[10]", sup: null, wide: true });
  assert.deepEqual(setCell(set(0, 6, false), set(1, 10, true)), { text: "[6]", sup: null, wide: true });
});

test("setCell: no set is nothing", () => {
  assert.equal(setCell(undefined, set(6, null, true)), null);
});

const side = (names: string[], sets: TennisSet[], seed: number | null = null) => ({
  ids: names.map((_, i) => String(i + 1)),
  names,
  countries: names.map(() => null),
  slugs: names.map(() => null),
  seed,
  rank: null,
  score: null,
  sets,
});
const fullMatch = (s1: TennisSet[], s2: TennisSet[], over: Partial<TennisMatch> = {}): TennisMatch => ({
  espn_id: "m1",
  tour: "wta",
  tournament_espn_id: "1-2026",
  tournament_name: "Guadalajara Open",
  tournament_location: null,
  major: false,
  competition_type: "womens-singles",
  round: "Final",
  round_number: 1,
  court: "Center Court",
  date: "2026-09-20T16:00:00Z",
  day: "2026-09-20",
  completed: true,
  status_state: "post",
  status_detail: "Final",
  winner_side: 1,
  side1: side(["Peyton Stearns"], s1),
  side2: side(["Sloane Stephens"], s2),
  ...over,
});
// the superscripts in rendered markup: <sup ...>N</sup>
const sups = (markup: string) => [...markup.matchAll(/<sup[^>]*>([^<]*)<\/sup>/g)].map((m) => m[1]);
const stearns = fullMatch([set(7, 8, true), set(6, null, true)], [set(6, 6, false), set(4, null, false)]);

test("the match line prints one tie-break superscript per tie-break set: the loser's points", () => {
  assert.deepEqual(sups(renderToStaticMarkup(TennisMatchLine({ match: stearns }))), ["6"]);
});

test("the share-image tile prints the same single superscript", () => {
  assert.deepEqual(sups(renderToStaticMarkup(MatchBox({ m: stearns }))), ["6"]);
});

test("a doubles match tie-break is shown as [10] over [6] on the page and the share image, never 1-0 with superscripts", () => {
  const m = fullMatch(
    [set(4, null, false), set(6, null, true), set(1, 10, true)],
    [set(6, null, true), set(2, null, false), set(0, 6, false)],
    { competition_type: "womens-doubles", round: "Round of 16" }
  );
  for (const markup of [renderToStaticMarkup(TennisMatchLine({ match: m })), renderToStaticMarkup(MatchBox({ m }))]) {
    assert.match(markup, /\[10\]/);
    assert.match(markup, /\[6\]/);
    assert.deepEqual(sups(markup), []);
    assert.doesNotMatch(markup, />1</);
  }
});

test("tennisMatchCaption: a finished Final is captioned once, not 'Final · Final'", () => {
  assert.equal(tennisMatchCaption({ ...finished(), round: "Final" }), "Final · Court 4");
  assert.equal(tennisMatchCaption({ ...finished("Retired"), round: "Final" }), "Retired · Final · Court 4");
  assert.equal(tennisMatchCaption(live()), "2nd Set · Round of 16 · Court 4");
});
