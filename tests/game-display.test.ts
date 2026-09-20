import { test } from "node:test";
import assert from "node:assert/strict";
import { scoresDayDescription, finishedNoScoreNote, shareImageStatus, gameAccessibleLabel, isUpcomingGame, scheduleRowHeading, scoreboardTileStatus } from "../src/lib/gameDisplay";

// scheduleRowHeading and gameAccessibleLabel format in the machine's own time zone (the schedule image is rendered
// where the viewer is), so the tests pin the zone rather than depend on where they run. New York: 12:00 UTC is
// 8:00 AM on Sunday, September 20. Node re-reads TZ when it is assigned, and each test file runs in its own process.
process.env.TZ = "America/New_York";
const DATE = "2026-09-20T12:00:00.000Z";

const game = (over: Record<string, unknown> = {}) => ({
  date: DATE,
  completed: false,
  status_state: "pre" as string | null,
  status_detail: "Scheduled" as string | null,
  round: null as string | null,
  home_name: "Arsenal",
  away_name: "Chelsea",
  home_score: 0,
  away_score: 0,
  home_score_display: null as string | null,
  away_score_display: null as string | null,
  ...over,
});

const calledOff = (detail = "Postponed") => game({ status_state: "post", status_detail: detail });
const finished = () => game({ completed: true, status_state: "post", status_detail: "FT", home_score: 2, away_score: 1 });

test("isUpcomingGame: only a scheduled game that is not live and not called off", () => {
  assert.equal(isUpcomingGame(game()), true);
  assert.equal(isUpcomingGame(calledOff()), false);
  assert.equal(isUpcomingGame(calledOff("Canceled")), false);
  assert.equal(isUpcomingGame(finished()), false);
  assert.equal(isUpcomingGame(game({ status_state: "in", status_detail: "45'" })), false);
  // a finished game with an abandoned status is a result, not called off, and still not upcoming
  assert.equal(isUpcomingGame(game({ completed: true, status_detail: "Abandoned" })), false);
});

test("scheduleRowHeading: an upcoming game shows its date and kickoff time", () => {
  assert.equal(scheduleRowHeading(game()), "Sun, Sep 20 · 8:00 AM");
});

test("scheduleRowHeading: a called-off game shows the reason and no kickoff time", () => {
  assert.equal(scheduleRowHeading(calledOff()), "Sun, Sep 20 · Postponed");
  assert.equal(scheduleRowHeading(calledOff("Canceled")), "Sun, Sep 20 · Cancelled");
  assert.equal(scheduleRowHeading(calledOff("Abandoned")), "Sun, Sep 20 · Abandoned");
  assert.doesNotMatch(scheduleRowHeading(calledOff()), /[AP]M/);
});

test("scheduleRowHeading: a finished game shows only the date", () => {
  assert.equal(scheduleRowHeading(finished()), "Sun, Sep 20");
  // a finished abandoned match is a result, so it carries no called-off label
  assert.equal(scheduleRowHeading(game({ completed: true, status_detail: "Abandoned" })), "Sun, Sep 20");
});

test("gameAccessibleLabel: an upcoming game reads as a fixture, a called-off one says why it is off", () => {
  assert.equal(gameAccessibleLabel(game()), "Chelsea at Arsenal, Sunday, September 20");
  assert.equal(gameAccessibleLabel(calledOff()), "Chelsea at Arsenal, Sunday, September 20, postponed");
  assert.equal(gameAccessibleLabel(calledOff("Canceled")), "Chelsea at Arsenal, Sunday, September 20, cancelled");
});

test("gameAccessibleLabel: a finished game reads as a result", () => {
  assert.equal(gameAccessibleLabel(finished()), "Chelsea 1, Arsenal 2, final");
  assert.equal(gameAccessibleLabel(game({ completed: true, status_detail: "Abandoned", round: "Match abandoned", home_score: 1, away_score: 1 })), "Chelsea 1, Arsenal 1, Match abandoned");
});

test("scoreboardTileStatus: an upcoming game shows its kickoff, a called-off one shows why it is off", () => {
  assert.equal(scoreboardTileStatus("nba", game({ date: "2026-09-20T18:30:00.000Z" }), false), "18:30 UTC");
  assert.equal(scoreboardTileStatus("nba", calledOff(), false), "Postponed");
  assert.equal(scoreboardTileStatus("nba", calledOff("Canceled"), false), "Cancelled");
  assert.doesNotMatch(scoreboardTileStatus("nba", calledOff(), false), /UTC/);
});

