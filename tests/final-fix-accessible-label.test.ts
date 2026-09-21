// Final review, Important 1 and Minor 8: a cricket card's accessible name reads in the card's own order and ends in the
// pill's own word.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { gameAccessibleLabel } from "../src/lib/gameDisplay";
import { GameCard } from "../src/components/GameCard";
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
const upcomingIpl = () => ipl({ completed: false, status_state: "pre", status_detail: "Scheduled", home_score: null, away_score: null, home_score_display: null, away_score_display: null, status_summary: null, home_winner: null, away_winner: null });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const firstTeam = (s: string) => (s.search(/Mumbai/) < s.search(/Chennai/) ? "Mumbai" : "Chennai");
const cardRows = (g: GameRow) => text(renderToStaticMarkup(createElement(GameCard, { league: g.league, game: g })));

/* ---- 1. accessible name of a cricket card ----------------------------------- */

test("a finished cricket card's accessible name lists the sides in the card's order and ends in the pill's word", () => {
  const g = ipl();
  const label = gameAccessibleLabel("ipl", g);
  // Mumbai (home) batted first: the chaser's line carries the target, so the card lists Mumbai on top
  assert.equal(firstTeam(cardRows(g)), "Mumbai");
  assert.equal(label, "Mumbai 180/5 (20 ov), Chennai 175/8 (20 ov, target 181), Result");
  assert.equal(firstTeam(label), firstTeam(cardRows(g)));
  assert.match(cardRows(g), /Result/, "the pill prints Result");
  // the away side batted first: the card and the label both flip
  const flipped = ipl({ home_score_display: "175/8 (20 ov, target 181)", away_score_display: "180/5 (20 ov)" });
  assert.equal(firstTeam(cardRows(flipped)), "Chennai");
  assert.equal(firstTeam(gameAccessibleLabel("ipl", flipped)), "Chennai");
  // a stage replaces the word on the pill and on the name
  assert.match(gameAccessibleLabel("ipl", ipl({ round: "Qualifier 1" })), /, Qualifier 1$/);
  assert.match(gameAccessibleLabel("ipl", ipl({ round: "Final" })), /, Final$/);
});

test("an upcoming cricket card's accessible name reads 'v', home side first, as the match page's title does", () => {
  const label = gameAccessibleLabel("ipl", upcomingIpl());
  assert.match(label, /^Mumbai v Chennai, /);
  assert.doesNotMatch(label, / at /);
  // the US leagues keep "at", football keeps "v"
  assert.match(gameAccessibleLabel("nba", { ...upcomingIpl(), league: "nba" } as GameRow), /^Chennai at Mumbai, /);
  assert.match(gameAccessibleLabel("epl", { ...upcomingIpl(), league: "epl" } as GameRow), /^Mumbai v Chennai, /);
});
