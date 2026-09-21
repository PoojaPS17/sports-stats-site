import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { League } from "../src/lib/leagues";
import type { StandingRow } from "../src/lib/queries";
import type { ComputedTableRow, ResultRow, TeamRef } from "../src/lib/analytics";

let db: TestDb;
let StandingsTable: typeof import("../src/components/StandingsTable").StandingsTable;
let StandingsExportCard: typeof import("../src/components/StandingsExportCard").StandingsExportCard;
let standingsExportWidth: typeof import("../src/components/StandingsExportCard").standingsExportWidth;
let ComputedStandingsTable: typeof import("../src/components/ComputedStandingsTable").ComputedStandingsTable;
let TeamHistoryExportCard: typeof import("../src/components/TeamHistoryExportCard").TeamHistoryExportCard;
let sortStandings: typeof import("../src/lib/standingsOrder").sortStandings;
let SeasonSummary: typeof import("../src/components/SeasonSummary").SeasonSummary;
let analytics: typeof import("../src/lib/analytics");
let teamSummary: typeof import("../src/lib/teamSummary");

before(async () => {
  db = await startTestDb();
  ({ StandingsTable } = await import("../src/components/StandingsTable"));
  ({ StandingsExportCard, standingsExportWidth } = await import("../src/components/StandingsExportCard"));
  ({ ComputedStandingsTable } = await import("../src/components/ComputedStandingsTable"));
  ({ TeamHistoryExportCard } = await import("../src/components/TeamHistoryExportCard"));
  ({ sortStandings } = await import("../src/lib/standingsOrder"));
  ({ SeasonSummary } = await import("../src/components/SeasonSummary"));
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
    no_result: null, net_run_rate: null, rank: null, zone: null, ...over,
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

// Two tables side by side each get (width - 112) / 2 px, and ExportGroup clips what does not fit. A soccer group
// table (name + P W D L GF GA GD Pts) measured 508px against 436px in a 980px image with "Borussia Mönchengladbach"
// in it. Checked in a browser after the fix: 457px natural width against 466px available at 1040px (see the report);
// node has no layout engine, so these pin the numbers that fix relies on.
test("a Champions League group-stage image is wider than the default side-by-side card and its tables are compact", () => {
  const groups = sortStandings("ucl", [
    row("Borussia Mönchengladbach", { season: 2019, conference: "Group A", wins: 4, draws: 1, losses: 1, points: 13, goals_for: 14, goals_against: 5, rank: 1 }),
    row("Paris Saint-Germain", { season: 2019, conference: "Group B", wins: 4, draws: 1, losses: 1, points: 13, goals_for: 14, goals_against: 5, rank: 1 }),
  ]);
  const width = standingsExportWidth("ucl" as League, groups);
  assert.ok(width >= 1040, `width ${width}`);
  const markup = html(createElement(StandingsExportCard, { league: "ucl" as League, standings: groups, title: "t", subtitle: null, context: "c" }));
  assert.match(markup, /padding:6px 5px/);
  assert.ok(!/padding:6px 8px/.test(markup), "no roomy cells in a side-by-side soccer table");
  assert.ok(markup.includes('<div style="white-space:normal">Borussia Mönchengladbach</div>'), "the club name may wrap instead of being clipped");
  // other cards keep their sizes and padding
  assert.equal(standingsExportWidth("epl" as League, sortStandings("epl", [row("A", { points: 3, wins: 1, conference: "g" })])), 720);
  const nfl = sortStandings("nfl", [row("A", { conference: "AFC", division: "AFC East", wins: 1, win_percent: "1" }), row("B", { conference: "NFC", division: "NFC East", wins: 1, win_percent: "1" })]);
  assert.equal(standingsExportWidth("nfl" as League, nfl), 980);
});

// ---- Qualification and relegation bands (Task 3) ----------------------------------------------------------

// The 2025-26 La Liga table as ESPN sent it (tests/fixtures/espn-laliga-2025-standings.json, trimmed from
// https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings?season=2025), as the site would store it.
function laligaRows(withNotes: boolean, played?: number): StandingRow[] {
  const data = JSON.parse(readFileSync(new URL("./fixtures/espn-laliga-2025-standings.json", import.meta.url), "utf8"));
  const stat = (e: any, n: string) => Number(e.stats.find((s: any) => s.name === n)?.displayValue ?? 0);
  return data.children[0].standings.entries.map((e: any) =>
    row(e.team.displayName, {
      conference: data.children[0].name, rank: stat(e, "rank"), points: stat(e, "points"), wins: played ? Math.floor(played / 2) : stat(e, "wins"), draws: played ? played - Math.floor(played / 2) : stat(e, "ties"),
      losses: played ? 0 : stat(e, "losses"), goals_for: stat(e, "pointsFor"), goals_against: stat(e, "pointsAgainst"), zone: withNotes ? e.note?.description ?? null : null,
    })
  );
}
/** The zone marker (class and tooltip) drawn on the row of a club. */
const markerOf = (markup: string, club: string) => {
  const tr = [...markup.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]).find((r) => r.includes(`>${club}<`));
  assert.ok(tr, `${club} row`);
  const m = /class="zone-marker ([^"]*)"(?: title="([^"]*)")?/.exec(tr);
  return { cls: (m?.[1] ?? "").trim(), title: m?.[2] ?? null };
};
const legendLabels = (markup: string) => [...markup.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));

