import { test } from "node:test";
import assert from "node:assert/strict";
import { gameDescription, gameLeadersShown, gameSides, gameSections, hasNoBoxScore, hasTeamStats, matchContextView, NO_BOX_SCORE, NO_BOX_SCORE_NOTE, playerBoxIsBlank, teamStatsFraming } from "../src/lib/gamePage";

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
    assert.equal(d, `Premier League: Arsenal v Chelsea, Sep 20, 2026. This match was ${word}. Team form and head-to-head record.`, detail);
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
    const f = teamStatsFraming("epl", g);
    assert.equal(f.seasonAverages, false);
    assert.equal(f.heading, "Team Stats");
    assert.equal(f.description, undefined);
    assert.equal(f.cardTitle, "Team stats");
    assert.equal(f.shareLabel, "team stats");
  }
});

test("teamStatsFraming: a fixture shows season averages coming into the game", () => {
  const f = teamStatsFraming("epl", game());
  assert.equal(f.seasonAverages, true);
  assert.equal(f.heading, "Season Comparison");
  assert.equal(f.description, "Season averages coming into this game. It hasn't been played yet.");
  assert.equal(f.cardTitle, "Season comparison");
  assert.equal(f.shareLabel, "season comparison");
});

test("teamStatsFraming: a called-off game gets the season comparison with wording that is true for it", () => {
  for (const [detail, word] of [["Postponed", "postponed"], ["Canceled", "cancelled"]]) {
    const f = teamStatsFraming("epl", calledOff(detail));
    assert.equal(f.seasonAverages, true, detail);
    assert.equal(f.heading, "Season Comparison");
    assert.equal(f.description, `Season averages for both teams. This match was ${word}.`);
    assert.doesNotMatch(f.description ?? "", /coming into|hasn't been played|yet/i);
    assert.equal(f.cardTitle, "Season comparison");
    assert.equal(f.shareLabel, "season comparison");
    assert.notEqual(f.heading, "Team Stats");
  }
});

test("teamStatsFraming: a finished abandoned game keeps its real team stats", () => {
  assert.equal(teamStatsFraming("epl", finished({ status_detail: "Abandoned" })).seasonAverages, false);
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
    assert.equal(v.description, `This ${league === "epl" ? "match" : "game"} was postponed. Ratings and form as of the scheduled date, from every result on record.`);
    assert.equal(v.labels.elo, "Elo rating");
    assert.equal(v.labels.form, "Recent form");
    assert.doesNotMatch(JSON.stringify(v), /going in|going into|pre-match/i);
  }
  assert.equal(matchContextView("epl", calledOff("Postponed")).labels.standing, "Position");
  assert.equal(matchContextView("nba", calledOff("Postponed")).labels.standing, "Record");
  assert.match(matchContextView("epl", calledOff("Canceled")).description, /^This match was cancelled\./);
});

/* ---- gameSections ------------------------------------------------------- */

test("gameSections: a postponed or cancelled game hides the broadcast strip and everything that reads as this game's play", () => {
  for (const detail of ["Postponed", "Canceled"]) {
  const off = gameSections(calledOff(detail));
  assert.deepEqual(off, { broadcastStrip: false, winProbability: false, lineups: false, leaders: false, playerStats: false, playFacts: false, detailsMissingNote: false });
  }
});

test("gameSections: fixtures, live and finished games show everything, as before", () => {
  const all = { broadcastStrip: true, winProbability: true, lineups: true, leaders: true, playerStats: true, playFacts: true, detailsMissingNote: true };
  assert.deepEqual(gameSections(game()), all);
  assert.deepEqual(gameSections(finished()), all);
  assert.deepEqual(gameSections(game({ status_state: "in", status_detail: "Suspended" })), all);
  assert.deepEqual(gameSections(finished({ status_detail: "Abandoned" })), all);
});

/* ---- a game abandoned or suspended part-way has real partial play: only the never-played games lose their play sections ---- */

