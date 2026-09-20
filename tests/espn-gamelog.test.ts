// ESPN's athlete game log, read for the audit's independent check of a season shown from ESPN's own row.
// Pure: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGamelog, gamelogRegularSeason, MAX_GAME_POINTS, MAX_INTERNAL_GAMES } from "../scripts/lib/espn-gamelog";

const NAMES = [
  "minutes",
  "fieldGoalsMade-fieldGoalsAttempted",
  "fieldGoalPct",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
  "threePointFieldGoalPct",
  "freeThrowsMade-freeThrowsAttempted",
  "freeThrowPct",
  "totalRebounds",
  "assists",
  "blocks",
  "steals",
  "fouls",
  "turnovers",
  "points",
];

/** One game's `stats`, parallel to NAMES; only minutes and points matter to the reader. */
const stats = (minutes: string, points: string): string[] => [minutes, "5-10", "50.0", "1-3", "33.3", "2-2", "100.0", "4", "3", "0", "1", "2", "1", points];
const event = (eventId: string, minutes: string, points: string) => ({ eventId, stats: stats(minutes, points) });

// Three regular-season games (one with "--" minutes: not played, a decimal minutes value counts) and a playoff game.
const payload = {
  names: NAMES,
  seasonTypes: [
    {
      displayName: "2016 Regular Season",
      categories: [
        { displayName: "October", events: [event("1", "34", "20"), event("2", "--", "--")] },
        { displayName: "November", events: [event("3", "12.5", "9")] },
      ],
    },
    { displayName: "2016 Postseason", categories: [{ displayName: "April", events: [event("9", "40", "40")] }] },
  ],
};

test("gamelogRegularSeason counts the games with numeric minutes and sums their points, and ignores the playoffs", () => {
  assert.deepEqual(gamelogRegularSeason(payload), { games: 2, points: 29 });
});

test("gamelogRegularSeason: a game with '--' minutes is not played even when it carries points", () => {
  const p = { names: NAMES, seasonTypes: [{ displayName: "2016 Regular Season", categories: [{ events: [event("1", "--", "12"), event("2", "20", "7")] }] }] };
  assert.deepEqual(gamelogRegularSeason(p), { games: 1, points: 7 });
});

test("gamelogRegularSeason: zero minutes and decimal minutes are played games, and a blank points cell on one is 0", () => {
  const p = { names: NAMES, seasonTypes: [{ displayName: "2016 Regular Season", categories: [{ events: [event("1", "0", "0"), event("2", "0.5", "2"), event("3", "8", "--")] }] }] };
  assert.deepEqual(gamelogRegularSeason(p), { games: 3, points: 2 });
});

test("gamelogRegularSeason finds the columns by name, wherever they are", () => {
  const p = {
    names: ["points", "assists", "minutes"],
    seasonTypes: [{ displayName: "2016 Regular Season", categories: [{ events: [{ eventId: "1", stats: ["30", "5", "36"] }, { eventId: "2", stats: ["--", "0", "--"] }] }] }],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 1, points: 30 });
});

test("gamelogRegularSeason is null for a payload with no points column, or no minutes column", () => {
  const noPoints = { names: NAMES.filter((n) => n !== "points"), seasonTypes: payload.seasonTypes };
  assert.equal(gamelogRegularSeason(noPoints), null);
  const noMinutes = { names: NAMES.filter((n) => n !== "minutes"), seasonTypes: payload.seasonTypes };
  assert.equal(gamelogRegularSeason(noMinutes), null);
});

test("gamelogRegularSeason is null for anything that is not a game-log payload", () => {
  for (const bad of [null, undefined, "x", 3, [], {}, { names: "points" }, { seasonTypes: payload.seasonTypes }]) {
    assert.equal(gamelogRegularSeason(bad), null, JSON.stringify(bad));
  }
});

test("gamelogRegularSeason: a season with no regular-season group is 0 games (the columns are there, the games are not)", () => {
  assert.deepEqual(gamelogRegularSeason({ names: NAMES, seasonTypes: [] }), { games: 0, points: 0 });
  assert.deepEqual(gamelogRegularSeason({ names: NAMES }), { games: 0, points: 0 });
  const playoffsOnly = { names: NAMES, seasonTypes: [payload.seasonTypes[1]] };
  assert.deepEqual(gamelogRegularSeason(playoffsOnly), { games: 0, points: 0 });
});

