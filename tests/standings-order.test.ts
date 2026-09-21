import { test } from "node:test";
import assert from "node:assert/strict";
import type { League } from "../src/lib/leagues";
import { sortStandings, leagueWideRank } from "../src/lib/standingsOrder";
import type { StandingRow } from "../src/lib/queries";

// A standings row with everything a table sorts on; tests override only what they are about.
function row(name: string, over: Partial<StandingRow> = {}): StandingRow {
  return {
    season: 2025,
    team_espn_id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    abbreviation: null,
    logo_url: null,
    color: null,
    conference: null,
    division: null,
    wins: 0,
    losses: 0,
    win_percent: "0",
    streak: null,
    playoff_seed: null,
    draws: null,
    points: null,
    goals_for: null,
    goals_against: null,
    no_result: null,
    net_run_rate: null,
    rank: null,
    zone: null,
    ...over,
  };
}
const names = (rows: StandingRow[]) => rows.map((r) => r.name);

// Three clubs level on points, goal difference and goals scored, told apart only by ESPN's rank. The
// old keys (wins, then fewer losses) would put Osasuna first, which is the order the site showed.
const level = { points: 37, goals_for: 45, goals_against: 60 };
const laLigaBottom = () => [
  row("Osasuna", { ...level, wins: 10, draws: 7, losses: 21, rank: 17 }),
  row("Mallorca", { ...level, wins: 9, draws: 10, losses: 19, rank: 18 }),
  row("Levante", { ...level, wins: 8, draws: 13, losses: 17, rank: 16 }),
];

test("La Liga: clubs level on points, GD and GF follow ESPN's rank (Levante, Osasuna, Mallorca)", () => {
  assert.deepEqual(names(sortStandings("laliga", laLigaBottom())), ["Levante", "Osasuna", "Mallorca"]);
});

test("Serie A: Torino ahead of Parma when ESPN ranks them 12 and 13", () => {
  const rows = [
    row("Parma", { points: 44, goals_for: 34, goals_against: 41, wins: 10, draws: 14, losses: 14, rank: 13 }),
    row("Torino", { points: 44, goals_for: 34, goals_against: 41, wins: 9, draws: 17, losses: 12, rank: 12 }),
  ];
  assert.deepEqual(names(sortStandings("seriea", rows)), ["Torino", "Parma"]);
});

test("Champions League: rows level on every key are ordered by rank, and sections never mix their ranks", () => {
  const lp = { points: 13, goals_for: 13, goals_against: 9, wins: 4, draws: 1, losses: 3, conference: "UEFA Champions League" };
  const rows = [
    row("Dortmund", { ...lp, rank: 12 }),
    row("Betis", { ...lp, rank: 11 }),
    row("Group A second", { conference: "Group A", points: 9, wins: 3, draws: 0, losses: 3, rank: 2 }),
    row("Villa", { ...lp, rank: 9 }),
    row("Group A first", { conference: "Group A", points: 3, wins: 1, draws: 0, losses: 5, rank: 1 }),
    row("Lens", { ...lp, rank: 10 }),
  ];
  const sorted = sortStandings("ucl", rows);
  assert.deepEqual(names(sorted), ["Group A first", "Group A second", "Villa", "Lens", "Betis", "Dortmund"]);
});

test("a later stage table leads (Super Eights before the groups) and each keeps its own order", () => {
  const rows = [
    row("Group X", { conference: "Group A", rank: 1, points: 6, wins: 3, losses: 1 }),
    row("Super Y", { conference: "Super Eights Group 1", rank: 2, points: 2, wins: 1, losses: 2 }),
    row("Super Z", { conference: "Super Eights Group 1", rank: 1, points: 2, wins: 1, losses: 2 }),
  ];
  assert.deepEqual(names(sortStandings("t20wc", rows)), ["Super Z", "Super Y", "Group X"]);
});

test("cricket: ESPN's rank settles two sides level on points (IPL 2025 Lucknow above Kolkata)", () => {
  const rows = [
    row("Kolkata Knight Riders", { points: 12, wins: 5, losses: 7, net_run_rate: "0.30", rank: 8 }),
    row("Lucknow Super Giants", { points: 12, wins: 6, losses: 8, net_run_rate: "-0.20", rank: 7 }),
  ];
  assert.deepEqual(names(sortStandings("ipl", rows)), ["Lucknow Super Giants", "Kolkata Knight Riders"]);
});

// ESPN gives the NFL no `points` stat, so the table must follow win percentage, not point differential.
test("NFL 2025 AFC North: Pittsburgh 10-7 above Baltimore 8-9 even though Baltimore's point differential is better", () => {
  const north = { conference: "American Football Conference", division: "AFC North" };
  const rows = [
    row("Baltimore Ravens", { ...north, wins: 8, losses: 9, draws: 0, win_percent: "0.471", goals_for: 460, goals_against: 400 }),
    row("Cleveland Browns", { ...north, wins: 5, losses: 12, draws: 0, win_percent: "0.294", goals_for: 300, goals_against: 380 }),
    row("Pittsburgh Steelers", { ...north, wins: 10, losses: 7, draws: 0, win_percent: "0.588", playoff_seed: 4, goals_for: 380, goals_against: 380 }),
    row("Cincinnati Bengals", { ...north, wins: 6, losses: 11, draws: 0, win_percent: "0.353", goals_for: 350, goals_against: 430 }),
  ];
  assert.deepEqual(names(sortStandings("nfl", rows)), ["Pittsburgh Steelers", "Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns"]);
});

