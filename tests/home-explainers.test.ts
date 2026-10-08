// The first-visit explainers say things about the site. Each claim is either derived from a constant the code also uses
// or pinned here to the code it describes, so copy cannot drift away from what the site does.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

const root = join(__dirname, "..");
let db: TestDb;
let X: typeof import("../src/lib/homeExplainers");
let data: typeof import("../src/lib/homeExplainersData");
let View: typeof import("../src/components/home/HomeExplainersView");
let cov: typeof import("../src/lib/cricketCoverage");
let picks: typeof import("../src/lib/sportPicks");

before(async () => {
  db = await startTestDb();
  X = await import("../src/lib/homeExplainers");
  data = await import("../src/lib/homeExplainersData");
  View = await import("../src/components/home/HomeExplainersView");
  cov = await import("../src/lib/cricketCoverage");
  picks = await import("../src/lib/sportPicks");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const lines = () =>
  Object.fromEntries(picks.SPORT_PICKS.map((s) => [s, { live: s === "cricket" ? 2 : 0, text: s === "cricket" ? "2 live now" : "Scores, tables, leaders" }])) as Parameters<typeof View.HomeExplainersView>[0]["lines"];
const examples = { matchHref: "/t20i/games/1", cricketer: { name: "Ravi Test", href: "/odi/players/ravi-test" }, compareLeague: "odi" };
const html = (newest: Parameters<typeof View.HomeExplainersView>[0]["newest"] = { leagueLabel: "NBA", startedIso: "2026-10-07T23:30:00.000Z" }) =>
  renderToStaticMarkup(createElement(View.HomeExplainersView, { lines: lines(), examples, newest }));

test("the stored-results cadence in the copy is the scraper timer's cadence", () => {
  const timer = readFileSync(join(root, "deploy/vm/systemd/sportsdb-scrape-tick.timer"), "utf8");
  assert.match(timer, new RegExp(`OnCalendar=\\*:0/${X.RESULTS_REFRESH_MINUTES}\\b`));
  assert.ok(X.trustItems().find((t) => t.id === "fresh")!.text.includes(`${X.RESULTS_REFRESH_MINUTES} minutes`));
});

test("the cricket archive line reads the archive years and never claims all-time history", () => {
  const line = X.cricketArchiveLine();
  assert.ok(line.includes(`since ${cov.archiveStartYear("test")}`), line);
  assert.ok(line.includes(`ODIs since ${cov.archiveStartYear("odi")}`), line);
  assert.ok(line.includes(`since ${cov.archiveStartYear("wodi")}`), line);
  assert.match(line, /not an all-time record/);
  assert.doesNotMatch(line.replace("not an all-time record", ""), /all-time|every Test|complete/i);
});

test("the match story tile links only to a cricket match whose page draws the story", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const pick = { rule: "chase", mode: "live", href: "/t20i/games/9", startIso: null };
  assert.equal(X.storyExampleHref(pick, now), "/t20i/games/9");
  assert.equal(X.storyExampleHref({ ...pick, mode: "latest", startIso: "2026-10-01T10:00:00Z" }, now), "/t20i/games/9");
  assert.equal(X.storyExampleHref({ ...pick, mode: "latest", startIso: "2026-01-01T10:00:00Z" }, now), null, "an old archive page gets the hero only");
  assert.equal(X.storyExampleHref({ ...pick, mode: "next", startIso: "2026-10-09T10:00:00Z" }, now), null, "a fixture has no story");
  assert.equal(X.storyExampleHref({ ...pick, rule: "football" }, now), null);
  assert.equal(X.showcaseTiles({ ...examples, matchHref: null })[0].link.href, "/cricket/series");
  assert.match(X.showcaseTiles(examples)[0].text, /last 45 days/);
});

test("tiles name their example when there is one and fall back to a page that exists when there is not", () => {
  const withEx = X.showcaseTiles(examples);
  assert.equal(withEx.length, 6);
  assert.equal(withEx[1].link.href, "/odi/players/ravi-test");
  assert.equal(withEx[2].link.href, "/odi/compare/players");
  const bare = X.showcaseTiles({ matchHref: null, cricketer: null, compareLeague: "nba" });
  assert.equal(bare[1].link.href, "/cricket/series");
});

function routeExists(href: string): boolean {
  const segs = href.split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const [head, ...tail] = rest;
    if (existsSync(join(dir, head)) && walk(join(dir, head), tail)) return true;
    for (const name of readdirSync(dir)) if (/^\[[^.\]]+\]$/.test(name) && walk(join(dir, name), tail)) return true;
    return false;
  };
  return walk(join(root, "src/app"), segs);
}

