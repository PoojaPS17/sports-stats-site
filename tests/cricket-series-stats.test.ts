import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregateSeriesStats, cricketSeriesSoFar, seriesLeadersClause, type SeriesStatRow } from "../src/lib/cricketSeriesStats";
import { CricketSeriesLeaders } from "../src/components/CricketSeriesLeaders";

// Search Console, 2026-10-06: the series pages of small competitions (CSA Women Pro50, Canada Super 60 Women) are the
// pages that earn clicks. This block gives them the leaders Cricinfo keeps on a separate tab and the aggregators
// do not have, summed from the per-match figures the top-up stores (see scripts/lib/cricket-series-stats.ts).

const bat = (runs: number, ballsFaced: number | null, notOut = false) => ({ runs, ballsFaced, fours: null, sixes: null, notOut });
const bowl = (overs: number, conceded: number, wickets: number) => ({ overs, conceded, wickets });
const row = (match: string, stage: string, player: string, name: string, team: string, stats: SeriesStatRow["stats"]): SeriesStatRow => ({
  match_espn_id: match,
  stage,
  player_espn_id: player,
  player_name: name,
  team_espn_id: team,
  stats,
});

const ROWS: SeriesStatRow[] = [
  row("m1", "1st Match", "p1", "Ann Alpha", "10", { batting: bat(60, 40) }),
  row("m2", "2nd Match", "p1", "Ann Alpha", "10", { batting: bat(26, 20, true) }),
  row("m1", "1st Match", "p2", "Cat Bravo", "20", { batting: bat(86, 70, true) }),
  row("m2", "2nd Match", "p2", "Cat Bravo", "20", { batting: bat(10, 12) }),
  row("m1", "1st Match", "p3", "Dee Bravo", "20", { bowling: bowl(4, 30, 3) }),
  row("m2", "2nd Match", "p3", "Dee Bravo", "20", { bowling: bowl(4, 23, 4) }),
  row("m1", "1st Match", "p4", "Bea Alpha", "10", { bowling: bowl(3.3, 20, 2) }),
  row("m2", "2nd Match", "p4", "Bea Alpha", "10", { bowling: bowl(4, 30, 2) }),
  // A first-class match: two innings, counted per innings (the totals are the match's).
  row("m3", "Final", "p5", "Eve Alpha", "10", {
    batting: bat(125, 230, false),
    innings: [
      { n: 1, batting: bat(120, 200) },
      { n: 3, batting: bat(5, 30, true) },
    ],
  }),
  // In the XI without batting or bowling: an appearance, not a leader.
  row("m3", "Final", "p6", "Fay Bravo", "20", {}),
];

test("aggregateSeriesStats: batting leaders by runs, with innings, not outs, high score, average and strike rate", () => {
  const s = aggregateSeriesStats(ROWS);
  assert.equal(s.matches, 3);
  assert.deepEqual(
    s.batting.map((b) => [b.name, b.innings, b.notOuts, b.runs, b.highScore, b.average, b.strikeRate]),
    [
      ["Eve Alpha", 2, 1, 125, "120", 125, 54.35],
      ["Cat Bravo", 2, 1, 96, "86*", 96, 117.07],
      ["Ann Alpha", 2, 1, 86, "60", 86, 143.33],
    ]
  );
  assert.ok(!s.batting.some((b) => b.name === "Fay Bravo"));
});

test("aggregateSeriesStats: bowling leaders by wickets, overs summed as balls, best figures and economy", () => {
  const s = aggregateSeriesStats(ROWS);
  assert.deepEqual(
    s.bowling.map((b) => [b.name, b.innings, b.overs, b.conceded, b.wickets, b.best, b.economy]),
    [
      ["Dee Bravo", 2, "8", 53, 7, "4/23", 6.63],
      ["Bea Alpha", 2, "7.3", 50, 4, "2/20", 6.67],
    ]
  );
});

test("aggregateSeriesStats: the highest score and best bowling figures name the match; a not out carries its star", () => {
  const s = aggregateSeriesStats(ROWS);
  assert.deepEqual(s.highestScore, { playerId: "p5", name: "Eve Alpha", teamId: "10", figure: "120", matchId: "m3", stage: "Final" });
  assert.deepEqual(s.bestBowling, { playerId: "p3", name: "Dee Bravo", teamId: "20", figure: "4/23", matchId: "m2", stage: "2nd Match" });
  // A tie on runs: the not out innings is the higher score.
  const tie = aggregateSeriesStats([row("m1", "1st", "a", "A", "1", { batting: bat(50, 40) }), row("m2", "2nd", "b", "B", "1", { batting: bat(50, 40, true) })]);
  assert.equal(tie.highestScore?.figure, "50*");
  assert.equal(tie.highestScore?.playerId, "b");
});

