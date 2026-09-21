// Cricket match labels the way Cricinfo writes them: a finished match not called "Final" unless it is
// the final, the venue's city named once, the side that batted first listed first, and "India Women"
// not "India-W". (Averages and strike rates are in cricket-format.test.ts.)
process.env.TZ = "Australia/Sydney";
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { battingFirstSide, battingFirstTeamId, scoreLineOrder } from "../src/lib/cricketOrder";
import { teamDisplayName } from "../src/lib/teamName";
import { MatchScoreHeader } from "../src/components/MatchScoreHeader";
import { MatchHeader } from "../src/components/MatchHeader";
import { MatchFacts, venueNamesCity } from "../src/components/MatchFacts";
import { GameCard } from "../src/components/GameCard";
import type { GameRow } from "../src/lib/queries";
import type { CricketTeamScorecard, GameDetails } from "../src/lib/matchDetail";

/* ---- game rows ---------------------------------------------------------- */

const game = (over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "test", espn_id: "1455614", date: "2025-12-25T23:30:00Z", name: "England v Australia", short_name: null,
    home_score: 4, away_score: 2, home_score_display: "132 & 4/0", away_score_display: "152 & 110", home_winner: true, away_winner: false,
    season_year: 2025, status_state: "post", status_detail: "Final", status_summary: "England won by 10 wickets", round: null, completed: true,
    home_team_espn_id: "1", away_team_espn_id: "2",
    home_name: "England", home_slug: "england", home_abbr: "ENG", home_logo: null, home_color: null,
    away_name: "Australia", away_slug: "australia", away_abbr: "AUS", away_logo: null, away_color: null,
    local_date: "2025-12-26", end_date: "2025-12-27",
    ...over,
  }) as GameRow;

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("a finished Test, ODI or T20 header does not say Final; the final does; other sports are unchanged", () => {
  assert.match(text(renderToStaticMarkup(createElement(MatchScoreHeader, { league: "test", game: game() }))), /Result · Dec 26-27, 2025/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(MatchScoreHeader, { league: "test", game: game() })), /Final/);
  for (const league of ["odi", "t20i", "wbbl", "ipl"] as const) {
    const html = renderToStaticMarkup(createElement(MatchScoreHeader, { league, game: game({ league, local_date: "2025-12-26", end_date: null }) }));
    assert.match(text(html), /Result · Fri, Dec 26, 2025/, league);
    assert.doesNotMatch(html, /Final ·/, league);
  }
  // a stage names the match: the final is the Final, a knockout is what it is
  assert.match(text(renderToStaticMarkup(createElement(MatchScoreHeader, { league: "ipl", game: game({ league: "ipl", round: "Final", end_date: null }) }))), /Final · Fri, Dec 26, 2025/);
  assert.match(text(renderToStaticMarkup(createElement(MatchScoreHeader, { league: "ipl", game: game({ league: "ipl", round: "Qualifier 1", end_date: null }) }))), /Qualifier 1 ·/);
  assert.match(text(renderToStaticMarkup(createElement(MatchScoreHeader, { league: "nba", game: game({ league: "nba", local_date: null, end_date: null, date: "2026-06-08T02:00:00Z" }) }))), /Final · Sun, Jun 7, 2026/);
});

test("the match page header prints the local date, as a range for a Test that ran several days", () => {
  const range = text(renderToStaticMarkup(createElement(MatchHeader, { league: "test", game: game({ local_date: "2025-12-26", end_date: "2025-12-30" }) })));
  assert.match(range, /Dec 26-30, 2025/);
  assert.doesNotMatch(range, /Dec 25/);
  const morning = text(renderToStaticMarkup(createElement(MatchHeader, { league: "wbbl", game: game({ league: "wbbl", date: "2024-11-23T23:00:00Z", local_date: "2024-11-24", end_date: null }) })));
  assert.match(morning, /Sun, Nov 24, 2024/);
  // a row with no stored local day is its UTC day, as before
  assert.match(text(renderToStaticMarkup(createElement(MatchHeader, { league: "test", game: game({ local_date: null, end_date: null }) }))), /Thu, Dec 25, 2025/);
});

/* ---- venue -------------------------------------------------------------- */