test("scoreboardTileStatus: a list spanning days puts the date on the tile, and a called-off game is not Upcoming", () => {
  assert.equal(scoreboardTileStatus("nba", game(), true), "Sep 20, 2026 · Upcoming");
  assert.equal(scoreboardTileStatus("nba", calledOff(), true), "Sep 20, 2026 · Postponed");
  assert.equal(scoreboardTileStatus("nba", finished(), true), "Sep 20, 2026 · Final");
});

test("scoreboardTileStatus: results and live games are unchanged", () => {
  assert.equal(scoreboardTileStatus("nba", finished(), false), "Final");
  assert.equal(scoreboardTileStatus("nba", game({ status_state: "in", status_detail: "Q3 4:12" }), false), "Q3 4:12");
  // a finished abandoned match is a result
  assert.equal(scoreboardTileStatus("ipl", game({ completed: true, status_detail: "Abandoned" }), false), "Result");
});

test("a cricket match ESPN cancelled but the writer stored as finished is still shown as called off", () => {
  // ESPN files a cancelled match under state post; older rows were stored completed
  const stored = game({ completed: true, status_state: "post", status_detail: "Canceled", home_score: null, away_score: null });
  assert.equal(isUpcomingGame(stored), false);
  assert.equal(scheduleRowHeading(stored), "Sun, Sep 20 · Cancelled");
  assert.equal(gameAccessibleLabel(stored), "Chelsea at Arsenal, Sunday, September 20, cancelled");
  assert.equal(scoreboardTileStatus("ipl", stored, false), "Cancelled");
  assert.equal(scoreboardTileStatus("ipl", stored, true), "Sep 20, 2026 · Cancelled");
  // whereas a finished abandoned match is a result
  const abandoned = game({ completed: true, status_state: "post", status_detail: "Abandoned" });
  assert.equal(scoreboardTileStatus("ipl", abandoned, false), "Result");
});

test("a live game is live even when its status text reads like a stoppage", () => {
  const live = game({ status_state: "in", status_detail: "Suspended" });
  assert.equal(scoreboardTileStatus("ipl", live, false), "Suspended");
  assert.equal(scoreboardTileStatus("ipl", live, true), "Sep 20, 2026 · Suspended");
  assert.equal(isUpcomingGame(live), false);
  assert.equal(scheduleRowHeading(live), "Sun, Sep 20");
  assert.equal(gameAccessibleLabel(live), "Chelsea at Arsenal, Sunday, September 20");
});

test("finishedNoScoreNote: a finished match with no scores says how it ended, and is never a called-off label", () => {
  const abandoned = { completed: true, home_score: null, away_score: null, status_summary: "Match abandoned without a ball bowled" };
  assert.equal(finishedNoScoreNote(abandoned), "Match abandoned without a ball bowled");
  assert.equal(finishedNoScoreNote({ ...abandoned, status_summary: "No result" }), "No result");
  // scored matches, unfinished matches and matches with no summary have nothing extra to say
  assert.equal(finishedNoScoreNote({ ...abandoned, home_score: 150, away_score: 120 }), null);
  assert.equal(finishedNoScoreNote({ ...abandoned, completed: false }), null);
  assert.equal(finishedNoScoreNote({ ...abandoned, status_summary: null }), null);
  assert.equal(finishedNoScoreNote({ ...abandoned, status_summary: "  " }), null);
});

/* ---- the scores-by-date page description ------------------------------- */

const DAY = "Sunday, September 20, 2026";

test("scoresDayDescription: a day of finished games reads as before", () => {
  const all = [finished(), finished(), finished()];
  assert.equal(scoresDayDescription("nba", DAY, all), "All 3 NBA games played on Sunday, September 20, 2026, with final scores and a link to each box score.");
  assert.equal(scoresDayDescription("epl", DAY, [finished()]), "The one Premier League match played on Sunday, September 20, 2026, with final scores and a link to each match report.");
  assert.equal(scoresDayDescription("ipl", DAY, [finished(), finished()]), "All 2 IPL matches played on Sunday, September 20, 2026, with final scores and a link to each scorecard.");
  assert.equal(scoresDayDescription("nba", DAY, []), "No NBA games were played on Sunday, September 20, 2026.");
});