test("NFL: a tie counts half through win percentage (7-9-1 above 7-10-0, below 8-9-0; 9-7-1 above 9-8-0)", () => {
  const c = { conference: "National Football Conference" };
  const rows = [
    row("Seven-ten", { ...c, wins: 7, losses: 10, draws: 0, win_percent: "0.412" }),
    row("Dallas Cowboys", { ...c, wins: 7, losses: 9, draws: 1, win_percent: "0.441" }),
    row("Eight-nine", { ...c, wins: 8, losses: 9, draws: 0, win_percent: "0.471" }),
    row("Nine-eight", { ...c, wins: 9, losses: 8, draws: 0, win_percent: "0.529" }),
    row("Green Bay Packers", { ...c, wins: 9, losses: 7, draws: 1, win_percent: "0.559" }),
  ];
  assert.deepEqual(names(sortStandings("nfl", rows)), ["Green Bay Packers", "Nine-eight", "Eight-nine", "Dallas Cowboys", "Seven-ten"]);
});

test("NBA: equal win percentage is settled by playoff seed, then by name; a seeded team beats an unseeded one", () => {
  const c = { conference: "Eastern Conference", wins: 41, losses: 41, win_percent: "0.500" };
  const rows = [
    row("Zeta", { ...c }),
    row("Alpha", { ...c }),
    row("Seed five", { ...c, playoff_seed: 5 }),
    row("Seed four", { ...c, playoff_seed: 4 }),
    row("Top", { ...c, wins: 50, losses: 32, win_percent: "0.610", playoff_seed: 2 }),
  ];
  assert.deepEqual(names(sortStandings("nba", rows)), ["Top", "Seed four", "Seed five", "Alpha", "Zeta"]);
});

test("a section where nobody has played is sorted by name and flagged unranked; a started section is not", () => {
  const rows = [
    row("Zed", { conference: "Western Conference", wins: 0, losses: 0, win_percent: "0", playoff_seed: 1 }),
    row("Abe", { conference: "Western Conference", wins: 0, losses: 0, win_percent: "0" }),
    row("Mid", { conference: "Eastern Conference", wins: 3, losses: 1, win_percent: "0.75" }),
    row("Low", { conference: "Eastern Conference", wins: 1, losses: 3, win_percent: "0.25" }),
  ];
  const sorted = sortStandings("nba", rows);
  assert.deepEqual(names(sorted), ["Mid", "Low", "Abe", "Zed"]);
  assert.deepEqual(sorted.map((r) => Boolean(r.unranked)), [false, false, true, true]);
});

test("a soccer or cricket table where nobody has played is also unranked, whatever ESPN ranks say", () => {
  const rows = [row("B", { rank: 1, points: 0, draws: 0 }), row("A", { rank: 2, points: 0, draws: 0 })];
  const sorted = sortStandings("epl", rows);
  assert.deepEqual(names(sorted), ["A", "B"]);
  assert.ok(sorted.every((r) => r.unranked));
  const cricket = sortStandings("ipl", [row("B", { no_result: 0 }), row("A", { no_result: 0 })]);
  assert.ok(cricket.every((r) => r.unranked));
  // a lone abandoned match is still a played match
  assert.ok(!sortStandings("ipl", [row("B", { no_result: 1 }), row("A")]).some((r) => r.unranked));
});

test("soccer rows without a rank fall back to points, goal difference, goals for, wins, losses, then name", () => {
  const rows = [
    row("Name Z", { points: 50, goals_for: 40, goals_against: 30, wins: 15, losses: 10 }),
    row("Name A", { points: 50, goals_for: 40, goals_against: 30, wins: 15, losses: 10 }),
    row("More losses", { points: 50, goals_for: 40, goals_against: 30, wins: 15, losses: 12 }),
    row("Better GF", { points: 50, goals_for: 45, goals_against: 35, wins: 14, losses: 14 }),
    row("Better GD", { points: 50, goals_for: 41, goals_against: 30, wins: 14, losses: 14 }),
    row("Leader", { points: 60, goals_for: 10, goals_against: 30, wins: 1, losses: 30 }),
  ];
  assert.deepEqual(names(sortStandings("epl", rows)), ["Leader", "Better GD", "Better GF", "Name A", "Name Z", "More losses"]);
});

test("a ranked row goes above an unranked one in the same table", () => {
  const rows = [row("No rank", { points: 90, wins: 1 }), row("Ranked", { points: 10, wins: 1, rank: 3 })];
  assert.deepEqual(names(sortStandings("epl", rows)), ["Ranked", "No rank"]);
});

