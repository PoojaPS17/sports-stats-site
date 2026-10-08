process.env.TZ = "UTC";
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chaseFigures, needLine, oversToBalls, parseCricketScore, parseNeedText, pickRightNow, storyView, type RightNowView } from "../src/lib/rightNow";
import { deriveMatchStory } from "../src/lib/cricketBalls";
import { RightNowCard } from "../src/components/home/RightNow";
import type { GameRow } from "../src/lib/queries";
import type { CricketSeriesMatch } from "../src/lib/cricketSeriesTypes";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();

const side = (name: string, score: string | null = null, extra: Partial<CricketSeriesMatch["home"] & object> = {}) => ({ id: name, name, abbreviation: null, score, winner: false, logo: null, ...extra });
const series = (id: string, over: Partial<CricketSeriesMatch> = {}): CricketSeriesMatch =>
  ({
    espn_id: id, series_espn_id: "9001", series_name: "Sample T20 Cup 2026", series_kind: "international", date: iso(-3), name: "x", short_name: null,
    description: "Final", class_card: "T20", international_class_id: "3", status_state: "in", status_summary: null,
    venue: null, home: side("Coral Coast"), away: side("Highveld"), scorecard_league: null, ...over,
  }) as CricketSeriesMatch;
const game = (id: string, over: Partial<GameRow> = {}): GameRow =>
  ({
    league: "epl", espn_id: id, date: iso(-1), name: "x", short_name: null, home_score: 1, away_score: 1, home_score_display: null, away_score_display: null,
    home_winner: null, away_winner: null, season_year: 2026, status_state: "in", status_detail: "67'", status_summary: null, round: null, completed: false,
    home_team_espn_id: "1", away_team_espn_id: "2", home_name: "Arsenal", home_slug: "arsenal", home_abbr: "ARS", home_logo: null, home_color: "ef0107",
    away_name: "Chelsea", away_slug: "chelsea", away_abbr: "CHE", away_logo: null, away_color: "034694", ...over,
  }) as GameRow;
const home = (over: Partial<Parameters<typeof pickRightNow>[0]> = {}): Parameters<typeof pickRightNow>[0] => ({ liveGames: [], liveCricket: [], upcomingGames: [], nextCricket: [], sections: [], featured: [], ...over });

/* ---------------- score text ---------------- */

test("oversToBalls reads cricket overs, not decimals", () => {
  assert.equal(oversToBalls("16.2"), 98);
  assert.equal(oversToBalls("20"), 120);
  assert.equal(oversToBalls("0.5"), 5);
  assert.equal(oversToBalls("3.7"), null);
});

test("parseCricketScore reads the forms ESPN sends", () => {
  assert.deepEqual(parseCricketScore("168/4 (16.2/20 ov, target 202)"), { runs: 168, wickets: 4, balls: 98, oversText: "16.2", limit: 20, target: 202 });
  assert.deepEqual(parseCricketScore("201/6 (20 ov)"), { runs: 201, wickets: 6, balls: 120, oversText: "20", limit: null, target: null });
  assert.deepEqual(parseCricketScore("233 all out"), { runs: 233, wickets: 10, balls: null, oversText: null, limit: null, target: null });
  assert.deepEqual(parseCricketScore("171 (19.1 ov)"), { runs: 171, wickets: 10, balls: 115, oversText: "19.1", limit: null, target: null });
  assert.deepEqual(parseCricketScore("311 & 372/6 (117 ov)"), { runs: 372, wickets: 6, balls: 702, oversText: "117", limit: null, target: null });
  assert.equal(parseCricketScore(""), null);
  assert.equal(parseCricketScore("Yet to bat"), null);
});

test("parseNeedText reads ESPN's chase sentence", () => {
  assert.deepEqual(parseNeedText("India need 52 runs from 30 balls"), { need: 52, balls: 30 });
  assert.deepEqual(parseNeedText("Punjab need 1 run in 1 ball"), { need: 1, balls: 1 });
  assert.equal(parseNeedText("Day 2: Stumps"), null);
  assert.equal(parseNeedText(null), null);
});

test("chaseFigures: need, balls, rates and ring from the score text, the sentence agreeing", () => {
  const c = chaseFigures("168/4 (16.2/20 ov, target 202)", "Coral Coast need 34 runs from 22 balls")!;
  assert.deepEqual({ need: c.need, ballsLeft: c.ballsLeft, wicketsLeft: c.wicketsLeft, target: c.target, runs: c.runs, oversText: c.oversText }, { need: 34, ballsLeft: 22, wicketsLeft: 6, target: 202, runs: 168, oversText: "16.2" });
  assert.equal(c.requiredRate, 9.27);
  assert.equal(c.currentRate, 10.29);
  assert.equal(c.fraction, 168 / 202);
  assert.equal(needLine(c), "34 off 22");
  // No sentence: the score text alone carries the same figures.
  assert.equal(chaseFigures("168/4 (16.2/20 ov, target 202)", null)!.need, 34);
});

