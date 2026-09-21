import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";
import { ALL_LEAGUES } from "../src/lib/leagues";
import { absoluteUrl } from "../src/lib/site";

let db: TestDb;
let HistoryPage: typeof import("../src/app/[league]/teams/[slug]/history/page").default;
let ComparePage: typeof import("../src/app/[league]/compare/page");
let CompareModeTabs: typeof import("../src/components/CompareModeTabs").CompareModeTabs;
let TeamHistoryExportCard: typeof import("../src/components/TeamHistoryExportCard").TeamHistoryExportCard;
let analytics: typeof import("../src/lib/analytics");
let sitemap: typeof import("../src/lib/sitemap");

before(async () => {
  db = await startTestDb();
  HistoryPage = (await import("../src/app/[league]/teams/[slug]/history/page")).default;
  ComparePage = await import("../src/app/[league]/compare/page");
  ({ CompareModeTabs } = await import("../src/components/CompareModeTabs"));
  ({ TeamHistoryExportCard } = await import("../src/components/TeamHistoryExportCard"));
  analytics = await import("../src/lib/analytics");
  sitemap = await import("../src/lib/sitemap");
  // WBBL: Perth in 2024 (a tie, no qualifier) and 2025 (no tie). The ESPN win percentage is always 0 for cricket.
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('wbbl', 'p', 'Perth Scorchers Women', 'perth-scorchers-women'), ('wbbl', 'q', 'Sydney Sixers Women', 'sydney-sixers-women')`);
  const rows: [number, string, number, number, number, number, number, number, number][] = [
    // season, team, wins, losses, ties, no result, points, rank, ...
    [2024, "p", 4, 5, 1, 0, 9, 5, 0],
    [2024, "q", 3, 5, 1, 1, 8, 6, 0],
    [2025, "p", 6, 4, 0, 0, 12, 3, 0],
    [2025, "q", 6, 3, 0, 1, 13, 2, 0],
  ];
  for (const [season, team, w, l, t, nr, pts, rank] of rows) {
    await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, draws, no_result, points, rank, win_percent, net_run_rate) values ('wbbl', $1, $2, $3, $4, $5, $6, $7, $8, 0, 0)`, [season, team, w, l, t, nr, pts, rank]);
  }
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const text = (fragment: string) => fragment.replace(/<[^>]+>/g, "").trim();
const heads = (markup: string) => [...markup.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
const tables = (markup: string) => markup.split("<table").slice(1).map((t) => "<table" + t);
const bodyRows = (markup: string) => [...markup.matchAll(/<tr[^>]*>((?:(?!<\/tr>).)*?<td[\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])));
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p), searchParams: Promise.resolve({}) });

test("getTeamHistory carries no_result and draws for a cricket team", async () => {
  const history = await analytics.getTeamHistory("wbbl", "q");
  assert.deepEqual(history.map((h) => [h.season, h.wins, h.losses, h.draws, h.no_result, h.points, h.position]), [[2024, 3, 5, 1, 1, 8, 2], [2025, 6, 3, 0, 1, 13, 1]]);
});

test("a cricket team's season history shows W, L, T, NR and Pts, and never a 0.000 percentage", async () => {
  const page = await HistoryPage(params({ league: "wbbl", slug: "sydney-sixers-women" }));
  const markup = renderToStaticMarkup(page);
  const [table, image] = tables(markup);
  assert.deepEqual(heads(table), ["Season", "Finish", "W", "L", "T", "NR", "Pts"]);
  assert.deepEqual(heads(image), ["Season", "Finish", "W", "L", "T", "NR", "Pts"], "the page's share image has the same columns");
  const rows = bodyRows(table);
  assert.deepEqual(rows.map((r) => [r[0], ...r.slice(2)]), [["2025", "6", "3", "0", "1", "13"], ["2024", "3", "5", "1", "1", "8"]]);
  assert.doesNotMatch(markup, /0\.000/);
  assert.doesNotMatch(markup, />Pct</);
});

test("with no tied match in any season the T column is left out", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('wbbl', 'z', 'Hobart Hurricanes Women', 'hobart-hurricanes-women')`);
  await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, draws, no_result, points, rank, win_percent) values ('wbbl', 2025, 'z', 7, 2, 0, 1, 15, 1, 0)`);
  const markup = renderToStaticMarkup(await HistoryPage(params({ league: "wbbl", slug: "hobart-hurricanes-women" })));
  for (const t of tables(markup)) assert.deepEqual(heads(t), ["Season", "Finish", "W", "L", "NR", "Pts"]);
  assert.doesNotMatch(markup, /0\.000/);
});