test("a finished La Liga 2025-26 table is banded from each row's ESPN note; the legend lists only those labels", () => {
  const rows = sortStandings("laliga", laligaRows(true));
  const markup = html(createElement(StandingsTable, { league: "laliga" as League, standings: rows }));
  assert.deepEqual(markerOf(markup, "Real Betis"), { cls: "zone-1", title: "Champions League" }, "Betis, 5th");
  assert.deepEqual(markerOf(markup, "Celta Vigo"), { cls: "zone-2", title: "Europa League" }, "6th");
  assert.deepEqual(markerOf(markup, "Getafe"), { cls: "zone-4", title: "Conference League qualifying" }, "7th");
  assert.deepEqual(markerOf(markup, "Rayo Vallecano"), { cls: "", title: null }, "8th has no note");
  assert.deepEqual(markerOf(markup, "Real Sociedad"), { cls: "zone-2", title: "Europa League" }, "Real Sociedad, 10th");
  assert.deepEqual(markerOf(markup, "Levante"), { cls: "", title: null }, "16th");
  assert.deepEqual(markerOf(markup, "Mallorca"), { cls: "zone-3", title: "Relegation" }, "18th");
  assert.deepEqual(legendLabels(markup), ["Champions League", "Europa League", "Conference League qualifying", "Relegation"]);
  assert.ok(!markup.includes("Qualification places as at the start of the season"), "no start-of-season caption on a finished table");
});

test("the same finished La Liga rows without notes fall back to the positional rule (5th is Europa League, no Conference band)", () => {
  const rows = sortStandings("laliga", laligaRows(false));
  const markup = html(createElement(StandingsTable, { league: "laliga" as League, standings: rows }));
  assert.deepEqual(markerOf(markup, "Real Betis"), { cls: "zone-2", title: "Europa League" });
  assert.deepEqual(markerOf(markup, "Real Sociedad"), { cls: "", title: null });
  assert.deepEqual(legendLabels(markup), ["Champions League", "Europa League", "Relegation"]);
});

test("a La Liga season in progress: Conference League at 6th by position, legend entry and caption; last year's notes are ignored", () => {
  const rows = sortStandings("laliga", laligaRows(true, 20)).map((r) => ({ ...r, season: 2026 }));
  const markup = html(createElement(StandingsTable, { league: "laliga" as League, standings: rows }));
  assert.deepEqual(markerOf(markup, "Real Betis"), { cls: "zone-2", title: "Europa League" }, "5th by position, though the stale note says Champions League");
  assert.deepEqual(markerOf(markup, "Celta Vigo"), { cls: "zone-4", title: "Conference League" }, "6th");
  assert.deepEqual(markerOf(markup, "Real Sociedad"), { cls: "", title: null }, "10th");
  assert.deepEqual(legendLabels(markup), ["Champions League", "Europa League", "Conference League", "Relegation"]);
  assert.ok(markup.includes("Qualification places as at the start of the season; cup results can change them."));
});