test("scoresDayDescription: a postponed game is not counted as played, and is mentioned as postponed", () => {
  const nine = Array.from({ length: 9 }, () => finished());
  assert.equal(
    scoresDayDescription("epl", DAY, [...nine, calledOff("Postponed")]),
    "9 Premier League matches played on Sunday, September 20, 2026, with final scores and a link to each match report. 1 match was postponed."
  );
  assert.equal(scoresDayDescription("nba", DAY, [finished(), calledOff("Canceled"), calledOff("Canceled")]), "1 NBA game played on Sunday, September 20, 2026, with final scores and a link to each box score. 2 games were cancelled.");
  // different reasons: the plain count
  assert.match(scoresDayDescription("nba", DAY, [finished(), calledOff("Canceled"), calledOff("Postponed")]), / 2 games were called off\.$/);
});

test("scoresDayDescription: a game stored as finished but cancelled is called off, not counted as played", () => {
  const storedFinished = game({ completed: true, status_detail: "Canceled", home_score: 0, away_score: 0 });
  assert.equal(scoresDayDescription("nba", DAY, [finished(), storedFinished]), "1 NBA game played on Sunday, September 20, 2026, with final scores and a link to each box score. 1 game was cancelled.");
  assert.equal(scoresDayDescription("nba", DAY, [storedFinished]), "No NBA games were played on Sunday, September 20, 2026. 1 game was cancelled.");
});

test("scoresDayDescription: a day where every game was called off says nothing was played", () => {
  assert.equal(scoresDayDescription("nba", DAY, [calledOff("Postponed"), calledOff("Postponed")]), "No NBA games were played on Sunday, September 20, 2026. 2 games were postponed.");
  assert.equal(scoresDayDescription("epl", DAY, [calledOff("Postponed")]), "No Premier League matches were played on Sunday, September 20, 2026. 1 match was postponed.");
});

test("scoresDayDescription: a finished abandoned cricket match is played (a result, not called off) but has no final score to promise", () => {
  const abandoned = game({ completed: true, status_detail: "Abandoned", home_score: null, away_score: null });
  assert.equal(scoresDayDescription("ipl", DAY, [abandoned]), "The one IPL match played on Sunday, September 20, 2026, with results and a link to each scorecard.");
  // a day of scored results and one without is still "with results"
  assert.equal(scoresDayDescription("ipl", DAY, [finished(), abandoned]), "All 2 IPL matches played on Sunday, September 20, 2026, with results and a link to each scorecard.");
});

test("scoresDayDescription: games in play are in play, not still to be played", () => {
  const inPlay = game({ status_state: "in", status_detail: "Q3 4:12" });
  assert.equal(scoresDayDescription("nba", DAY, [inPlay, inPlay]), "2 NBA games in play on Sunday, September 20, 2026, with scores as they finish.");
  assert.equal(scoresDayDescription("nba", DAY, [inPlay, game()]), "2 NBA games in play or to be played on Sunday, September 20, 2026, with scores as they finish.");
  assert.equal(scoresDayDescription("nba", DAY, [game()]), "1 NBA game to be played on Sunday, September 20, 2026, with scores as they finish.");
  // a live game that says suspended is still in play
  assert.match(scoresDayDescription("ipl", DAY, [game({ status_state: "in", status_detail: "Suspended" })]), /^1 IPL match in play on /);
});

test("shareImageStatus: the label over a game's share image: Final for a scored result, Result for a no-score match, the reason when called off", () => {
  const noScore = { completed: true, status_state: "post", status_detail: "Abandoned", home_score: null, away_score: null, status_summary: "Match abandoned without a ball bowled" };
  assert.equal(shareImageStatus(noScore), "Result");
  assert.equal(shareImageStatus({ ...noScore, home_score: 2, away_score: 1, status_summary: null }), "Final");
  assert.equal(shareImageStatus({ ...noScore, completed: false, status_detail: "Postponed", home_score: 0, away_score: 0 }), "Postponed");
  assert.equal(shareImageStatus({ ...noScore, completed: true, status_detail: "Canceled" }), "Cancelled");
  assert.equal(shareImageStatus({ ...noScore, completed: false, status_state: "pre", status_detail: "Scheduled", status_summary: null }), null);
  assert.equal(shareImageStatus({ ...noScore, completed: false, status_state: "in", status_detail: "Suspended" }), null);
});

test("scoresDayDescription: games still to come are not counted as played", () => {
  assert.equal(scoresDayDescription("nba", DAY, [game(), game()]), "2 NBA games to be played on Sunday, September 20, 2026, with scores as they finish.");
  assert.equal(scoresDayDescription("nba", DAY, [finished(), game()]), "1 NBA game played on Sunday, September 20, 2026, with final scores and a link to each box score.");
});
