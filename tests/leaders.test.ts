// The pure rules behind the leader boards: competition ranking, the secondary sort, tie inclusion at the cutoff,
// the season's team list for a traded player, and which NBA figure (box scores or ESPN's own row) a season's average is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEADER_CAP, competitionRanks, nbaPerGame, nbaQualifyingGames, orderLeaders, pickLeaders, roundLeaderAverage, seasonTeams, teamsLabel, usesEspnSeasonLine, type NbaSeasonInputs } from "../src/lib/leaders";
import type { EspnSeasonTotals } from "../src/lib/espnSeason";

const cand = (id: string, name: string, value: number, secondary: number | null = null) => ({ player_espn_id: id, name, value, secondary });

test("competition ranking: equal values share a rank and the next rank skips (1, 2, 2, 2, 5)", () => {
  assert.deepEqual(competitionRanks([10, 9, 9, 9, 7]), [1, 2, 2, 2, 5]);
  assert.deepEqual(competitionRanks([5, 5, 5]), [1, 1, 1]);
  assert.deepEqual(competitionRanks([8, 7, 6]), [1, 2, 3]);
  assert.deepEqual(competitionRanks([]), []);
});

test("order: value desc, then the secondary desc (none last), then name, then id: never arbitrary", () => {
  const rows = [cand("4", "Zed", 10, 2), cand("2", "Bea", 10, 5), cand("1", "Ann", 10, 5), cand("3", "Cy", 10), cand("9", "Top", 12, 0), cand("5", "Ann", 10, 5)];
  assert.deepEqual(orderLeaders(rows).map((r) => r.player_espn_id), ["9", "1", "5", "2", "4", "3"]);
  // Input order never matters.
  assert.deepEqual(orderLeaders([...rows].reverse()).map((r) => r.player_espn_id), ["9", "1", "5", "2", "4", "3"]);
  // The secondary breaks the order but not the rank: equal goals share a rank whatever their assists.
  const picked = pickLeaders(rows, 10, { ties: true });
  assert.deepEqual(picked.rows.map((r) => r.rank), [1, 2, 2, 2, 2, 2]);
});

test("tie inclusion: everyone tied at the cutoff value is listed, so a top three can show five", () => {
  const rows = [cand("a", "A", 10), cand("b", "B", 9), cand("c", "C", 8), cand("d", "D", 8), cand("e", "E", 8), cand("f", "F", 5)];
  const withTies = pickLeaders(rows, 3, { ties: true });
  assert.deepEqual(withTies.rows.map((r) => [r.player_espn_id, r.rank]), [["a", 1], ["b", 2], ["c", 3], ["d", 3], ["e", 3]]);
  assert.equal(withTies.omitted, 0);
  // Without tie inclusion (the small cards) the list is exactly the limit, still ranked as a competition.
  const exact = pickLeaders(rows, 3);
  assert.deepEqual(exact.rows.map((r) => [r.player_espn_id, r.rank]), [["a", 1], ["b", 2], ["c", 3]]);
  // A tie just below the cutoff is not pulled in.
  assert.deepEqual(pickLeaders([cand("a", "A", 9), cand("b", "B", 8), cand("c", "C", 7), cand("d", "D", 6), cand("e", "E", 6)], 3, { ties: true }).rows.map((r) => r.player_espn_id), ["a", "b", "c"]);
});

test("a tie for the last place is listed whole up to the cap; the rest is counted, not silently dropped", () => {
  assert.equal(LEADER_CAP, 15);
  const rows = [cand("top", "Top", 30), ...Array.from({ length: 20 }, (_, i) => cand(`t${String(i).padStart(2, "0")}`, `Tied ${String(i).padStart(2, "0")}`, 20))];
  const picked = pickLeaders(rows, 10, { ties: true });
  assert.equal(picked.rows.length, 15);
  assert.equal(picked.omitted, 6);
  assert.deepEqual(picked.rows.map((r) => r.rank), [1, ...Array(14).fill(2)]);
  assert.equal(pickLeaders(rows.slice(0, 13), 10, { ties: true }).omitted, 0);
});

test("values of zero or below are never a leader", () => {
  assert.deepEqual(pickLeaders([cand("a", "A", 0), cand("b", "B", 3)], 10, { ties: true }).rows.map((r) => r.player_espn_id), ["b"]);
});

const stint = (espn_id: string, name: string, first_date: string) => ({ espn_id, name, slug: name.toLowerCase().replace(/ /g, "-"), first_date });

