// tests/performance-card-route.test.ts
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let GET: (request: Request, ctx: { params: Promise<{ league: string; id: string; slug: string }> }) => Promise<Response>;

const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

async function seedGame(id: string, completed: boolean, statusDetail = "Final") {
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values ('nba','1','Los Angeles Lakers','los-angeles-lakers','LAL','552583'), ('nba','2','Boston Celtics','boston-celtics','BOS','007a33')
     on conflict (league, espn_id) do nothing`,
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ('nba', $1, now() - interval '3 hours', 'Lakers vs Celtics', '1', '2', 2025, $2, $3, 110, 108)`,
    [id, completed, statusDetail],
  );
}

async function seedPlayer(slug: string, espnId: string) {
  await q(`insert into players (league, espn_id, team_espn_id, name, slug, position, jersey) values ('nba', $1, '1', 'Luka Dončić', $2, 'G', '77')`, [espnId, slug]);
}

async function seedBoxRow(gameId: string, playerId: string, stats: object) {
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('nba', $1, $2, '1', $3)`, [gameId, playerId, JSON.stringify(stats)]);
}

const NBA_LINE = { box: { MIN: "36", PTS: "34", REB: "11", AST: "9", STL: "2", BLK: "1", TO: "3", FG: "12-19", "3PT": "3-7", FT: "7-8", "+/-": "-4" } };

before(async () => {
  db = await startTestDb();
  ({ GET } = await import("../src/app/[league]/games/[id]/players/[slug]/card/route"));

  await seedGame("g1", true);
  await seedPlayer("luka-doncic", "p1");
  await seedBoxRow("g1", "p1", NBA_LINE);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("a real league/game/player triple with a box score returns a PNG", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await res.arrayBuffer());
  // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("format is required to be one of og|portrait|story, else 400", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=huge");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 400);
});

test("an unknown game returns 404", async () => {
  const req = new Request("http://localhost/nba/games/nope/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "nope", slug: "luka-doncic" }) });
  assert.equal(res.status, 404);
});

test("an unknown player returns 404", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/nobody/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "nobody" }) });
  assert.equal(res.status, 404);
});

test("a real player with no box-score row for this game (e.g. did not play) returns 404", async () => {
  await seedPlayer("bench-guy", "p2");
  const req = new Request("http://localhost/nba/games/g1/players/bench-guy/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "bench-guy" }) });
  assert.equal(res.status, 404);
});

test("a league outside NBA/NFL returns 404 even if the route pattern otherwise matches", async () => {
  const req = new Request("http://localhost/epl/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "epl", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.status, 404);
});

test("a long-final game (more than 2 hours old) gets the day-long cache header", async () => {
  const req = new Request("http://localhost/nba/games/g1/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g1", slug: "luka-doncic" }) });
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=86400, stale-while-revalidate=604800");
});

test("a game finished less than 2 hours ago gets the short cache header", async () => {
  await seedGame("g2", true);
  await q(`update games set date = now() - interval '30 minutes' where espn_id = 'g2'`);
  await seedBoxRow("g2", "p1", NBA_LINE);
  const req = new Request("http://localhost/nba/games/g2/players/luka-doncic/card?format=og");
  const res = await GET(req, { params: Promise.resolve({ league: "nba", id: "g2", slug: "luka-doncic" }) });
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=300");
});
