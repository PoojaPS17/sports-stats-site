import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let GET: (request: Request, ctx: { params: Promise<{ type: string }> }) => Promise<Response>;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const call = (type: string, query = "") => GET(new Request(`http://localhost/api/block/${type}${query}`), { params: Promise.resolve({ type }) });

before(async () => {
  db = await startTestDb();
  ({ GET } = await import("../src/app/api/block/[type]/route"));
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation, color) values
       ('epl','1','Arsenal','arsenal','ARS','ef0107'), ('epl','2','Chelsea','chelsea','CHE','034694'), ('epl','3','Liverpool','liverpool','LIV','c8102e')`
  );
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score) values
       ('epl','g1', now() - interval '3 days', 'Arsenal v Chelsea', '1', '2', 2026, true, 'Full Time', 2, 1),
       ('epl','g2', now() + interval '2 days', 'Liverpool v Arsenal', '3', '1', 2026, false, null, null, null),
       ('epl','g3', now() + interval '9 days', 'Arsenal v Liverpool', '1', '3', 2026, false, null, null, null),
       ('epl','g4', now() + interval '16 days', 'Chelsea v Arsenal', '2', '1', 2026, false, null, null, null),
       ('epl','g5', now() + interval '23 days', 'Arsenal v Chelsea', '1', '2', 2026, false, null, null, null)`
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("an unknown type is a 400", async () => {
  const res = await call("news");
  assert.equal(res.status, 400);
});

test("bad parameters are a 400 with the reason", async () => {
  const res = await call("team-next", "?league=epl");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /team must be a team slug/);
});

test("team-next gives the last result and the next three, from the team's side, with the type's cache header", async () => {
  const res = await call("team-next", "?league=epl&team=arsenal");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=60, stale-while-revalidate=240");
  const { block } = await res.json();
  assert.equal(block.team.name, "Arsenal");
  assert.equal(block.team.href, "/epl/teams/arsenal");
  assert.deepEqual({ opponent: block.last.opponent, score: block.last.score, result: block.last.result, home: block.last.home }, { opponent: "Chelsea", score: "2-1", result: "W", home: true });
  assert.deepEqual(block.next.map((f: { opponent: string; home: boolean }) => [f.opponent, f.home]), [["Liverpool", false], ["Liverpool", true], ["Chelsea", false]]);
  assert.equal(block.next[0].href, "/epl/games/g2");
});

test("a team that does not exist is a null block, not an error", async () => {
  const res = await call("team-next", "?league=epl&team=nobody");
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).block, null);
});

test("bts needs no database and returns at most three articles with their art", async () => {
  const res = await call("bts");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, s-maxage=3600, stale-while-revalidate=14400");
  const { block } = await res.json();
  assert.ok(block.articles.length > 0 && block.articles.length <= 3);
  assert.match(block.articles[0].href, /^\/beyond-the-scoreline\//);
  assert.equal(typeof block.articles[0].number, "string");
});
