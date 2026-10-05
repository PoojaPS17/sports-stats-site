import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { startTestDb, type TestDb } from "./helpers/testDb";

// The proxy decides from the stored row whether /cricket/matches/<id> is served by the public,
// per-request route or rewritten to the day-cached final route. It reads the database, so the
// module is imported after the embedded Postgres is up.
let db: TestDb;
let proxy: (req: NextRequest) => Promise<Response>;
before(async () => {
  db = await startTestDb();
  await db.pool.query(`insert into cricket_series (espn_id, name, kind) values ('8836-2026-27', 'President''s Trophy 2026-27', 'domestic')`);
  const row = (id: string, state: string, summary: string | null, home: string | null, away: string | null, candidates = "{}") =>
    db.pool.query(
      `insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, status_summary, home, away, league_candidates)
       values ($1, '8836-2026-27', '2026-09-30T05:00Z', 'A v B', $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [id, state, summary, home && JSON.stringify({ id: "1", name: "A", score: home }), away && JSON.stringify({ id: "2", name: "B", score: away }), candidates]
    );
  await row("9001", "post", "Match drawn", "344", "643/8d & 167/3 (24.5 ov)");
  await row("9002", "in", "Day 2 - Session 1", "120/3", null);
  await row("9003", "pre", null, null, null);
  await row("9004", "post", "Match drawn", "344", null);
  await row("9005", "post", "Match abandoned without a ball bowled", null, null);
  // A match SportsDB archives has its own page under its league and redirects there; the final route must not catch it.
  await db.pool.query(`insert into games (espn_id, league, date, name, home_team_espn_id, away_team_espn_id) values ('9006', 'ipl', '2026-09-30T05:00Z', 'A v B', '1', '2')`);
  await row("9006", "post", "A won by 5 wickets", "180/4", "176/8", "{ipl}");
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

test("a finished match with both totals is rewritten to the final route", async () => {
  const res = await proxy(req("/cricket/matches/9001"));
  assert.equal(rewriteOf(res), "/cricket/matches/final/9001");
});

test("a match in play, a fixture, a result with a total missing, and an archived match all stay on the public route", async () => {
  for (const id of ["9002", "9003", "9004", "9006", "4242424"]) {
    const res = await proxy(req(`/cricket/matches/${id}`));
    assert.equal(res.headers.get("x-middleware-next"), "1", `${id} passes through`);
    assert.equal(rewriteOf(res), null, `${id} is not rewritten`);
  }
});

test("a match abandoned without a ball bowled is final and rewritten", async () => {
  assert.equal(rewriteOf(await proxy(req("/cricket/matches/9005"))), "/cricket/matches/final/9005");
});

test("the final route is internal: a direct request is sent to the public address", async () => {
  const res = await proxy(req("/cricket/matches/final/9001"));
  assert.equal(res.status, 308);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/cricket/matches/9001");
});

test("other cricket paths and non-numeric ids are untouched", async () => {
  for (const path of ["/cricket/matches/9001/x", "/cricket/matches/abc", "/cricket/series/8836-2026-27", "/cricket/matches"]) {
    const res = await proxy(req(path));
    assert.equal(rewriteOf(res), null, path);
  }
});
