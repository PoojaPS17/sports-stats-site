import { test } from "node:test";
import assert from "node:assert/strict";
import { gameDescription, gameSides, gameSections, hasTeamStats, matchContextView, teamStatsFraming } from "../src/lib/gamePage";

const game = (over: Record<string, unknown> = {}) => ({
  completed: false,
  status_state: "pre" as string | null,
  status_detail: "Scheduled" as string | null,
  status_summary: null as string | null,
  home_name: "Arsenal",
  away_name: "Chelsea",
  ...over,
});
const calledOff = (detail = "Postponed") => game({ status_state: "post", status_detail: detail });
const finished = (over: Record<string, unknown> = {}) => game({ completed: true, status_state: "post", status_detail: "FT", ...over });

const PRE_MATCH = /pre-match|win probability|will be played|upcoming|kickoff|coming into/i;

/* ---- gameSides ---------------------------------------------------------- */

test("gameSides: the US leagues name the visitors first, football and cricket the home side first", () => {
  assert.deepEqual(gameSides("nba", game()), { first: "Chelsea", second: "Arsenal", awayFirst: true });
  assert.deepEqual(gameSides("nfl", game()), { first: "Chelsea", second: "Arsenal", awayFirst: true });
  assert.deepEqual(gameSides("epl", game()), { first: "Arsenal", second: "Chelsea", awayFirst: false });
  assert.deepEqual(gameSides("ipl", game()), { first: "Arsenal", second: "Chelsea", awayFirst: false });
});

/* ---- gameDescription ---------------------------------------------------- */

const D = "Sep 20, 2026";

test("gameDescription: a normal soccer fixture still mentions team form, head-to-head and the pre-match probability", () => {
  assert.equal(
    gameDescription("epl", game(), D, ""),
    "Premier League: Arsenal v Chelsea, Sep 20, 2026. Team form, head-to-head record and pre-match win probability."
  );
});

test("gameDescription: a normal NBA fixture names the visitors first", () => {
  assert.equal(
    gameDescription("nba", game(), D, " at Capital One Arena"),
    "NBA: Chelsea at Arsenal at Capital One Arena, Sep 20, 2026. Team form, head-to-head record and pre-match win probability."
  );
});

test("gameDescription: a finished soccer game lists its scorers and what the page covers", () => {
  assert.equal(
    gameDescription("epl", finished(), D, "", " Goals: Saka 12'."),
    "Premier League: Arsenal v Chelsea, Sep 20, 2026. Goals: Saka 12'. Line-ups, timeline, team stats, box score and head-to-head."
  );
});

test("gameDescription: a finished NFL game says what the page covers", () => {
  assert.match(gameDescription("nfl", finished(), D, ""), /^NFL: Chelsea at Arsenal, Sep 20, 2026\. Scoring summary, win probability, team stats, box score and head-to-head\.$/);
});

test("gameDescription: a called-off game says so and keeps only what stays true, for each reason", () => {
  const expected: [string, string][] = [
    ["Postponed", "postponed"],
    ["Canceled", "cancelled"],
    ["Abandoned", "abandoned"],
    ["Suspended", "suspended"],
  ];
  for (const [detail, word] of expected) {
    const d = gameDescription("epl", calledOff(detail), D, "");
    assert.equal(d, `Premier League: Arsenal v Chelsea, Sep 20, 2026. This game was ${word}. Team form and head-to-head record.`, detail);
    assert.doesNotMatch(d, PRE_MATCH, detail);
  }
});

test("gameDescription: a called-off US game is a game, not a match", () => {
  const d = gameDescription("nba", calledOff("Postponed"), D, "");
  assert.equal(d, "NBA: Chelsea at Arsenal, Sep 20, 2026. This game was postponed. Team form and head-to-head record.");
  assert.doesNotMatch(d, PRE_MATCH);
});

test("gameDescription: a called-off cricket match says so and has no win probability", () => {
  const d = gameDescription("ipl", calledOff("Postponed"), D, "");
  assert.equal(d, "IPL: Arsenal v Chelsea, Sep 20, 2026. This match was postponed. Head-to-head record and recent form.");
  assert.doesNotMatch(d, PRE_MATCH);
});

test("gameDescription: a cricket fixture is unchanged", () => {
  assert.equal(gameDescription("ipl", game(), D, ""), "IPL: Arsenal v Chelsea, Sep 20, 2026. Head-to-head record and recent form.");
});

test("gameDescription: a finished cricket match reports its result", () => {
  assert.equal(
    gameDescription("ipl", finished({ status_summary: "Chelsea won by 5 wickets" }), D, ""),
    "IPL: Arsenal v Chelsea, Sep 20, 2026. Chelsea won by 5 wickets. Scorecard and head-to-head."
  );
});

test("gameDescription: a finished abandoned cricket match is a result: its summary, no called-off wording", () => {
  const d = gameDescription("ipl", finished({ status_detail: "Abandoned", status_summary: "Match abandoned without a ball bowled" }), D, "");
  assert.equal(d, "IPL: Arsenal v Chelsea, Sep 20, 2026. Match abandoned without a ball bowled. Scorecard and head-to-head.");
  assert.doesNotMatch(d, /was (postponed|cancelled|abandoned|suspended)/);
});

