import { test } from "node:test";
import assert from "node:assert/strict";
import { cricketMatchCardModel, cricketSeasonCardModel, cricketSeriesCardModel } from "../src/lib/cricketShareCards";
import type { CricketSeriesStats } from "../src/lib/cricketSeriesStats";

// Cricket series and match pages sent the site's generic share card: a series link looked like the homepage. These
// models say what each page's own card shows; the image routes only draw them.

const series = {
  name: "Sheffield Shield 2026-27",
  kind: "domestic" as const,
  formats: ["First-class"],
  start_date: "2026-10-04T00:00:00.000Z",
  end_date: "2027-03-28T00:00:00.000Z",
  match_count: 31,
  completed_count: 5,
  called_off_count: 0,
};

const stats: CricketSeriesStats = {
  matches: 5,
  batting: [{ playerId: "1", name: "Cameron Bancroft", teamId: "a", innings: 6, notOuts: 1, runs: 312, highScore: "118", average: 62.4, strikeRate: 54.1 }],
  bowling: [{ playerId: "2", name: "Scott Boland", teamId: "b", innings: 6, overs: "98", conceded: 240, wickets: 14, best: "5/31", economy: 2.45 }],
  highestScore: null,
  bestBowling: null,
};

test("cricketSeriesCardModel: kind and format as the eyebrow, the dates, then the table leader and the leaders as facts", () => {
  const card = cricketSeriesCardModel(series, stats, { team: "Western Australia", points: 18, played: 4 });
  assert.equal(card.eyebrow, "Domestic cricket · First-class");
  assert.equal(card.title, "Sheffield Shield 2026-27");
  assert.equal(card.dates, "Oct 4, 2026 – Mar 28, 2027");
  assert.deepEqual(card.facts, [
    { label: "Leads the table", value: "Western Australia · 18 pts, 4 played" },
    { label: "Most runs", value: "Cameron Bancroft · 312" },
    { label: "Most wickets", value: "Scott Boland · 14" },
  ]);
});

test("cricketSeriesCardModel: a table nobody has played in yet is not a leader", () => {
  // ESPN publishes the table before the first ball, every side on 0 from 0: the first row then says nothing.
  assert.deepEqual(cricketSeriesCardModel(series, null, { team: "New South Wales", points: 0, played: 0 }).facts, [{ label: "Matches", value: "31 matches, 5 played" }]);
});

test("cricketSeriesCardModel: with no table or leaders the facts fall back to the match count", () => {
  assert.deepEqual(cricketSeriesCardModel(series, null, null).facts, [{ label: "Matches", value: "31 matches, 5 played" }]);
  assert.deepEqual(cricketSeriesCardModel({ ...series, completed_count: 0 }, null, null).facts, [{ label: "Matches", value: "31 matches" }]);
  assert.deepEqual(cricketSeriesCardModel({ ...series, completed_count: 30, called_off_count: 1 }, null, null).facts, [{ label: "Matches", value: "31 matches, all played" }]);
  assert.deepEqual(cricketSeriesCardModel({ ...series, match_count: 0, completed_count: 0 }, null, null).facts, []);
  // Leaders alone still leave room for the match count; three facts do not.
  assert.deepEqual(
    cricketSeriesCardModel(series, stats, null).facts.map((f) => f.label),
    ["Most runs", "Most wickets", "Matches"]
  );
});

test("cricketSeriesCardModel: the eyebrow names women's and youth cricket, and a catch-all kind is plain cricket", () => {
  assert.equal(cricketSeriesCardModel({ ...series, kind: "womens-domestic", formats: ["Other OD"] }, null, null).eyebrow, "Women's domestic cricket · One-day");
  assert.equal(cricketSeriesCardModel({ ...series, kind: "other", formats: ["Youth ODI", "Other match"] }, null, null).eyebrow, "Cricket · Youth ODI");
  assert.equal(cricketSeriesCardModel({ ...series, kind: "international", formats: [] }, null, null).eyebrow, "International cricket");
  assert.equal(cricketSeriesCardModel({ ...series, start_date: null, end_date: null }, null, null).dates, null);
});

test("cricketSeasonCardModel: a season archive card names the year and how many series it holds", () => {
  const card = cricketSeasonCardModel(2025, 412);
  assert.equal(card.eyebrow, "Cricket series");
  assert.equal(card.title, "2025 Cricket Series");
  assert.equal(card.dates, null);
  assert.deepEqual(card.facts, [{ label: "Series", value: "412 series, leagues and tournaments" }]);
});

