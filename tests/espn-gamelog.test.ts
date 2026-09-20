// ESPN's athlete game log, read for the audit's independent check of a season shown from ESPN's own row.
// Pure: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGamelog, gamelogNotReadAtAll, gamelogRegularSeason, MAX_GAME_POINTS, MAX_INTERNAL_GAMES } from "../scripts/lib/espn-gamelog";

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

// -- the All-Star Game: ESPN lists it in "Regular Season", the site and ESPN's season row do not count it --------

/** The real shape: `events` maps an event id to the event object, whose `team.isAllStar` marks the exhibition. */
const eventInfo = (isAllStar: boolean | undefined) => ({ team: isAllStar === undefined ? {} : { isAllStar } });

test("gamelogRegularSeason drops the All-Star Game (team.isAllStar true) and counts every other event", () => {
  // Bosh 2015 in miniature: 43 real games of 908 points would be 2 games of 30 + 20 here; the All-Star Game is 11 minutes, 10 points.
  const p = {
    names: NAMES,
    events: { "1": eventInfo(false), "2": eventInfo(false), "400606285": { ...eventInfo(true), eventNote: "NBA ALL-STAR GAME" } },
    seasonTypes: [{ displayName: "2014-15 Regular Season", categories: [{ displayName: "January", events: [event("1", "34", "30"), event("400606285", "11", "10")] }, { displayName: "February", events: [event("2", "30", "20")] }] }],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 2, points: 50 });
});

test("gamelogRegularSeason still counts an event with no matching payload.events entry, or with no isAllStar flag", () => {
  const p = {
    names: NAMES,
    events: { "1": eventInfo(false), "3": eventInfo(undefined), "4": null, "5": "odd" },
    seasonTypes: [{ displayName: "2014-15 Regular Season", categories: [{ events: [event("1", "30", "10"), event("2", "30", "11"), event("3", "30", "12"), event("4", "30", "13"), event("5", "30", "14")] }] }],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 5, points: 60 });
  // No `events` map at all (or one that is not a map): every event is counted, as before.
  const bare = { names: NAMES, seasonTypes: p.seasonTypes };
  assert.deepEqual(gamelogRegularSeason(bare), { games: 5, points: 60 });
  assert.deepEqual(gamelogRegularSeason({ ...bare, events: [] }), { games: 5, points: 60 });
  assert.deepEqual(gamelogRegularSeason({ ...bare, events: "x" }), { games: 5, points: 60 });
});

test("gamelogRegularSeason: the All-Star Game in a playoff group changes nothing, and isAllStar must be exactly true", () => {
  const p = {
    names: NAMES,
    events: { "1": eventInfo(true), "2": { team: { isAllStar: "true" } } },
    seasonTypes: [
      { displayName: "Regular Season", categories: [{ events: [event("1", "11", "10"), event("2", "30", "7")] }] },
      { displayName: "Postseason", categories: [{ events: [event("1", "11", "10")] }] },
    ],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 1, points: 7 });
});

// -- a game log ESPN does not have --------------------------------------------------------------------

const FILTERS = [{ name: "season", value: "2016", options: [{ value: "2016", displayValue: "2015-16" }] }];

test("gamelogRegularSeason: a bare {filters} payload is 0 games and 0 points (ESPN has no game log for that season)", () => {
  assert.deepEqual(gamelogRegularSeason({ filters: FILTERS }), { games: 0, points: 0 });
  assert.deepEqual(gamelogRegularSeason({ filters: [] }), { games: 0, points: 0 });
});

test("gamelogRegularSeason: only a payload whose sole key is a filters array reads as no games; every other odd payload is null", () => {
  assert.equal(gamelogRegularSeason({ filters: FILTERS, names: ["minutes"] }), null);
  assert.equal(gamelogRegularSeason({ filters: FILTERS, names: NAMES.filter((n) => n !== "points") }), null);
  assert.equal(gamelogRegularSeason({ filters: FILTERS, seasonTypes: payload.seasonTypes }), null);
  assert.equal(gamelogRegularSeason({ filters: FILTERS, events: {} }), null);
  assert.equal(gamelogRegularSeason({ code: 404, message: "Not Found" }), null);
  assert.equal(gamelogRegularSeason({ filters: "x" }), null);
  assert.equal(gamelogRegularSeason({ filters: {} }), null);
  assert.equal(gamelogRegularSeason({ filters: FILTERS, code: 404 }), null);
  assert.equal(gamelogRegularSeason({}), null);
});

test("gamelogRegularSeason: a game log with only Preseason and Postseason groups is 0 games and 0 points", () => {
  const p = {
    names: NAMES,
    filters: FILTERS,
    events: { "9": eventInfo(false) },
    seasonTypes: [
      { displayName: "2014-15 Preseason", categories: [{ events: [event("8", "20", "8")] }] },
      { displayName: "2014-15 Postseason", categories: [{ events: [event("9", "40", "40")] }] },
    ],
  };
  assert.deepEqual(gamelogRegularSeason(p), { games: 0, points: 0 });
});

test("gamelogNotReadAtAll: a run that checked seasons and read none with games is a wholesale ESPN change; any readable log clears it", () => {
  assert.equal(gamelogNotReadAtAll(0, 3), true);
  assert.equal(gamelogNotReadAtAll(0, 1), true);
  assert.equal(gamelogNotReadAtAll(1, 3), false);
  assert.equal(gamelogNotReadAtAll(40, 2), false);
  // Nothing checked at all (no season shown from ESPN's own row, or --gamelog not asked): nothing to fail.
  assert.equal(gamelogNotReadAtAll(0, 0), false);
  assert.equal(gamelogNotReadAtAll(5, 0), false);
});

// -- Bosh 2015 (ESPN athlete 1977): the log listed 44 games / 918 points, ESPN's row is 44 GP / 928 PTS ----------

test("classifyGamelog: Bosh 2015 is ESPN internal once the All-Star Game is dropped, and was a MISMATCH with it counted", () => {
  const row = { games: 44, pts: 928 };
  // 43 real games (908 points); the 44th is a Bulls game ESPN's box score leaves blank (20 points in ours).
  assert.equal(classifyGamelog({ games: 43, points: 908 }, row), "ESPN internal");
  // Counting the All-Star Game (11 minutes, 10 points) made 44 games / 918 points: same games, 10 points short.
  assert.equal(classifyGamelog({ games: 44, points: 918 }, row), "MISMATCH");
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
