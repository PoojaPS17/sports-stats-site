import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cricketResultLine } from "../src/lib/cricketResult";
import { cricketMatchReport, type MatchReportInput } from "../src/lib/cricketMatchReport";
import { extractGameDetails } from "../src/lib/matchDetail";

// Pakistan Women Under-19s v Bangladesh Women Under-19s, 1st Match of the 2026/27 tri-series, as ESPN served it on
// 2026-10-06 (trimmed of videos, news and standings).
const summary = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-summary-1554707.json", import.meta.url), "utf8"));
const comp = summary.header.competitions[0];
const details = extractGameDetails("cricket", summary, "1300", "1301");

const PAK = { name: "Pakistan Women Under-19s", abbreviation: "PAW19", score: "87/6 (20 ov, target 118)", winner: false };
const BAN = { name: "Bangladesh Women Under-19s", abbreviation: "BAW19", score: "117/8", winner: true };

const result: MatchReportInput = {
  kind: "result",
  home: PAK,
  away: BAN,
  statusSummary: comp.status.summary,
  stage: "1st Match",
  seriesName: "Pakistan Women's Under-19s T20 Tri-Series 2026/27",
  venue: "Iqbal Stadium, Faisalabad",
  date: "2026-10-02T05:00:00Z",
  scorecard: details.scorecard,
  playerOfTheMatch: "Nishita Akter Nishi",
};

test("cricketResultLine: ESPN's abbreviated summary becomes the full names, the winner first, 'wickets' spelled out", () => {
  assert.equal(cricketResultLine(PAK, BAN, "BAN-WMN U19 won by 30 runs"), "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs");
  assert.equal(cricketResultLine({ ...PAK, winner: true }, { ...BAN, winner: false, score: "117/8 (19.2 ov, target 118)" }, "PAK-WMN U19 won by 5 wkts (with 4 balls remaining)"), "Pakistan Women Under-19s beat Bangladesh Women Under-19s by 5 wickets (with 4 balls remaining)");
  assert.equal(cricketResultLine({ ...PAK, winner: true }, { ...BAN, winner: false }, "PAK-WMN U19 won by 1 run"), "Pakistan Women Under-19s beat Bangladesh Women Under-19s by 1 run");
  // A winner the summary names some other way ("awarded", a super over) keeps the summary as the reason.
  assert.equal(cricketResultLine({ ...PAK, winner: true }, { ...BAN, winner: false }, "Match tied (PAK-WMN U19 won the Super Over)"), "Pakistan Women Under-19s beat Bangladesh Women Under-19s (Match tied (PAK-WMN U19 won the Super Over))");
});

test("cricketResultLine: ties, draws and no-results name both sides; anything else is null", () => {
  const krl = { name: "Khan Research Laboratories", abbreviation: "KRL", score: "344", winner: false };
  const hka = { name: "Hyderabad Kingsmen Academy", abbreviation: "HHKA", score: "643/8d & 167/3 (24.5 ov)", winner: false };
  assert.equal(cricketResultLine(krl, hka, "Match drawn"), "Khan Research Laboratories and Hyderabad Kingsmen Academy drew");
  assert.equal(cricketResultLine(krl, hka, "Match tied"), "Khan Research Laboratories and Hyderabad Kingsmen Academy tied");
  assert.equal(cricketResultLine(krl, hka, "No result"), "No result between Khan Research Laboratories and Hyderabad Kingsmen Academy");
  assert.equal(cricketResultLine(krl, hka, "Match abandoned without a ball bowled"), null);
  assert.equal(cricketResultLine(krl, hka, null), null);
  assert.equal(cricketResultLine(krl, { ...hka, name: "" }, "Match drawn"), null);
});

test("cricketMatchReport: a result reads as a match report, with the top scorer, the best bowler and the Player of the Match", () => {
  assert.equal(
    cricketMatchReport(result),
    "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs in the 1st Match of the Pakistan Women's Under-19s T20 Tri-Series 2026/27 at Iqbal Stadium, Faisalabad on Oct 2, 2026. Sadia Akter top-scored with 34 not out and Mahnoor Zeb took 3 for 24; Nishita Akter Nishi was Player of the Match."
  );
});