test("aggregateSeriesStats: averages and strike rates are null when nothing divides them; lists keep the limit; nothing in gives nothing out", () => {
  const s = aggregateSeriesStats([row("m1", "1st", "a", "A", "1", { batting: bat(30, null, true), bowling: bowl(0, 0, 0) })]);
  assert.equal(s.batting[0].average, null);
  assert.equal(s.batting[0].strikeRate, null);
  assert.equal(s.bowling.length, 0, "no overs bowled is not a bowling innings");
  assert.equal(aggregateSeriesStats(ROWS, 2).batting.length, 2);
  assert.equal(aggregateSeriesStats(ROWS, 2).bowling.length, 2);
  const empty = aggregateSeriesStats([]);
  assert.deepEqual([empty.matches, empty.batting, empty.bowling, empty.highestScore, empty.bestBowling], [0, [], [], null, null]);
});

test("seriesLeadersClause and cricketSeriesSoFar: the table leader, the latest result, the next fixture and the leaders in one paragraph", () => {
  const stats = aggregateSeriesStats(ROWS);
  assert.equal(seriesLeadersClause(stats), "Most runs: Eve Alpha (125); most wickets: Dee Bravo (7).");
  assert.equal(seriesLeadersClause(aggregateSeriesStats([])), null);
  const text = cricketSeriesSoFar({
    leader: { team: "Titans Women", points: 5, played: 1 },
    lastResult: { name: "Titans Women v Dolphins Women", stage: "3rd Match", summary: "Titans WMN won by 86 runs" },
    nextFixture: { name: "Titans Women v Lions Women", stage: "4th Match", date: "2026-10-10T08:00:00Z" },
    stats,
    finished: false,
  });
  assert.equal(
    text,
    "Titans Women lead the points table with 5 points from 1 match. Latest result: Titans Women vs Dolphins Women, 3rd Match: Titans WMN won by 86 runs. Next: Titans Women vs Lions Women, 4th Match, Oct 10. Most runs: Eve Alpha (125); most wickets: Dee Bravo (7)."
  );
  assert.equal(
    cricketSeriesSoFar({ leader: { team: "Titans Women", points: 15, played: 7 }, lastResult: { name: "A v B", stage: null, summary: null }, nextFixture: null, stats: null, finished: true }),
    "Titans Women finished top of the points table with 15 points from 7 matches. Latest result: A vs B."
  );
  assert.equal(cricketSeriesSoFar({ leader: null, lastResult: null, nextFixture: null, stats: null, finished: false }), "");
  // Before the first match, ESPN's table has a top row with nothing played: "lead the points table with 0 points from
  // 0 matches" (Sheffield Shield 2026-27, live, 2026-10-06) says nothing, so the leader waits for a result.
  assert.equal(
    cricketSeriesSoFar({ leader: { team: "New South Wales", points: 0, played: 0 }, lastResult: null, nextFixture: { name: "Victoria v South Australia", stage: "1st Match", date: "2026-10-06T23:30:00Z" }, stats: null, finished: false }),
    "Next: Victoria vs South Australia, 1st Match, Oct 6."
  );
});

test("CricketSeriesLeaders: a Series stats heading, a batting and a bowling table with team short names, and the highlights line", () => {
  const teams = [
    { id: "10", name: "Alpha Women", abbreviation: "ALP", logo: null },
    { id: "20", name: "Bravo Women", abbreviation: "BRV", logo: null },
  ];
  const html = renderToStaticMarkup(createElement(CricketSeriesLeaders, { stats: aggregateSeriesStats(ROWS), teams }));
  assert.match(html, /<h2[^>]*>.*Series stats/);
  for (const col of ["Inns", "Runs", "HS", "Avg", "SR", "Wkts", "Best", "Econ"]) assert.match(html, new RegExp(`<th[^>]*>${col}</th>`), col);
  assert.match(html, /Eve Alpha/);
  assert.match(html, /ALP/);
  assert.match(html, /86\*/);
  assert.match(html, /4\/23/);
  assert.match(html, /Highest score/);
  assert.match(html, /Best bowling/);
  assert.match(html, /Final/);
  assert.equal(renderToStaticMarkup(createElement(CricketSeriesLeaders, { stats: aggregateSeriesStats([]), teams })), "");
  assert.equal(renderToStaticMarkup(createElement(CricketSeriesLeaders, { stats: null, teams })), "");
});
