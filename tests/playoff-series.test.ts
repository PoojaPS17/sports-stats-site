import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderName,
  notNeededGames,
  notPlayedText,
  parseSeriesRound,
  placeholderName,
  placeholderParts,
  placeholderWinners,
  seriesLength,
  seriesStates,
  winsNeeded,
  type SeriesGame,
} from "../src/lib/playoffSeries";
import { isTimeTbd } from "../src/lib/gameStatus";

// Real shapes from the production rows read on 2026-10-08 (team ids: 10 TB, 30 NYY, 4 CLE, 5 CHW, 19 LAD, 15 ATL, 25 SD, 8 MIL).
let n = 0;
function game(round: string, home: string, away: string, result: "home" | "away" | "open" | "live", extra: Partial<SeriesGame> = {}): SeriesGame {
  n += 1;
  return {
    league: "mlb",
    espn_id: `g${n}`,
    season_year: 2026,
    round,
    completed: result === "home" || result === "away",
    status_state: result === "live" ? "in" : result === "open" ? "pre" : "post",
    home_team_espn_id: home,
    away_team_espn_id: away,
    home_winner: result === "home" ? true : result === "away" ? false : null,
    away_winner: result === "away" ? true : result === "home" ? false : null,
    home_score: result === "open" ? 0 : null,
    away_score: result === "open" ? 0 : null,
    ...extra,
  };
}

// The Rays swept the Yankees: ALDS games 1-3 finished (Rays won), games 4 and 5 "if necessary" still Scheduled 0-0.
const swept = (): SeriesGame[] => [
  game("AL Division Series - Game 1", "10", "30", "home"),
  game("AL Division Series - Game 2", "10", "30", "home"),
  game("AL Division Series - Game 3", "30", "10", "away"),
  game("ALDS - Game 4 If Necessary", "10", "30", "open"),
  game("ALDS - Game 5 If Necessary", "30", "10", "open"),
];

test("parseSeriesRound reads every spelling ESPN uses for one round", () => {
  assert.deepEqual(parseSeriesRound("AL Division Series - Game 4"), { round: "AL Division Series", game: 4, ifNecessary: false });
  assert.deepEqual(parseSeriesRound("ALDS - Game 4 If Necessary"), { round: "AL Division Series", game: 4, ifNecessary: true });
  assert.deepEqual(parseSeriesRound("NLCS - Game 7 If Necessary"), { round: "NL Championship Series", game: 7, ifNecessary: true });
  assert.deepEqual(parseSeriesRound("NL Wild Card - Game 3"), { round: "NL Wild Card", game: 3, ifNecessary: false });
  assert.deepEqual(parseSeriesRound("World Series - Game 6"), { round: "World Series", game: 6, ifNecessary: false });
  assert.equal(parseSeriesRound("EAST 1ST ROUND - GAME 2")?.game, 2);
  assert.equal(parseSeriesRound("WEST SEMIFINALS – GAME 1")?.game, 1, "an en dash");
  for (const none of [null, undefined, "", "Final", "Qualifier 1", "Semi-Final", "Play-In", "Week 3"]) assert.equal(parseSeriesRound(none), null);
});

test("series formats: MLB wild card 3, division 5, championship and World Series 7; NBA 7; anything else unknown", () => {
  assert.equal(seriesLength("mlb", "AL Wild Card"), 3);
  assert.equal(seriesLength("mlb", "NL Division Series"), 5);
  assert.equal(seriesLength("mlb", "AL Championship Series"), 7);
  assert.equal(seriesLength("mlb", "World Series"), 7);
  assert.equal(seriesLength("mlb", "Spring Showcase"), null);
  assert.equal(seriesLength("nba", "East 1st Round"), 7);
  assert.equal(seriesLength("nfl", "Wild Card"), null);
  assert.equal(seriesLength("epl", "Final"), null);
  assert.deepEqual([3, 5, 7].map(winsNeeded), [2, 3, 4]);
});

test("a swept best-of-5 hides games 4 and 5 and nothing else", () => {
  const games = swept();
  const out = notNeededGames(games);
  assert.deepEqual([...out.keys()].sort(), [`mlb:${games[3].espn_id}`, `mlb:${games[4].espn_id}`].sort());
  const first = out.get(`mlb:${games[3].espn_id}`)!;
  assert.equal(first.score, "3-0");
  assert.equal(first.winner, "10");
  assert.equal(notPlayedText(first), "Not played: series decided 3-0");
});

test("the 3-1 series that ended in game 4 drops only game 5", () => {
  const games = [
    game("NL Division Series - Game 1", "19", "15", "home"),
    game("NL Division Series - Game 2", "19", "15", "away"),
    game("NL Division Series - Game 3", "15", "19", "away"),
    game("NL Division Series - Game 4", "15", "19", "away"),
    game("NLDS - Game 5 If Necessary", "19", "15", "open"),
  ];
  const out = notNeededGames(games);
  assert.deepEqual([...out.keys()], [`mlb:${games[4].espn_id}`]);
  assert.equal([...out.values()][0].score, "3-1");
});