test("gamelogRegularSeason takes the group whose name contains Regular, whatever the season label, and skips malformed events", () => {
  const p = {
    names: NAMES,
    seasonTypes: [
      { displayName: "2015-16 Regular Season", categories: [{ events: [event("1", "30", "11"), null, { eventId: "x" }, { eventId: "y", stats: ["30"] }, { eventId: "z", stats: "nope" }] }, { events: "none" }, null] },
      { displayName: "2015-16 Play-In", categories: [{ events: [event("8", "30", "50")] }] },
    ],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 1, points: 11 });
});

// -- classifying the game log against ESPN's totals ----------------------------------------------

const espn = { games: 60, pts: 1200 };

test("classifyGamelog: the same games and the same points are confirmed", () => {
  assert.equal(classifyGamelog({ games: 60, points: 1200 }, espn), "confirmed");
});

test("classifyGamelog: ESPN internal needs 1 to 3 games apart, wherever the other rules would also fit", () => {
  assert.equal(classifyGamelog({ games: 63, points: 1300 }, espn), "ESPN internal");
  assert.equal(classifyGamelog({ games: 64, points: 1300 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 57, points: 1000 }, espn), "ESPN internal");
});

test("classifyGamelog: the constants are the documented ones", () => {
  assert.equal(MAX_INTERNAL_GAMES, 3);
  assert.equal(MAX_GAME_POINTS, 100);
});

test("classifyGamelog: the log listing one more game (the All-Star Game) with the points that game holds is ESPN internal", () => {
  assert.equal(classifyGamelog({ games: 61, points: 1230 }, espn), "ESPN internal");
  // Up to what the extra games could hold, not beyond.
  assert.equal(classifyGamelog({ games: 61, points: 1200 + MAX_GAME_POINTS }, espn), "ESPN internal");
  assert.equal(classifyGamelog({ games: 61, points: 1200 + MAX_GAME_POINTS + 1 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 63, points: 1200 + 3 * MAX_GAME_POINTS }, espn), "ESPN internal");
});

test("classifyGamelog: the log missing games ESPN counts is ESPN internal, when ESPN's points are what those games hold", () => {
  assert.equal(classifyGamelog({ games: 58, points: 1150 }, espn), "ESPN internal");
  assert.equal(classifyGamelog({ games: 59, points: 1200 - MAX_GAME_POINTS - 1 }, espn), "MISMATCH");
});

test("classifyGamelog: a log with more than 3 more games than the row is a MISMATCH", () => {
  assert.equal(classifyGamelog({ games: 64, points: 1250 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 64, points: 1200 }, espn), "MISMATCH");
});

test("classifyGamelog: an empty log is never confirmed or ESPN internal, whatever the row's games", () => {
  assert.equal(classifyGamelog({ games: 0, points: 0 }, espn), "MISMATCH");
  // The bug this guards: 0 games against a row of 2 is 'within 3 games' and 0 <= 100 points apart.
  assert.equal(classifyGamelog({ games: 0, points: 0 }, { games: 2, pts: 10 }), "MISMATCH");
  assert.equal(classifyGamelog({ games: 0, points: 0 }, { games: 1, pts: 0 }), "MISMATCH");
  // Not "log incomplete" either, for a row with many games.
  assert.equal(classifyGamelog({ games: 0, points: 0 }, { games: 40, pts: 800 }), "MISMATCH");
});

test("classifyGamelog: log incomplete is a log more than 3 games short of the row whose points do not exceed the row's", () => {
  // Boundary in games: 3 short is ESPN internal, 4 short is log incomplete.
  assert.equal(classifyGamelog({ games: 57, points: 1100 }, espn), "ESPN internal");
  assert.equal(classifyGamelog({ games: 56, points: 1100 }, espn), "log incomplete");
  assert.equal(classifyGamelog({ games: 1, points: 20 }, espn), "log incomplete");
  // Boundary in points: equal to the row's is incomplete, one above is a MISMATCH.
  assert.equal(classifyGamelog({ games: 56, points: 1200 }, espn), "log incomplete");
  assert.equal(classifyGamelog({ games: 56, points: 1201 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 0, points: 0 }, espn), "MISMATCH"); // handled by the empty-log rule, not this one
});

test("classifyGamelog: the same games with different points is a MISMATCH", () => {
  assert.equal(classifyGamelog({ games: 60, points: 1202 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 60, points: 1199 }, espn), "MISMATCH");
});

test("classifyGamelog: points in the wrong direction for the games that differ are a MISMATCH", () => {
  // The log lists more games yet fewer points; the log lists fewer games yet more points.
  assert.equal(classifyGamelog({ games: 61, points: 1190 }, espn), "MISMATCH");
  assert.equal(classifyGamelog({ games: 59, points: 1210 }, espn), "MISMATCH");
});
