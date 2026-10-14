import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { isMlbStandout, MLB_STANDOUT } from "../src/lib/mlbStandouts";
import type { Stats } from "../src/lib/playerProfile";

// ESPN's baseball summary has no leaders, so every MLB performance page was noindex and performances-mlb.xml empty.
// A standout line now decides both, from the stored box score.

const bat = (o: Record<string, string>): Stats => ({ batting: { AB: "4", H: "1", HR: "0", RBI: "0", K: "1", BB: "0", R: "0", ...o } });
const pit = (o: Record<string, string>): Stats => ({ pitching: { IP: "6.0", H: "5", R: "2", ER: "2", BB: "1", K: "5", HR: "0", ...o } });

const cases: [string, Stats, boolean][] = [
  ["an ordinary batting line", bat({}), false],
  ["two home runs", bat({ HR: "2" }), true],
  ["one home run", bat({ HR: "1" }), false],
  ["four hits", bat({ H: "4" }), true],
  ["three hits", bat({ H: "3" }), false],
  ["five RBI", bat({ RBI: "5" }), true],
  ["four RBI", bat({ RBI: "4" }), false],
  ["an ordinary start", pit({}), false],
  ["ten strikeouts", pit({ K: "10" }), true],
  ["nine strikeouts", pit({ K: "9" }), false],
  ["seven innings, one earned run", pit({ IP: "7.0", ER: "1" }), true],
  ["seven innings, two earned runs", pit({ IP: "7.0", ER: "2" }), false],
  ["6.2 innings, no runs", pit({ IP: "6.2", ER: "0" }), false],
  ["7.1 innings, no earned runs", pit({ IP: "7.1", ER: "0" }), true],
  ["seven innings with no earned-run figure", pit({ IP: "7.0", ER: "--" }), false],
  ["a dashed home-run cell", bat({ HR: "--" }), false],
  ["no stats", {}, false],
];

test("a standout line is a multi-homer, four-hit, five-RBI, ten-strikeout or seven-inning one-run game", () => {
  assert.deepEqual(MLB_STANDOUT, { homeRuns: 2, hits: 4, rbi: 5, strikeouts: 10, innings: 7, earnedRunsAtMost: 1 });
  for (const [name, stats, want] of cases) assert.equal(isMlbStandout(stats), want, name);
});

let db: TestDb;
let sitemapEntries: (id: string) => Promise<{ url: string }[]>;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  await db.pool.query(`insert into teams (league, espn_id, name, slug, abbreviation) values ('mlb','1','Home','home','HOM'), ('mlb','2','Away','away','AWY')`);
  // Seasons 2026 and 2025 are in the window; 2023 is not. One game each; a player per case, so each case is its own row.
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values
       ('mlb','g26','2026-06-01','a','1','2'  ,2026,true),
       ('mlb','g23','2023-06-01','b','1','2',2023,true),
       ('mlb','open','2026-10-14','c','1','2',2026,false)`,
  );
  for (const [i, [, stats]] of cases.entries()) {
    await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values ('mlb', $1, '1', $2, $3)`, [`p${i}`, `Player ${i}`, `player-${i}`]);
    await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('mlb','g26',$1,'1',$2)`, [`p${i}`, JSON.stringify(stats)]);
  }
  // The same standout line in an out-of-window season and in a game still in play.
  await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug) values ('mlb','old','1','Old','old-player'), ('mlb','live','1','Live','live-player')`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('mlb','g23','old','1',$1), ('mlb','open','live','1',$1)`, [JSON.stringify(bat({ HR: "3" }))]);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("the MLB performances sitemap lists exactly the standout lines of the last two seasons in finished games", async () => {
  const urls = (await sitemapEntries("performances-mlb")).map((e) => e.url.replace(/^.*\/mlb\//, "/mlb/")).sort();
  const want = cases.flatMap(([, stats], i) => (isMlbStandout(stats) ? [`/mlb/games/g26/players/player-${i}`] : [])).sort();
  assert.ok(want.length > 0);
  assert.deepEqual(urls, want, "the SQL and isMlbStandout agree on every case");
  assert.ok(!urls.some((u) => u.includes("old-player") || u.includes("live-player")), "outside the window, or not finished");
});

test("the performance page is indexed by the same test the sitemap lists by", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/[league]/games/[id]/players/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(src, /data\.league === "mlb"\) return data\.game\.completed && isMlbStandout\(data\.row\.stats\)/);
});
