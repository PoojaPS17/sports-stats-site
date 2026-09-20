import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { outcome } from "./helpers/nextErrors";
import { absoluteUrl } from "../src/lib/site";
import { h2hPath } from "../src/lib/h2h";

// A head-to-head page with no meetings has nothing to index ("0-0-0 in 0 meetings"), so it renders noindex, and the
// h2h sitemap lists a pair only if its page is indexable. The page's `meetings` (getHeadToHead) and the sitemap's SQL
// twin (countedMeetingSql) are the same rule: a completed game with both scores, whose stage is not 'excluded', in
// either home/away order, in the same league. Every case below is asserted against both, on the same fixtures.
let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let analytics: typeof import("../src/lib/analytics");
let pageModule: typeof import("../src/app/[league]/h2h/[pair]/page");
let db: TestDb;

const TEAMS = ["alpha", "bravo", "charlie", "delta", "echo"]; // espn ids "1".."5"
// An epl team that is not in the current epl standings (id "6"), who has played alpha.
const OUTSIDER = "foxtrot";

interface Fixture {
  id: string;
  home: string; // slug
  away: string;
  scores: [number, number] | null;
  completed: boolean;
  seasonType?: number;
  round?: string;
  detail?: string;
}

// nba games (season_type 2 = regular season unless stated); each id names the pair it belongs to, see EXPECTED below.
const NBA_GAMES: Fixture[] = [
  { id: "ab", home: "alpha", away: "bravo", scores: [100, 90], completed: true },
  { id: "ab-2", home: "bravo", away: "alpha", scores: [97, 99], completed: true }, // both home/away orders: still one URL, two meetings
  { id: "ad-future", home: "alpha", away: "delta", scores: null, completed: false },
  { id: "ae-noscore", home: "alpha", away: "echo", scores: null, completed: true },
  { id: "bc-postponed", home: "bravo", away: "charlie", scores: [0, 0], completed: false, detail: "Postponed" },
  { id: "bd-preseason", home: "bravo", away: "delta", scores: [120, 80], completed: true, seasonType: 1 },
  { id: "be-reverse", home: "echo", away: "bravo", scores: [88, 99], completed: true },
  { id: "cd-reverse", home: "delta", away: "charlie", scores: [101, 101], completed: true },
  { id: "ce-playoffs", home: "charlie", away: "echo", scores: [95, 90], completed: true, seasonType: 3, round: "Finals" },
];

// Whether each of the C(5,2) pairs has a meeting the page counts, and so is indexable and listed.
const EXPECTED: Record<string, boolean> = {
  "alpha-bravo": true, // met in both home/away orders
  "alpha-charlie": false, // they only met in the epl (league is part of the rule)
  "alpha-delta": false, // only an unplayed fixture
  "alpha-echo": false, // completed but no score
  "bravo-charlie": false, // only a postponed game (not completed)
  "bravo-delta": false, // only a preseason game: the page lists it but does not count it
  "bravo-echo": true, // played with the second team at home
  "charlie-delta": true, // played with the first team away
  "charlie-echo": true, // playoffs count
  "delta-echo": false, // never met
};

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  analytics = await import("../src/lib/analytics");
  pageModule = await import("../src/app/[league]/h2h/[pair]/page");
  const id = (slug: string) => String([...TEAMS, OUTSIDER].indexOf(slug) + 1);
  for (const league of ["nba", "epl"]) {
    for (const slug of TEAMS) {
      await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, $2, $3, $3)`, [league, id(slug), slug]);
    }
  }
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('epl', $1, $2, $2)`, [id(OUTSIDER), OUTSIDER]);
  // nba: all five teams are in the current standings; epl: only alpha and charlie.
  for (const slug of TEAMS) await db.pool.query(`insert into standings (league, season, team_espn_id) values ('nba', 2026, $1)`, [id(slug)]);
  for (const slug of ["alpha", "charlie"]) await db.pool.query(`insert into standings (league, season, team_espn_id) values ('epl', 2026, $1)`, [id(slug)]);
  const insert = async (league: string, g: Fixture) =>
    db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, round, status_state, status_detail)
       values ($1, $2, '2026-01-10T00:00:00Z', $2, 2026, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [league, g.id, id(g.home), id(g.away), g.scores?.[0] ?? null, g.scores?.[1] ?? null, g.completed, league === "nba" ? (g.seasonType ?? 2) : null, g.round ?? null, g.detail ? "post" : null, g.detail ?? null]
    );
  for (const g of NBA_GAMES) await insert("nba", g);
  await insert("epl", { id: "epl-ac", home: "alpha", away: "charlie", scores: [2, 1], completed: true });
  await insert("epl", { id: "epl-af", home: "alpha", away: OUTSIDER, scores: [1, 1], completed: true });
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const pairs = Object.keys(EXPECTED).map((k) => k.split("-") as [string, string]);
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const robotsIndex = (m: { robots?: unknown }) => (m.robots as { index?: boolean } | null | undefined)?.index;

test("the fixtures cover every pair once", () => {
  assert.equal(pairs.length, (TEAMS.length * (TEAMS.length - 1)) / 2);
});