test("any other competition keeps the old keys and ignores rank", () => {
  const rows = [row("Low", { points: 1, rank: 1, wins: 1 }), row("High", { points: 5, rank: 2, wins: 1 })];
  assert.deepEqual(names(sortStandings("tennis" as unknown as League, rows)), ["High", "Low"]);
});

test("sortStandings does not mutate its input", () => {
  const rows = laLigaBottom();
  const before = names(rows);
  sortStandings("laliga", rows);
  assert.deepEqual(names(rows), before);
  assert.ok(rows.every((r) => r.unranked === undefined));
});

test("leagueWideRank ranks NFL/NBA across conferences by win percentage, then point differential (DAL 7-9-1 is 21st, not 20th)", () => {
  // 20 teams ahead on win percentage, one level with a better point differential is not needed: 20 ahead -> 21st.
  const rows: StandingRow[] = [];
  for (let i = 0; i < 20; i++) rows.push(row(`Ahead ${i}`, { conference: i % 2 ? "AFC" : "NFC", wins: 10, losses: 7, win_percent: "0.588", goals_for: 300, goals_against: 300 }));
  // a team on lower win% but a huge point differential that the old order ranked above Dallas
  rows.push(row("Big diff", { conference: "AFC", wins: 7, losses: 10, win_percent: "0.412", goals_for: 500, goals_against: 300 }));
  rows.push(row("Dallas", { conference: "NFC", wins: 7, losses: 9, draws: 1, win_percent: "0.441", goals_for: 470, goals_against: 511 }));
  const pos = leagueWideRank("nfl", rows);
  assert.equal(pos.get("dallas"), 21);
  assert.equal(pos.get("big-diff"), 22);
});

test("leagueWideRank leaves ties shared and, for other leagues, uses table order within the table", () => {
  const nfl = [row("A", { win_percent: "0.500", goals_for: 1, goals_against: 1 }), row("B", { win_percent: "0.500", goals_for: 1, goals_against: 1 }), row("C", { win_percent: "0.400" })];
  const pos = leagueWideRank("nfl", nfl);
  assert.deepEqual([pos.get("a"), pos.get("b"), pos.get("c")], [1, 1, 3]);
  const soccer = leagueWideRank("laliga", laLigaBottom());
  assert.deepEqual([soccer.get("levante"), soccer.get("osasuna"), soccer.get("mallorca")], [1, 2, 3]);
});

// A finished table must never be mistaken for a new season just because ESPN sent no W/L/D.
test("a table with games played but null draws is ranked, not sorted by name", () => {
  const rows = [
    row("Aaa", { wins: 5, losses: 20, draws: null, points: 15, goals_for: 20, goals_against: 50, rank: 2 }),
    row("Zzz", { wins: 20, losses: 5, draws: null, points: 60, goals_for: 60, goals_against: 20, rank: 1 }),
  ];
  const sorted = sortStandings("epl", rows);
  assert.deepEqual(names(sorted), ["Zzz", "Aaa"]);
  assert.ok(sorted.every((r) => !r.unranked));
});

test("a table with points but no W/L/D is ordered on its points, not marked as not started", () => {
  const bare = { wins: 0, losses: 0, draws: null, no_result: null };
  const rows = [row("Aaa", { ...bare, points: 30, rank: null }), row("Zzz", { ...bare, points: 70 }), row("Mmm", { ...bare, points: 50 })];
  const sorted = sortStandings("laliga", rows);
  assert.deepEqual(names(sorted), ["Zzz", "Mmm", "Aaa"]);
  assert.ok(sorted.every((r) => !r.unranked));
});

test("goals, a run rate or a win percentage alone also show a table has been played", () => {
  const goals = sortStandings("seriea", [row("Aaa", { goals_for: 1, goals_against: 3 }), row("Zzz", { goals_for: 9, goals_against: 0 })]);
  assert.deepEqual(names(goals), ["Zzz", "Aaa"]);
  const nrr = sortStandings("ipl", [row("Aaa", { net_run_rate: "-0.5" }), row("Zzz", { net_run_rate: "1.2" })]);
  assert.deepEqual(names(nrr), ["Zzz", "Aaa"]);
  const pct = sortStandings("nba", [row("Aaa", { win_percent: "0.400" }), row("Zzz", { win_percent: "0.700" })]);
  assert.deepEqual(names(pct), ["Zzz", "Aaa"]);
  for (const t of [goals, nrr, pct]) assert.ok(t.every((r) => !r.unranked));
});

test("zero and missing figures everywhere are still a table nobody has played in", () => {
  const rows = [row("Zzz", { points: 0, goals_for: 0, goals_against: 0, net_run_rate: "0.000", win_percent: "0", draws: null }), row("Aaa", { points: null, draws: 0 })];
  const sorted = sortStandings("epl", rows);
  assert.deepEqual(names(sorted), ["Aaa", "Zzz"]);
  assert.ok(sorted.every((r) => r.unranked));
});
