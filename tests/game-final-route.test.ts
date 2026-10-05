import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

// The proxy decides from the stored row whether /<league>/games/<id> is served per request or
// rewritten to the day-cached final route: completed, with its report stored.
let db: TestDb;
let proxy: (req: NextRequest) => Promise<Response>;
before(async () => {
  db = await startTestDb();
  const game = (league: string, id: string, completed: boolean) =>
    db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed) values ($1, $2, '2026-10-01T00:00Z', 'A at B', '1', '2', $3)`, [league, id, completed]);
  await game("nba", "7001", true);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('nba', '7001', '{}'::jsonb)`);
  await game("nba", "7002", true);
  await game("nba", "7003", false);
  await game("epl", "7004", true);
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('epl', '7004', '{}'::jsonb)`);
  process.env.SITE_LAUNCHED = "1";
  proxy = (await import("../src/proxy")).default;
});
after(async () => {
  delete process.env.SITE_LAUNCHED;
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const req = (path: string) => new NextRequest(`https://sports-db.live${path}`, { headers: { host: "sports-db.live" } });
const rewriteOf = (r: Response) => (r.headers.get("x-middleware-rewrite") ? new URL(r.headers.get("x-middleware-rewrite")!).pathname : null);

test("a completed game with its report stored is rewritten to the final route", async () => {
  assert.equal(rewriteOf(await proxy(req("/nba/games/7001"))), "/nba/games/final/7001");
  assert.equal(rewriteOf(await proxy(req("/epl/games/7004"))), "/epl/games/final/7004");
});

test("a completed game without its report, a game not finished, an unknown game and an unknown league stay on the public route", async () => {
  for (const path of ["/nba/games/7002", "/nba/games/7003", "/nba/games/424242", "/xyz/games/7001", "/cricket/games/7001"]) {
    const res = await proxy(req(path));
    assert.equal(res.headers.get("x-middleware-next"), "1", `${path} passes through`);
    assert.equal(rewriteOf(res), null, `${path} is not rewritten`);
  }
});

test("the final route is internal: a direct request is sent to the public address", async () => {
  const res = await proxy(req("/nba/games/final/7001"));
  assert.equal(res.status, 308);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/nba/games/7001");
});

test("deeper game paths are untouched", async () => {
  for (const path of ["/nba/games/7001/players/lebron-james", "/nba/games/7001/players/lebron-james/card", "/nba/games"]) {
    assert.equal(rewriteOf(await proxy(req(path))), null, path);
  }
});