test("chaseFigures claims nothing when the sentence and the score disagree, or the chase is over", () => {
  assert.equal(chaseFigures("168/4 (16.2/20 ov, target 202)", "Coral Coast need 35 runs from 22 balls"), null);
  assert.equal(chaseFigures("168/4 (16.2/20 ov, target 202)", "Coral Coast need 34 runs from 21 balls"), null);
  assert.equal(chaseFigures("203/4 (18.2/20 ov, target 202)", null), null);
  assert.equal(chaseFigures("168/4 (20/20 ov, target 202)", null), null);
  assert.equal(chaseFigures("201/6 (20 ov)", null), null);
  // Bowled out: ESPN writes the bare total, and the innings is over whatever the target.
  assert.equal(chaseFigures("114 (18/20 ov, target 176)", null), null);
  assert.equal(chaseFigures("168/4 (16.2 ov, target 202)", null), null);
});

/* ---------------- the rule ---------------- */

const chasing = (id: string, balls: number, over: Partial<CricketSeriesMatch> = {}) => {
  const bowled = 120 - balls;
  const overs = `${Math.floor(bowled / 6)}${bowled % 6 ? `.${bowled % 6}` : ""}`;
  return series(id, { home: side("Highveld", "201/6 (20 ov)"), away: side("Coral Coast", `150/4 (${overs}/20 ov, target 202)`), status_summary: `Coral Coast need 52 runs from ${balls} balls`, ...over });
};

test("a chase in progress is featured first, the batting-first side on top and dimmed", () => {
  const pick = pickRightNow(home({ liveGames: [game("g1", { home_score: 2, away_score: 2 })], liveCricket: [series("c0", { home: side("A", "88/2 (10 ov)"), away: side("B") }), chasing("c1", 22)] }), NOW);
  assert.equal(pick.rule, "chase");
  assert.equal(pick.href, "/cricket/matches/c1");
  assert.deepEqual(pick.sides.map((s) => [s.name, s.main, s.dim]), [["Highveld", "201/6", true], ["Coral Coast", "150/4", false]]);
  assert.equal(pick.chase!.need, 52);
  assert.equal(pick.chase!.ballsLeft, 22);
  assert.deepEqual(pick.story, { eventId: "c1", seriesId: "9001" });
  assert.equal(pick.competition, "Sample T20 Cup 2026 · Final");
});

test("of several chases the one with the fewest balls left is featured; a tie keeps the importance order", () => {
  const a = chasing("a", 40);
  const b = chasing("b", 12);
  const c = chasing("c", 12);
  assert.equal(pickRightNow(home({ liveCricket: [a, b, c] }), NOW).href, "/cricket/matches/b");
  assert.equal(pickRightNow(home({ liveCricket: [a, c, b] }), NOW).href, "/cricket/matches/c");
});

test("a chase in an archived competition links to its league game page", () => {
  const ipl = game("500", { league: "ipl", home_name: "Punjab", away_name: "Chennai", home_score: 151, away_score: 147, home_score_display: "151/1 (15.3/20 ov, target 148)", away_score_display: "147/9 (20 ov)", status_summary: "Punjab need 0 runs from 27 balls" });
  const live = game("501", { league: "ipl", home_name: "Punjab", away_name: "Chennai", home_score: 140, away_score: 147, home_score_display: "140/3 (15.3/20 ov, target 148)", away_score_display: "147/9 (20 ov)", status_summary: "Punjab need 8 runs from 27 balls" });
  const pick = pickRightNow(home({ liveGames: [ipl, live] }), NOW);
  assert.equal(pick.rule, "chase");
  assert.equal(pick.href, "/ipl/games/501");
  assert.deepEqual(pick.story, { eventId: "501", seriesId: "8048" });
  assert.deepEqual([pick.chase!.need, pick.chase!.ballsLeft, pick.chase!.target], [8, 27, 148]);
  assert.equal(pick.sides[0].name, "Chennai");
});