test("a Premier League season in progress has no Conference band", () => {
  const rows = sortStandings("epl", Array.from({ length: 20 }, (_, i) => row(`Club ${String(i + 1).padStart(2, "0")}`, { season: 2026, conference: "g", rank: i + 1, wins: 5, draws: 1, losses: 4, points: 100 - i })));
  const markup = html(createElement(StandingsTable, { league: "epl" as League, standings: rows }));
  assert.deepEqual(markerOf(markup, "Club 06"), { cls: "", title: null });
  assert.deepEqual(legendLabels(markup), ["Champions League", "Europa League", "Relegation"]);
});

test("the standings image draws the same bands and legend from the notes, in its own colours", () => {
  const rows = sortStandings("laliga", laligaRows(true));
  const markup = html(createElement(StandingsExportCard, { league: "laliga" as League, standings: rows, title: "t", subtitle: null, context: "c" }));
  assert.ok(markup.includes("Conference League qualifying"));
  assert.ok(/background:#0f766e/.test(markup), "a colour for the Conference band");
  const running = sortStandings("laliga", laligaRows(true, 20));
  const live = html(createElement(StandingsExportCard, { league: "laliga" as League, standings: running, title: "t", subtitle: null, context: "c" }));
  assert.ok(live.includes("Conference League") && live.includes("Qualification places as at the start of the season"));
});

test("the season summary names 17th and 18th 'Relegated' in the Bundesliga and 16th 'Relegation play-off'", () => {
  const rows = sortStandings("bundesliga", Array.from({ length: 18 }, (_, i) => row(`Club ${String(i + 1).padStart(2, "0")}`, { conference: "g", rank: i + 1, wins: 17, draws: 0, losses: 17, points: 100 - i })));
  const markup = html(createElement(SeasonSummary, { league: "bundesliga" as League, playoffResults: [], standings: rows }));
  const lines = [...markup.matchAll(/<p class="text-sm">([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
  assert.deepEqual(lines, ["ChampionClub 01", "RelegatedClub 17, Club 18", "Relegation play-offClub 16"]);
});

test("the season summary for the Premier League still relegates the bottom three", () => {
  const rows = sortStandings("epl", Array.from({ length: 20 }, (_, i) => row(`Club ${String(i + 1).padStart(2, "0")}`, { conference: "g", rank: i + 1, wins: 19, draws: 0, losses: 19, points: 100 - i })));
  const markup = html(createElement(SeasonSummary, { league: "epl" as League, playoffResults: [], standings: rows }));
  const lines = [...markup.matchAll(/<p class="text-sm">([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
  assert.deepEqual(lines, ["ChampionClub 01", "RelegatedClub 18, Club 19, Club 20"]);
});

test("the season summary uses a finished season's notes: a Serie A play-off place is not 'Relegated'", () => {
  const notes: Record<number, string> = { 17: "Relegated via playoff", 19: "Relegated", 20: "Relegated" };
  const rows = sortStandings("seriea", Array.from({ length: 20 }, (_, i) => row(`Club ${String(i + 1).padStart(2, "0")}`, { season: 2022, conference: "g", rank: i + 1, wins: 19, draws: 0, losses: 19, points: 100 - i, zone: notes[i + 1] ?? null })));
  const markup = html(createElement(SeasonSummary, { league: "seriea" as League, playoffResults: [], standings: rows }));
  const lines = [...markup.matchAll(/<p class="text-sm">([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
  assert.deepEqual(lines, ["ChampionClub 01", "RelegatedClub 19, Club 20", "Relegation play-offClub 17"]);
});
