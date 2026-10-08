// Audit 2026-10-08, cricket:
//  A. /status said "Test Cricket: none scheduled" while 28 Tests were listed: an international gets a games row only once finished;
//  B. the toss was missing on ~13% of older matches: one read of the IPL's id, no retry, and the miss was cached a day;
//  C. team records counted raw runs, so a rain-shortened (DLS) win was a loss; Tests, ties and no results were guessed;
//  D. Eswatini was two teams (Swaziland, stored under cs-swaziland, and ESPN's 300710).
/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures shaped like raw ESPN JSON */
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { summarizeTeamSeason, seasonResults } from "../src/lib/teamSummary";
import { fetchCricketSummaryResilient } from "../src/lib/cricketLive";
import { matchPills } from "../src/lib/cricketMatchExtras";
import { canonicalTeamSlug, canonicalTeamIdSql } from "../src/lib/teamAliases";
import type { GameRow } from "../src/lib/queries";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let status: typeof import("../src/lib/leagueStatus");
before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  status = await import("../src/lib/leagueStatus");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  for (const t of ["players", "teams", "games", "cricket_series_matches"]) await db.pool.query(`delete from ${t}`);
});

/* ------------------------------ C: team records ---------------------------- */

function game(league: string, over: Partial<GameRow>): GameRow {
  return {
    league, espn_id: "1", date: "2025-07-19T10:00:00Z", name: "x", short_name: null, home_score: null, away_score: null, home_score_display: null, away_score_display: null,
    home_winner: null, away_winner: null, season_year: 2025, status_state: "post", status_detail: null, status_summary: null, round: null, completed: true,
    home_team_espn_id: "ind", away_team_espn_id: "eng", home_name: "India Women", home_slug: "india-women", home_abbr: "IND-W", home_logo: null, home_color: null,
    away_name: "England Women", away_slug: "england-women", away_abbr: "ENG-W", away_logo: null, away_color: null, ...over,
  } as GameRow;
}

test("a rain-shortened chase won by the side with fewer raw runs is a win for it, a loss for the other (ESPN 1448403 shape)", () => {
  // India Women 160, England Women 139 on the scoreboard; England chased a DLS target and "won by 8 wkts (DLS)".
  const dls = game("wt20i", { home_score: 160, away_score: 139, status_summary: "ENG Women won by 8 wkts (DLS)" });
  assert.deepEqual(seasonResults([dls], "eng"), ["W"]);
  assert.deepEqual(seasonResults([dls], "ind"), ["L"]);
  const eng = summarizeTeamSeason([dls], "eng");
  assert.deepEqual([eng.wins, eng.losses, eng.draws], [1, 0, 0]);
  const ind = summarizeTeamSeason([dls], "ind");
  assert.deepEqual([ind.wins, ind.losses, ind.draws], [0, 1, 0]);
});

test("draws, ties and no results are never wins; a Test with nothing stated is left out, not guessed from first-innings runs", () => {
  const drawnTest = game("test", { home_score: 400, away_score: 250, status_summary: "Match drawn" });
  assert.deepEqual(seasonResults([drawnTest], "ind"), ["D"]);
  assert.deepEqual(seasonResults([drawnTest], "eng"), ["D"]);
  const tie = game("odi", { home_score: 250, away_score: 250, status_summary: "Match tied" });
  assert.deepEqual(seasonResults([tie], "ind"), ["D"]);
  const washed = game("odi", { home_score: 0, away_score: 0, status_summary: "No result" });
  assert.deepEqual(seasonResults([washed], "ind"), []);
  const unstated = game("test", { home_score: 400, away_score: 250, status_summary: null });
  assert.deepEqual(seasonResults([unstated], "ind"), []);
});

