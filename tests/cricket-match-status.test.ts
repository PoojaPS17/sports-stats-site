import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCricketMatch, cricketMatchDescription, cricketMatchName, cricketMatchTitleCandidates, cricketMatchWhen, cricketSchemaStatus, seriesMatchesToPlay } from "../src/lib/cricketMatchStatus";
import { fitTitle, TITLE_BUDGET } from "../src/lib/metadata";

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
  // a start just after midnight UTC is 00:xx, never 24:xx
  assert.equal(cricketMatchWhen({ date: "2026-09-21T00:30:00Z", ...m("pre", null) }), "Sep 21, 00:30 UTC");
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
  const base = { name: "India v Australia", series_name: "Tour of India", description: "2nd ODI" };
  assert.equal(cricketMatchDescription({ ...base, ...m("pre", "Match postponed") }), "India vs Australia, 2nd ODI, Tour of India: match postponed.");
  assert.equal(cricketMatchDescription({ ...base, ...m("pre", "Match cancelled") }), "India vs Australia, 2nd ODI, Tour of India: match cancelled.");
});

// Searchers type "vs", "scorecard", "live score" and "playing xi" (Search Console, 2026-10-05: 4.6K impressions on
// "scorecard" queries, 0.1-0.5% CTR at position 8-9). The description names what the page holds, in those words.
test("cricketMatchDescription: a result leads with the scorecard and the result, a live match with the live score", () => {
  const base = { name: "India v Australia", series_name: "Tour of India", description: "2nd ODI" };
  assert.equal(
    cricketMatchDescription({ ...base, ...m("post", "India won by 5 wickets") }),
    "India vs Australia scorecard and result, 2nd ODI, Tour of India: India won by 5 wickets. Full batting and bowling scorecard, Playing XI, umpires and venue."
  );
  assert.equal(
    cricketMatchDescription({ ...base, ...m("post", "Match abandoned without a ball bowled") }),
    "India vs Australia scorecard and result, 2nd ODI, Tour of India: Match abandoned without a ball bowled. Full batting and bowling scorecard, Playing XI, umpires and venue."
  );
  assert.equal(
    cricketMatchDescription({ ...base, ...m("in", "Stumps") }),
    "India vs Australia live score and scorecard, 2nd ODI, Tour of India: Stumps. Batting and bowling figures, Playing XI and match facts, updating while the match is in play."
  );
  assert.equal(
    cricketMatchDescription({ ...base, ...m("pre", null) }),
    "India vs Australia live score and scorecard, 2nd ODI, Tour of India. Playing XI and match facts once play starts."
  );
  // No stage: nothing dangles between the name and the series.
  assert.equal(cricketMatchDescription({ ...base, description: null, ...m("pre", null) }), "India vs Australia live score and scorecard, Tour of India. Playing XI and match facts once play starts.");
});

test("cricketMatchName: ESPN's 'A v B' reads 'A vs B', and only the separator changes", () => {
  assert.equal(cricketMatchName("India v Australia"), "India vs Australia");
  assert.equal(cricketMatchName("Vancouver Thunderbirds Women v Toronto Sixers Women"), "Vancouver Thunderbirds Women vs Toronto Sixers Women");
  assert.equal(cricketMatchName("India vs Australia"), "India vs Australia");
  assert.equal(cricketMatchName("Villa v Valencia"), "Villa vs Valencia");
});

