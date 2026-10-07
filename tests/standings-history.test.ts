import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let snapshotStandings: typeof import("../scripts/lib/standingsHistory").snapshotStandings;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

before(async () => {
  db = await startTestDb();
  ({ snapshotStandings } = await import("../scripts/lib/standingsHistory"));
  await q(
    `insert into standings (league, season, team_espn_id, conference, wins, losses, win_percent, rank, points) values
       ('epl', 2025, '1', null, 20, 10, 0.66, 1, 70),
       ('epl', 2026, '1', null, 3, 1, 0.75, 1, 10),
       ('epl', 2026, '2', null, 2, 2, 0.5, 2, 7),
       ('ipl', 2026, '9', 'Group A', 4, 1, 0.8, 1, 8),
       ('ipl', 2026, '9', 'Super 8', 1, 0, 1, 2, 2)`
  );
});

after(async () => {
  await db.stop();
});

const rows = async () => (await q(`select league, season, team_espn_id, conference, wins, rank from standings_history order by league, team_espn_id, conference`)).rows;

test("only each league's newest season is copied, stage tables kept apart", async () => {
  assert.equal(await snapshotStandings(db.pool), 4);
  assert.deepEqual(await rows(), [
    { league: "epl", season: 2026, team_espn_id: "1", conference: "", wins: 3, rank: 1 },
    { league: "epl", season: 2026, team_espn_id: "2", conference: "", wins: 2, rank: 2 },
    { league: "ipl", season: 2026, team_espn_id: "9", conference: "Group A", wins: 4, rank: 1 },
    { league: "ipl", season: 2026, team_espn_id: "9", conference: "Super 8", wins: 1, rank: 2 },
  ]);
});

test("a second run the same day replaces that day's rows instead of adding", async () => {
  await q(`update standings set wins = 4, rank = 2 where league = 'epl' and team_espn_id = '1' and season = 2026`);
  await snapshotStandings(db.pool);
  const all = await rows();
  assert.equal(all.length, 4);
  assert.deepEqual(all[0], { league: "epl", season: 2026, team_espn_id: "1", conference: "", wins: 4, rank: 2 });
});

test("an earlier day's rows are left as they were", async () => {
  await q(`update standings_history set snapshot_date = snapshot_date - 1`);
  await q(`update standings set wins = 5 where league = 'epl' and team_espn_id = '1' and season = 2026`);
  await snapshotStandings(db.pool);
  const { rows: r } = await q(`select snapshot_date, wins from standings_history where league = 'epl' and team_espn_id = '1' order by snapshot_date`);
  assert.deepEqual(r.map((x) => x.wins), [4, 5]);
});
