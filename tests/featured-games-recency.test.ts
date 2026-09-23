import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// Regression test for the homepage hero ("LATEST RESULT") getting stuck on an old blowout:
// getFeaturedGames used to rank completed games by score margin before applying its LIMIT,
// so a lopsided older result could win the cut over a genuinely more recent, closer game.
let db: TestDb;
let queries: typeof import("../src/lib/queries");
let pickSpotlight: typeof import("../src/components/SpotlightCard").pickSpotlight;

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  pickSpotlight = (await import("../src/components/SpotlightCard")).pickSpotlight;
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

interface Seed {
  id: string;
  date: string;
  scores: [number, number];
}

async function seed(league: string, games: Seed[]) {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, '1', 'One', 'one'), ($1, '2', 'Two', 'two') on conflict do nothing`, [league]);
  for (const g of games) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type)
       values ($1, $2, $3, 'x', 2025, '1', '2', $4, $5, true, 2, 'STD')`,
      [league, g.id, g.date, g.scores[0], g.scores[1]]
    );
  }
}

test("getFeaturedGames ranks completed games by recency, not by score margin", async () => {
  await seed("nfl", [
    { id: "blowout-older", date: hoursAgo(48), scores: [31, 7] }, // bigger margin, older
    { id: "close-newer", date: hoursAgo(2), scores: [24, 21] }, // smaller margin, newest
  ]);
  const featured = await queries.getFeaturedGames("nfl", 1);
  assert.equal(featured[0]?.espn_id, "close-newer", "the more recent, closer game should win the limit-1 cut, not the older blowout");
});

test("the homepage spotlight follows the same recent game once three-per-league truncates the pool", async () => {
  await seed("nfl", [
    { id: "blowout-1", date: hoursAgo(60), scores: [40, 3] },
    { id: "blowout-2", date: hoursAgo(50), scores: [38, 6] },
    { id: "blowout-3", date: hoursAgo(40), scores: [35, 9] },
    { id: "actual-latest", date: hoursAgo(1), scores: [20, 17] },
  ]);
  const featured = await queries.getFeaturedGames("nfl", 3);
  assert.deepEqual(
    featured.map((g) => g.espn_id),
    ["actual-latest", "blowout-3", "blowout-2"],
    "the 3-row pool should keep the newest result plus the two next-newest, not the three biggest blowouts"
  );
  const spotlight = pickSpotlight(featured);
  assert.equal(spotlight?.espn_id, "actual-latest");
});