const details = (venue: string | null, city: string | null): GameDetails =>
  ({ venue, city, attendance: null, officials: [], linescores: null, events: [], lineups: [], team_stats: [], player_box: [], scorecard: [], leaders: [], win_probability: [] }) as GameDetails;

test("the venue prints its city once", () => {
  const facts = (venue: string | null, city: string | null) => text(renderToStaticMarkup(createElement(MatchFacts, { league: "ipl", game: game({ league: "ipl" }), details: details(venue, city) })));
  assert.match(facts("Wankhede Stadium, Mumbai", "Mumbai"), /Wankhede Stadium, Mumbai\s*$/);
  assert.doesNotMatch(facts("Wankhede Stadium, Mumbai", "Mumbai"), /Mumbai, Mumbai/);
  assert.doesNotMatch(facts("Arun Jaitley Stadium, Delhi", "delhi"), /Delhi, delhi/i);
  // a city that is only part of the ground's name is still worth naming, as Cricinfo does
  assert.match(facts("Melbourne Cricket Ground", "Melbourne"), /Melbourne Cricket Ground, Melbourne/);
  assert.match(facts("Kensington Oval", "Bridgetown"), /Kensington Oval, Bridgetown/);
  assert.match(facts("Kensington Oval", null), /Kensington Oval/);
  assert.equal(venueNamesCity("Eden Gardens, Kolkata", "Kolkata"), true);
  assert.equal(venueNamesCity("Eden Gardens", "Kolkata"), false);
  assert.equal(venueNamesCity("Kolkata", "Kolkata"), false);
  // the city can be any part after the ground's name, not only the last (the review's Szodliget example)
  assert.equal(venueNamesCity("GB Oval, Szodliget, Budapest", "Szodliget"), true);
  assert.equal(venueNamesCity("GB Oval, Szodliget, Budapest", " szodliget "), true);
  assert.doesNotMatch(facts("GB Oval, Szodliget, Budapest", "Szodliget"), /Szodliget, Szodliget|Budapest, Szodliget/);
  assert.match(facts("GB Oval, Szodliget, Budapest", "Szodliget"), /GB Oval, Szodliget, Budapest\s*$/);
  assert.equal(venueNamesCity("Szodliget Oval, Budapest", "Szodliget"), false, "part of a name is not the city");
});

/* ---- batting order ------------------------------------------------------ */

const espnCard = (firstId: string): CricketTeamScorecard[] => [
  // ESPN lists the roster's teams in its own order; the innings numbers say who batted first
  { teamId: "1", teamName: "England", battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: "a", name: "A", stats: [], innings: firstId === "1" ? 1 : 2 }], bowlingRows: [], innings: [{ period: firstId === "1" ? 1 : 2, runs: 132, wickets: 10, overs: 40, description: "all out" }] },
  { teamId: "2", teamName: "Australia", battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: "b", name: "B", stats: [], innings: firstId === "2" ? 1 : 2 }], bowlingRows: [], innings: [{ period: firstId === "2" ? 1 : 2, runs: 152, wickets: 10, overs: 41, description: "all out" }] },
];

test("the side that batted first is read from the stored scorecard", () => {
  assert.equal(battingFirstTeamId(espnCard("2")), "2");
  assert.equal(battingFirstTeamId(espnCard("1")), "1");
  // a scorecard from before innings totals were stored: the batting rows are numbered
  const rowsOnly = espnCard("2").map((e) => ({ ...e, innings: undefined }));
  assert.equal(battingFirstTeamId(rowsOnly), "2");
  // Cricsheet's scorecard: one entry per innings, in match order, unnumbered
  const cricsheet = [
    { teamId: "2", teamName: "Australia", battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: "b", name: "B", stats: [] }], bowlingRows: [] },
    { teamId: "1", teamName: "England", battingLabels: [], bowlingLabels: [], battingRows: [{ athleteId: "a", name: "A", stats: [] }], bowlingRows: [] },
  ] as CricketTeamScorecard[];
  assert.equal(battingFirstTeamId(cricsheet), "2");
  assert.equal(battingFirstTeamId([]), null);
  assert.equal(battingFirstTeamId(undefined), null);
});

