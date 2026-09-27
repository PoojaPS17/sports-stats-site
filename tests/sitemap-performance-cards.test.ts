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
  await q(
    `insert into game_details (league, game_espn_id, details) values ('nba', 'g1', $1)`,
    [JSON.stringify({ leaders: [{ team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: "34" }] })],
  );
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