test("the season's teams: one team, several in the order the player joined them, or none", () => {
  assert.deepEqual(seasonTeams([stint("1", "Boston Celtics", "2025-10-22T00:00:00Z")]).map((t) => t.name), ["Boston Celtics"]);
  const traded = seasonTeams([stint("2", "Philadelphia 76ers", "2026-02-10T00:00:00Z"), stint("1", "Boston Celtics", "2025-10-22T00:00:00Z"), stint("2", "Philadelphia 76ers", "2026-03-01T00:00:00Z")]);
  assert.deepEqual(traded.map((t) => t.name), ["Boston Celtics", "Philadelphia 76ers"]);
  assert.equal(teamsLabel(traded), "Boston Celtics / Philadelphia 76ers");
  assert.equal(teamsLabel([]), null);
  assert.deepEqual(seasonTeams([]), []);
  // Date objects (what pg returns) sort the same as strings.
  assert.deepEqual(seasonTeams([{ ...stint("b", "B FC", "x"), first_date: new Date("2026-01-01") }, { ...stint("a", "A FC", "x"), first_date: new Date("2025-08-01") }]).map((t) => t.name), ["A FC", "B FC"]);
});

// ---------------------------------------------------------------------------
// NBA: ESPN's own row is the season's figure only where the page shows it (twin of buildProfile's useEspn).
// ---------------------------------------------------------------------------
const espn = (o: Partial<EspnSeasonTotals> = {}): EspnSeasonTotals => ({ games: 10, starts: 10, minutesPerGame: 30, pts: 250, reb: 60, ast: 50, stl: 10, blk: 5, to: 20, fgm: 90, fga: 190, tpm: 20, tpa: 50, ftm: 30, fta: 40, ...o });
const inputs = (o: Partial<NbaSeasonInputs> = {}): NbaSeasonInputs => ({ logged: 10, unrecorded: 0, recordedPoints: 200, teams: 1, storedGames: 10, espn: espn(), ...o });

test("NBA source: box scores when ESPN counts no more games than are logged, ESPN's row when box scores are short", () => {
  assert.equal(usesEspnSeasonLine(inputs()), false, "complete: box");
  assert.equal(usesEspnSeasonLine(inputs({ logged: 9, unrecorded: 1 })), true, "one game has no box score: ESPN");
  assert.equal(usesEspnSeasonLine(inputs({ logged: 0, unrecorded: 10, recordedPoints: 0 })), true, "every game blank: ESPN");
  assert.equal(usesEspnSeasonLine(inputs({ logged: 11 })), false, "the site is ahead of ESPN (its totals lag): box");
  assert.equal(usesEspnSeasonLine(inputs({ logged: 9, espn: null })), false, "no readable ESPN row: box");
  // ESPN's points below the recorded points: the row is not over the same games.
  assert.equal(usesEspnSeasonLine(inputs({ logged: 9, unrecorded: 1, recordedPoints: 400 })), false);
  // A traded player's row must cover the logged plus the listed games.
  assert.equal(usesEspnSeasonLine(inputs({ logged: 6, unrecorded: 1, teams: 2, espn: espn({ games: 7 }), storedGames: 7 })), true);
  assert.equal(usesEspnSeasonLine(inputs({ logged: 6, unrecorded: 5, teams: 2, espn: espn({ games: 8 }), storedGames: 8 })), false);
  // A stored games figure above the row's own games: the row does not cover the season.
  assert.equal(usesEspnSeasonLine(inputs({ logged: 9, unrecorded: 1, storedGames: 12 })), false);
});

test("NBA per game: ESPN's totals over ESPN's games, or the rows' sum over the rows with a figure; games follow the profile", () => {
  const fromEspn = nbaPerGame("pts", { ...inputs({ logged: 9, unrecorded: 1 }), sum: 200, n: 9 });
  assert.deepEqual([fromEspn.source, fromEspn.exact, fromEspn.games], ["espn", 25, 10]);
  const fromBox = nbaPerGame("pts", { ...inputs(), sum: 205, n: 10 });
  assert.deepEqual([fromBox.source, fromBox.exact, fromBox.games], ["box", 20.5, 10]);
  assert.equal(nbaPerGame("reb", { ...inputs({ logged: 9, unrecorded: 1 }), sum: 45, n: 9 }).exact, 6);
  // No row with a figure and no ESPN line: nothing to average.
  assert.equal(nbaPerGame("pts", { ...inputs({ logged: 0, espn: null }), sum: 0, n: 0 }).exact, null);
  // Games with no box score add to the box games (or ESPN's stored figure, when there is one), never below the logged ones.
  assert.equal(nbaPerGame("pts", { ...inputs({ logged: 8, unrecorded: 1, espn: null, storedGames: null }), sum: 160, n: 8 }).games, 9);
  assert.equal(nbaPerGame("pts", { ...inputs({ logged: 8, unrecorded: 1, espn: null, storedGames: 11 }), sum: 160, n: 8 }).games, 11);
});

test("the 70% qualifier is integer arithmetic (7 of 10, not 8) and the average rounds like the page's cell", () => {
  assert.equal(nbaQualifyingGames(82), 58);
  assert.equal(nbaQualifyingGames(10), 7);
  assert.equal(nbaQualifyingGames(1), 1);
  assert.equal(nbaQualifyingGames(0), 0);
  assert.equal(roundLeaderAverage(27.64), 27.6);
  assert.equal(roundLeaderAverage(27.65), 27.7);
  assert.equal(roundLeaderAverage(1234.56), 1234.6, "no grouping comma");
});