test("gameSections: an abandoned or suspended game keeps every play section; only the original slot's broadcast strip goes", () => {
  for (const detail of ["Abandoned", "Suspended"]) {
    for (const state of ["post", "pre"]) {
      const s = gameSections(game({ status_state: state, status_detail: detail }));
      assert.deepEqual(s, { broadcastStrip: false, winProbability: true, lineups: true, leaders: true, playerStats: true, playFacts: true, detailsMissingNote: true }, `${detail} ${state}`);
    }
  }
});

test("teamStatsFraming: an abandoned or suspended game that reached state post has a real box score, so it keeps Team Stats", () => {
  for (const detail of ["Abandoned", "Suspended"]) {
    const f = teamStatsFraming("epl", game({ status_state: "post", status_detail: detail }));
    assert.equal(f.seasonAverages, false, detail);
    assert.equal(f.heading, "Team Stats");
    assert.equal(f.description, undefined);
    assert.equal(f.cardTitle, "Team stats");
  }
});

test("teamStatsFraming: an abandoned or suspended game still in state pre only has season averages, and says it was called off", () => {
  for (const [detail, word] of [["Abandoned", "abandoned"], ["Suspended", "suspended"]]) {
    const f = teamStatsFraming("epl", game({ status_state: "pre", status_detail: detail }));
    assert.equal(f.seasonAverages, true);
    assert.equal(f.heading, "Season Comparison");
    assert.equal(f.description, `Season averages for both teams. This match was ${word}.`);
  }
});

test("the header, description and ratings card still say an abandoned or suspended game was called off", () => {
  assert.match(gameDescription("epl", calledOff("Abandoned"), D, ""), /This match was abandoned\./);
  assert.match(matchContextView("epl", calledOff("Suspended")).description, /^This match was suspended\./);
  assert.equal(matchContextView("epl", calledOff("Suspended")).showProbability, false);
});

test("nouns: the US leagues say game, football and cricket say match", () => {
  assert.match(gameDescription("nba", calledOff("Postponed"), D, ""), /This game was postponed\./);
  assert.match(gameDescription("nfl", calledOff("Postponed"), D, ""), /This game was postponed\./);
  assert.match(teamStatsFraming("nba", calledOff("Postponed")).description ?? "", /This game was postponed\./);
  assert.match(teamStatsFraming("ipl", calledOff("Postponed")).description ?? "", /This match was postponed\./);
  assert.match(gameDescription("seriea", calledOff("Postponed"), D, ""), /This match was postponed\./);
});

/* ---- a game with no box score ------------------------------------------- */

