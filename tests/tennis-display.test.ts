import { test } from "node:test";
import assert from "node:assert/strict";
import { tennisMatchCaption, tennisMatchStatus } from "../src/lib/tennisDisplay";
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
