import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let games: typeof import("../scripts/lib/games");
before(async () => {
  db = await startTestDb();
  games = await import("../scripts/lib/games");
});
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query("delete from games");
});

function team(id: string, name: string, home: boolean, score: string) {
  return { homeAway: home ? "home" : "away", score, winner: home, team: { id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() } };
}
function event(id: string, opts: { feed: "scoreboard" | "schedule"; type: number; comp: string; headline?: string; year?: number }) {
  return {
    id,
    date: "2026-04-20T00:00:00Z",
    name: "A at B",
    ...(opts.feed === "scoreboard" ? { season: { year: opts.year ?? 2026, type: opts.type } } : { season: { year: opts.year ?? 2026 }, seasonType: { type: opts.type } }),
    competitions: [
      {
        type: { abbreviation: opts.comp },
        competitors: [team("1", "Alpha", true, "100"), team("2", "Bravo", false, "90")],
        status: { type: { state: "post", completed: true, detail: "Final" } },
        ...(opts.headline ? { notes: [{ type: "event", headline: opts.headline }] } : {}),
      },
    ],
  };
}
const row = async (id: string) => (await db.pool.query(`select season_type, competition_type, round, stage from games where league = 'nba' and espn_id = $1`, [id])).rows[0];

test("parseStageFields reads the type from either feed", () => {
  assert.deepEqual(games.parseStageFields("nba", event("x", { feed: "scoreboard", type: 3, comp: "QTR" })), { seasonType: 3, competitionType: "QTR" });
  assert.deepEqual(games.parseStageFields("nba", event("x", { feed: "schedule", type: 5, comp: "STD" })), { seasonType: 5, competitionType: "STD" });
});

test("soccer's large season ids are not stored as a season type", () => {
  assert.deepEqual(games.parseStageFields("epl", event("x", { feed: "scoreboard", type: 12654, comp: "STD" })), { seasonType: null, competitionType: null });
});

test("a playoff game gets its round and stage from the scoreboard feed as well as the schedule feed", async () => {
  await games.upsertEvent("nba", event("s", { feed: "scoreboard", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  await games.upsertEvent("nba", event("t", { feed: "schedule", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  for (const id of ["s", "t"]) assert.deepEqual(await row(id), { season_type: 3, competition_type: "QTR", round: "East 1st Round - Game 3", stage: "playoffs" });
});

test("play-in, preseason and the Cup final are stored but are not regular season", async () => {
  await games.upsertEvent("nba", event("p", { feed: "schedule", type: 5, comp: "STD" }));
  await games.upsertEvent("nba", event("q", { feed: "scoreboard", type: 1, comp: "STD" }));
  await games.upsertEvent("nba", event("c", { feed: "scoreboard", type: 2, comp: "CC" }));
  assert.equal((await row("p")).stage, "playin");
  assert.equal((await row("q")).stage, "excluded");
  assert.equal((await row("c")).stage, "excluded");
  assert.equal((await row("p")).round, null);
});

test("an All-Star event is not stored, and its made-up teams are not added", async () => {
  const ev = event("a", { feed: "scoreboard", type: 2, comp: "ALLSTAR" });
  ev.competitions[0].competitors = [team("901", "Team Stripes", true, "100"), team("902", "Team Stars", false, "90")];
  await games.upsertEvent("nba", ev);
  assert.equal((await db.pool.query(`select 1 from games where espn_id = 'a'`)).rowCount, 0);
  assert.equal((await db.pool.query(`select 1 from teams where espn_id in ('901','902')`)).rowCount, 0);
});

test("a later, sparser feed never erases the type or the round", async () => {
  await games.upsertEvent("nba", event("k", { feed: "schedule", type: 3, comp: "QTR", headline: "East 1st Round - Game 3" }));
  const sparse = event("k", { feed: "scoreboard", type: 3, comp: "QTR" });
  delete (sparse.season as { type?: number }).type;
  delete (sparse.competitions[0] as { type?: unknown }).type;
  await games.upsertEvent("nba", sparse);
  assert.deepEqual(await row("k"), { season_type: 3, competition_type: "QTR", round: "East 1st Round - Game 3", stage: "playoffs" });
});