test("the season-history image for a cricket team has the same columns", () => {
  const played = [
    { season: 2024, position: 6, teamsInSeason: 8, wins: 3, losses: 5, draws: 1, no_result: 1, points: 8, goals_for: null, goals_against: null, win_percent: "0", conference: null, played: true },
    { season: 2025, position: 2, teamsInSeason: 8, wins: 6, losses: 3, draws: 0, no_result: 1, points: 13, goals_for: null, goals_against: null, win_percent: "0", conference: null, played: true },
  ];
  const markup = renderToStaticMarkup(createElement(TeamHistoryExportCard, { league: "wbbl", teamName: "Sydney Sixers Women", teamLogo: null, teamColor: null, played, soccer: false, summary: [] }));
  assert.deepEqual(heads(markup), ["Season", "Finish", "W", "L", "T", "NR", "Pts"]);
  assert.deepEqual(bodyRows(markup).map((r) => r.slice(1)), [["2nd / 8", "6", "3", "0", "1", "13"], ["6th / 8", "3", "5", "1", "1", "8"]]);
  assert.doesNotMatch(markup, /0\.000/);
  const nba = renderToStaticMarkup(createElement(TeamHistoryExportCard, { league: "nba", teamName: "Celtics", teamLogo: null, teamColor: null, played: [{ ...played[1], win_percent: "0.610", draws: null, no_result: null }], soccer: false, summary: [] }));
  assert.deepEqual(heads(nba), ["Season", "Finish", "W", "L", "Pct"]);
  assert.match(nba, /0\.610/);
});

test("a non-cricket history keeps its Pct column", async () => {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('nba', '1', 'Celtics', 'celtics')`);
  await db.pool.query(`insert into standings (league, season, team_espn_id, wins, losses, win_percent) values ('nba', 2025, '1', 61, 21, 0.744)`);
  const markup = renderToStaticMarkup(await HistoryPage(params({ league: "nba", slug: "celtics" })));
  for (const t of tables(markup)) assert.deepEqual(heads(t), ["Season", "Finish", "W", "L", "Pct"]);
  assert.match(markup, /0\.744/);
});

/* ---- /[league]/compare ---- */

test("every cricket league's team compare redirects to its players' compare; other leagues are unchanged", async () => {
  const cricket = ALL_LEAGUES.filter((l) => !["nba", "nfl", "epl", "laliga", "bundesliga", "seriea", "ucl"].includes(l));
  assert.ok(cricket.includes("ipl") && cricket.includes("wbbl") && cricket.includes("test"), `cricket leagues: ${cricket.join(",")}`);
  for (const league of cricket) {
    let digest = "";
    try {
      await ComparePage.default(params({ league }));
    } catch (err) {
      digest = (err as { digest?: string }).digest ?? "";
    }
    assert.equal(digest, `NEXT_REDIRECT;replace;/${league}/compare/players;307;`, league);
  }
  for (const league of ["nba", "nfl", "epl"]) {
    const result = await outcome(() => ComparePage.default(params({ league })));
    assert.ok(typeof result === "object" && "value" in result && isValidElement(result.value), `${league} still renders its team compare: ${JSON.stringify(result, (_k, v) => (v instanceof Error ? v.message : v))}`);
  }
  assert.equal(await outcome(() => ComparePage.default(params({ league: "cricket-not-a-league" }))), "not-found");
});

test("the redirect target is not itself a redirect, and metadata for a cricket compare does no team lookups", async () => {
  const meta = await ComparePage.generateMetadata({ params: Promise.resolve({ league: "ipl" }), searchParams: Promise.resolve({ a: "x", b: "y" }) });
  assert.deepEqual(meta, {});
  const players = await import("../src/app/[league]/compare/players/page");
  const result = await outcome(() => players.default({ params: Promise.resolve({ league: "ipl" }), searchParams: Promise.resolve({}) } as never));
  assert.ok(typeof result === "object" && "value" in result, "the players' compare renders (no redirect loop)");
});

test("no cricket compare tab points at the redirecting team compare, and the sitemap lists none", async () => {
  assert.equal(CompareModeTabs({ league: "ipl", active: "players" }), null);
  const nba = renderToStaticMarkup(createElement(CompareModeTabs, { league: "nba", active: "teams" }));
  assert.match(nba, /href="\/nba\/compare"/);
  assert.match(nba, /href="\/nba\/compare\/players"/);
  const urls = (await sitemap.sitemapEntries("core")).map((e) => e.url);
  assert.ok(urls.includes(absoluteUrl("/nba/compare")), "the NBA's team compare is still listed");
  for (const league of ["ipl", "wbbl", "test"]) assert.ok(!urls.includes(absoluteUrl(`/${league}/compare`)), league);
});
