import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let analytics: typeof import("../src/lib/analytics");
before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  analytics = await import("../src/lib/analytics");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from standings");
  await db.pool.query("delete from teams");
});

interface Seed {
  name: string;
  conference?: string | null;
  division?: string | null;
  wins?: number;
  losses?: number;
  draws?: number | null;
  win_percent?: number;
  seed?: number | null;
  points?: number | null;
  gf?: number | null;
  ga?: number | null;
  rank?: number | null;
}
const idOf = (name: string) => `id-${name.toLowerCase().replace(/\W+/g, "-")}`;
async function seed(league: string, season: number, rows: Seed[]) {
  for (const r of rows) {
    await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, $2, $3, $2) on conflict do nothing`, [league, idOf(r.name), r.name]);
    await db.pool.query(
      `insert into standings (league, season, team_espn_id, conference, division, wins, losses, draws, win_percent, playoff_seed, points, goals_for, goals_against, rank)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [league, season, idOf(r.name), r.conference ?? null, r.division ?? null, r.wins ?? 0, r.losses ?? 0, r.draws ?? null, r.win_percent ?? 0, r.seed ?? null, r.points ?? null, r.gf ?? null, r.ga ?? null, r.rank ?? null]
    );
  }
}
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

// La Liga 2025: Levante, Osasuna and Mallorca all finish level on every key we can sort on except
// wins (the old order put Osasuna first); ESPN ranks them 16, 17, 18.
const LALIGA = [
  { name: "Osasuna", wins: 10, draws: 7, losses: 21, points: 37, gf: 45, ga: 60, rank: 17 },
  { name: "Mallorca", wins: 9, draws: 10, losses: 19, points: 37, gf: 45, ga: 60, rank: 18 },
  { name: "Levante", wins: 8, draws: 13, losses: 17, points: 37, gf: 45, ga: 60, rank: 16 },
  { name: "Leader", wins: 30, draws: 4, losses: 4, points: 94, gf: 90, ga: 20, rank: 1 },
];

test("getStandings and getStandingsBySeason return a soccer table in ESPN's rank order", async () => {
  await seed("laliga", 2025, LALIGA);
  const expected = ["Leader", "Levante", "Osasuna", "Mallorca"];
  assert.deepEqual(names(await queries.getStandings("laliga")), expected);
  assert.deepEqual(names(await queries.getStandingsBySeason("laliga", 2025)), expected);
  const [first] = await queries.getStandings("laliga");
  assert.equal(first.rank, 1);
});

test("a soccer table with no stored rank keeps the old order (points, GD, GF, wins)", async () => {
  await seed("epl", 2025, LALIGA.map((r) => ({ ...r, rank: null })));
  assert.deepEqual(names(await queries.getStandings("epl")), ["Leader", "Osasuna", "Mallorca", "Levante"]);
});

test("NFL divisions come out in record order: Pittsburgh 10-7 above Baltimore 8-9, whatever the point differential", async () => {
  const c = { conference: "American Football Conference", division: "AFC North" };
  await seed("nfl", 2025, [
    { ...c, name: "Baltimore Ravens", wins: 8, losses: 9, draws: 0, win_percent: 0.471, gf: 460, ga: 400 },
    { ...c, name: "Pittsburgh Steelers", wins: 10, losses: 7, draws: 0, win_percent: 0.588, seed: 4, gf: 380, ga: 380 },
    { ...c, name: "Cleveland Browns", wins: 5, losses: 12, draws: 0, win_percent: 0.294, gf: 300, ga: 380 },
  ]);
  assert.deepEqual(names(await queries.getStandings("nfl")), ["Pittsburgh Steelers", "Baltimore Ravens", "Cleveland Browns"]);
  assert.deepEqual(names(await queries.getStandingsBySeason("nfl", 2025)), ["Pittsburgh Steelers", "Baltimore Ravens", "Cleveland Browns"]);
});

test("a season where every team is 0-0 comes back by name and flagged unranked", async () => {
  await seed("nba", 2026, [
    { name: "Zephyrs", conference: "Western Conference" },
    { name: "Aces", conference: "Western Conference" },
    { name: "Middies", conference: "Eastern Conference" },
  ]);
  const rows = await queries.getStandingsBySeason("nba", 2026);
  assert.deepEqual(names(rows), ["Middies", "Aces", "Zephyrs"]);
  assert.ok(rows.every((r) => r.unranked));
});

test("getTeamHistory ranks an NFL season by win percentage: 7-9-1 Dallas is 21st of 32, not behind a better point differential", async () => {
  const rows: Seed[] = [];
  for (let i = 0; i < 20; i++) rows.push({ name: `Ahead ${i}`, conference: i % 2 ? "AFC" : "NFC", wins: 10, losses: 7, draws: 0, win_percent: 0.588, gf: 300, ga: 300 });
  rows.push({ name: "Big diff", conference: "AFC", wins: 7, losses: 10, draws: 0, win_percent: 0.412, gf: 500, ga: 300 });
  rows.push({ name: "Dallas", conference: "NFC", wins: 7, losses: 9, draws: 1, win_percent: 0.441, gf: 470, ga: 511 });
  for (let i = 0; i < 10; i++) rows.push({ name: `Below ${i}`, conference: "AFC", wins: 3, losses: 14, draws: 0, win_percent: 0.176, gf: 250, ga: 400 });
  await seed("nfl", 2025, rows);
  const [dal] = await analytics.getTeamHistory("nfl", idOf("Dallas"));
  assert.equal(dal.position, 21);
  assert.equal(dal.teamsInSeason, 32);
  assert.equal(dal.draws, 1);
  const [big] = await analytics.getTeamHistory("nfl", idOf("Big diff"));
  assert.equal(big.position, 22);
  const [top] = await analytics.getTeamHistory("nfl", idOf("Ahead 0"));
  assert.equal(top.position, 1); // twenty teams share the record, so they share first place
});

