import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { League } from "../src/lib/leagues";
import type { StandingRow } from "../src/lib/queries";

// Cricket points tables: the order when ESPN sent no rank, the tie column, the Q marker. The rows
// are real ESPN standings (site.api.espn.com/apis/v2/sports/cricket/<id>/standings?season=<year>&seasontype=2),
// name, wins, losses, ties, no result, points, net run rate, ESPN's rank, qualified.
type Real = [string, number, number, number | null, number, number, number, number, boolean];
const IPL_2015: Real[] = [
  ["Chennai Super Kings", 9, 5, 0, 0, 18, 0.709, 1, false],
  ["Mumbai Indians", 8, 6, 0, 0, 16, -0.043, 2, false],
  ["Royal Challengers Bengaluru", 7, 5, 0, 2, 16, 1.037, 3, false],
  ["Rajasthan Royals", 7, 5, 0, 2, 16, 0.062, 4, false],
  ["Kolkata Knight Riders", 7, 6, 0, 1, 15, 0.253, 5, false],
  ["Sunrisers Hyderabad", 7, 7, 0, 0, 14, -0.239, 6, false],
  ["Delhi Capitals", 5, 8, 0, 1, 11, -0.049, 7, false],
  ["Punjab Kings", 3, 11, 0, 0, 6, -1.436, 8, false],
];
const IPL_2025: Real[] = [
  ["Punjab Kings", 9, 4, null, 1, 19, 0.372, 1, true],
  ["Royal Challengers Bengaluru", 9, 4, null, 1, 19, 0.301, 2, true],
  ["Gujarat Titans", 9, 5, null, 0, 18, 0.254, 3, true],
  ["Mumbai Indians", 8, 6, null, 0, 16, 1.142, 4, true],
  ["Delhi Capitals", 7, 6, null, 1, 15, 0.011, 5, false],
  ["Sunrisers Hyderabad", 6, 7, null, 1, 13, -0.241, 6, false],
  ["Lucknow Super Giants", 6, 8, null, 0, 12, -0.376, 7, false],
  ["Kolkata Knight Riders", 5, 7, null, 2, 12, -0.305, 8, false],
  ["Rajasthan Royals", 4, 10, null, 0, 8, -0.549, 9, false],
  ["Chennai Super Kings", 4, 10, null, 0, 8, -0.647, 10, false],
];
const WBBL_2025: Real[] = [
  ["Hobart Hurricanes Women", 7, 2, 0, 1, 15, 0.662, 1, true],
  ["Sydney Sixers Women", 6, 3, 0, 1, 13, -0.313, 2, true],
  ["Perth Scorchers Women", 6, 4, 0, 0, 12, -0.132, 3, true],
  ["Melbourne Stars Women", 5, 4, 0, 1, 11, 0.629, 4, true],
  ["Melbourne Renegades Women", 5, 5, 0, 0, 10, 0.121, 5, false],
  ["Adelaide Strikers Women", 3, 4, 0, 3, 9, 0.077, 6, false],
  ["Sydney Thunder Women", 4, 5, 0, 1, 9, -0.124, 7, false],
  ["Brisbane Heat Women", 0, 9, 0, 1, 1, -0.869, 8, false],
];
const WBBL_2024: Real[] = [
  ["Melbourne Renegades Women", 7, 3, 0, 0, 14, 0.527, 1, true],
  ["Brisbane Heat Women", 7, 3, 0, 0, 14, 0.384, 2, true],
  ["Sydney Thunder Women", 6, 3, 0, 1, 13, -0.002, 3, true],
  ["Hobart Hurricanes Women", 5, 5, 0, 0, 10, 0.189, 4, true],
  ["Perth Scorchers Women", 4, 5, 1, 0, 9, -0.171, 5, false],
  ["Sydney Sixers Women", 3, 5, 1, 1, 8, -0.477, 6, false],
  ["Adelaide Strikers Women", 3, 6, 0, 1, 7, -0.357, 7, false],
  ["Melbourne Stars Women", 2, 7, 0, 1, 5, -0.205, 8, false],
];

