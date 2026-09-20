import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCricketMatch, cricketMatchDescription, cricketMatchWhen, cricketSchemaStatus, seriesMatchesToPlay } from "../src/lib/cricketMatchStatus";

// ESPN's cricket listing (site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&dates=YYYYMMDD) sends a match
// abandoned without a ball bowled as status "post" (type id 6, description "Abandoned", longSummary "Match abandoned
// without a ball bowled"), a match with no result as "post" ("No result"), a match in play as "in", and a cancelled
// match as "post" too (type id 7, description "Canceled", longSummary "Match cancelled without a ball bowled": four
// England Lions v Pakistan Shaheens matches, 2026-03). No sample of a postponed match, or of a pre-state match with a
// called-off summary, turned up in 2025-10 to 2026-12, so the pre/null rule is coded from the field names.
const m = (status_state: string | null, status_summary: string | null) => ({ status_state, status_summary });

test("classifyCricketMatch: a match not yet played is a fixture", () => {
  assert.equal(classifyCricketMatch(m("pre", "Match scheduled to begin at 09:30")), "fixture");
  assert.equal(classifyCricketMatch(m("pre", null)), "fixture");
  assert.equal(classifyCricketMatch(m(null, null)), "fixture");
  assert.equal(classifyCricketMatch(m(null, "")), "fixture");
});

test("classifyCricketMatch: a match ESPN closed without playing is called off, with the reason", () => {
  assert.deepEqual(classifyCricketMatch(m("pre", "Match postponed")), { calledOff: "Postponed" });
  assert.deepEqual(classifyCricketMatch(m("pre", "Match postponed due to rain")), { calledOff: "Postponed" });
  assert.deepEqual(classifyCricketMatch(m(null, "Postponed")), { calledOff: "Postponed" });
  assert.deepEqual(classifyCricketMatch(m("pre", "Match cancelled")), { calledOff: "Cancelled" });
  assert.deepEqual(classifyCricketMatch(m("pre", "Match Canceled")), { calledOff: "Cancelled" });
  assert.deepEqual(classifyCricketMatch(m("pre", "Match abandoned")), { calledOff: "Abandoned" });
  assert.deepEqual(classifyCricketMatch(m("pre", "Match suspended")), { calledOff: "Suspended" });
});

test("classifyCricketMatch: a match in play stays live, even when it is suspended for rain", () => {
  assert.equal(classifyCricketMatch(m("in", "Stumps")), "live");
  assert.equal(classifyCricketMatch(m("in", "Play suspended due to rain")), "live");
  assert.equal(classifyCricketMatch(m("in", null)), "live");
});

test("classifyCricketMatch: a finished match is a result, and an abandoned or no-result one stays a result", () => {
  assert.equal(classifyCricketMatch(m("post", "Bahrain won by 67 runs")), "result");
  assert.equal(classifyCricketMatch(m("post", "Match abandoned without a ball bowled")), "result");
  assert.equal(classifyCricketMatch(m("post", "Abandoned")), "result");
  assert.equal(classifyCricketMatch(m("post", "No result (abandoned with a toss)")), "result");
  assert.equal(classifyCricketMatch(m("post", "No result")), "result");
  assert.equal(classifyCricketMatch(m("post", null)), "result");
});

test("classifyCricketMatch: a match ESPN closes as postponed or cancelled is not a result, whichever state it sends", () => {
  assert.deepEqual(classifyCricketMatch(m("post", "Match postponed")), { calledOff: "Postponed" });
  assert.deepEqual(classifyCricketMatch(m("post", "Match cancelled")), { calledOff: "Cancelled" });
  // as ESPN sends it (England Lions v Pakistan Shaheens, 2026-03: type id 7 "Canceled", state post)
  assert.deepEqual(classifyCricketMatch(m("post", "Match cancelled without a ball bowled")), { calledOff: "Cancelled" });
  assert.equal(cricketMatchWhen({ date: "2026-03-01T06:00:00Z", ...m("post", "Match cancelled without a ball bowled") }), "Mar 1, 2026 · Cancelled");
});

test("cricketMatchWhen: a fixture shows its start time in UTC, a called-off match its date and reason, a result its date", () => {
  const date = "2026-09-20T09:30:00Z";
  assert.equal(cricketMatchWhen({ date, ...m("pre", null) }), "Sep 20, 09:30 UTC");
  assert.equal(cricketMatchWhen({ date, ...m("pre", "Match postponed") }), "Sep 20, 2026 · Postponed");
  assert.doesNotMatch(cricketMatchWhen({ date, ...m("pre", "Match postponed") }), /UTC|\d:\d\d/);
  assert.equal(cricketMatchWhen({ date, ...m("post", "Bahrain won by 67 runs") }), "Sep 20, 2026");
  assert.equal(cricketMatchWhen({ date, ...m("post", "Match abandoned without a ball bowled") }), "Sep 20, 2026");
  assert.equal(cricketMatchWhen({ date, ...m("in", "Stumps") }), "Sep 20, 09:30 UTC");
});

test("cricketSchemaStatus: called-off matches are postponed or cancelled to a crawler, the rest scheduled", () => {
  assert.equal(cricketSchemaStatus(m("pre", "Match postponed")), "https://schema.org/EventPostponed");
  assert.equal(cricketSchemaStatus(m("pre", "Match cancelled")), "https://schema.org/EventCancelled");
  assert.equal(cricketSchemaStatus(m("pre", null)), "https://schema.org/EventScheduled");
  assert.equal(cricketSchemaStatus(m("in", "Play suspended")), "https://schema.org/EventScheduled");
  assert.equal(cricketSchemaStatus(m("post", "Match abandoned without a ball bowled")), "https://schema.org/EventScheduled");
});

test("seriesMatchesToPlay: a called-off match is not still to be played, so a series can finish with one", () => {
  assert.equal(seriesMatchesToPlay({ match_count: 10, completed_count: 8, called_off_count: 0 }), 2);
  assert.equal(seriesMatchesToPlay({ match_count: 10, completed_count: 9, called_off_count: 1 }), 0);
  assert.equal(seriesMatchesToPlay({ match_count: 10, completed_count: 8, called_off_count: 1 }), 1);
  assert.equal(seriesMatchesToPlay({ match_count: 0, completed_count: 0, called_off_count: 0 }), 0);
});

test("cricketMatchDescription: a called-off match says so, and does not promise a live score", () => {
  const base = { name: "India v Australia", series_name: "Tour of India" };
  assert.equal(cricketMatchDescription({ ...base, ...m("pre", "Match postponed") }), "India v Australia, Tour of India: match postponed.");
  assert.equal(cricketMatchDescription({ ...base, ...m("pre", "Match cancelled") }), "India v Australia, Tour of India: match cancelled.");
  assert.equal(cricketMatchDescription({ ...base, ...m("pre", null) }), "India v Australia live score and scorecard, Tour of India.");
  assert.equal(cricketMatchDescription({ ...base, ...m("in", "Stumps") }), "India v Australia live score and scorecard, Tour of India: Stumps.");
  assert.equal(cricketMatchDescription({ ...base, ...m("post", "Match abandoned without a ball bowled") }), "India v Australia live score and scorecard, Tour of India: Match abandoned without a ball bowled.");
});
