import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { absoluteUrl } from "../src/lib/site";

// sitemap.ts imports the shared app pool, so it loads after startTestDb() (see before()).
let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let db: TestDb;

// One player per case, each with a single completed 2026 game and the given box-score line.
const CASES: { slug: string; box: Record<string, string>; listed: boolean }[] = [
  { slug: "normal-line", box: { MIN: "31", PTS: "12" }, listed: true },
  { slug: "sub-minute", box: { MIN: "0", PTS: "0", AST: "1" }, listed: true },
  { slug: "bench-dnp", box: { MIN: "--", PTS: "--" }, listed: false },
  { slug: "dnp-but-scored", box: { MIN: "--", PTS: "5" }, listed: true },
  { slug: "blank-minutes", box: { MIN: "", PTS: "0" }, listed: false },
];

// A game ESPN published no box score for (nobody has a numeric MIN or PTS from 1 on): its players' pages
// render the games ESPN counts, so they are listed. Their MIN "--" row in g1, a game with real lines, is a DNP.
const BLANK_GAME_PLAYERS = ["blank-box-a", "blank-box-b"];

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed)
     values ('nba', 'g1', '2026-01-10T00:00:00Z', 'g1', '1', '2', 2026, true)`
  );
  for (const [i, c] of CASES.entries()) {
    const id = `p${i}`;
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('nba', $1, $2, $2)`, [id, c.slug]);
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, stats) values ('nba', 'g1', $1, $2)`, [
      id,
      JSON.stringify({ box: c.box }),
    ]);
  }
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed)
     values ('nba', 'g2', '2025-01-10T00:00:00Z', 'g2', '1', '2', 2025, true)`
  );
  for (const [i, slug] of BLANK_GAME_PLAYERS.entries()) {
    const id = `b${i}`;
    await db.pool.query(`insert into players (league, espn_id, name, slug) values ('nba', $1, $2, $2)`, [id, slug]);
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, stats) values ('nba', 'g2', $1, $2)`, [
      id,
      JSON.stringify({ box: { MIN: "--", PTS: i === 0 ? "--" : "0" } }),
    ]);
  }
  // The same players' other appearance, in g1 (real lines for others): a bench-sheet DNP that adds nothing.
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, stats) values ('nba', 'g1', 'b0', $1)`, [
    JSON.stringify({ box: { MIN: "--", PTS: "--" } }),
  ]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("NBA sitemap lists a player whose game has a minutes cell, even 0, or points; not a bench-sheet DNP", async () => {
  const urls = new Set((await sitemapEntries("players-nba")).map((e) => e.url));
  for (const c of CASES) {
    assert.equal(urls.has(absoluteUrl(`/nba/players/${c.slug}`)), c.listed, `players-nba ${c.slug} (MIN ${JSON.stringify(c.box.MIN)}, PTS ${JSON.stringify(c.box.PTS)})`);
  }
});

test("NBA sitemap lists the season page of a player whose only game has a minutes cell, not of a bench-sheet DNP", async () => {
  const urls = new Set((await sitemapEntries("pseasons-nba")).map((e) => e.url));
  for (const c of CASES) {
    assert.equal(urls.has(absoluteUrl(`/nba/players/${c.slug}/2026`)), c.listed, `pseasons-nba ${c.slug} (MIN ${JSON.stringify(c.box.MIN)}, PTS ${JSON.stringify(c.box.PTS)})`);
  }
});

test("NBA sitemap lists the player and the season page of a game with no box score, and not a DNP row in a game with real lines", async () => {
  const players = new Set((await sitemapEntries("players-nba")).map((e) => e.url));
  const seasons = new Set((await sitemapEntries("pseasons-nba")).map((e) => e.url));
  for (const slug of BLANK_GAME_PLAYERS) {
    assert.ok(players.has(absoluteUrl(`/nba/players/${slug}`)), `players-nba ${slug}`);
    assert.ok(seasons.has(absoluteUrl(`/nba/players/${slug}/2025`)), `pseasons-nba ${slug} 2025`);
  }
  // b0's other row is a "--" line in g1, where others have real lines: 2026 has no page content for b0.
  assert.ok(!seasons.has(absoluteUrl("/nba/players/blank-box-a/2026")), "pseasons-nba blank-box-a 2026");
  // The DNP-like players of g1 stay out (a game with real stat lines is not a blank-box game).
  assert.ok(!players.has(absoluteUrl("/nba/players/bench-dnp")));
});