test("a series that is open keeps every game: 2-1 and 2-2 in a best-of-5 are not decided", () => {
  const open = [
    game("AL Division Series - Game 1", "5", "4", "away"),
    game("AL Division Series - Game 2", "5", "4", "home"),
    game("AL Division Series - Game 3", "4", "5", "home"),
    game("AL Division Series - Game 4", "5", "4", "open", { home_score: null, away_score: null }),
    game("ALDS - Game 5 If Necessary", "4", "5", "open"),
  ];
  assert.equal(notNeededGames(open).size, 0);
  const tied = [...open.slice(0, 3), game("AL Division Series - Game 4", "5", "4", "home"), open[4]];
  assert.equal(notNeededGames(tied).size, 0, "2-2 needs game 5");
});

test("a game in play, or already finished, is never hidden", () => {
  const games = swept();
  games[3] = { ...games[3], status_state: "in", completed: false };
  const out = notNeededGames(games);
  assert.deepEqual([...out.keys()], [`mlb:${games[4].espn_id}`]);
  const played = swept();
  played[3] = { ...played[3], completed: true, status_state: "post", home_winner: true, away_winner: false };
  assert.equal(notNeededGames(played).has(`mlb:${played[3].espn_id}`), false);
});

test("series are kept apart by team pair and season", () => {
  const games = [...swept(), game("AL Division Series - Game 1", "4", "5", "away"), game("ALDS - Game 4 If Necessary", "5", "4", "open")];
  const out = notNeededGames(games);
  assert.equal(out.size, 2, "the CLE-CHW series is 1-0 and keeps its game 4");
  const lastYear = swept().map((g) => ({ ...g, season_year: 2025, home_winner: null, away_winner: null, completed: false, status_state: "pre" }));
  assert.equal(notNeededGames([...swept(), ...lastYear]).size, 2, "last year's open series does not borrow this year's wins");
});

test("best-of-3 wild card clinches at 2, best-of-7 at 4", () => {
  const wc = [game("AL Wild Card - Game 1", "18", "4", "away"), game("AL Wild Card - Game 2", "18", "4", "away"), game("AL Wild Card - Game 3", "4", "18", "open")];
  assert.equal(notNeededGames(wc).get(`mlb:${wc[2].espn_id}`)?.score, "2-0");
  const cs = [
    ...[1, 2, 3].map((i) => game(`NL Championship Series - Game ${i}`, "19", "8", "home")),
    game("NL Championship Series - Game 4", "8", "19", "open"),
    game("NLCS - Game 5 If Necessary", "8", "19", "open"),
  ];
  assert.equal(notNeededGames(cs).size, 0, "3-0 in a best-of-7 is not over");
  cs[3] = { ...cs[3], completed: true, status_state: "post", home_winner: false, away_winner: true };
  assert.equal(notNeededGames(cs).size, 1, "4-0 is");
});

test("a round whose format is not known, or not a series, is never hidden", () => {
  const unknown = [1, 2, 3, 4].map((i) => game(`Exhibition - Game ${i}`, "1", "2", "home")).concat(game("Exhibition - Game 5", "1", "2", "open"));
  assert.equal(notNeededGames(unknown).size, 0);
  const nfl = [game("Wild Card", "1", "2", "home"), game("Wild Card", "1", "2", "open")].map((g) => ({ ...g, league: "nfl" }));
  assert.equal(notNeededGames(nfl).size, 0);
  const noSeason = swept().map((g) => ({ ...g, season_year: null }));
  assert.equal(notNeededGames(noSeason).size, 0);
});

test("NBA best-of-7: hidden after four wins, whichever name the round has", () => {
  const nba = (round: string, home: string, away: string, r: "home" | "away" | "open") => ({ ...game(round, home, away, r), league: "nba" });
  const games = [
    nba("East 1st Round - Game 1", "1", "2", "home"),
    nba("East 1st Round - Game 2", "1", "2", "home"),
    nba("East 1st Round - Game 3", "2", "1", "away"),
    nba("East 1st Round - Game 4", "2", "1", "away"),
    nba("East 1st Round - Game 5", "1", "2", "open"),
  ];
  assert.equal(notNeededGames(games).size, 1, "team 1 has four wins, so game 5 goes");
  // At 3-1 the series is still open and game 5 stays.
  const open = [...games.slice(0, 3), nba("East 1st Round - Game 4", "2", "1", "home"), games[4]];
  assert.equal(notNeededGames(open).size, 0);
});