test("the stored result line decides over the runs, and the flags still decide when it names no team", () => {
  assert.deepEqual(seasonResults([game("odi", { home_score: 300, away_score: 200, status_summary: "England Women won by 3 wickets" })], "ind"), ["L"]);
  // Franchise short name the line cannot be matched to: the winner flag.
  assert.deepEqual(seasonResults([game("ipl", { home_score: 150, away_score: 190, home_winner: true, away_winner: false, status_summary: "Stars won by 1 run" })], "ind"), ["W"]);
  // Football is still decided by its score.
  assert.deepEqual(seasonResults([game("epl", { home_score: 2, away_score: 1 })], "ind"), ["W"]);
});

/* ------------------------------ A: /status --------------------------------- */

test("the next fixture of a league comes from the series listing too, and only for a fixture still to be played", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('test', '1', 'A', 'a'), ('test', '2', 'B', 'b'), ('odi', '1', 'A', 'a'), ('odi', '2', 'B', 'b')`);
  // Both leagues have a finished game, so both have a row on the page.
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values
    ('test', 'g1', now() - interval '30 days', 'x', '1', '2', 2026, true),
    ('odi', 'g2', now() - interval '30 days', 'x', '1', '2', 2026, true),
    ('odi', 'g3', now() + interval '20 days', 'x', '1', '2', 2026, false)`);
  const m = (id: string, cls: string, offset: string, state: string, summary: string | null = null) =>
    db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, international_class_id, status_state, status_summary) values ($1, 's', now() + $2::interval, 'n', $3, $4, $5)`, [id, offset, cls, state, summary]);
  await m("f1", "1", "10 days", "pre"); // the next Test
  await m("f2", "1", "40 days", "pre");
  await m("f3", "1", "3 days", "pre", "Match postponed"); // called off: not upcoming
  await m("f4", "1", "-2 days", "pre"); // start time already passed
  await m("f5", "1", "5 days", "post"); // not a fixture
  await m("f6", "2", "50 days", "pre"); // later than the ODI the games table already has
  await m("f7", "0", "1 day", "pre"); // a domestic card: no league here
  const rows = await status.getLeagueStatusRows();
  const next = (lg: string) => rows.find((r) => r.league === lg)?.next_scheduled ?? null;
  const days = (d: Date | null) => (d ? Math.round((d.getTime() - Date.now()) / 86_400_000) : null);
  assert.equal(days(next("test")), 10);
  assert.equal(days(next("odi")), 20);
});

test("a listed fixture that already has a finished game is not upcoming", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('test', '1', 'A', 'a'), ('test', '2', 'B', 'b')`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ('test', 'f1', now() + interval '1 hour', 'x', '1', '2', 2026, true)`);
  await db.pool.query(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, international_class_id, status_state) values ('f1', 's', now() + interval '1 hour', 'n', '1', 'pre')`);
  const rows = await status.getLeagueStatusRows();
  assert.equal(rows.find((r) => r.league === "test")?.next_scheduled, null);
});

/* ------------------------------ B: the toss -------------------------------- */

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});
const noSleep = { sleep: async () => {} };
const summary = (notes: any[] | undefined) => ({ header: { competitions: [{ competitors: [{ id: "1" }, { id: "2" }] }] }, notes });
const TOSS = [{ type: "toss", text: "India won the toss and chose to bat" }];
function stub(handler: (url: string) => any) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    urls.push(url);
    const out = handler(url);
    return new Response(JSON.stringify(out ?? { code: 2502, detail: "http error: bad gateway" }), { status: out ? 200 : 502 });
  }) as typeof fetch;
  return urls;
}

test("the toss is read from the match's own series when the IPL's copy has no notes", async () => {
  const urls = stub((u) => (u.includes("/cricket/8048/") ? summary(undefined) : summary(TOSS)));
  const got = await fetchCricketSummaryResilient("1525659", "8604", noSleep);
  assert.deepEqual(matchPills(got.notes), ["Toss: India won the toss and chose to bat"]);
  assert.match(urls[0], /cricket\/8604\/summary\?event=1525659$/);
});