test("with no scorecard, a limited-overs score line says who chased, and a Test does not guess", () => {
  const t20 = game({ league: "ipl", home_score_display: "151/1 (15.3/20 ov, target 148)", away_score_display: "147/9 (20 ov)" });
  assert.equal(battingFirstSide(t20), "away");
  assert.deepEqual(scoreLineOrder(t20), ["away", "home"]);
  const homeFirst = game({ league: "ipl", home_score_display: "147/9 (20 ov)", away_score_display: "151/1 (15.3/20 ov, target 148)" });
  assert.equal(battingFirstSide(homeFirst), "home");
  assert.deepEqual(scoreLineOrder(homeFirst), ["home", "away"]);
  // no target on either line (no result), or a Test with a target: order unknown, usual order
  assert.equal(battingFirstSide(game({ league: "ipl", home_score_display: "5/0", away_score_display: null })), null);
  assert.equal(battingFirstSide(game({ league: "test", home_score_display: "254 & 258 (95.2 ov, target 271)", away_score_display: "270 & 300" })), null);
  // and never for another sport
  assert.equal(battingFirstSide(game({ league: "nba", home_score_display: "target" })), null);
});

test("a scorecard beats the score-line guess, and the headers list the batting-first side first", () => {
  // the team lines, not the Follow button's title ("Follow Australia vs England"), which names the sides in a fixed order
  const order = (html: string) => [html.search(/>Australia</), html.search(/>England</)];
  // ESPN's home side England batted second here; the card's usual order (away, home) is Australia first anyway
  const away = renderToStaticMarkup(createElement(MatchHeader, { league: "test", game: game(), scorecard: espnCard("2") }));
  assert.ok(order(away)[0] < order(away)[1], "Australia (batted first) before England");
  // England batted first: England is listed first, though it is the home side
  const home = renderToStaticMarkup(createElement(MatchHeader, { league: "test", game: game(), scorecard: espnCard("1") }));
  assert.ok(order(home)[1] < order(home)[0], "England (batted first) before Australia");
  const image = renderToStaticMarkup(createElement(MatchScoreHeader, { league: "test", game: game(), scorecard: espnCard("1") }));
  assert.ok(order(image)[1] < order(image)[0], "the export header agrees");
  // no scorecard: the usual order, away first
  const plain = renderToStaticMarkup(createElement(MatchHeader, { league: "test", game: game() }));
  assert.ok(order(plain)[0] < order(plain)[1]);
});

test("a game card in the fixtures list orders a chased match by its score lines, and other sports by away-then-home", () => {
  const chased = game({ league: "ipl", home_score_display: "147/9 (20 ov)", away_score_display: "151/1 (15.3/20 ov, target 148)", home_winner: false, away_winner: true });
  const html = renderToStaticMarkup(createElement(GameCard, { league: "ipl", game: chased }));
  assert.ok(html.search(/>England</) < html.search(/>Australia</), "the home side batted first, so it is listed first");
  const nba = renderToStaticMarkup(createElement(GameCard, { league: "nba", game: game({ league: "nba", home_score_display: null, away_score_display: null, local_date: null }) }));
  assert.ok(nba.search(/>Australia</) < nba.search(/>England</));
});

/* ---- women's names ------------------------------------------------------ */

test("a women's side reads 'India Women', and only the display changes", () => {
  assert.equal(teamDisplayName("India Women"), "India Women");
  assert.equal(teamDisplayName("India Women won by 5 wickets"), "India Women won by 5 wickets");
  assert.equal(teamDisplayName(null), null);
  const g = game({ league: "wt20i", home_name: "India Women", home_slug: "india-women", home_abbr: "IND-W", away_name: "Australia Women", away_slug: "australia-women", away_abbr: "AUS-W" });
  const header = renderToStaticMarkup(createElement(MatchHeader, { league: "wt20i", game: g }));
  assert.match(header, /India Women/);
  assert.doesNotMatch(header, /India-W/);
  assert.match(header, /href="\/wt20i\/teams\/india-women"/); // the URL is the slug, unchanged
  // the compact card keeps ESPN's own abbreviation in its narrow column
  const card = renderToStaticMarkup(createElement(GameCard, { league: "wt20i", game: g }));
  assert.match(card, />IND-W</);
  assert.match(card, />India Women</);
});