test("gameDescription: Tests keep their own description; a called-off Test says so", () => {
  assert.equal(
    gameDescription("test", game(), D, " at Lord's"),
    "Arsenal v Chelsea at Lord's, Sep 20, 2026. Full scorecard of all four innings and head-to-head."
  );
  assert.equal(
    gameDescription("test", finished({ status_summary: "Chelsea won by 10 wickets" }), D, ""),
    "Arsenal v Chelsea, Sep 20, 2026. Chelsea won by 10 wickets. Full scorecard of all four innings and head-to-head."
  );
  const off = gameDescription("test", calledOff("Postponed"), D, "");
  assert.equal(off, "Arsenal v Chelsea, Sep 20, 2026. This match was postponed. Head-to-head record.");
  assert.doesNotMatch(off, /scorecard/i);
});

/* ---- teamStatsFraming --------------------------------------------------- */

test("teamStatsFraming: a finished or live game shows real team stats", () => {
  for (const g of [finished(), game({ status_state: "in", status_detail: "45'" })]) {
    const f = teamStatsFraming(g);
    assert.equal(f.seasonAverages, false);
    assert.equal(f.heading, "Team Stats");
    assert.equal(f.description, undefined);
    assert.equal(f.cardTitle, "Team stats");
    assert.equal(f.shareLabel, "team stats");
  }
});

test("teamStatsFraming: a fixture shows season averages coming into the game", () => {
  const f = teamStatsFraming(game());
  assert.equal(f.seasonAverages, true);
  assert.equal(f.heading, "Season Comparison");
  assert.equal(f.description, "Season averages coming into this game. It hasn't been played yet.");
  assert.equal(f.cardTitle, "Season comparison");
  assert.equal(f.shareLabel, "season comparison");
});

test("teamStatsFraming: a called-off game gets the season comparison with wording that is true for it", () => {
  for (const [detail, word] of [["Postponed", "postponed"], ["Canceled", "cancelled"], ["Abandoned", "abandoned"], ["Suspended", "suspended"]]) {
    const f = teamStatsFraming(calledOff(detail));
    assert.equal(f.seasonAverages, true, detail);
    assert.equal(f.heading, "Season Comparison");
    assert.equal(f.description, `Season averages for both teams. This game was ${word}.`);
    assert.doesNotMatch(f.description ?? "", /coming into|hasn't been played|yet/i);
    assert.equal(f.cardTitle, "Season comparison");
    assert.equal(f.shareLabel, "season comparison");
    assert.notEqual(f.heading, "Team Stats");
  }
});

test("teamStatsFraming: a finished abandoned game keeps its real team stats", () => {
  assert.equal(teamStatsFraming(finished({ status_detail: "Abandoned" })).seasonAverages, false);
});

/* ---- hasTeamStats ------------------------------------------------------- */

test("hasTeamStats: an empty stats list on either side hides the section", () => {
  const side = (n: number) => ({ stats: Array.from({ length: n }, () => ({ label: "x", value: "1" })) });
  assert.equal(hasTeamStats(side(3), side(3)), true);
  assert.equal(hasTeamStats(side(0), side(0)), false);
  assert.equal(hasTeamStats(side(3), side(0)), true);
  assert.equal(hasTeamStats(undefined, side(3)), false);
});

/* ---- matchContextView --------------------------------------------------- */

test("matchContextView: a fixture keeps the going-in wording and its win probability", () => {
  const v = matchContextView("epl", game());
  assert.equal(v.title, "Going in");
  assert.equal(v.description, "Ratings and form going into this game, from every result on record.");
  assert.equal(v.showProbability, true);
  assert.deepEqual(v.labels, { elo: "Elo rating", form: "Form going in", standing: "Position" });
  assert.equal(matchContextView("nba", game()).labels.standing, "Record going in");
});

test("matchContextView: a finished game keeps before and after", () => {
  const v = matchContextView("epl", finished());
  assert.equal(v.title, "Before and after");
  assert.equal(v.showProbability, true);
  assert.deepEqual(v.labels, { elo: "Elo rating (change)", form: "Form going in", standing: "Table position" });
  assert.equal(matchContextView("nba", finished()).labels.standing, "Record");
});

test("matchContextView: a called-off game has no probability and no going-in wording", () => {
  for (const league of ["epl", "nba"] as const) {
    const v = matchContextView(league, calledOff("Postponed"));
    assert.equal(v.showProbability, false);
    assert.equal(v.title, "Ratings and form");
    assert.equal(v.description, "This game was postponed. Ratings and form as of the scheduled date, from every result on record.");
    assert.equal(v.labels.elo, "Elo rating");
    assert.equal(v.labels.form, "Recent form");
    assert.doesNotMatch(JSON.stringify(v), /going in|going into|pre-match/i);
  }
  assert.equal(matchContextView("epl", calledOff("Postponed")).labels.standing, "Position");
  assert.equal(matchContextView("nba", calledOff("Postponed")).labels.standing, "Record");
  assert.match(matchContextView("epl", calledOff("Canceled")).description, /^This game was cancelled\./);
});

/* ---- gameSections ------------------------------------------------------- */

test("gameSections: a called-off game hides the broadcast strip and everything that reads as this game's play", () => {
  const off = gameSections(calledOff());
  assert.deepEqual(off, { broadcastStrip: false, winProbability: false, lineups: false, leaders: false, playerStats: false, detailsMissingNote: false });
});

test("gameSections: fixtures, live and finished games show everything, as before", () => {
  const all = { broadcastStrip: true, winProbability: true, lineups: true, leaders: true, playerStats: true, detailsMissingNote: true };
  assert.deepEqual(gameSections(game()), all);
  assert.deepEqual(gameSections(finished()), all);
  assert.deepEqual(gameSections(game({ status_state: "in", status_detail: "Suspended" })), all);
  assert.deepEqual(gameSections(finished({ status_detail: "Abandoned" })), all);
});