test("a failed read is retried, and a second path is tried, before the toss is given up on", async () => {
  let own = 0;
  const urls = stub((u) => (u.includes("/cricket/8604/") ? (++own === 1 ? null : summary(TOSS)) : null));
  const got = await fetchCricketSummaryResilient("1525659", "8604", noSleep);
  assert.equal(matchPills(got.notes).length, 1);
  assert.equal(urls.length, 2);
  // Own path fails twice, the IPL's serves it.
  stub((u) => (u.includes("/cricket/8048/") ? summary(TOSS) : null));
  assert.equal(matchPills((await fetchCricketSummaryResilient("1", "8604", noSleep)).notes).length, 1);
});

test("when nothing answers, the last read is kept for the live window only (its own address), so a miss is not frozen for a day", async () => {
  const urls = stub(() => null);
  assert.equal(await fetchCricketSummaryResilient("1525659", "8604", { ...noSleep, revalidate: 86400 }), null);
  assert.match(urls[urls.length - 1], /attempt=2$/);
  assert.ok(urls.slice(0, -1).every((u) => !u.includes("attempt")));
});

test("an abandoned match with no toss note anywhere still renders from its summary", async () => {
  stub(() => summary([{ type: "seriesnote", text: "x" }]));
  const got = await fetchCricketSummaryResilient("1", "8604", noSleep);
  assert.deepEqual(matchPills(got.notes).filter((p) => p.startsWith("Toss")), []);
});

/* --------------------------- D: Eswatini, one team ------------------------- */

async function seedEswatini() {
  await db.pool.query(`insert into teams (league, espn_id, name, slug, abbreviation, logo_url) values
    ('t20i', 'cs-swaziland', 'Swaziland', 'swaziland', 'SWA', null),
    ('t20i', '300710', 'Eswatini', 'eswatini', 'SWZ', 'https://a.espncdn.com/i/teamlogos/cricket/500/300710.png'),
    ('t20i', '120', 'Malawi', 'malawi', 'MWI', null)`);
  await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_summary) values
    ('t20i', 'old', '2021-10-17', 'x', 'cs-swaziland', '120', 2021, true, 'Eswatini won by 5 runs'),
    ('t20i', 'new', '2021-10-23', 'x', '120', '300710', 2021, true, 'Malawi won by 3 wickets')`);
  await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug, roster_seen_at) values ('t20i', 'p1', 'cs-swaziland', 'Old Player', 'old-player', now()), ('t20i', 'p2', '300710', 'New Player', 'new-player', now())`);
}

test("Eswatini's team page reads the 2021 matches filed under Swaziland: one record, one name", async () => {
  await seedEswatini();
  assert.deepEqual(await queries.getTeamSeasons("t20i", "300710"), [2021]);
  const games = await queries.getTeamGamesBySeason("t20i", "300710", 2021);
  assert.equal(games.length, 2);
  for (const g of games) {
    const mine = g.home_team_espn_id === "300710" ? g.home_name : g.away_name;
    assert.equal(mine, "Eswatini");
  }
  const s = summarizeTeamSeason(games, "300710");
  // Eswatini won the first (as the stored home side, "cs-swaziland") and lost the second: 1-1, not 0-1.
  assert.deepEqual([s.wins, s.losses, s.draws], [1, 1, 0]);
  assert.deepEqual((await queries.getTeamRoster("t20i", "300710")).map((p) => p.name).sort(), ["New Player", "Old Player"]);
});

test("the alias leaves the team list, and a player filed under it names Eswatini", async () => {
  await seedEswatini();
  assert.deepEqual((await queries.getAllTeams("t20i")).map((t) => t.name), ["Eswatini", "Malawi"]);
  assert.equal((await queries.getPlayerBySlug("t20i", "old-player"))?.team_name, "Eswatini");
  assert.equal(canonicalTeamSlug("t20i", "swaziland"), "eswatini");
  assert.equal(canonicalTeamSlug("t20i", "eswatini"), null);
  assert.equal(canonicalTeamSlug("odi", "swaziland"), null);
  assert.match(canonicalTeamIdSql("g.league", "g.home_team_espn_id"), /cs-swaziland/);
});