test("with no chase, the closest score among the games in play is featured", () => {
  const far = game("far", { home_score: 4, away_score: 0 });
  const close = game("close", { league: "nba", home_score: 100, away_score: 101, status_detail: "Q4 1:12" });
  const level = game("level", { home_score: 2, away_score: 2, date: iso(-0.5) });
  const pick = pickRightNow(home({ liveGames: [far, close, level], liveCricket: [series("c1", { home: side("A", "88/2 (10 ov)"), away: side("B") })] }), NOW);
  assert.equal(pick.rule, "closest");
  assert.equal(pick.href, "/epl/games/level");
  assert.equal(pick.why, "The closest score in play: level");
  assert.equal(pick.line, "67'");
  const two = pickRightNow(home({ liveGames: [far, close] }), NOW);
  assert.equal(two.href, "/nba/games/close");
  assert.equal(two.why, "The closest score in play: 1 apart");
});

test("a bare cricket total is an innings that ended all out, and says so", () => {
  const pick = pickRightNow(home({ liveCricket: [series("c1", { home: side("Highveld", "175/7"), away: side("Coral Coast", "114 (18/20 ov, target 176)") })] }), NOW);
  assert.equal(pick.rule, "cricket");
  assert.deepEqual(pick.sides.map((s) => [s.main, s.detail]), [["175/7", null], ["114", "all out, 18/20 ov, target 176"]]);
});

test("a first-innings match is featured when nothing else is in play, with ESPN's own line", () => {
  const first = series("c1", { home: side("Highveld", "88/2 (10 ov)"), away: side("Coral Coast"), status_summary: "Highveld, batting first, are 88/2" });
  const pick = pickRightNow(home({ liveCricket: [first] }), NOW);
  assert.equal(pick.rule, "cricket");
  assert.equal(pick.chase, null);
  assert.equal(pick.line, "Highveld, batting first, are 88/2");
  assert.equal(pick.mode, "live");
});

test("a chase whose sentence contradicts its score is shown as plain cricket, with ESPN's sentence", () => {
  const odd = chasing("c1", 22, { status_summary: "Coral Coast need 99 runs from 22 balls" });
  const pick = pickRightNow(home({ liveCricket: [odd] }), NOW);
  assert.equal(pick.rule, "cricket");
  assert.equal(pick.line, "Coral Coast need 99 runs from 22 balls");
});

test("with nothing in play: a fixture within a day is Next up, labelled as such, never live", () => {
  const soon = game("soon", { status_state: "pre", completed: false, date: iso(5), home_score: null, away_score: null, status_detail: null });
  const done = game("done", { status_state: "post", completed: true, date: iso(-6), home_score: 3, away_score: 1, home_winner: true, away_winner: false, status_summary: "Arsenal won 3-1" });
  const pick = pickRightNow(home({ upcomingGames: [soon], sections: [{ league: "epl", games: [done], liveCount: 0, windowCount: 1, snapshot: null }] }), NOW);
  assert.equal(pick.mode, "next");
  assert.equal(pick.why, "Next up");
  assert.equal(pick.href, "/epl/games/soon");
  assert.equal(pick.startIso, iso(5));
  const html = renderToStaticMarkup(createElement(RightNowCard, { view: { pick, worm: null, lastBalls: null, overNumber: null } }));
  assert.match(html, /Next up/);
  assert.doesNotMatch(html, /Live/);
});

test("with nothing in play and no fixture within a day, a result from the last two days is the Latest result", () => {
  const later = game("later", { status_state: "pre", completed: false, date: iso(80), home_score: null, away_score: null });
  const done = game("done", { status_state: "post", completed: true, date: iso(-6), home_score: 3, away_score: 1, home_winner: true, away_winner: false, status_summary: "Arsenal won 3-1" });
  const older = game("older", { status_state: "post", completed: true, date: iso(-100), home_score: 0, away_score: 0 });
  const pick = pickRightNow(home({ upcomingGames: [later], sections: [{ league: "epl", games: [older, done], liveCount: 0, windowCount: 2, snapshot: null }] }), NOW);
  assert.equal(pick.mode, "latest");
  assert.equal(pick.href, "/epl/games/done");
  assert.equal(pick.line, "Arsenal won 3-1");
  assert.deepEqual(pick.sides.map((s) => [s.name, s.main, s.dim]), [["Arsenal", "3", false], ["Chelsea", "1", true]]);
  // Nothing recent: the fixture, however far off.
  assert.equal(pickRightNow(home({ upcomingGames: [later], sections: [{ league: "epl", games: [older], liveCount: 0, windowCount: 1, snapshot: null }] }), NOW).mode, "next");
  // No fixture at all: the old result rather than nothing.
  assert.equal(pickRightNow(home({ sections: [{ league: "epl", games: [older], liveCount: 0, windowCount: 1, snapshot: null }] }), NOW).mode, "latest");
});