test("every link in the explainers is a page that exists", async () => {
  const { LADDER } = await import("../src/lib/homeLadder");
  const hrefs = [
    ...Object.values(LADDER).flat().map((p) => p.href),
    ...X.showcaseTiles(examples).map((t) => t.link.href),
    ...X.showcaseTiles({ matchHref: null, cricketer: null, compareLeague: "nba" }).map((t) => t.link.href),
    ...X.trustItems().map((t) => t.link.href),
  ];
  for (const h of hrefs) assert.ok(routeExists(h), `${h} has no page`);
  assert.deepEqual(Object.keys(LADDER).sort(), [...picks.SPORT_PICKS].sort(), "one card per picker sport");
  for (const sport of picks.SPORT_PICKS) assert.ok(LADDER[sport].length >= 2 && LADDER[sport].length <= 3);
});

test("the rendered modules: four sections, h2 only, real links, nothing hidden from crawlers", () => {
  const out = html();
  assert.doesNotMatch(out, /<h1/);
  assert.equal((out.match(/<section class="home-firstvisit"/g) ?? []).length, 4);
  for (const t of ["Built from every result we store", "How it works", "Where the numbers come from", "Start here", "Every match as a story", "Fixtures in your calendar", "Just show me everything"]) assert.ok(out.includes(t), t);
  assert.ok(out.includes('href="/odi/players/ravi-test"'));
  assert.ok(out.includes('href="/methodology"') && out.includes('href="/status"') && out.includes('href="/privacy"'));
  assert.ok(out.includes("Newest result stored: NBA, started"));
  assert.match(out, /Cricket history is partial/);
  assert.doesNotMatch(out, /display:\s*none/);
  assert.doesNotMatch(out, /(?<![-\w])hidden(?![-\w])/);
  assert.match(out, /2 live now/, "the live line comes from the picker's counts");
});

test("the newest-result line is left out when the database cannot say, and no number is invented", () => {
  const out = html(null);
  assert.doesNotMatch(out, /Newest result stored/);
  assert.doesNotMatch(out, /\b\d{1,3}(,\d{3})+\b/, "no big count is typed into the copy");
  assert.doesNotMatch(out, /\bfree\b/i, "the page promises no price");
});

test("the newest result is the latest finished game, not a fixture and not a future date", async () => {
  assert.equal(await data.readNewestResult(), null);
  const ins = (id: string, league: string, when: string, done: boolean) =>
    db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, $3, 'A v B', '1', '2', $4)`, [league, id, when, done]);
  await ins("a", "nba", "2026-10-01T00:00:00Z", true);
  await ins("b", "epl", "2026-10-05T18:00:00Z", true);
  await ins("c", "nfl", "2026-10-06T18:00:00Z", false);
  await ins("d", "mlb", "2099-01-01T00:00:00Z", true);
  assert.deepEqual(await data.readNewestResult(), { leagueLabel: "Premier League", startedIso: "2026-10-05T18:00:00.000Z" });
});

test("the picker toggles and reports sports through the window events the cards use", () => {
  const src = readFileSync(join(root, "src/components/home/SportPicker.tsx"), "utf8");
  assert.ok(src.includes("PICK_TOGGLE_EVENT") && src.includes("PICKED_EVENT"));
  assert.equal(picks.PICK_TOGGLE_EVENT, "sportsdb:pick-toggle");
});

test("the explainer styles live in a components layer and use tokens, not colours", () => {
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const start = css.indexOf("First-visit explainers");
  assert.ok(start > 0);
  assert.ok(css.lastIndexOf("@layer components", start) > css.lastIndexOf("\n}\n", start), "inside an open @layer components block");
  const block = css.slice(start);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(block, /rgba?\(/);
});
