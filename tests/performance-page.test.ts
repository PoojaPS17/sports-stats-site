// tests/performance-page.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let PerformancePage: (typeof import("../src/app/[league]/games/[id]/players/[slug]/page"))["default"];
let generateMetadata: (typeof import("../src/app/[league]/games/[id]/players/[slug]/page"))["generateMetadata"];

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ default: PerformancePage, generateMetadata } = await import("../src/app/[league]/games/[id]/players/[slug]/page"));

  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', 'g1', now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, true, 'Final', 110, 108)`,
  );
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p1', '1', 'Luka Dončić', 'luka-doncic', 'G', '77')`);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', 'p2', '2', 'Jayson Tatum', 'jayson-tatum', 'F', '0')`);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p1', '1', $1)`, [JSON.stringify(NBA_LINE)]);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g1', 'p2', '2', $1)`, [JSON.stringify(NBA_LINE)]);
  // getGameDetails runs every stored report through presentDetails (matchDetail.ts), which unconditionally
  // maps over `events` and `lineups` — a real scraped report always has every GameDetails field (extractGameDetails
  // fills each one, empty arrays included), so the fixture must too, not just the `leaders` field this test reads.
  await q(
    `insert into game_details (league, game_espn_id, details) values ('nba', 'g1', $1)`,
    [
      JSON.stringify({
        venue: null,
        city: null,
        attendance: null,
        officials: [],
        linescores: null,
        events: [],
        lineups: [],
        team_stats: [],
        player_box: [],
        scorecard: [],
        leaders: [{ team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: "34" }],
        win_probability: [],
      }),
    ],
  );

  // Two playoff games for p1, same season (2025) as the regular-season game g1 (34 pts).
  // g2 (40 pts) beats g1's regular-season best but is *not* the postseason high (g3, 45 pts, is) —
  // exactly the scenario the bug produced a false "Season high" tag for. season_type = 3 is what
  // the generated `games.stage` column (db/schema.sql) turns into 'playoffs'.
  const PLAYOFF_LINE_LOW = { box: { MIN: "38", PTS: "40", REB: "8", AST: "7", STL: "1", BLK: "0", TO: "2", FG: "15-24", "3PT": "4-9", FT: "6-7", "+/-": "3" } };
  const PLAYOFF_LINE_HIGH = { box: { MIN: "40", PTS: "45", REB: "9", AST: "8", STL: "2", BLK: "0", TO: "3", FG: "17-27", "3PT": "5-10", FT: "6-7", "+/-": "10" } };
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, season_type, completed, status_detail, home_score, away_score)
     values ('nba', 'g2', now() - interval '2 days', 'Lakers vs Celtics', '1', '2', 2025, 3, true, 'Final', 115, 102)`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, season_type, completed, status_detail, home_score, away_score)
     values ('nba', 'g3', now() - interval '1 days', 'Lakers vs Celtics', '1', '2', 2025, 3, true, 'Final', 120, 110)`,
  );
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g2', 'p1', '1', $1)`, [JSON.stringify(PLAYOFF_LINE_LOW)]);
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', 'g3', 'p1', '1', $1)`, [JSON.stringify(PLAYOFF_LINE_HIGH)]);
  for (const [gameId, pts] of [["g2", "40"], ["g3", "45"]] as const) {
    await q(
      `insert into game_details (league, game_espn_id, details) values ('nba', $1, $2)`,
      [
        gameId,
        JSON.stringify({
          venue: null,
          city: null,
          attendance: null,
          officials: [],
          linescores: null,
          events: [],
          lineups: [],
          team_stats: [],
          player_box: [],
          scorecard: [],
          leaders: [{ team_id: "1", label: "Points", athlete_id: "p1", athlete: "Luka Dončić", value: pts }],
          win_probability: [],
        }),
      ],
    );
  }
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a leader's page is indexed", async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(meta.robots && (meta.robots as { index?: boolean }).index, true);
});

test("a non-leader with a real stat line still renders (200) but is noindex", async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ league: "nba", id: "g1", slug: "jayson-tatum" }) });
  assert.equal(meta.robots && (meta.robots as { index?: boolean }).index, false);
  // The page component itself must not throw / return notFound() for this pair.
  const el = await PerformancePage({ params: Promise.resolve({ league: "nba", id: "g1", slug: "jayson-tatum" }) });
  assert.ok(el);
});

test("an unknown pair 404s the same way the card route does", async () => {
  await assert.rejects(
    () => PerformancePage({ params: Promise.resolve({ league: "nba", id: "g1", slug: "nobody" }) }),
    (e: unknown) => (e as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404",
  );
});

test("a playoff game's Season high tag is computed against other playoff games, not the regular season", async () => {
  // g2 (40 pts) beats the regular-season best (g1, 34 pts) but is not the postseason high
  // (g3, 45 pts, is) — before the fix, g2 was wrongly tagged "Season high · PTS" purely for
  // beating the regular-season best, because the comparison set was the regular-season profile.
  const el = await PerformancePage({ params: Promise.resolve({ league: "nba", id: "g2", slug: "luka-doncic" }) });
  const html = renderToStaticMarkup(el);
  assert.doesNotMatch(html, /Season high/);
});

test("the performance page renders an h1 with the player's name", async () => {
  const el = await PerformancePage({ params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  const html = renderToStaticMarkup(el);
  assert.match(html, /<h1[^>]*class="[^"]*page-title/);
  assert.match(html, /Luka Dončić/);
});