test("a cricket fixture counts as Next up, soonest first across sports", () => {
  const nextCricket = [series("n1", { status_state: "pre", date: iso(3), home: side("India"), away: side("Australia") })];
  const upcomingGames = [game("g1", { status_state: "pre", date: iso(10), home_score: null, away_score: null })];
  const pick = pickRightNow(home({ nextCricket, upcomingGames }), NOW);
  assert.equal(pick.mode, "next");
  assert.equal(pick.href, "/cricket/matches/n1");
});

test("no data at all is an honest empty state with a way on, not an empty box", () => {
  const pick = pickRightNow(home(), NOW);
  assert.equal(pick.mode, "none");
  const html = renderToStaticMarkup(createElement(RightNowCard, { view: { pick, worm: null, lastBalls: null, overNumber: null } }));
  assert.match(html, /<h2[^>]*>.*Right now/);
  assert.match(html, /Nothing is in play and no fixtures are stored/);
  assert.match(html, /href="\/top-games"/);
  assert.doesNotMatch(html, /Live/);
});

/* ---------------- against a real match's ball-by-ball ---------------- */

// India v West Indies, 1st T20I, Lucknow, 2026-10-06: West Indies all out for 171 (19.1 ov), India chasing 172.
const items = JSON.parse(readFileSync(new URL("./fixtures/espn-cricket-playbyplay-1529230.json", import.meta.url), "utf8")) as { period: number; over: { number: number; complete: boolean } }[];

test("a chase read off the real ball-by-ball: the card's figures equal what the match page derives", () => {
  // Cut the match after the 12th over of the chase.
  const cut = items.filter((b) => b.period === 1 || b.over.number <= 12);
  const story = deriveMatchStory(cut);
  const [first, second] = story;
  assert.equal(second.total.wickets, 2);
  // The feed's score texts at that moment.
  const firstText = `${first.total.runs} all out (${first.total.overs} ov)`;
  const bowled = Math.floor(second.total.overs) * 6 + Math.round((second.total.overs % 1) * 10);
  const secondText = `${second.total.runs}/${second.total.wickets} (${second.total.overs}/20 ov, target ${second.target})`;
  assert.equal(firstText, "171 all out (19.1 ov)");
  const need = second.target! - second.total.runs;
  const left = 120 - bowled;
  const live = series("1529230", { series_espn_id: "8048-2026", home: side("West Indies", firstText), away: side("India", secondText), status_summary: `India need ${need} runs from ${left} balls`, class_card: "T20I" });
  const pick = pickRightNow(home({ liveCricket: [live] }), NOW);
  assert.equal(pick.rule, "chase");
  assert.deepEqual([pick.chase!.need, pick.chase!.ballsLeft, pick.chase!.runs, pick.chase!.wicketsLeft], [need, left, second.total.runs, 8]);
  assert.equal(pick.sides[0].main, "171");
  assert.equal(pick.sides[0].detail, "all out, 19.1 ov");
  assert.equal(pick.sides[1].main, `${second.total.runs}/2`);
  // The chart and the latest over come from the same story the match page draws.
  const view = storyView(story);
  assert.equal(view.worm!.lines.length, 2);
  assert.equal(view.worm!.lines.filter((l) => l.chasing).length, 1);
  assert.equal(view.overNumber, 12);
  assert.deepEqual(view.lastBalls, second.overs.at(-1)!.balls.map((b) => b.symbol));
  const html = renderToStaticMarkup(createElement(RightNowCard, { view: { pick, ...view } satisfies RightNowView }));
  assert.match(html, new RegExp(`<b>${need}</b><span>off ${left}</span>`));
  assert.match(html, /Live · 2nd innings/);
  assert.match(html, /171<\/span>/);
  assert.match(html, /href="\/cricket\/matches\/1529230"/);
  assert.equal((html.match(/<h2/g) ?? []).length, 1);
  assert.equal((html.match(/<h1/g) ?? []).length, 0);
  assert.match(html, /Wickets left<\/span><b>8</);
});

test("the story needs two innings; with one, the card draws without a chart", () => {
  const story = deriveMatchStory(items.filter((b) => b.period === 1));
  assert.deepEqual(storyView(story), { worm: null, lastBalls: null, overNumber: null });
});

test("the card source: one section, nothing hidden from the HTML, no hard-coded figures", () => {
  const src = readFileSync(new URL("../src/components/home/RightNow.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /display:\s*none|className="[^"]*\bhidden\b/);
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<div className="home-firstvisit">\s*<RightNow \/>/);
});