let db: TestDb;
let sortStandings: typeof import("../src/lib/standingsOrder").sortStandings;
let leagueWideRank: typeof import("../src/lib/standingsOrder").leagueWideRank;
let standings: typeof import("../scripts/lib/standings");
let queries: typeof import("../src/lib/queries");
let StandingsTable: typeof import("../src/components/StandingsTable").StandingsTable;
let StandingsExportCard: typeof import("../src/components/StandingsExportCard").StandingsExportCard;
let standingsExportWidth: typeof import("../src/components/StandingsExportCard").standingsExportWidth;

before(async () => {
  db = await startTestDb();
  ({ sortStandings, leagueWideRank } = await import("../src/lib/standingsOrder"));
  standings = await import("../scripts/lib/standings");
  queries = await import("../src/lib/queries");
  ({ StandingsTable } = await import("../src/components/StandingsTable"));
  ({ StandingsExportCard, standingsExportWidth } = await import("../src/components/StandingsExportCard"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from standings");
  await db.pool.query("delete from teams");
});

const slug = (name: string) => name.toLowerCase().replace(/\W+/g, "-");
function asRows(real: Real[], over: { rank?: boolean; season?: number; conference?: string | null } = {}): StandingRow[] {
  return real.map(([name, wins, losses, ties, nr, points, nrr, rank, qualified]) => ({
    season: over.season ?? 2025, team_espn_id: slug(name), name, slug: slug(name), abbreviation: null, logo_url: null, color: null, conference: over.conference ?? null, division: null,
    wins, losses, win_percent: "0", streak: null, playoff_seed: null, draws: ties, points, goals_for: null, goals_against: null, no_result: nr, net_run_rate: String(nrr),
    rank: over.rank === false ? null : rank, zone: null, qualified: qualified ? true : null,
  }));
}
const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const shuffled = <T>(xs: T[]) => [...xs].reverse();

/* ---- order when ESPN sent no rank ---- */

test("IPL 2015 without ranks: points, then wins, then NRR (Mumbai 2nd on 8 wins, Bengaluru 3rd), as Wikipedia", () => {
  const rows = sortStandings("ipl", shuffled(asRows(IPL_2015, { rank: false, season: 2015 })));
  assert.deepEqual(names(rows), names(asRows(IPL_2015)));
});

test("IPL 2025 without ranks: Lucknow (6 wins) above Kolkata (5 wins) on 12 points, though Kolkata's NRR is better", () => {
  const rows = sortStandings("ipl", shuffled(asRows(IPL_2025, { rank: false })));
  assert.deepEqual(names(rows), names(asRows(IPL_2025)));
  assert.deepEqual(names(rows).slice(6, 8), ["Lucknow Super Giants", "Kolkata Knight Riders"]);
});

test("WBBL 2025-26 without ranks: net run rate before wins (Adelaide, 3 wins, above Thunder, 4 wins, on 9 points)", () => {
  const rows = sortStandings("wbbl", shuffled(asRows(WBBL_2025, { rank: false })));
  assert.deepEqual(names(rows), names(asRows(WBBL_2025)));
  assert.deepEqual(names(rows).slice(5, 7), ["Adelaide Strikers Women", "Sydney Thunder Women"]);
});

test("the order after points is per league: wins first for the IPL, WPL and World Cups, NRR first for the Big Bash leagues", () => {
  const level = (rank: number | null) => [
    { ...asRows(WBBL_2025, { rank: false })[5], rank }, // Adelaide: 3 wins, 9 points, NRR +0.077
    { ...asRows(WBBL_2025, { rank: false })[6], rank }, // Thunder: 4 wins, 9 points, NRR -0.124
  ];
  for (const league of ["ipl", "wpl", "cwc", "t20wc", "wcwc", "wt20wc"] as League[]) assert.deepEqual(names(sortStandings(league, level(null))), ["Sydney Thunder Women", "Adelaide Strikers Women"], league);
  for (const league of ["bbl", "wbbl"] as League[]) assert.deepEqual(names(sortStandings(league, level(null))), ["Adelaide Strikers Women", "Sydney Thunder Women"], league);
});

test("rows that have ESPN's rank keep it whatever the fallback keys say", () => {
  // Rank 2 has fewer wins and a worse NRR than rank 3 here; the rank wins.
  const [a, b] = asRows(WBBL_2025, { rank: false }).slice(5, 7);
  assert.deepEqual(names(sortStandings("wbbl", [{ ...a, rank: 2 }, { ...b, rank: 1 }])), [b.name, a.name]);
  assert.deepEqual(names(sortStandings("ipl", shuffled(asRows(IPL_2015)))), names(asRows(IPL_2015)));
});

test("a team's finish in the history uses the same fallback order (IPL 2015: Mumbai finishes 2nd)", () => {
  const ranks = leagueWideRank("ipl", asRows(IPL_2015, { rank: false }));
  assert.equal(ranks.get("mumbai-indians"), 2);
  assert.equal(ranks.get("royal-challengers-bengaluru"), 3);
});

/* ---- ingest ---- */

const stat = (name: string, displayValue: string) => ({ name, displayValue });
function espnEntry(r: Real, opts: { qualified?: boolean; tiesStat?: string } = {}) {
  const [name, wins, losses, ties, nr, points, nrr, rank, qualified] = r;
  const stats = [
    stat("rank", String(rank)),
    stat("matchesPlayed", String(wins + losses + (ties ?? 0) + nr)),
    stat("matchesWon", String(wins)),
    stat("matchesLost", String(losses)),
    stat("noresult", String(nr)),
    stat("matchPoints", String(points)),
    stat("netrr", String(nrr)),
    ...(ties !== null ? [stat("matchesTied", String(ties))] : []),
    ...(qualified && opts.qualified !== false ? [stat("qualified", "Y")] : []),
    ...(opts.tiesStat ? [stat("ties", opts.tiesStat)] : []),
  ];
  return { team: { id: slug(name), displayName: name }, stats };
}
const espnResponse = (year: number, entries: ReturnType<typeof espnEntry>[]) => ({ season: { year }, children: [{ name: "Points table", standings: { entries } }] });
const storedCricket = async (league: string, season: number) =>
  (await db.pool.query(`select team_espn_id, draws, no_result, qualified from standings where league = $1 and season = $2 order by rank`, [league, season])).rows;

test("a cricket table's matchesTied is stored as draws, and its qualified flag as qualified", async () => {
  await standings.upsertStandingsResponse("wbbl", espnResponse(2024, WBBL_2024.map((r) => espnEntry(r))));
  const rows = await storedCricket("wbbl", 2024);
  assert.equal(rows.length, 8);
  const perth = rows.find((r) => r.team_espn_id === "perth-scorchers-women");
  const sixers = rows.find((r) => r.team_espn_id === "sydney-sixers-women");
  assert.deepEqual([perth.draws, sixers.draws, sixers.no_result], [1, 1, 1]);
  assert.deepEqual(rows.map((r) => r.qualified), [true, true, true, true, null, null, null, null], "only the qualifiers carry the stat; the rest are unknown, not false");
  assert.equal(rows.find((r) => r.team_espn_id === "hobart-hurricanes-women").draws, 0);
});

test("a table with no matchesTied stat (the IPL 2025 feed) stores draws null, and no qualified stat stores null", async () => {
  await standings.upsertStandingsResponse("ipl", espnResponse(2015, IPL_2015.map((r) => espnEntry(r))));
  assert.ok((await storedCricket("ipl", 2015)).every((r) => r.qualified === null && r.draws === 0));
  await standings.upsertStandingsResponse("ipl", espnResponse(2025, IPL_2025.map((r) => espnEntry(r))));
  const rows = await storedCricket("ipl", 2025);
  assert.ok(rows.every((r) => r.draws === null));
  assert.equal(rows.filter((r) => r.qualified === true).length, 4);
});

test("a later fetch updates draws and qualified in place (the conflict branch)", async () => {
  await standings.upsertStandingsResponse("wbbl", espnResponse(2024, WBBL_2024.map((r) => espnEntry(r, { qualified: false }))));
  assert.ok((await storedCricket("wbbl", 2024)).every((r) => r.qualified === null));
  await standings.upsertStandingsResponse("wbbl", espnResponse(2024, WBBL_2024.map((r) => espnEntry(r))));
  const rows = await storedCricket("wbbl", 2024);
  assert.equal(rows.filter((r) => r.qualified === true).length, 4);
  assert.equal(rows.find((r) => r.team_espn_id === "perth-scorchers-women").draws, 1);
  // ESPN dropping a flag or explicitly sending N is followed, not kept.
  await standings.upsertStandingsResponse("wbbl", espnResponse(2024, WBBL_2024.map((r) => ({ ...espnEntry(r, { qualified: false }), stats: [...espnEntry(r, { qualified: false }).stats, stat("qualified", "N")] }))));
  assert.ok((await storedCricket("wbbl", 2024)).every((r) => r.qualified === false));
});

test("football keeps reading `ties`; a `ties` stat is never added to matchesTied", async () => {
  const feed = (stats: [string, string][]) => ({ season: { year: 2025 }, children: [{ name: "g", standings: { entries: [{ team: { id: "1" }, stats: stats.map(([n, v]) => stat(n, v)) }] } }] });
  await standings.upsertStandingsResponse("laliga", feed([["ties", "13"], ["rank", "3"]]));
  await standings.upsertStandingsResponse("nfl", feed([["ties", "1"], ["wins", "7"]]));
  await standings.upsertStandingsResponse("ipl", feed([["ties", "2"], ["matchesTied", "5"]]));
  const { rows } = await db.pool.query(`select league, draws, qualified from standings order by league`);
  assert.deepEqual(rows, [{ league: "ipl", draws: 2, qualified: null }, { league: "laliga", draws: 13, qualified: null }, { league: "nfl", draws: 1, qualified: null }]);
});

test("getStandingsBySeason returns draws and qualified for the page", async () => {
  await standings.upsertStandingsResponse("wbbl", espnResponse(2024, WBBL_2024.map((r) => espnEntry(r))));
  for (const r of WBBL_2024) await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('wbbl', $1, $2, $1) on conflict do nothing`, [slug(r[0]), r[0]]);
  const rows = await queries.getStandingsBySeason("wbbl", 2024);
  assert.equal(rows[0].name, "Melbourne Renegades Women");
  assert.equal(rows[0].qualified, true);
  assert.equal(rows.find((r) => r.name === "Perth Scorchers Women")!.draws, 1);
});

/* ---- render ---- */

const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (fragment: string) => fragment.replace(/<[^>]+>/g, "").trim();
const heads = (markup: string) => [...markup.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
const bodyRows = (markup: string) => [...markup.matchAll(/<tr[^>]*>((?:(?!<\/tr>).)*?<td[\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])));
const table = (league: League, real: Real[], seasonFinished = true, over = {}) => html(createElement(StandingsTable, { league, standings: sortStandings(league, asRows(real, over)), seasonFinished }));
const card = (league: League, real: Real[], seasonFinished = true) => html(createElement(StandingsExportCard, { league, standings: sortStandings(league, asRows(real)), title: "t", context: "c", seasonFinished }));

test("WBBL 2024: Perth and Sixers read M=10 with T=1, in a T column between L and NR", () => {
  const markup = table("wbbl", WBBL_2024);
  assert.deepEqual(heads(markup), ["Team", "M", "W", "L", "T", "NR", "Pts", "NRR"]);
  const rows = bodyRows(markup);
  const perth = rows.find((r) => r[0].includes("Perth"))!;
  const sixers = rows.find((r) => r[0].includes("Sixers"))!;
  assert.deepEqual(perth.slice(1), ["10", "4", "5", "1", "0", "9", "-0.171"]);
  assert.deepEqual(sixers.slice(1), ["10", "3", "5", "1", "1", "8", "-0.477"]);
  assert.deepEqual(rows.find((r) => r[0].includes("Renegades"))!.slice(1, 6), ["10", "7", "3", "0", "0"], "a team with no tie shows 0 in the column");
});

test("no T column when nobody in the table has tied (WBBL 2025, IPL 2025), and the old columns keep their wording", () => {
  assert.deepEqual(heads(table("wbbl", WBBL_2025)), ["Team", "M", "W", "L", "NR", "Pts", "NRR"]);
  assert.deepEqual(heads(table("ipl", IPL_2025)), ["Team", "M", "W", "L", "NR", "Pts", "NRR"]);
  assert.deepEqual(bodyRows(table("ipl", IPL_2025))[0].slice(1), ["14", "9", "4", "1", "19", "0.372"]);
});

test("the image has the same T column and M, and none when nobody tied", () => {
  const withTies = card("wbbl", WBBL_2024);
  assert.deepEqual(heads(withTies), ["Team", "M", "W", "L", "T", "NR", "Pts", "NRR"]);
  assert.deepEqual(bodyRows(withTies).find((r) => r[0].includes("Perth"))!.slice(1), ["10", "4", "5", "1", "0", "9", "-0.171"]);
  assert.deepEqual(heads(card("wbbl", WBBL_2025)), ["Team", "M", "W", "L", "NR", "Pts", "NRR"]);
});

test("a tournament with several tables shows T only in the table that has a tie", () => {
  const groupA = asRows(WBBL_2024.slice(0, 4), { conference: "Group A" });
  const groupB = asRows(WBBL_2024.slice(4), { conference: "Group B" });
  const markup = html(createElement(StandingsTable, { league: "t20wc" as League, standings: sortStandings("t20wc", [...groupA, ...groupB]) }));
  const [first, second] = markup.split("<section").slice(1);
  assert.deepEqual(heads(first), ["Team", "M", "W", "L", "NR", "Pts", "NRR"]);
  assert.deepEqual(heads(second), ["Team", "M", "W", "L", "T", "NR", "Pts", "NRR"]);
});

test("Q marks the qualifiers of a finished season, with a legend; a season still running shows none", () => {
  const done = table("ipl", IPL_2025, true);
  const qs = [...done.matchAll(/>Q<\/span>/g)].length;
  assert.equal(qs, 5, "four rows plus the legend's own Q");
  assert.match(done, /Qualified for the playoffs/);
  assert.equal(bodyRows(done).filter((r) => /Q$/.test(r[0])).length, 4);
  assert.ok(bodyRows(done).slice(0, 4).every((r) => /Q$/.test(r[0])) && bodyRows(done).slice(4).every((r) => !/Q$/.test(r[0])));
  const running = table("ipl", IPL_2025, false);
  assert.doesNotMatch(running, />Q</);
  assert.doesNotMatch(running, /Qualified for/);
});

test("a finished season whose feed flagged nobody shows no Q and no legend", () => {
  const markup = table("ipl", IPL_2015, true);
  assert.doesNotMatch(markup, />Q</);
  assert.doesNotMatch(markup, /Qualified for/);
});

test("a World Cup's legend says next stage; the image shows the marker and legend only for a finished season", () => {
  assert.match(table("wt20wc", WBBL_2025, true), /Qualified for the next stage/);
  const done = card("ipl", IPL_2025, true);
  assert.match(done, /Qualified for the playoffs/);
  assert.equal(bodyRows(done).filter((r) => /Q$/.test(r[0])).length, 4);
  const running = card("ipl", IPL_2025, false);
  assert.doesNotMatch(running, />Q</);
  assert.doesNotMatch(running, /Qualified for/);
});

test("football and NFL tables are unchanged by the cricket columns", () => {
  const row = (over: Partial<StandingRow>): StandingRow => ({ ...asRows(IPL_2025)[0], net_run_rate: null, qualified: true, ...over });
  const soccer = html(createElement(StandingsTable, { league: "laliga" as League, standings: [row({ wins: 8, draws: 13, losses: 17, points: 37, goals_for: 45, goals_against: 60, no_result: null })], seasonFinished: true }));
  assert.deepEqual(heads(soccer), ["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]);
  assert.doesNotMatch(soccer, />Q</);
  const nfl = html(createElement(StandingsTable, { league: "nfl" as League, standings: [row({ wins: 7, losses: 9, draws: 1, win_percent: "0.441", conference: "NFC", division: "NFC East", no_result: null })], seasonFinished: true }));
  assert.deepEqual(heads(nfl), ["Team", "W", "L", "T", "Pct", "Streak"]);
  assert.doesNotMatch(nfl, />Q</);
});

/* ---- the offseason recap's record, the image width ---- */

test("the offseason recap's cricket record carries ties and no results in words, so it agrees with the table and stays unambiguous", async () => {
  const { OffseasonRecap } = await import("../src/components/OffseasonRecap");
  const { cricketRecord } = await import("../src/lib/cricketStandings");
  assert.equal(cricketRecord({ wins: 4, losses: 5, draws: 1, no_result: 0 }), "4-5, 1 tie");
  assert.equal(cricketRecord({ wins: 3, losses: 5, draws: 1, no_result: 1 }), "3-5, 1 tie, 1 NR");
  assert.equal(cricketRecord({ wins: 3, losses: 5, draws: 0, no_result: 1 }), "3-5, 1 NR");
  assert.equal(cricketRecord({ wins: 9, losses: 5, draws: null, no_result: null }), "9-5");
  assert.equal(cricketRecord({ wins: 3, losses: 4, draws: 2, no_result: 2 }), "3-4, 2 ties, 2 NR");
  const table = asRows(WBBL_2024);
  const recap = { season: 2024, seasonLabel: "2024", tableSize: 8, table: sortStandings("wbbl", table), playoffs: [], champion: null, endedOn: null, endedOnLocal: null, leaders: [], closingGames: [] } as never;
  const markup = renderToStaticMarkup(createElement(OffseasonRecap, { league: "wbbl", recap }));
  assert.match(markup, /Perth Scorchers Women[\s\S]*?4-5, 1 tie</, "Perth: T=1 in the table, so 1 tie here");
  assert.match(markup, /Sydney Sixers Women[\s\S]*?3-5, 1 tie, 1 NR</);
  assert.match(markup, /Melbourne Renegades Women[\s\S]*?7-3</);
  assert.doesNotMatch(markup, /3-5-1/);
});

test("a side-by-side cricket image is wider when a table has a T column (a World Cup group with a tie), and not otherwise", () => {
  const groups = (tie: number) => sortStandings("t20wc", [
    ...asRows(WBBL_2024.slice(0, 4), { conference: "Group A" }).map((r, i) => ({ ...r, draws: i === 0 ? tie : 0 })),
    ...asRows(WBBL_2024.slice(4), { conference: "Group B" }).map((r) => ({ ...r, draws: 0 })),
  ]);
  // Measured in a browser (Chromium, the export card at 980px): with a T column and "United States of America" a
  // group table's natural width was 447px against 436px available, so its name was clipped; at 1040px 466px.
  assert.equal(standingsExportWidth("t20wc" as League, groups(1)), 1040);
  assert.equal(standingsExportWidth("t20wc" as League, groups(0)), 980);
  assert.equal(standingsExportWidth("wbbl" as League, sortStandings("wbbl", asRows(WBBL_2024))), 720, "one table stays the single-table width");
  assert.equal(standingsExportWidth("t20wc" as League, groups(1)) >= standingsExportWidth("t20wc" as League, groups(0)), true);
});