// ESPN's NBA box score for a game it published no player statistics for: every player who played has minutes "--"
// and all-zero statistics, and a player who did not play has dashes.
const ZERO_ROW = ["--", "0", "0-0", "0-0", "0-0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
const DNP_ROW = ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"];
const team = (rows: string[][]) => ({ categories: [{ rows: rows.map((stats) => ({ stats })) }] });
const BLANK_BOX = [team([ZERO_ROW, DNP_ROW]), team([ZERO_ROW, ZERO_ROW])];
const withCell = (index: number, cell: string) => [team([ZERO_ROW, ZERO_ROW.map((c, i) => (i === index ? cell : c))]), team([DNP_ROW])];

test("playerBoxIsBlank: a box of minutes \"--\", zeros and dashes is blank", () => {
  assert.equal(playerBoxIsBlank(BLANK_BOX), true);
});

test("playerBoxIsBlank: any real figure makes the box real", () => {
  assert.equal(playerBoxIsBlank(withCell(0, "34")), false);
  assert.equal(playerBoxIsBlank(withCell(1, "-3")), false); // a real minus, not a dash
  assert.equal(playerBoxIsBlank(withCell(2, "1-2")), false);
  assert.equal(playerBoxIsBlank(withCell(3, "12.5")), false);
});

test("playerBoxIsBlank: a zero is blank in each of the box score's forms", () => {
  assert.equal(playerBoxIsBlank(withCell(0, "0.0")), true);
  assert.equal(playerBoxIsBlank(withCell(2, "0/0")), true);
  assert.equal(playerBoxIsBlank(withCell(3, "")), true);
  assert.equal(playerBoxIsBlank(withCell(4, "–")), true);
});

test("playerBoxIsBlank: with no player rows listed there is nothing to call blank", () => {
  assert.equal(playerBoxIsBlank([]), false);
  assert.equal(playerBoxIsBlank([{ categories: [] }]), false);
  assert.equal(playerBoxIsBlank([{ categories: [{ rows: [] }] }, { categories: [] }]), false);
});

test("hasNoBoxScore: only a finished game can lack a box score", () => {
  assert.equal(hasNoBoxScore({ completed: true }, BLANK_BOX), true);
  // A live game legitimately starts with zeros.
  assert.equal(hasNoBoxScore({ completed: false }, BLANK_BOX), false);
  assert.equal(hasNoBoxScore({ completed: true }, withCell(0, "34")), false);
});

test("gameDescription: a finished game with no box score says so instead of listing a box score", () => {
  const d = gameDescription("nba", finished({ home_name: "Chicago Bulls", away_name: "Cleveland Cavaliers" }), "Oct 28, 2015", " at United Center", "", false);
  assert.equal(d, "NBA: Cleveland Cavaliers at Chicago Bulls at United Center, Oct 28, 2015. ESPN has no box score for this game. Head-to-head record.");
  assert.ok(d.includes(NO_BOX_SCORE));
  assert.doesNotMatch(d, /box score and|team stats/i);
});

test("gameDescription: the box score parameter defaults to true and changes nothing when true", () => {
  const g = finished();
  assert.equal(gameDescription("nba", g, D, "", "", true), gameDescription("nba", g, D, ""));
  assert.equal(gameDescription("nba", g, D, ""), "NBA: Chelsea at Arsenal, Sep 20, 2026. Scoring summary, win probability, team stats, box score and head-to-head.");
});

test("gameDescription: a called-off game says so whatever the box score; first-class cricket ignores the parameter", () => {
  assert.equal(gameDescription("nba", calledOff("Postponed"), D, "", "", false), "NBA: Chelsea at Arsenal, Sep 20, 2026. This game was postponed. Team form and head-to-head record.");
  const test = finished({ status_summary: "Chelsea won by 10 wickets" });
  assert.equal(gameDescription("test", test, D, "", "", false), gameDescription("test", test, D, ""));
  // A game not yet finished is never "no box score" either.
  assert.equal(gameDescription("nba", game(), D, "", "", false), gameDescription("nba", game(), D, ""));
});

test("the page note carries the visitor-facing sentence and says the score is unaffected", () => {
  assert.ok(NO_BOX_SCORE_NOTE.startsWith(NO_BOX_SCORE.slice(0, -1) + ","));
  assert.match(NO_BOX_SCORE_NOTE, /The final score above is unaffected\.$/);
});

test("gameLeadersShown: a game with no box score shows no leaders, since a leader line would be an invented statistic", () => {
  const leaders = [{ athlete_id: "1", value: "0" }, { athlete_id: "2", value: "0" }];
  assert.deepEqual(gameLeadersShown({ leaders: true }, true, leaders), []);
  // Any other game keeps the leaders ESPN sent, and none when the section is off or ESPN sent none.
  assert.deepEqual(gameLeadersShown({ leaders: true }, false, leaders), leaders);
  assert.deepEqual(gameLeadersShown({ leaders: false }, false, leaders), []);
  assert.deepEqual(gameLeadersShown({ leaders: true }, false, undefined), []);
  assert.deepEqual(gameLeadersShown({ leaders: true }, true, undefined), []);
});