test("getTeamHistory follows ESPN's rank for a soccer season and still ranks a cup group within its group", async () => {
  await seed("laliga", 2025, LALIGA);
  assert.equal((await analytics.getTeamHistory("laliga", idOf("Levante")))[0].position, 2);
  assert.equal((await analytics.getTeamHistory("laliga", idOf("Osasuna")))[0].position, 3);
  assert.equal((await analytics.getTeamHistory("laliga", idOf("Mallorca")))[0].position, 4);

  await seed("ucl", 2020, [
    { name: "Bayern", conference: "Group A", wins: 5, draws: 1, losses: 0, points: 16, gf: 18, ga: 5, rank: 1 },
    { name: "Atletico", conference: "Group A", wins: 3, draws: 2, losses: 1, points: 11, gf: 11, ga: 8, rank: 2 },
    { name: "Porto", conference: "Group B", wins: 1, draws: 1, losses: 4, points: 4, gf: 3, ga: 12, rank: 1 },
  ]);
  const [porto] = await analytics.getTeamHistory("ucl", idOf("Porto"));
  assert.deepEqual([porto.position, porto.teamsInSeason], [1, 1]);
  const [atl] = await analytics.getTeamHistory("ucl", idOf("Atletico"));
  assert.deepEqual([atl.position, atl.teamsInSeason], [2, 2]);
});

test("getTeamHistory marks a season with no games played as not played", async () => {
  await seed("nba", 2026, [{ name: "Aces" }, { name: "Bees" }]);
  await seed("nba", 2025, [{ name: "Aces", wins: 50, losses: 32, win_percent: 0.61 }, { name: "Bees", wins: 40, losses: 42, win_percent: 0.49 }]);
  const history = await analytics.getTeamHistory("nba", idOf("Aces"));
  assert.deepEqual(history.map((h) => [h.season, h.played, h.position]), [[2025, true, 1], [2026, false, 1]]);
});

async function seedNflSeason() {
  const rows: Seed[] = [];
  for (let i = 0; i < 20; i++) rows.push({ name: `Ahead ${i}`, conference: i % 2 ? "AFC" : "NFC", wins: 10, losses: 7, draws: 0, win_percent: 0.588, gf: 300, ga: 300 });
  rows.push({ name: "Big diff", conference: "AFC", wins: 7, losses: 10, draws: 0, win_percent: 0.412, gf: 500, ga: 300 });
  rows.push({ name: "Dallas", conference: "NFC", wins: 7, losses: 9, draws: 1, win_percent: 0.441, gf: 470, ga: 511 });
  for (let i = 0; i < 10; i++) rows.push({ name: `Below ${i}`, conference: "AFC", wins: 3, losses: 14, draws: 0, win_percent: 0.176, gf: 250, ga: 400 });
  await seed("nfl", 2025, rows);
}

test("the compare page's league position for an NFL team is its league-wide rank by record (Dallas 21st of 32)", async () => {
  await seedNflSeason();
  const compare = await import("../src/lib/compare");
  const cmp = await compare.getTeamComparison("nfl", idOf("Dallas"), idOf("Big diff"));
  assert.ok(cmp);
  assert.deepEqual([cmp.a.position, cmp.a.teamsInTable, cmp.b.position], [21, 32, 22]);
  const position = cmp.groups.flatMap((g) => g.metrics).find((m) => m.label === "League position");
  assert.deepEqual([position?.a, position?.b], [21, 22]);
});

test("the compare page has no league position for a season nobody has played", async () => {
  await seed("nba", 2026, [{ name: "Aces", conference: "Eastern Conference" }, { name: "Bees", conference: "Eastern Conference" }]);
  const compare = await import("../src/lib/compare");
  const cmp = await compare.getTeamComparison("nba", idOf("Aces"), idOf("Bees"));
  assert.ok(cmp);
  assert.deepEqual([cmp.a.position, cmp.a.notStarted, cmp.b.position], [null, true, null]);
});

test("the team-history page's finishes agree with the table: DAL 2025 is 21st of 32 with W-L-T columns, and the finish cards follow", async () => {
  await seedNflSeason();
  const { renderToStaticMarkup } = await import("react-dom/server");
  const page = await import("../src/app/[league]/teams/[slug]/history/page");
  const element = await page.default({ params: Promise.resolve({ league: "nfl", slug: idOf("Dallas") }) });
  const markup = renderToStaticMarkup(element);
  const text = (s: string) => s.replace(/<[^>]+>/g, "").trim();
  // the first table is the page's; the share image's copy comes after it
  const table = /<table[\s\S]*?<\/table>/.exec(markup)![0];
  const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
  assert.deepEqual(headers, ["Season", "Finish", "Conference", "W", "L", "T", "Pct"]);
  const cells = [...markup.matchAll(/<tr class="table-row">([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])));
  assert.deepEqual(cells, [["2025", "21st / 32", "NFC", "7", "9", "1", "0.441"]]);
  assert.match(markup, /Best finish[\s\S]*?21st/);
  const top = renderToStaticMarkup(await page.default({ params: Promise.resolve({ league: "nfl", slug: idOf("Ahead 0") }) }));
  assert.match(top, /1st-place finishes[\s\S]*?>1</); // twenty teams share the record, so they share first place
});
