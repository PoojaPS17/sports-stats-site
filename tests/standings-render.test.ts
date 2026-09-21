import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { League } from "../src/lib/leagues";
import type { StandingRow } from "../src/lib/queries";
import type { ComputedTableRow, ResultRow, TeamRef } from "../src/lib/analytics";

let db: TestDb;
let StandingsTable: typeof import("../src/components/StandingsTable").StandingsTable;
let StandingsExportCard: typeof import("../src/components/StandingsExportCard").StandingsExportCard;
let ComputedStandingsTable: typeof import("../src/components/ComputedStandingsTable").ComputedStandingsTable;
let TeamHistoryExportCard: typeof import("../src/components/TeamHistoryExportCard").TeamHistoryExportCard;
let sortStandings: typeof import("../src/lib/standingsOrder").sortStandings;
let analytics: typeof import("../src/lib/analytics");
let teamSummary: typeof import("../src/lib/teamSummary");

before(async () => {
  db = await startTestDb();
  ({ StandingsTable } = await import("../src/components/StandingsTable"));
  ({ StandingsExportCard } = await import("../src/components/StandingsExportCard"));
  ({ ComputedStandingsTable } = await import("../src/components/ComputedStandingsTable"));
  ({ TeamHistoryExportCard } = await import("../src/components/TeamHistoryExportCard"));
  ({ sortStandings } = await import("../src/lib/standingsOrder"));
  analytics = await import("../src/lib/analytics");
  teamSummary = await import("../src/lib/teamSummary");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

function row(name: string, over: Partial<StandingRow> = {}): StandingRow {
  return {
    season: 2025, team_espn_id: name.toLowerCase().replace(/\W+/g, "-"), name, slug: name.toLowerCase().replace(/\W+/g, "-"), abbreviation: null, logo_url: null, color: null,
    conference: null, division: null, wins: 0, losses: 0, win_percent: "0", streak: null, playoff_seed: null, draws: null, points: null, goals_for: null, goals_against: null,
    no_result: null, net_run_rate: null, rank: null, ...over,
  };
}
const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (fragment: string) => fragment.replace(/<[^>]+>/g, "").trim();
const heads = (markup: string) => [...markup.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
const bodyRows = (markup: string) => [...markup.matchAll(/<tr[^>]*>((?:(?!<\/tr>).)*?<td[\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])));
const h2s = (markup: string) => [...markup.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]));

const dallas = row("Dallas Cowboys", { conference: "National Football Conference", division: "NFC East", wins: 7, losses: 9, draws: 1, win_percent: "0.441", streak: null });

test("NFL standings show a T column between L and Pct, with the tie in it", () => {
  const rows = sortStandings("nfl", [dallas, row("Giants", { conference: "National Football Conference", division: "NFC East", wins: 2, losses: 15, draws: 0, win_percent: "0.118" })]);
  const markup = html(createElement(StandingsTable, { league: "nfl" as League, standings: rows }));
  assert.deepEqual(heads(markup), ["Team", "W", "L", "T", "Pct", "Streak"]);
  const [dal, nyg] = bodyRows(markup);
  assert.deepEqual(dal.slice(1), ["7", "9", "1", "0.441", "—"]);
  assert.deepEqual(nyg.slice(1, 4), ["2", "15", "0"], "the column is always there for the NFL, showing 0");
});

test("NBA standings have no T column", () => {
  const rows = sortStandings("nba", [row("Aces", { conference: "Eastern Conference", wins: 50, losses: 32, win_percent: "0.610" })]);
  assert.deepEqual(heads(html(createElement(StandingsTable, { league: "nba" as League, standings: rows }))), ["Team", "W", "L", "Pct", "Streak"]);
});

test("a domestic soccer table is headed by the league and season, not ESPN's group name, and has a P column", () => {
  const cases: [League, number, string, string][] = [
    ["seriea", 2026, "2026-2027 Italian Serie A", "Serie A 2026-27"],
    ["laliga", 2015, "2015/2016 Spanish Primera División", "La Liga 2015-16"],
    ["epl", 2015, "Barclays Premier League 2015-2016", "Premier League 2015-16"],
    ["laliga", 2026, "2026-27 LALIGA", "La Liga 2026-27"],
    ["bundesliga", 2025, "", "Bundesliga 2025-26"],
  ];
  for (const [league, season, group, heading] of cases) {
    const rows = sortStandings(league, [row("Levante", { season, conference: group || null, wins: 8, draws: 13, losses: 17, points: 37, goals_for: 45, goals_against: 60, rank: 16 })]);
    const markup = html(createElement(StandingsTable, { league, standings: rows }));
    assert.deepEqual(h2s(markup), [heading], group);
    assert.deepEqual(heads(markup), ["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]);
    assert.deepEqual(bodyRows(markup)[0].slice(1), ["38", "8", "13", "17", "45", "60", "-15", "37"]);
  }
});

test("Champions League group and stage names are left as they are", () => {
  const rows = sortStandings("ucl", [
    row("Bayern", { season: 2020, conference: "Group A", wins: 5, draws: 1, points: 16, rank: 1 }),
    row("Villa", { season: 2025, conference: "UEFA Champions League", wins: 5, draws: 1, points: 16, rank: 1 }),
  ]);
  assert.deepEqual(h2s(html(createElement(StandingsTable, { league: "ucl" as League, standings: rows }))), ["Group A", "UEFA Champions League"]);
});

test("a table nobody has played in prints dashes for positions and says the season has not started", () => {
  const rows = sortStandings("nba", [
    row("Zephyrs", { conference: "Western Conference" }),
    row("Aces", { conference: "Western Conference" }),
    row("Middies", { conference: "Eastern Conference", wins: 3, losses: 1, win_percent: "0.75" }),
  ]);
  const markup = html(createElement(StandingsTable, { league: "nba" as League, standings: rows }));
  assert.deepEqual(h2s(markup), ["Eastern Conference", "Western Conference" + "Season not started"]);
  // position, then the logo's initials and the name
  assert.deepEqual(bodyRows(markup).map((r) => r[0]), ["1MMiddies", "–AAces", "–ZZephyrs"]);
});

test("an unranked soccer table shows dashes and no qualification or relegation colours", () => {
  const rows = sortStandings("epl", Array.from({ length: 20 }, (_, i) => row(`Team ${String(i).padStart(2, "0")}`, { conference: "g", season: 2026, points: 0, draws: 0 })));
  const markup = html(createElement(StandingsTable, { league: "epl" as League, standings: rows }));
  assert.equal(bodyRows(markup).filter((r) => r[0].startsWith("–")).length, 20);
  assert.ok(!markup.includes("zone-1") && !markup.includes("zone-3"));
  assert.ok(markup.includes("Season not started"));
});

test("the standings image is the whole 32-team NFL table, with a T column, not the first 25", () => {
  const rows: StandingRow[] = [];
  for (let d = 0; d < 8; d++) {
    for (let t = 0; t < 4; t++) rows.push(row(`Team ${d}-${t}`, { conference: d < 4 ? "American Football Conference" : "National Football Conference", division: `${d < 4 ? "AFC" : "NFC"} D${d}`, wins: 10 - t, losses: 7 + t, draws: t === 1 ? 1 : 0, win_percent: String(0.6 - t * 0.1) }));
  }
  const markup = html(createElement(StandingsExportCard, { league: "nfl" as League, standings: sortStandings("nfl", rows), title: "NFL standings", subtitle: null, context: "NFL standings" }));
  assert.ok(!/more teams/.test(markup));
  assert.equal((markup.match(/Team \d-\d/g) ?? []).length, 32);
  assert.ok(heads(markup).includes("T"));
  const dallasLike = bodyRows(markup).find((r) => r[0].includes("Team 0-1"))!;
  assert.deepEqual(dallasLike.slice(1, 4), ["9", "8", "1"]);
});

test("the standings image for a soccer league has the P column and the league heading; an unstarted table shows dashes", () => {
  const markup = html(createElement(StandingsExportCard, { league: "seriea" as League, standings: sortStandings("seriea", [row("Torino", { season: 2026, conference: "2026-2027 Italian Serie A", wins: 1, draws: 1, losses: 0, points: 4, rank: 1 })]), title: "Serie A standings", subtitle: null, context: "x" }));
  assert.deepEqual(heads(markup), ["Team", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"]);
  assert.ok(markup.includes("Serie A 2026-27") && !markup.includes("Italian"));
  const fresh = html(createElement(StandingsExportCard, { league: "nba" as League, standings: sortStandings("nba", [row("Aces", { conference: "Eastern Conference" }), row("Bees", { conference: "Eastern Conference" })]), title: "NBA standings", subtitle: null, context: "x" }));
  assert.ok(fresh.includes("Season not started"));
  assert.deepEqual(bodyRows(fresh).map((r) => r[0]), ["–AAces", "–BBees"]);
});

test("the team-history image and the computed tables carry the tie", () => {
  const played = [{ season: 2025, position: 21, teamsInSeason: 32, wins: 7, losses: 9, draws: 1, points: null, goals_for: null, goals_against: null, win_percent: "0.441", conference: null, played: true }];
  const markup = html(createElement(TeamHistoryExportCard, { league: "nfl" as League, teamName: "Dallas Cowboys", teamLogo: null, teamColor: null, played, soccer: false, summary: [] }));
  assert.deepEqual(heads(markup).slice(0, 6), ["Season", "Finish", "W", "L", "T", "Pct"]);
  assert.deepEqual(bodyRows(markup)[0], ["2025", "21st / 32", "7", "9", "1", "0.441"]);
  const nba = html(createElement(TeamHistoryExportCard, { league: "nba" as League, teamName: "Aces", teamLogo: null, teamColor: null, played: [{ ...played[0], draws: null, wins: 50, losses: 32 }], soccer: false, summary: [] }));
  assert.deepEqual(heads(nba).slice(0, 5), ["Season", "Finish", "W", "L", "Pct"]);
});

const team = (id: string): TeamRef => ({ espn_id: id, name: `Team ${id}`, slug: `t${id}`, abbreviation: null, logo_url: null, color: null });
const game = (id: string, home: string, away: string, hs: number, as: number): ResultRow => ({ espn_id: id, date: "2025-09-07T00:00:00Z", season_year: 2025, round: null, home_team_espn_id: home, away_team_espn_id: away, home_score: hs, away_score: as });

test("computed NFL tables count a tie as half a win in Pct and in the order, and show it in a T column", () => {
  const teams = new Map(["A", "B", "C", "D"].map((id) => [id, team(id)]));
  const results = [game("1", "A", "B", 20, 10), game("2", "A", "B", 17, 17), game("3", "C", "D", 40, 0), game("4", "C", "D", 3, 10)];
  const table = analytics.computeTable("nfl", results, teams, "overall");
  assert.deepEqual(table.map((r) => r.team.espn_id), ["A", "C", "D", "B"], "A (1-0-1, .750) is ahead of C (1-1, .500) despite the smaller margin");
  const a = table[0];
  assert.equal(analytics.computedWinPct("nfl", a), 0.75);
  assert.equal(analytics.computedWinPct("nba", a), 0.5, "no ties in the NBA: the old formula");
  const markup = html(createElement(ComputedStandingsTable, { league: "nfl" as League, rows: table as ComputedTableRow[], scope: "overall" }));
  assert.deepEqual(heads(markup).slice(0, 6), ["Team", "P", "W", "L", "T", "PF"]);
  assert.deepEqual(bodyRows(markup)[0].slice(1, 6), ["2", "1", "0", "1", "37"]);
  assert.equal(bodyRows(markup)[0][8], "0.750");
});

test("formatWinLossTie writes W-L, and W-L-T once there is a tie", () => {
  assert.equal(teamSummary.formatWinLossTie(7, 9, 1), "7-9-1");
  assert.equal(teamSummary.formatWinLossTie(7, 10, 0), "7-10");
  assert.equal(teamSummary.formatWinLossTie(7, 10, null), "7-10");
});