// The title's first words are what a searcher scans on the results page: the teams as they type them, then the
// word that names the page (Scorecard, Live Score), then the stage and series while they fit the 59-character
// budget (see fitTitle). Shorter forms drop the series first, because the description still names it.
test("cricketMatchTitleCandidates: result, live and fixture forms, longest first", () => {
  const base = { name: "Khan Research Laboratories v Hyderabad Kingsmen Academy", series_name: "President's Trophy 2026-27", description: "14th Match" };
  assert.deepEqual(cricketMatchTitleCandidates({ ...base, ...m("post", "Match drawn") }), [
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard, 14th Match, President's Trophy 2026-27",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard, President's Trophy 2026-27",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard, 14th Match",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy",
  ]);
  assert.deepEqual(cricketMatchTitleCandidates({ ...base, ...m("in", "Stumps") }).slice(0, 2), [
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Live Score, 14th Match, President's Trophy 2026-27",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy Live Score, President's Trophy 2026-27",
  ]);
  // A fixture and a called-off match have no scorecard yet: the teams, stage and series alone.
  assert.deepEqual(cricketMatchTitleCandidates({ ...base, ...m("pre", null) }), [
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy, 14th Match, President's Trophy 2026-27",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy, President's Trophy 2026-27",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy, 14th Match",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy",
  ]);
  assert.deepEqual(cricketMatchTitleCandidates({ ...base, ...m("pre", "Match postponed") })[0], "Khan Research Laboratories vs Hyderabad Kingsmen Academy, 14th Match, President's Trophy 2026-27");
  // No stage: the stage-only forms are not offered, and no candidate repeats another.
  const noStage = cricketMatchTitleCandidates({ ...base, description: null, ...m("post", "Match drawn") });
  assert.deepEqual(noStage, ["Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard, President's Trophy 2026-27", "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard", "Khan Research Laboratories vs Hyderabad Kingsmen Academy"]);
});

// Domestic sides have long names: "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard" is 66 characters,
// over the budget, and the bare names would lose the one word that says what the page is. The abbreviated forms
// ("KRL vs HKA Scorecard, 14th Match, President's Trophy 2026-27", as Cricbuzz titles its pages) come next, and the
// full names alone are the last resort.
test("cricketMatchTitleCandidates: abbreviated forms follow the full ones, so a long-named match keeps its keyword", () => {
  const sides = { home: { abbreviation: "KRL" }, away: { abbreviation: "HKA" } };
  const long = { name: "Khan Research Laboratories v Hyderabad Kingsmen Academy", series_name: "President's Trophy 2026-27", description: "14th Match", ...sides, ...m("post", "Match drawn") };
  const candidates = cricketMatchTitleCandidates(long);
  assert.deepEqual(candidates.slice(4), [
    "KRL vs HKA Scorecard, 14th Match, President's Trophy 2026-27",
    "KRL vs HKA Scorecard, President's Trophy 2026-27",
    "KRL vs HKA Scorecard, 14th Match",
    "KRL vs HKA Scorecard",
    "Khan Research Laboratories vs Hyderabad Kingsmen Academy",
  ]);
  // The full abbreviated form is 60 characters, one over the budget, so the series form is the one chosen.
  assert.equal(fitTitle(...candidates), "KRL vs HKA Scorecard, President's Trophy 2026-27");
  // A fixture has no keyword to keep: its fourth full form is the bare names, which fit, so no abbreviated form is reached.
  assert.equal(fitTitle(...cricketMatchTitleCandidates({ ...long, ...m("pre", null) })), "Khan Research Laboratories vs Hyderabad Kingsmen Academy");
  assert.ok(cricketMatchTitleCandidates({ ...long, ...m("pre", null) }).includes("KRL vs HKA, 14th Match, President's Trophy 2026-27"));
  // Without abbreviations (a side not stored yet) only the full forms are offered.
  assert.equal(fitTitle(...cricketMatchTitleCandidates({ ...long, home: null, away: null })), "Khan Research Laboratories vs Hyderabad Kingsmen Academy");
  // Short names never need the abbreviated forms: the first fitting full form wins.
  assert.equal(fitTitle(...cricketMatchTitleCandidates({ name: "India v Australia", series_name: "Australia tour of India 2026-27", description: "2nd ODI", home: { abbreviation: "IND" }, away: { abbreviation: "AUS" }, ...m("post", "India won") })), "India vs Australia Scorecard, 2nd ODI");
});
