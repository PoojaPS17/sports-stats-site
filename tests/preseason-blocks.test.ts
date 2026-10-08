// The homepage blocks and the daily snapshot while the NBA is in its preseason and MLB holds a phantom 2027: the standings block
// lists the exhibition records without positions, the team card says Preseason and gives the same record, and nothing ranks
// a team from exhibition games or snapshots a season that repeats the last one.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let GET: (request: Request, ctx: { params: Promise<{ type: string }> }) => Promise<Response>;
let snapshotStandings: typeof import("../scripts/lib/standingsHistory").snapshotStandings;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
const call = (type: string, query = "") => GET(new Request(`http://localhost/api/block/${type}${query}`), { params: Promise.resolve({ type }) });

before(async () => {
  db = await startTestDb();
  ({ GET } = await import("../src/app/api/block/[type]/route"));
  ({ snapshotStandings } = await import("../scripts/lib/standingsHistory"));
  await q(`insert into teams (league, espn_id, name, slug, abbreviation) values
    ('nba','1','Atlanta Hawks','atlanta-hawks','ATL'), ('nba','2','Boston Celtics','boston-celtics','BOS'), ('nba','3','Cleveland Cavaliers','cleveland-cavaliers','CLE'),
    ('mlb','10','Tampa Bay Rays','tampa-bay-rays','TB'), ('mlb','11','New York Yankees','new-york-yankees','NYY')`);
  await q(`insert into standings (league, season, team_espn_id, conference, wins, losses, win_percent, playoff_seed, season_type) values
    ('nba', 2026, '1', 'East', 50, 32, 0.61, 4, 2), ('nba', 2026, '2', 'East', 60, 22, 0.73, 1, 2), ('nba', 2026, '3', 'East', 40, 42, 0.49, 8, 2),
    ('nba', 2027, '1', 'East', 0, 1, 0, 12, 1), ('nba', 2027, '2', 'East', 1, 0, 1, 1, 1), ('nba', 2027, '3', 'East', 0, 0, 0, 9, 1),
    ('mlb', 2026, '10', 'AL', 98, 64, 0.605, 1, 2), ('mlb', 2026, '11', 'AL', 93, 68, 0.578, 4, 2),
    ('mlb', 2027, '10', 'AL', 98, 64, 0.605, 1, null), ('mlb', 2027, '11', 'AL', 93, 68, 0.578, 4, null)`);
  await q(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, season_type, status_state, home_score, away_score, home_winner, away_winner) values
    ('nba','r26','2026-04-10T00:00:00Z','x','2','1',2026,true,2,'post',100,90,true,false),
    ('nba','p1','2026-10-05T00:00:00Z','x','2','1',2027,true,1,'post',110,100,true,false),
    ('nba','p2','2026-10-12T23:00:00Z','x','1','2',2027,false,1,'pre',null,null,null,null),
    ('nba','f1','2026-10-20T23:30:00Z','x','2','3',2027,false,2,'pre',null,null,null,null),
    ('mlb','m26','2026-10-02T00:00:00Z','x','10','11',2026,true,2,'post',5,3,true,false)`);
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("the NBA standings block is labelled Preseason, lists the exhibition records and gives no positions or zones", async () => {
  const { block } = await (await call("standings", "?league=nba")).json();
  assert.equal(block.preseason, true);
  assert.deepEqual(block.rows.map((r: { name: string; position: number | null; figure: string; zone: string | null }) => [r.name, r.position, r.figure, r.zone]), [
    ["Boston Celtics", null, "1-0", null],
    ["Atlanta Hawks", null, "0-1", null],
    ["Cleveland Cavaliers", null, "0-0", null],
  ]);
});

test("the NBA team card says Preseason, gives the exhibition record and no rank, and tags the preseason games", async () => {
  const { block } = await (await call("team-next", "?league=nba&team=atlanta-hawks")).json();
  assert.deepEqual(block.summary, { leagueLabel: "NBA · Preseason", position: null, figure: null, record: "Preseason record 0-1", form: [], preseason: true });
  assert.equal(block.last.preseason, true);
  assert.equal(block.next[0].id, "p2");
  assert.equal(block.next[0].preseason, true);
});

test("a team with no preseason game yet has no card record, and a regular-season fixture carries no tag", async () => {
  const { block } = await (await call("team-next", "?league=nba&team=cleveland-cavaliers")).json();
  assert.equal(block.summary.record, null);
  assert.equal(block.summary.position, null);
  assert.equal(block.next[0].id, "f1");
  assert.equal(block.next[0].preseason, undefined);
});

test("the MLB standings block is 2026's table: the 2027 copy is ignored", async () => {
  const { block } = await (await call("standings", "?league=mlb")).json();
  assert.equal(block.preseason, undefined);
  assert.deepEqual(block.rows.map((r: { name: string; position: number | null; figure: string }) => [r.name, r.position, r.figure]), [
    ["Tampa Bay Rays", 1, "98-64"],
    ["New York Yankees", 2, "93-68"],
  ]);
});

test("the daily snapshot records MLB's 2026 table and the NBA's last real season, never a phantom or a preseason table", async () => {
  await snapshotStandings(db.pool);
  const { rows } = await q(`select league, season, count(*)::int as n from standings_history group by 1, 2 order by 1, 2`);
  assert.deepEqual(rows, [{ league: "mlb", season: 2026, n: 2 }, { league: "nba", season: 2026, n: 3 }]);
});
