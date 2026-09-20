import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let lib: typeof import("../scripts/lib/stage-backfill");
before(async () => {
  db = await startTestDb();
  lib = await import("../scripts/lib/stage-backfill");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

test("play-in games are requested for the NBA only", () => {
  assert.deepEqual(lib.seasonTypesFor("nba"), [undefined, 3, 5]);
  assert.deepEqual(lib.seasonTypesFor("nfl"), [undefined, 3]);
  assert.deepEqual(lib.seasonTypesFor("epl"), [undefined]);
});

function ev(id: string, date: string, type: number, opts: { scores?: [string, string] | null; completed?: boolean; headline?: string } = {}) {
  const scores = opts.scores === undefined ? (["1", "1"] as [string, string]) : opts.scores;
  const t = (id2: string, home: boolean) => ({
    homeAway: home ? "home" : "away",
    ...(scores ? { score: scores[home ? 0 : 1] } : {}),
    winner: home,
    team: { id: id2, displayName: `T${id2}` },
  });
  return {
    id,
    date,
    name: "x",
    season: { year: 2026, type },
    competitions: [
      {
        type: { abbreviation: "STD" },
        competitors: [t("1", true), t("2", false)],
        ...(opts.headline ? { notes: [{ type: "event", headline: opts.headline }] } : {}),
        status: { type: { state: opts.completed === false ? "pre" : "post", completed: opts.completed ?? true } },
      },
    ],
  };
}

test("classifies untyped games from that day's scoreboard, including a late game listed under the previous day", async () => {
  // Two games stored without a type (as the old backfill left them).
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed)
     values ('nba', 'a', '2025-10-05T18:00:00Z', 'x', '1', '2', true), ('nba', 'b', '2025-10-06T02:30:00Z', 'x', '1', '2', true), ('nba', 'c', '2025-10-08T02:30:00Z', 'x', '1', '2', true)`
  );
  const asked: string[] = [];
  const fetchDay = async (_l: string, day: string) => {
    asked.push(day);
    if (day === "20251005") return { events: [ev("a", "2025-10-05T18:00:00Z", 1), ev("b", "2025-10-06T02:30:00Z", 1)] };
    return { events: [] };
  };
  const res = await lib.classifyUntypedGames(db.pool, "nba", fetchDay);
  const { rows } = await db.pool.query(`select espn_id, season_type, stage from games order by espn_id`);
  assert.deepEqual(rows, [
    { espn_id: "a", season_type: 1, stage: "excluded" },
    { espn_id: "b", season_type: 1, stage: "excluded" },
    { espn_id: "c", season_type: null, stage: "regular" },
  ]);
  assert.equal(res.typed, 2);
  assert.equal(res.stillUntyped, 1);
  assert.ok(asked.includes("20251005"), "a game at 02:30 UTC on the 6th is on the 5th's scoreboard");
});

test("an already-stored untyped All-Star row is typed in place, without upserting the exhibition or its made-up teams", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed)
     values ('nba', 'as1', '2026-02-16T01:00:00Z', 'x', '901', '902', true)`
  );
  await db.pool.query(`delete from teams where league = 'nba' and espn_id in ('901', '902')`);
  const { rows: gamesBefore } = await db.pool.query(`select count(*)::int as n from games`);
  const allStar = ev("as1", "2026-02-16T01:00:00Z", 2);
  allStar.competitions[0].type.abbreviation = "ALLSTAR";
  for (const c of allStar.competitions[0].competitors) c.team = { id: c.homeAway === "home" ? "901" : "902", displayName: `Team ${c.homeAway}` };
  const res = await lib.classifyUntypedGames(db.pool, "nba", async (_l, day) => (day === "20260215" ? { events: [allStar] } : { events: [] }));
  const { rows } = await db.pool.query(`select espn_id, season_type, competition_type, stage from games`);
  assert.deepEqual(rows, [{ espn_id: "as1", season_type: 2, competition_type: "ALLSTAR", stage: "excluded" }]);
  const { rows: gamesAfter } = await db.pool.query(`select count(*)::int as n from games`);
  assert.equal(gamesAfter[0].n, gamesBefore[0].n);
  const { rows: teams } = await db.pool.query(`select 1 from teams where league = 'nba' and espn_id in ('901', '902')`);
  assert.equal(teams.length, 0);
  assert.equal(res.typed, 1);
  assert.equal(res.stillUntyped, 0);
});

test("typing a stored game leaves its result alone when the feed is thinly hydrated", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, home_score, away_score, home_winner, away_winner, completed, status_state, status_detail)
     values ('nba', 'a', '2025-10-05T18:00:00Z', 'x', '1', '2', 100, 90, true, false, true, 'post', 'Final')`
  );
  const thin = ev("a", "2025-10-05T18:00:00Z", 2, { scores: null, completed: false });
  await lib.classifyUntypedGames(db.pool, "nba", async (_l, day) => (day === "20251005" ? { events: [thin] } : { events: [] }));
  const { rows } = await db.pool.query(
    `select season_type, competition_type, home_score, away_score, home_winner, away_winner, completed, status_state, status_detail from games where espn_id = 'a'`
  );
  assert.deepEqual(rows, [
    { season_type: 2, competition_type: "STD", home_score: 100, away_score: 90, home_winner: true, away_winner: false, completed: true, status_state: "post", status_detail: "Final" },
  ]);
});

test("typing a stored game keeps a stored round the feed lacks, and fills a null one from a playoff headline", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, round, completed)
     values ('nba', 'keep', '2025-10-05T18:00:00Z', 'x', '1', '2', 'Old Round', true),
            ('nba', 'fill', '2025-10-05T20:00:00Z', 'x', '1', '2', null, true)`
  );
  const events = [ev("keep", "2025-10-05T18:00:00Z", 2), ev("fill", "2025-10-05T20:00:00Z", 3, { headline: "West Finals - Game 5" })];
  await lib.classifyUntypedGames(db.pool, "nba", async (_l, day) => (day === "20251005" ? { events } : { events: [] }));
  const { rows } = await db.pool.query(`select espn_id, season_type, round from games order by espn_id`);
  assert.deepEqual(rows, [
    { espn_id: "fill", season_type: 3, round: "West Finals - Game 5" },
    { espn_id: "keep", season_type: 2, round: "Old Round" },
  ]);
});

test("typed counts only rows the update matched", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, completed)
     values ('nba', 'a', '2025-10-05T18:00:00Z', 'x', '1', '2', true), ('nba', 'gone', '2025-10-05T20:00:00Z', 'x', '1', '2', true)`
  );
  // "gone" is read as untyped, then deleted before its day feed comes back (the update finds no row).
  const res = await lib.classifyUntypedGames(db.pool, "nba", async (_l, day) => {
    if (day !== "20251005") return { events: [] };
    await db.pool.query(`delete from games where espn_id = 'gone'`);
    return { events: [ev("a", "2025-10-05T18:00:00Z", 2), ev("gone", "2025-10-05T20:00:00Z", 2)] };
  });
  assert.equal(res.typed, 1);
  assert.equal(res.stillUntyped, 0);
  const { rows } = await db.pool.query(`select espn_id from games`);
  assert.deepEqual(rows, [{ espn_id: "a" }]);
});