const match = {
  espn_id: "1553790",
  series_espn_id: "8046",
  series_name: "President's Trophy 2026-27",
  date: "2026-09-30T04:30:00.000Z",
  name: "Khan Research Laboratories v Hyderabad Kingsmen Academy",
  description: "14th Match",
  status_state: "post" as const,
  status_summary: "Khan Research Laboratories won by 5 wickets",
  venue: "Diamond Club Ground, Islamabad",
  home: { id: "10", name: "Khan Research Laboratories", abbreviation: "KRL", score: "233/5 (48.2/50 ov, target 230)", winner: true, logo: "https://a.espncdn.com/i/teamlogos/cricket/500/10.png" },
  away: { id: "11", name: "Hyderabad Kingsmen Academy", abbreviation: "HKA", score: "229", winner: false, logo: null },
};

test("cricketMatchCardModel: a result shows the stage and series, the date, both scores split for the big figure, the loser muted, and the result in full names", () => {
  const card = cricketMatchCardModel(match);
  assert.equal(card.eyebrow, "14th Match · President's Trophy 2026-27");
  assert.equal(card.when, "Result · Sep 30, 2026");
  assert.deepEqual(card.sides[0], { id: "10", name: "Khan Research Laboratories", logo: "https://a.espncdn.com/i/teamlogos/cricket/500/10.png", score: { main: "233/5", detail: "48.2/50 ov, target 230" }, muted: false });
  assert.deepEqual(card.sides[1], { id: "11", name: "Hyderabad Kingsmen Academy", logo: null, score: { main: "229", detail: null }, muted: true });
  assert.equal(card.middle, null);
  assert.equal(card.line, "Khan Research Laboratories beat Hyderabad Kingsmen Academy by 5 wickets");
});

test("cricketMatchCardModel: a fixture has no scores, says vs, gives the start in UTC and names the ground", () => {
  const card = cricketMatchCardModel({ ...match, status_state: "pre", status_summary: "Match scheduled to begin at 09:30", home: { ...match.home, score: null, winner: false }, away: { ...match.away, score: null } });
  assert.equal(card.when, "Sep 30, 04:30 UTC");
  assert.equal(card.sides[0].score, null);
  assert.equal(card.sides[1].score, null);
  assert.equal(card.sides[0].muted, false);
  assert.equal(card.middle, "vs");
  assert.equal(card.line, "Diamond Club Ground, Islamabad");
});

test("cricketMatchCardModel: a live match keeps both sides lit and carries ESPN's live summary", () => {
  const card = cricketMatchCardModel({ ...match, status_state: "in", status_summary: "Day 2 - Session 1", home: { ...match.home, score: "188/4 (52 ov)", winner: false }, away: { ...match.away, score: null } });
  assert.equal(card.when, "Live · Sep 30, 04:30 UTC");
  assert.deepEqual(card.sides[0].score, { main: "188/4", detail: "52 ov" });
  assert.equal(card.sides[1].score, null);
  assert.equal(card.sides[1].muted, false);
  assert.equal(card.middle, null);
  assert.equal(card.line, "Day 2 - Session 1");
});

test("cricketMatchCardModel: a called-off match says so in the middle, and an abandoned result carries the summary there", () => {
  const off = cricketMatchCardModel({ ...match, status_state: "pre", status_summary: "Match postponed due to rain", home: { ...match.home, score: null, winner: false }, away: { ...match.away, score: null } });
  assert.equal(off.when, "Sep 30, 2026 · Postponed");
  assert.equal(off.middle, "Postponed");
  assert.equal(off.line, null);
  const abandoned = cricketMatchCardModel({ ...match, status_summary: "Match abandoned without a ball bowled", home: { ...match.home, score: null, winner: false }, away: { ...match.away, score: null } });
  assert.equal(abandoned.when, "Result · Sep 30, 2026");
  assert.equal(abandoned.middle, "Match abandoned without a ball bowled");
  assert.equal(abandoned.sides[0].muted, false);
  assert.equal(abandoned.sides[1].muted, false);
  assert.equal(abandoned.line, null);
});

test("cricketMatchCardModel: a listing without stored sides still names both teams from the match name", () => {
  const card = cricketMatchCardModel({ ...match, home: null, away: null, status_state: "pre", status_summary: null });
  assert.deepEqual(card.sides.map((s) => s.name), ["Khan Research Laboratories", "Hyderabad Kingsmen Academy"]);
  assert.equal(card.sides[0].logo, null);
  assert.equal(card.sides[0].id, null);
});
