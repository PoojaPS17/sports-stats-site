// The result card's score column: a bowled-out cricket innings arrives as a plain total ("233", ESPN's
// convention) with no display string, and used to fall through to the big-numeral layout football and
// the NBA use, next to the other side's small "235/6 (44.1/50 ov, target 234)" line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameCard } from "../src/components/GameCard";
import type { GameRow } from "../src/lib/queries";

function row(extra: Partial<GameRow>): GameRow {
  return {
    league: "odi",
    espn_id: "1496580",
    date: "2026-07-16T08:30:00Z",
    name: "India v England",
    short_name: "IND v ENG",
    home_score: 233,
    away_score: 235,
    home_score_display: null,
    away_score_display: "235/6 (44.1/50 ov, target 234)",
    home_winner: false,
    away_winner: true,
    season_year: 2026,
    status_state: "post",
    status_detail: "Result",
    status_summary: "England won by 4 wkts (35b rem)",
    round: null,
    completed: true,
    local_date: "2026-07-16",
    home_team_espn_id: "6",
    away_team_espn_id: "1",
    home_name: "India",
    home_slug: "india",
    home_abbr: "IND",
    home_logo: null,
    home_color: "1d4ed8",
    away_name: "England",
    away_slug: "england",
    away_abbr: "ENG",
    away_logo: null,
    away_color: "ffffff",
    ...extra,
  } as GameRow;
}

const render = (g: GameRow) => renderToStaticMarkup(createElement(GameCard, { league: g.league, game: g }));

test("a bowled-out cricket innings prints as 'all out' on the small score line, not as a big numeral", () => {
  const html = render(row({}));
  assert.ok(html.includes("233 all out"), html);
  assert.ok(html.includes("235/6 (44.1/50 ov, target 234)"));
  assert.ok(!html.includes("score-display"), "no big-numeral score on a cricket card");
});

test("a cricket innings still in progress with a plain total prints the runs without 'all out'", () => {
  const html = render(row({ completed: false, status_state: "in", status_detail: "Day 1", home_score: 45, away_score: null, away_score_display: null, home_winner: null, away_winner: null, status_summary: null }));
  assert.ok(html.includes(">45<"), html);
  assert.ok(!html.includes("all out"));
  assert.ok(!html.includes("score-display"));
});

test("a plain-score league keeps the big numeral beside the name", () => {
  const html = render(row({ league: "nba", home_score: 110, away_score: 108, away_score_display: null, home_winner: true, away_winner: false, status_detail: "Final", status_summary: null, local_date: null, home_name: "Lakers", away_name: "Celtics" }));
  assert.ok(html.includes("score-display"));
  assert.ok(html.includes(">110<"));
  assert.ok(!html.includes("all out"));
});
