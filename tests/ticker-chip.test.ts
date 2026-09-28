import { test } from "node:test";
import assert from "node:assert/strict";
import { tickerChip } from "../src/lib/ticker";
import type { TickerGame } from "../src/lib/queries";

const base: TickerGame = {
  league: "nfl",
  espn_id: "1",
  home_name: "Denver Broncos",
  home_slug: "denver-broncos",
  home_abbr: "DEN",
  home_score: 30,
  home_score_display: null,
  home_winner: true,
  away_name: "Los Angeles Rams",
  away_slug: "los-angeles-rams",
  away_abbr: "LAR",
  away_score: 26,
  away_score_display: null,
  away_winner: false,
  completed: true,
  status_summary: null,
  status_state: "post",
  status_detail: "Final",
  date: "2026-09-27T20:25:00.000Z",
};

test("a finished NFL game: visitors first, winner flagged, status Final, label kept for old readers", () => {
  const chip = tickerChip(base);
  assert.equal(chip.league, "NFL");
  assert.equal(chip.live, false);
  assert.equal(chip.upcoming, false);
  assert.equal(chip.status, "Final");
  assert.deepEqual(chip.sides, [
    { name: "LAR", score: "26", won: false },
    { name: "DEN", score: "30", won: true },
  ]);
  assert.equal(chip.href, "/nfl/games/1");
  assert.match(chip.label, /Denver Broncos beat Los Angeles Rams 30-26/);
});

test("a game in play is live and carries the clock as its status", () => {
  const chip = tickerChip({ ...base, completed: false, status_state: "in", status_detail: "Q3 4:12", home_winner: null, away_winner: null });
  assert.equal(chip.live, true);
  assert.equal(chip.status, "Q3 4:12");
  assert.equal(chip.sides[0].won, false);
  assert.equal(chip.sides[1].won, false);
});

test("an upcoming game has no scores and a date for its status", () => {
  const chip = tickerChip({ ...base, completed: false, status_state: "pre", status_detail: null, home_score: null, away_score: null, home_winner: null, away_winner: null });
  assert.equal(chip.upcoming, true);
  assert.equal(chip.sides[0].score, null);
  assert.match(chip.status, /Sep 27/);
});

test("a cricket result shows the margin, not a scoreline, and the side that batted first first", () => {
  const chip = tickerChip({
    ...base,
    league: "odi",
    home_name: "India",
    home_abbr: "IND",
    away_name: "West Indies",
    away_abbr: "WI",
    home_score: null,
    away_score: null,
    home_score_display: "282/6 (50 ov)",
    away_score_display: "274 (49.2 ov)",
    home_winner: true,
    away_winner: false,
    status_summary: "India won by 8 runs",
  });
  assert.equal(chip.status, "won by 8 runs");
  assert.equal(chip.sides.find((s) => s.name === "IND")?.won, true);
  assert.equal(chip.sides.find((s) => s.name === "IND")?.score, "282/6 (50 ov)");
});

test("a side without an abbreviation falls back to its display name", () => {
  const chip = tickerChip({ ...base, home_abbr: null, away_abbr: null });
  assert.equal(chip.sides[1].name, "Denver Broncos");
});
