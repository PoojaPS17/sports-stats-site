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
