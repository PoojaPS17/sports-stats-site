import { test } from "node:test";
import assert from "node:assert/strict";
import { gameAccessibleLabel, isUpcomingGame, scheduleRowHeading } from "../src/lib/gameDisplay";

// Noon UTC, so the calendar day is the same in every timezone the tests may run in.
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
  const h = scheduleRowHeading(game());
  assert.match(h, /^Sun, Sep 20 · \d{1,2}:\d{2} [AP]M$/);
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
