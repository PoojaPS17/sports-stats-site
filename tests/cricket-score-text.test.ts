// One rule for how a cricket side's score prints, used by every surface that shows one: a bowled-out
// innings arrives as a plain total with no display string and reads "233 all out" once the match is over.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sideScoreText, splitScoreText } from "../src/lib/gameDisplay";
import { MatchHeader } from "../src/components/MatchHeader";
import { SpotlightCard } from "../src/components/SpotlightCard";
import { MatchScoreHeader } from "../src/components/MatchScoreHeader";
import type { GameRow } from "../src/lib/queries";

function odi(extra: Partial<GameRow> = {}): GameRow {
  return {
    league: "odi", espn_id: "1496580", date: "2026-07-16T08:30:00Z", name: "India v England", short_name: "IND v ENG",
    home_score: 233, away_score: 235, home_score_display: null, away_score_display: "235/6 (44.1/50 ov, target 234)",
    home_winner: false, away_winner: true, season_year: 2026, status_state: "post", status_detail: "Result",
    status_summary: "England won by 4 wkts (35b rem)", round: null, completed: true, local_date: "2026-07-16",
    home_team_espn_id: "6", away_team_espn_id: "1", home_name: "India", home_slug: "india", home_abbr: "IND", home_logo: null, home_color: null,
    away_name: "England", away_slug: "england", away_abbr: "ENG", away_logo: null, away_color: null, ...extra,
  } as GameRow;
}

test("sideScoreText: a finished cricket innings with a plain total reads 'all out'; anything else keeps its string", () => {
  assert.equal(sideScoreText("odi", 233, null, true), "233 all out");
  assert.equal(sideScoreText("odi", 235, "235/6 (44.1/50 ov, target 234)", true), "235/6 (44.1/50 ov, target 234)");
  assert.equal(sideScoreText("odi", 45, null, false), "45");
  assert.equal(sideScoreText("odi", null, null, true), null);
  // a plain-score league never gains a display string
  assert.equal(sideScoreText("nba", 110, null, true), null);
  assert.equal(sideScoreText("epl", 2, null, true), null);
});

test("splitScoreText: the big figure and the small detail of a cricket score", () => {
  assert.deepEqual(splitScoreText("235/6 (44.1/50 ov, target 234)"), { main: "235/6", detail: "44.1/50 ov, target 234" });
  assert.deepEqual(splitScoreText("233 all out"), { main: "233", detail: "all out" });
  assert.deepEqual(splitScoreText("387/3"), { main: "387/3", detail: null });
  assert.deepEqual(splitScoreText("194 (24.5/25 ov)"), { main: "194", detail: "24.5/25 ov" });
});

test("the match header keeps the figure beside the name and puts the overs, target or 'all out' on a small line under it", () => {
  // At phone width the whole "235/6 (44.1/50 ov, target 234)" beside the name squeezed the name out of the row.
  const html = renderToStaticMarkup(createElement(MatchHeader, { league: "odi", game: odi() }));
  assert.ok(html.includes(">235/6<"), html);
  assert.ok(html.includes(">44.1/50 ov, target 234<"), html);
  assert.ok(!html.includes("235/6 (44.1/50 ov, target 234)"));
  assert.ok(html.includes(">233<"), html);
  assert.ok(html.includes(">all out<"), html);
  assert.ok(!html.includes("233 all out"));
  // the detail sits under the name, inside the team link, so it comes before the figure in the markup
  assert.ok(html.indexOf(">44.1/50 ov, target 234<") < html.indexOf(">235/6<"));
  // a plain score has no detail line
  const nba = renderToStaticMarkup(createElement(MatchHeader, { league: "nba", game: odi({ league: "nba", home_score: 110, away_score: 108, away_score_display: null, home_winner: true, away_winner: false, local_date: null }) }));
  assert.ok(nba.includes(">110<"));
  assert.ok(!nba.includes("all out"));
});

test("the spotlight card puts both cricket sides on the small line, the bowled-out side as 'all out'", () => {
  const html = renderToStaticMarkup(createElement(SpotlightCard, { game: odi() }));
  assert.ok(html.includes("233 all out"), html);
  assert.ok(!html.includes("text-[52px]"), "no big numeral on a cricket spotlight");
});

test("the export score header (shared by the downloadable cards) prints 'all out'", () => {
  const html = renderToStaticMarkup(createElement(MatchScoreHeader, { league: "odi", game: odi() }));
  assert.ok(html.includes("233 all out"), html);
});
