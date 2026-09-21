// Final review, Important 2 and Minor 12: the calendar prints the pill's normalised stage, and files a cricket fixture
// with no start time under its local day.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEvent } from "../src/lib/ics";
import type { GameRow } from "../src/lib/queries";

const ipl = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "ipl", espn_id: "1", date: "2025-05-04T14:00:00Z", local_date: null, name: "x", short_name: null,
    home_score: 180, away_score: 175, home_score_display: "180/5 (20 ov)", away_score_display: "175/8 (20 ov, target 181)", home_winner: true, away_winner: false,
    season_year: 2025, status_state: "post", status_detail: "Final", status_summary: "Mumbai won by 5 runs", round: null, completed: true,
    home_team_espn_id: "1", away_team_espn_id: "2",
    home_name: "Mumbai", home_slug: "mumbai", home_abbr: "MI", home_logo: null, home_color: null,
    away_name: "Chennai", away_slug: "chennai", away_abbr: "CSK", away_logo: null, away_color: null,
    ...over,
  }) as GameRow;

/* ---- 2. the calendar's stage line ------------------------------------------- */

test("the calendar's stage line is the pill's: normalised, and nothing for a truncated group tag", () => {
  const stageLine = (round: string) => gameEvent("t20wc" as never, ipl({ league: "t20wc" as never, round })).description!.split("\n")[1];
  assert.equal(stageLine("2nd QF"), "2nd Quarter-Final");
  assert.equal(stageLine("1st Semi Final"), "1st Semi-Final");
  assert.equal(stageLine("3rd Place Play-Off"), "3rd Place Play-off");
  // "2nd Super" is suppressed on purpose everywhere else: the line after the league is the result, not a stage
  assert.match(stageLine("2nd Super"), /^Result/);
  // an unrecognised label still passes through as given
  assert.equal(stageLine("Match 12"), "Match 12");
});

test("a cricket fixture with no start time is an all-day event on its local day, as every other surface files it", () => {
  const tbd = { completed: false, status_state: "pre", status_detail: "TBD", home_score: null, away_score: null, home_score_display: null, away_score_display: null, status_summary: null } as const;
  // 23:30 UTC on the 25th is the 26th in Melbourne
  const ev = gameEvent("test", ipl({ league: "test", date: "2025-12-25T23:30:00Z", local_date: "2025-12-26", ...tbd }));
  assert.equal(ev.allDay, true);
  assert.equal(ev.start.toISOString(), "2025-12-26T00:00:00.000Z");
  // no local date stored: the league's day-zone rule, unchanged (cricket's zone is UTC)
  assert.equal(gameEvent("test", ipl({ league: "test", date: "2025-12-25T23:30:00Z", local_date: null, ...tbd })).start.toISOString(), "2025-12-25T00:00:00.000Z");
});