test("cricketMatchReport: each clause is optional; no scorecard gives the result sentence alone", () => {
  assert.equal(
    cricketMatchReport({ ...result, scorecard: [], playerOfTheMatch: null, venue: null }),
    "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs in the 1st Match of the Pakistan Women's Under-19s T20 Tri-Series 2026/27 on Oct 2, 2026."
  );
  assert.equal(
    cricketMatchReport({ ...result, scorecard: [], stage: null, date: null }),
    "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs in the Pakistan Women's Under-19s T20 Tri-Series 2026/27 at Iqbal Stadium, Faisalabad. Nishita Akter Nishi was Player of the Match."
  );
  // A bowler who took no wicket is not the best bowler; a dismissed top scorer has no "not out".
  const scorecard = [
    { teamId: "1", teamName: "A", battingLabels: [], battingRows: [{ name: "Ann", athleteId: "1", stats: ["61", "70", "5", "0", "87.14"], dismissal: "c Bo b Cy" }], bowlingLabels: [], bowlingRows: [{ name: "Dee", athleteId: "2", stats: ["4", "0", "20", "0", "5.00"] }] },
    { teamId: "2", teamName: "B", battingLabels: [], battingRows: [{ name: "Eve", athleteId: "3", stats: ["61", "55", "7", "1", "110.90"], dismissal: "not out" }], bowlingLabels: [], bowlingRows: [] },
  ];
  assert.equal(cricketMatchReport({ ...result, scorecard, playerOfTheMatch: null, venue: null, stage: null, seriesName: null, date: null }), "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs. Eve top-scored with 61 not out.");
});

test("cricketMatchReport: a tie on runs goes to the fewer balls; the best bowler is most wickets, then fewest runs", () => {
  const scorecard = [
    { teamId: "1", teamName: "A", battingLabels: [], battingRows: [{ name: "Ann", athleteId: "1", stats: ["61", "70", "5", "0", "87.14"], dismissal: "c Bo b Cy" }], bowlingLabels: [], bowlingRows: [{ name: "Dee", athleteId: "2", stats: ["4", "0", "20", "3", "5.00"] }, { name: "Fay", athleteId: "4", stats: ["4", "1", "12", "3", "3.00"] }] },
    { teamId: "2", teamName: "B", battingLabels: [], battingRows: [{ name: "Eve", athleteId: "3", stats: ["61", "80", "7", "1", "76.25"], dismissal: "not out" }], bowlingLabels: [], bowlingRows: [{ name: "Gus", athleteId: "5", stats: ["4", "0", "9", "2", "2.25"] }] },
  ];
  assert.equal(cricketMatchReport({ ...result, scorecard, playerOfTheMatch: null, venue: null, stage: null, seriesName: null, date: null }), "Bangladesh Women Under-19s beat Pakistan Women Under-19s by 30 runs. Ann top-scored with 61 and Fay took 3 for 12.");
});

test("cricketMatchReport: a fixture is a preview with the start in UTC; a live or called-off match has no sentence", () => {
  assert.equal(
    cricketMatchReport({ ...result, kind: "fixture", statusSummary: "Match scheduled to begin at 10:00", scorecard: [], playerOfTheMatch: null }),
    "Pakistan Women Under-19s play Bangladesh Women Under-19s in the 1st Match of the Pakistan Women's Under-19s T20 Tri-Series 2026/27 at Iqbal Stadium, Faisalabad on Oct 2, 2026, 05:00 UTC."
  );
  assert.equal(cricketMatchReport({ ...result, kind: "fixture", scorecard: [], venue: null, stage: null, seriesName: null, date: null }), "Pakistan Women Under-19s play Bangladesh Women Under-19s.");
  assert.equal(cricketMatchReport({ ...result, kind: "live" }), null);
  assert.equal(cricketMatchReport({ ...result, kind: { calledOff: "Postponed" } }), null);
  // A result whose summary cannot be read is not reported in words that might be wrong.
  assert.equal(cricketMatchReport({ ...result, statusSummary: "Match abandoned without a ball bowled", home: { ...PAK, winner: false }, away: { ...BAN, winner: false } }), null);
});
