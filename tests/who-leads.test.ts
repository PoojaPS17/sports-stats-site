import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { boardLeader, isRecent } from "../src/lib/whoLeads";
import type { LeaderRow } from "../src/lib/queries";

// "Who leads" against a real database: a competition appears only while its season is running and has recent results,
// the leader is the player on rank 1 of the Leaders page's own board with that page's figure, ties are named, and
// cricket's sixes board is never used. Expectations are hand-computed from the rows below.

let db: TestDb;
let readWhoLeads: typeof import("../src/lib/whoLeadsData").readWhoLeads;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);
const ago = (d: number) => `now() - interval '${d} days'`;
const ahead = (d: number) => `now() + interval '${d} days'`;

async function game(league: string, id: string, when: string, completed: boolean, season = 2026) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ($1,$2,${when},$2,'1','2',$3,$4,$5,1,0)`,
    [league, id, season, completed, completed ? "Final" : null]
  );
}
const row = (league: string, game: string, player: string, team: string, stats: object) =>
  q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ($1,$2,$3,$4,$5)`, [league, game, player, team, JSON.stringify(stats)]);

before(async () => {
  db = await startTestDb();
  ({ readWhoLeads } = await import("../src/lib/whoLeadsData"));
  for (const l of ["epl", "nba", "laliga", "ipl"]) await q(`insert into teams (league, espn_id, name, slug) values ($1,'1','Alpha','alpha'), ($1,'2','Beta','beta')`, [l]);
  for (const l of ["epl", "nba", "laliga", "ipl"])
    await q(`insert into players (league, espn_id, name, slug, team_espn_id) values ($1,'a','Sam Strike','sam-strike','1'), ($1,'b','Dan Duo','dan-duo','2'), ($1,'c','Cal Crease','cal-crease','1')`, [l]);
  // A league table with one game each, so no table is complete.
  for (const l of ["epl", "nba", "laliga", "ipl"]) await q(`insert into standings (league, season, team_espn_id, wins, losses, draws) values ($1,2026,'1',1,0,0), ($1,2026,'2',0,1,0)`, [l]);
  // EPL: in season (a fixture still to play), results 2 days ago. Goals: Sam 3, Dan 1 -> Sam. No assists recorded.
  await game("epl", "e1", ago(9), true);
  await game("epl", "e2", ago(2), true);
  await game("epl", "e3", ahead(5), false);
  await row("epl", "e1", "a", "1", { match: { APP: "1", SUBIN: "0", G: "2", A: "0" } });
  await row("epl", "e2", "a", "1", { match: { APP: "1", SUBIN: "0", G: "1", A: "0" } });
  await row("epl", "e2", "b", "2", { match: { APP: "1", SUBIN: "0", G: "1", A: "0" } });
  // NBA: results yesterday but nothing left to play: the season is over, so no card.
  await game("nba", "n1", ago(1), true);
  await row("nba", "n1", "a", "1", { box: { MIN: "30", PTS: "30", REB: "5", AST: "5" } });
  // La Liga: a fixture to play but the last result is 60 days old: not presented as current.
  await game("laliga", "l1", ago(60), true);
  await game("laliga", "l2", ahead(5), false);
  await row("laliga", "l1", "a", "1", { match: { APP: "1", SUBIN: "0", G: "4", A: "0" } });
  // IPL: in season. Runs: Sam 80 + 40 = 120, Dan 120 (level). Sixes: Cal 9 (never shown). Wickets: Cal 3.
  await game("ipl", "i1", ago(8), true);
  await game("ipl", "i2", ago(3), true);
  await game("ipl", "i3", ahead(4), false);
  await row("ipl", "i1", "a", "1", { batting: { runs: 80, sixes: 4 } });
  await row("ipl", "i2", "a", "1", { batting: { runs: 40, sixes: 1 } });
  await row("ipl", "i2", "b", "2", { batting: { runs: 120, sixes: 2 } });
  await row("ipl", "i2", "c", "1", { bowling: { wickets: 3, conceded: 20 }, batting: { runs: 0, sixes: 9 } });
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("only competitions in season with a recent result, newest result first", async () => {
  const out = await readWhoLeads();
  assert.deepEqual(out.map((l) => l.league), ["epl", "ipl"]);
  assert.equal(out[0].leagueLabel, "Premier League");
  assert.ok(out[0].seasonLabel.length > 0);
});

test("the leader is rank 1 of the Leaders page's board, with its figure", async () => {
  const [epl] = await readWhoLeads();
  assert.equal(epl.entries.length, 1, "no assists were recorded, so no assists board");
  const goals = epl.entries[0];
  assert.equal(goals.label, "Goals");
  assert.equal(goals.figure, "3");
  assert.deepEqual(goals.people.map((p) => [p.name, p.slug, p.team]), [["Sam Strike", "sam-strike", "Alpha"]]);
  assert.equal(goals.moreLevel, false);
});

test("cricket: runs and wickets only, never sixes; a tie at the top names both", async () => {
  const ipl = (await readWhoLeads()).find((l) => l.league === "ipl")!;
  assert.deepEqual(ipl.entries.map((e) => e.label), ["Runs", "Wickets"]);
  const runs = ipl.entries[0];
  assert.equal(runs.figure, "120");
  assert.deepEqual(runs.people.map((p) => p.name).sort(), ["Dan Duo", "Sam Strike"]);
  assert.equal(ipl.entries[1].figure, "3");
  assert.equal(ipl.entries[1].people[0].name, "Cal Crease");
});

test("boardLeader: ties, a three-way tie that may be longer, empty boards", () => {
  const r = (name: string, value: number): LeaderRow => ({ player_espn_id: name, name, slug: name.toLowerCase(), headshot_url: null, team_name: null, team_slug: null, value });
  assert.equal(boardLeader({ label: "Goals", unit: "GLS", rows: [] }), null);
  assert.equal(boardLeader({ label: "Goals", unit: "GLS", rows: [r("A", 0)] }), null);
  const two = boardLeader({ label: "Goals", unit: "GLS", rows: [r("A", 9), r("B", 9), r("C", 7)] })!;
  assert.deepEqual(two.people.map((p) => p.name), ["A", "B"]);
  assert.equal(two.moreLevel, false);
  const three = boardLeader({ label: "Goals", unit: "GLS", rows: [r("A", 9), r("B", 9), r("C", 9)] })!;
  assert.equal(three.moreLevel, true);
  assert.equal(boardLeader({ label: "Points", unit: "PPG", rows: [r("A", 27.6)] })!.figure, "27.6");
});

test("isRecent", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  assert.equal(isRecent("2026-09-01T00:00:00Z", now), true);
  assert.equal(isRecent("2026-08-01T00:00:00Z", now), false);
  assert.equal(isRecent(null, now), false);
});

test("an empty database gives no cards", async () => {
  for (const t of ["player_game_stats", "games"]) await q(`delete from ${t}`);
  assert.deepEqual(await readWhoLeads(), []);
});
