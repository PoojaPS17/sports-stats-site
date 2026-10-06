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

// Searchers type "vs", "match scorecard", "live score" and "playing xi" (Search Console, 2026-10-06: the nine biggest
// queries, 6.6K impressions at position 7-9 with one click, all read "<team> vs <team> cricket team match scorecard").
// The description names what the page holds in those words, with the match's date, so the snippet matches the query.
test("cricketMatchDescription: a result leads with the match scorecard and the result, a live match with the live score", () => {
  const base = { name: "India v Australia", series_name: "Tour of India", description: "2nd ODI", date: "2026-10-02T04:00:00Z" };
  assert.equal(
    cricketMatchDescription({ ...base, ...m("post", "India won by 5 wickets") }),
    "India vs Australia match scorecard and result, 2nd ODI, Tour of India, Oct 2, 2026: India won by 5 wickets. Full batting and bowling scorecard, Playing XI, umpires and venue."
  );
  assert.equal(
    cricketMatchDescription({ ...base, ...m("post", "Match abandoned without a ball bowled") }),
    "India vs Australia match scorecard and result, 2nd ODI, Tour of India, Oct 2, 2026: Match abandoned without a ball bowled. Full batting and bowling scorecard, Playing XI, umpires and venue."
  );
  assert.equal(
    cricketMatchDescription({ ...base, ...m("in", "Stumps") }),
    "India vs Australia live score and scorecard, 2nd ODI, Tour of India, Oct 2, 2026: Stumps. Batting and bowling figures, Playing XI and match facts, updating while the match is in play."
  );
  // With the stored sides, the result is written in full names, the winner first (ESPN's summary abbreviates: "BAN-WMN
  // U19 won by 30 runs"; the queries that find these pages type the names in full).
  assert.equal(
    cricketMatchDescription({
      ...base,
      ...m("post", "AUS won by 5 wkts"),
      home: { name: "India", abbreviation: "IND", score: "250/8", winner: false },
      away: { name: "Australia", abbreviation: "AUS", score: "251/5 (48.1 ov, target 251)", winner: true },
    }),
    "India vs Australia match scorecard and result, 2nd ODI, Tour of India, Oct 2, 2026: Australia beat India by 5 wickets. Full batting and bowling scorecard, Playing XI, umpires and venue."
  );
  // A fixture gives its start (UTC), not ESPN's "Match scheduled to begin at 09:30" (a local time with no zone).
  assert.equal(
    cricketMatchDescription({ ...base, ...m("pre", "Match scheduled to begin at 09:30") }),
    "India vs Australia live score and scorecard, 2nd ODI, Tour of India, starts Oct 2, 2026, 04:00 UTC. Playing XI and match facts once play starts."
  );
  // No stage: nothing dangles between the name and the series. No date (a match not stored yet): no date clause.
  assert.equal(cricketMatchDescription({ ...base, description: null, date: null, ...m("pre", null) }), "India vs Australia live score and scorecard, Tour of India. Playing XI and match facts once play starts.");
  assert.equal(cricketMatchDescription({ name: "India v Australia", series_name: "Tour of India", ...m("post", "India won") }), "India vs Australia match scorecard and result, Tour of India: India won. Full batting and bowling scorecard, Playing XI, umpires and venue.");
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
  assert.deepEqual(noStage, ["Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard, President's Trophy 2026-27", "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard"]);
});

// Domestic sides have long names: "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard" is 66 characters,
// over the budget. PR #50 fell back to the sides' abbreviations ("KRL vs HHKA Scorecard, President's Trophy 2026-27"),
// and Search Console (2026-10-06) showed what that cost: the queries are typed with the full names ("hyderabad kingsmen
// academy vs khan research laboratories cricket team match scorecard", 2,409 impressions, position 8.3, one click),
// and a title without those words is skipped. So the full names and the keyword are the floor: when nothing fits,
// the title runs over and Google clips its tail, which keeps the names searchers scan for. No abbreviated form is offered.
test("cricketMatchTitleCandidates: a long-named match keeps its full names and keyword, never abbreviations", () => {
  const sides = { home: { abbreviation: "KRL" }, away: { abbreviation: "HHKA" } };
  const long = { name: "Khan Research Laboratories v Hyderabad Kingsmen Academy", series_name: "President's Trophy 2026-27", description: "14th Match", ...sides, ...m("post", "Match drawn") };
  const candidates = cricketMatchTitleCandidates(long);
  assert.ok(candidates.every((c) => !/\bKRL\b|\bHHKA\b/.test(c)), `abbreviated form offered: ${candidates.join(" / ")}`);
  assert.ok(candidates.every((c) => c.includes("Scorecard")), "a result title always says Scorecard");
  assert.equal(fitTitle(...candidates), "Khan Research Laboratories vs Hyderabad Kingsmen Academy Scorecard");
  assert.ok(fitTitle(...candidates).length > TITLE_BUDGET, "the chosen title runs over the budget rather than lose the names");
  // The longest pair in the series: still the full names and the keyword.
  const longest = { ...long, name: "Oil & Gas Development Company Limited v Sui Northern Gas Pipelines Limited" };
  assert.equal(fitTitle(...cricketMatchTitleCandidates(longest)), "Oil & Gas Development Company Limited vs Sui Northern Gas Pipelines Limited Scorecard");
  // A fixture has no keyword: the bare names fit, and the stage comes along while it fits.
  assert.equal(fitTitle(...cricketMatchTitleCandidates({ ...long, ...m("pre", null) })), "Khan Research Laboratories vs Hyderabad Kingsmen Academy");
  assert.equal(
    fitTitle(...cricketMatchTitleCandidates({ ...long, name: "Hyderabad Kingsmen Academy v Sui Northern Gas Pipelines Limited", description: "20th Match", ...m("pre", null) })),
    "Hyderabad Kingsmen Academy vs Sui Northern Gas Pipelines Limited"
  );
  // Short names never run over: the first fitting full form wins, as before.
  assert.equal(fitTitle(...cricketMatchTitleCandidates({ name: "India v Australia", series_name: "Australia tour of India 2026-27", description: "2nd ODI", ...m("post", "India won") })), "India vs Australia Scorecard, 2nd ODI");
});