test("duplicate rows and a data fault (both sides at the clinching count) never decide a series", () => {
  const games = swept();
  assert.equal(notNeededGames([...games, games[0]]).size, 2, "a repeated row is one game");
  const fault = [
    game("AL Division Series - Game 1", "10", "30", "home"),
    game("AL Division Series - Game 2", "10", "30", "home"),
    game("AL Division Series - Game 3", "10", "30", "home"),
    game("AL Division Series - Game 4", "10", "30", "away"),
    game("AL Division Series - Game 5", "10", "30", "away"),
    game("AL Division Series - Game 6", "10", "30", "away"),
    game("ALDS - Game 7 If Necessary", "10", "30", "open"),
  ];
  assert.equal(notNeededGames(fault).size, 0);
});

test("a winner falls back on the score when the feed set no winner flags", () => {
  const scored = swept().map((g, i) => (i < 3 ? { ...g, home_winner: null, away_winner: null, home_score: i === 2 ? 1 : 5, away_score: i === 2 ? 4 : 2 } : g));
  assert.equal(notNeededGames(scored).size, 2);
});

test("seriesStates reports the wins", () => {
  const [s] = [...seriesStates(swept()).values()];
  assert.equal(s.length, 5);
  assert.equal(s.needed, 3);
  assert.equal(s.wins["10"], 3);
  assert.equal(s.wins["30"], 0);
  assert.equal(s.winner, "10");
});

test("placeholder sides: a CLE/CHW team is a label, then the team that won the series", () => {
  assert.deepEqual(placeholderParts("CLE/CHW"), ["CLE", "CHW"]);
  assert.equal(placeholderParts("CLE"), null);
  assert.equal(placeholderParts("ARS"), null);
  assert.equal(placeholderParts(null), null);
  assert.equal(placeholderName("CLE/CHW"), "Winner of CLE-CHW");
  assert.equal(placeholderName("TB"), null);
  assert.equal(isPlaceholderName("Winner of CLE-CHW"), true);
  assert.equal(isPlaceholderName("Cleveland Guardians"), false);

  const rows = (cleWins: number): SeriesGame[] =>
    [1, 2, 3].map((i) => ({ ...game(`AL Division Series - Game ${i}`, "4", "5", i <= cleWins ? "home" : "away"), home_abbr: "CLE", away_abbr: "CHW" }));
  assert.equal(placeholderWinners(rows(1)).size, 0, "1-2 is not decided");
  const w = placeholderWinners(rows(3));
  assert.equal(w.get("CLE/CHW"), "4");
  assert.equal(w.get("CHW/CLE"), "4");
  const chw = placeholderWinners(rows(0));
  assert.equal(chw.get("CLE/CHW"), "5");
});

// ---------------------------------------------------------------- isTimeTbd: the fixed placeholder time

const lcs = { completed: false, status_state: "pre", status_detail: "Scheduled", date: "2026-10-12T04:00:00.000Z" };

test("isTimeTbd: MLB LCS rows filed at 12:00 AM EDT with the bare status Scheduled have no time yet", () => {
  assert.equal(isTimeTbd(lcs, "mlb"), true);
  assert.equal(isTimeTbd({ ...lcs, date: "2026-11-02T05:00:00.000Z" }, "mlb"), true, "midnight Eastern in winter is 05:00 UTC");
  assert.equal(isTimeTbd({ ...lcs, status_detail: "TBD" }, undefined), true, "the old TBD rule is untouched");
});

test("isTimeTbd: real kickoffs are never TBD (evidence: production NBA/soccer/cricket games at exactly 04:00 UTC)", () => {
  // MLB's real evening starts, "Scheduled": 8 PM EDT is 00:00 UTC, not midnight Eastern.
  assert.equal(isTimeTbd({ ...lcs, date: "2026-10-09T00:00:00.000Z" }, "mlb"), false);
  assert.equal(isTimeTbd({ ...lcs, date: "2026-10-12T04:30:00.000Z" }, "mlb"), false);
  // NBA's real late tip-offs at 04:00 UTC carry the time as text.
  assert.equal(isTimeTbd({ ...lcs, status_detail: "Tue, November 10th at 11:00 PM EST", date: "2026-11-11T04:00:00.000Z" }, "nba"), false);
  // A bare "Scheduled" at 04:00 UTC in leagues where it is a real kickoff: cricket (Test day 1), soccer, MLS (9 PM Pacific = midnight Eastern).
  for (const league of ["test", "odi", "t20wc", "wbbl", "bbl", "epl", "laliga", "mls", "saudi", "ipl"]) assert.equal(isTimeTbd(lcs, league), false, league);
  // No league given: the rule cannot apply.
  assert.equal(isTimeTbd(lcs), false);
  // Only unplayed, scheduled games: never a game in play, over, or called off.
  assert.equal(isTimeTbd({ ...lcs, status_state: "in" }, "mlb"), false);
  assert.equal(isTimeTbd({ ...lcs, completed: true, status_state: "post" }, "mlb"), false);
  assert.equal(isTimeTbd({ ...lcs, status_detail: "Postponed" }, "mlb"), false);
  assert.equal(isTimeTbd({ ...lcs, date: undefined }, "mlb"), false);
  assert.equal(isTimeTbd({ ...lcs, date: "not a date" }, "mlb"), false);
});