test("the page's meetings, its robots directive and the sitemap agree for every pair", async () => {
  const listed = new Set((await sitemapEntries("h2h-nba")).map((e) => e.url));
  for (const [a, b] of pairs) {
    const path = h2hPath("nba", a, b);
    const h2h = await analytics.getHeadToHead("nba", a, b);
    assert.ok(h2h, `${a} vs ${b} resolves`);
    const meta = await pageModule.generateMetadata(params({ league: "nba", pair: `${a}-vs-${b}` }));
    const expected = EXPECTED[`${a}-${b}`];
    assert.equal(h2h.meetings > 0, expected, `${a} vs ${b}: page meetings ${h2h.meetings}`);
    assert.equal(robotsIndex(meta), expected, `${a} vs ${b}: robots index`);
    assert.equal(listed.has(absoluteUrl(path)), expected, `${a} vs ${b}: listed in sitemap`);
  }
});

test("the h2h sitemap lists exactly the indexable pairs of that league, once each", async () => {
  const nba = (await sitemapEntries("h2h-nba")).map((e) => e.url).sort();
  const expected = pairs.filter(([a, b]) => EXPECTED[`${a}-${b}`]).map(([a, b]) => absoluteUrl(h2hPath("nba", a, b))).sort();
  assert.deepEqual(nba, expected);
  // The epl pair met in the epl only: listed there, and not listed for nba.
  assert.deepEqual((await sitemapEntries("h2h-epl")).map((e) => e.url), [absoluteUrl("/epl/h2h/alpha-vs-charlie")]);
});

test("a pair with no counted meetings keeps its canonical, follows links and does not say '0 meetings'", async () => {
  for (const [a, b] of pairs.filter(([x, y]) => !EXPECTED[`${x}-${y}`])) {
    const meta = await pageModule.generateMetadata(params({ league: "nba", pair: `${a}-vs-${b}` }));
    assert.deepEqual(meta.robots, { index: false, follow: true }, `${a} vs ${b}`);
    assert.deepEqual(meta.alternates, { canonical: absoluteUrl(h2hPath("nba", a, b)) });
    assert.ok(meta.description, "has a description");
    assert.doesNotMatch(meta.description, /0-0-0|\b0 meetings|in 0\b/, `${a} vs ${b}: ${meta.description}`);
    assert.doesNotMatch(String(meta.openGraph?.description), /0-0-0|\b0 meetings/);
  }
});

test("a pair that met in both home/away orders is listed once and counts both meetings", async () => {
  const h2h = await analytics.getHeadToHead("nba", "alpha", "bravo");
  assert.equal(h2h?.meetings, 2);
  assert.deepEqual(h2h?.games.map((g) => g.espn_id).sort(), ["ab", "ab-2"]);
  const urls = (await sitemapEntries("h2h-nba")).map((e) => e.url).filter((u) => u === absoluteUrl("/nba/h2h/alpha-vs-bravo"));
  assert.equal(urls.length, 1, "one URL for the pair, whichever side was at home");
});

test("a pair with counted meetings is indexable and keeps its record description", async () => {
  const meta = await pageModule.generateMetadata(params({ league: "nba", pair: "alpha-vs-bravo" }));
  assert.equal(robotsIndex(meta), true);
  assert.match(meta.description ?? "", /record \(2-0-0 in 2 meetings\)/);
});

test("a pair with a meeting but a team outside the current standings is not listed, though its page is indexable", async () => {
  // The sitemap only offers pairs of clubs in the current standings (its scope, not a noindex rule): the page rule
  // ignores standings, so a pair with a counted meeting stays indexable on the page and is merely left out of the list.
  const h2h = await analytics.getHeadToHead("epl", "alpha", OUTSIDER);
  assert.equal(h2h?.meetings, 1);
  const meta = await pageModule.generateMetadata(params({ league: "epl", pair: `alpha-vs-${OUTSIDER}` }));
  assert.equal(robotsIndex(meta), true);
  const urls = (await sitemapEntries("h2h-epl")).map((e) => e.url);
  assert.ok(!urls.includes(absoluteUrl(h2hPath("epl", "alpha", OUTSIDER))), "not in the epl sitemap");
  assert.ok(urls.includes(absoluteUrl("/epl/h2h/alpha-vs-charlie")), "sanity: both-in-standings pair is listed");
});

test("a zero-meeting page still renders for visitors, and the excluded-only pair still lists its game", async () => {
  for (const pair of ["alpha-vs-delta", "bravo-vs-delta"]) {
    const page = await outcome(() => pageModule.default(params({ league: "nba", pair })));
    assert.ok(typeof page === "object" && "value" in page, `${pair}: ${typeof page === "object" && "error" in page ? String((page.error as Error)?.stack ?? page.error) : String(page)}`);
    assert.ok(isValidElement(page.value));
  }
  const h2h = await analytics.getHeadToHead("nba", "bravo", "delta");
  assert.equal(h2h?.meetings, 0);
  assert.deepEqual(h2h?.games.map((g) => g.espn_id), ["bd-preseason"], "the page's list still shows the preseason game (unchanged)");
});

test("the twin and the page rule are one definition: countedMeetingSql selects exactly the games isCountedMeeting accepts", async () => {
  const { rows } = await db.pool.query(
    `select g.*, (${analytics.countedMeetingSql("g")}) as sql_counted from games g`
  );
  assert.equal(rows.length, NBA_GAMES.length + 2, "every nba and epl fixture row");
  assert.deepEqual([...new Set(rows.map((g) => g.league))].sort(), ["epl", "nba"]);
  for (const g of rows) assert.equal(g.sql_counted, analytics.isCountedMeeting(g), `game ${g.espn_id}`);
  assert.ok(rows.some((g) => g.sql_counted) && rows.some((g) => !g.sql_counted), "both outcomes are exercised");
});
