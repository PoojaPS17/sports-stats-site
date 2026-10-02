// How an MLB event from ESPN becomes a `games` row: the season type and competition type that the
// generated `stage` column reads, the playoff round, and the round labels the week hub groups by.
//
// The fixtures are real ESPN responses captured on 2026-10-02 (trimmed to the fields the loaders
// read): tests/fixtures/espn-mlb-scoreboard-postseason.json is that day's scoreboard, a National
// League Wild Card game three.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPORT_PATH, standingsLevel } from "../scripts/lib/espn";
import { normalizeStage } from "../src/lib/stage";

// games.ts and matchweeks.ts import the database module, which only reads DATABASE_URL: nothing here connects.
process.env.DATABASE_URL ??= "postgres://postgres:password@localhost:1/none";
let parseRound: typeof import("../scripts/lib/games").parseRound;
let parseStageFields: typeof import("../scripts/lib/games").parseStageFields;
let playoffRoundLabel: typeof import("../src/lib/matchweeks").playoffRoundLabel;
before(async () => {
  ({ parseRound, parseStageFields } = await import("../scripts/lib/games"));
  ({ playoffRoundLabel } = await import("../src/lib/matchweeks"));
});

const scoreboard = JSON.parse(readFileSync(new URL("./fixtures/espn-mlb-scoreboard-postseason.json", import.meta.url), "utf8"));
const wildCardGame = scoreboard.events[0];

test("MLB is baseball/mlb on ESPN", () => {
  assert.equal(SPORT_PATH.mlb, "baseball/mlb");
});

test("MLB asks ESPN for division-level standings groups, as the NFL does", () => {
  assert.equal(standingsLevel("mlb"), "level=3");
  assert.equal(standingsLevel("nfl"), "level=3");
  assert.equal(standingsLevel("nba"), "");
  assert.equal(standingsLevel("epl"), "");
});

test("an MLB event's season type and competition type are stored, as the NBA's and NFL's are", () => {
  assert.deepEqual(parseStageFields("mlb", wildCardGame), { seasonType: 3, competitionType: "RD16" });
  // The scoreboard puts the season type on `season.type`; a team schedule puts it on `seasonType.type`.
  assert.deepEqual(parseStageFields("mlb", { seasonType: { type: 2 }, competitions: [{ type: { abbreviation: "STD" } }] }), { seasonType: 2, competitionType: "STD" });
  assert.deepEqual(parseStageFields("mlb", { season: { type: 1 }, competitions: [{ type: { abbreviation: "STD" } }] }), { seasonType: 1, competitionType: "STD" });
  // Soccer puts a competition id in that field, so it is still gated to the US sports.
  assert.deepEqual(parseStageFields("epl", { season: { type: 1 } }), { seasonType: null, competitionType: null });
});

test("a postseason MLB game's round comes from the notes headline; a regular-season game has none", () => {
  assert.equal(parseRound("mlb", wildCardGame), "NL Wild Card - Game 3");
  assert.equal(parseRound("mlb", { season: { type: 2 }, competitions: [{ type: { abbreviation: "STD" }, notes: [] }] }), null);
  // The All-Star game is an exhibition: no round, and `upsertEvent` skips it outright.
  assert.equal(parseRound("mlb", { season: { type: 2 }, competitions: [{ type: { abbreviation: "ALLSTAR" }, notes: [{ type: "event", headline: "MLB All-Star Game" }] }] }), null);
});

test("ESPN's MLB round abbreviations are spelled out, Game N kept", () => {
  assert.equal(normalizeStage("ALWC"), "AL Wild Card");
  assert.equal(normalizeStage("NLWC - Game 3"), "NL Wild Card - Game 3");
  assert.equal(normalizeStage("ALDS - Game 1"), "AL Division Series - Game 1");
  assert.equal(normalizeStage("NLDS"), "NL Division Series");
  assert.equal(normalizeStage("ALCS - Game 7"), "AL Championship Series - Game 7");
  assert.equal(normalizeStage("NLCS"), "NL Championship Series");
  // Spelled-out variants of the same rounds land on the same labels.
  assert.equal(normalizeStage("AL Wild Card Series - Game 2"), "AL Wild Card - Game 2");
  assert.equal(normalizeStage("NL Division Series"), "NL Division Series");
  // The World Series needs no rewriting.
  assert.equal(normalizeStage("World Series - Game 7"), "World Series - Game 7");
});

test("the week hub groups MLB playoff games into the four rounds, with no league and no game number", () => {
  assert.equal(playoffRoundLabel("NL Wild Card - Game 3"), "Wild Card");
  assert.equal(playoffRoundLabel("AL Wild Card"), "Wild Card");
  assert.equal(playoffRoundLabel("AL Division Series - Game 1"), "Division Series");
  assert.equal(playoffRoundLabel("NL Championship Series - Game 7"), "Championship Series");
  assert.equal(playoffRoundLabel("World Series - Game 4"), "World Series");
  // The NBA's and the NFL's own labels are untouched.
  assert.equal(playoffRoundLabel("AFC Wild Card Playoffs"), "Wild Card");
  assert.equal(playoffRoundLabel("East 1st Round - Game 3"), "First Round");
  assert.equal(playoffRoundLabel("West Finals - Game 5"), "Conference Finals");
  assert.equal(playoffRoundLabel("AFC Championship"), "Conference Championships");
});
