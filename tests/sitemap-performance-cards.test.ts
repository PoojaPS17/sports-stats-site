import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let SITEMAP_IDS: string[];
let sitemapEntries: (id: string) => Promise<{ url: string }[]>;

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

before(async () => {
  db = await startTestDb();
  ({ SITEMAP_IDS, sitemapEntries } = await import("../src/lib/sitemap"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL'), ('nba','2','Boston Celtics','boston-celtics','BOS')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic')`);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values ('nba', 'p2', '2', 'Jayson Tatum', 'jayson-tatum')`); // never a leader
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', '{}')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p2', '2', '{}')`);
  // p1 leads two categories in the same game (points and assists) — a real case for a
  // point guard, and the exact shape that must not produce a duplicate sitemap row.
  await q(
    `insert into game_details (league, game_espn_id, details) values ('nba', 'g1', $1)`,
    [
      JSON.stringify({
        leaders: [
          { team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: "34" },
          { team_id: "1", label: "Assists", athlete_id: "p1", athlete: "Luka Dončić", value: "11" },
        ],
      }),
    ],
  );
  // A malformed `leaders` shape (not a JSON array) must not 500 the whole sitemap section — it
  // should just exclude this game's entries. g2 has no player_game_stats row at all, so even if
  // the guard were absent for a *valid empty array* it would already be excluded; the point here
  // is that a non-array `leaders` must not throw jsonb_array_elements: cannot call
  // jsonb_array_elements on a non-array.
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g2', now() - interval '2 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 100, 90)`,
  );
  await q(`insert into game_details (league, game_espn_id, details) values ('nba', 'g2', $1)`, [JSON.stringify({ leaders: {} })]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("SITEMAP_IDS includes a performances id for nba and nfl, none for a league with no leaders concept", () => {
  assert.ok(SITEMAP_IDS.includes("performances-nba"));
  assert.ok(SITEMAP_IDS.includes("performances-nfl"));
  assert.ok(!SITEMAP_IDS.includes("performances-epl"));
});

test("the performances sitemap lists the leader's page and not the non-leader's", async () => {
  const entries = await sitemapEntries("performances-nba");
  const paths = entries.map((e) => e.url);
  assert.ok(paths.some((p) => p.endsWith("/nba/games/g1/players/luka-doncic")));
  assert.ok(!paths.some((p) => p.endsWith("/nba/games/g1/players/jayson-tatum")));
});

test("a leader in two stat categories of the same game is listed exactly once", async () => {
  const entries = await sitemapEntries("performances-nba");
  const paths = entries.map((e) => e.url).filter((p) => p.endsWith("/nba/games/g1/players/luka-doncic"));
  assert.equal(paths.length, 1);
});

test("a non-array `leaders` shape does not throw and simply excludes that game", async () => {
  let entries: { url: string }[] = [];
  await assert.doesNotReject(async () => {
    entries = await sitemapEntries("performances-nba");
  });
  const paths = entries.map((e) => e.url);
  assert.ok(!paths.some((p) => p.includes("/nba/games/g2/")));
});
