// Audit 2026-10-08, cricket player pages:
//  - the highest score lost its not-out asterisk (Kohli's Test best printed 254 for 254*);
//  - an average was rounded in the meta description (48.01) and cut in the grid (48.00);
//  - a player whose last roster row was a one-off XI (Rashid Khan, ICC World XI) was said to play for it;
//  - an older stored scorecard with no dismissal text printed an unbeaten 84 as "84" beside the World Cup copy's "84*".
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { cricketPlayerDescription } from "../src/lib/cricketPlayerSeo";
import { highScoreText, trunc2 } from "../src/lib/cricketFormat";
import { withStoredNotOuts } from "../src/lib/cricketNotOut";
import { potmLine } from "../src/lib/cricketMatchExtras";
import type { CricketCareerStats } from "../src/lib/queries";
import type { CricketTeamScorecard } from "../src/lib/matchDetail";

let db: TestDb;
let queries: typeof import("../src/lib/queries");
let cricketGroups: typeof import("../src/lib/compare").cricketGroups;
before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  cricketGroups = (await import("../src/lib/compare")).cricketGroups;
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  for (const t of ["player_game_stats", "players", "teams", "games", "game_details"]) await db.pool.query(`delete from ${t}`);
});

const inn = (n: number, runs: number, notOut = false) => ({ n, batting: { runs, ballsFaced: runs + 5, fours: 1, sixes: 0, notOut } });
const addTest = (game: string, player: string, innings: ReturnType<typeof inn>[]) =>
  db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('test', $1, $2, 'A', $3::jsonb)`, [game, player, JSON.stringify({ innings, v: 3 })]);

/* ------------------------------ highest score ------------------------------ */

test("highScoreText writes a not-out score with its asterisk", () => {
  assert.equal(highScoreText(254, true), "254*");
  assert.equal(highScoreText(254, false), "254");
  assert.equal(highScoreText(null, false), "-");
  assert.equal(highScoreText(null, true, "—"), "—");
});

test("the career's highest score carries the not-out flag of that innings", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('test', 'kohli', 'Virat Kohli', 'virat-kohli')`);
  await addTest("g1", "kohli", [inn(1, 254, true), inn(2, 12)]);
  await addTest("g2", "kohli", [inn(1, 200), inn(2, 40, true)]);
  const c = await queries.getPlayerCricketCareer("test", "kohli");
  assert.deepEqual([c?.highestScore, c?.highestScoreNotOut], [254, true]);
});

test("a lower not out does not star a higher score that was out, and a tie on the score stars if either was unbeaten", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('test', 'a', 'A', 'a'), ('test', 'b', 'B', 'b')`);
  await addTest("g1", "a", [inn(1, 150), inn(2, 149, true)]);
  await addTest("g1", "b", [inn(1, 100), inn(2, 100, true), inn(3, 100)]);
  const a = await queries.getPlayerCricketCareer("test", "a");
  const b = await queries.getPlayerCricketCareer("test", "b");
  assert.deepEqual([a?.highestScore, a?.highestScoreNotOut], [150, false]);
  assert.deepEqual([b?.highestScore, b?.highestScoreNotOut], [100, true]);
});

test("a limited-overs match (no innings list) keeps its not-out flag too", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('odi', 'gill', 'Shubman Gill', 'shubman-gill')`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('odi', 'g1', 'gill', 'A', $1::jsonb)`, [JSON.stringify({ batting: { runs: 223, ballsFaced: 200, fours: 20, sixes: 5, notOut: true } })]);
  const c = await queries.getPlayerCricketCareer("odi", "gill");
  assert.deepEqual([c?.highestScore, c?.highestScoreNotOut], [223, true]);
});

const career = (over: Partial<CricketCareerStats> = {}): CricketCareerStats => ({
  matches: 113, inningsBatted: 191, runs: 8848, ballsFaced: 9000, inningsWithBalls: 191, notOuts: 24, hundreds: 29, fifties: 30, highestScore: 254, highestScoreNotOut: true, average: 8848 / 167,
  strikeRate: 55, inningsBowled: 0, overs: 0, runsConceded: 0, wickets: 0, economy: null, fiveWicketHauls: 0, catches: 100, ...over,
});

test("the meta description and the comparison write 254*", () => {
  assert.match(cricketPlayerDescription("test", "Virat Kohli", "India", career()), /best 254\*/);
  assert.match(cricketPlayerDescription("test", "Virat Kohli", "India", career({ highestScoreNotOut: false })), /best 254[,.]/);
  const batting = cricketGroups(career(), career({ highestScore: 223, highestScoreNotOut: false })).find((g) => g.title === "Batting")!;
  const hs = batting.metrics.find((m) => m.label === "Highest score")!;
  assert.deepEqual([hs.aText, hs.bText, hs.a, hs.b], ["254*", "223", 254, 223]);
  const none = cricketGroups(null, career()).find((g) => g.title === "Batting")!.metrics.find((m) => m.label === "Highest score")!;
  assert.deepEqual([none.aText, none.bText], ["—", "254*"]);
});

/* -------------------------------- averages --------------------------------- */

test("the meta description cuts an average the way the grid does (Statsguru), not rounds it", () => {
  // 12,002 runs in 250 dismissals is 48.008: the grid read 48.00, the meta 48.01.
  assert.equal(trunc2(12002 / 250), "48.00");
  assert.match(cricketPlayerDescription("odi", "Sachin Tendulkar", null, career({ average: 12002 / 250, highestScore: 200, highestScoreNotOut: true })), /at 48\.00 /);
  // Kohli's ODI average, 58.789...: 58.78 in the grid, 58.79 in the meta.
  assert.equal(trunc2(58.7894), "58.78");
  assert.match(cricketPlayerDescription("odi", "Virat Kohli", null, career({ average: 58.7894 })), /at 58\.78 /);
  // A bowling average is cut too: 5,120 / 230 = 22.2608...
  assert.match(cricketPlayerDescription("odi", "A Bowler", null, career({ runs: 100, inningsBatted: 10, matches: 50, wickets: 230, runsConceded: 5120, hundreds: 0, fifties: 0, average: 11 })), /230 wickets at 22\.26/);
});

/* --------------------------- the team a page names ------------------------- */

async function seedXi() {
  await db.pool.query(`insert into teams (league, espn_id, name, slug) values ('t20i', '40', 'Afghanistan', 'afghanistan'), ('t20i', 'cs-icc-world-xi', 'ICC World XI', 'icc-world-xi'), ('t20i', 'cs-swaziland', 'Swaziland', 'swaziland'), ('t20i', '7', 'Pakistan', 'pakistan')`);
  await db.pool.query(`insert into players (league, espn_id, team_espn_id, name, slug, roster_seen_at) values
    ('t20i', 'rashid', 'cs-icc-world-xi', 'Rashid Khan', 'rashid-khan', now()),
    ('t20i', 'only-xi', 'cs-icc-world-xi', 'Only Xi', 'only-xi', now()),
    ('t20i', 'afridi', '7', 'Shahid Afridi', 'shahid-afridi', now()),
    ('t20i', 'swazi', 'cs-swaziland', 'Eswatini Man', 'eswatini-man', now())`);
  for (const [id, date] of [["g1", "2018-05-31"], ["g2", "2025-09-01"], ["g3", "2026-09-17"]]) {
    await db.pool.query(`insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed) values ('t20i', $1, $2, 'x', '40', '7', 2026, true)`, [id, date]);
  }
  const row = (game: string, player: string, team: string) => db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('t20i', $1, $2, $3, '{}')`, [game, player, team]);
  await row("g1", "rashid", "cs-icc-world-xi");
  await row("g2", "rashid", "40");
  await row("g3", "rashid", "40");
  await row("g1", "only-xi", "cs-icc-world-xi");
}

test("a player whose last roster row is a one-off XI is shown with his most recent national team", async () => {
  await seedXi();
  const rashid = await queries.getPlayerBySlug("t20i", "rashid-khan");
  assert.deepEqual([rashid?.team_espn_id, rashid?.team_name, rashid?.team_slug], ["40", "Afghanistan", "afghanistan"]);
  const all = await queries.getAllPlayers("t20i");
  assert.equal(all.find((p) => p.slug === "rashid-khan")?.team_name, "Afghanistan");
});

test("everyone else keeps the stored team: a national side, a small nation, and a player who only ever played for the XI", async () => {
  await seedXi();
  assert.equal((await queries.getPlayerBySlug("t20i", "shahid-afridi"))?.team_name, "Pakistan");
  assert.equal((await queries.getPlayerBySlug("t20i", "eswatini-man"))?.team_name, "Swaziland");
  assert.equal((await queries.getPlayerBySlug("t20i", "only-xi"))?.team_name, "ICC World XI");
});

test("the affected-player query the owner runs lists a player until the fix and every one of them resolves to a national side", async () => {
  await seedXi();
  const { rows } = await db.pool.query(
    `select p.name from players p join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league in ('test','odi','t20i','wodi','wt20i') and t.name ~* '(^|[[:space:]])XI$' order by p.name`
  );
  assert.deepEqual(rows.map((r) => r.name), ["Only Xi", "Rashid Khan"]);
});

/* ----------------------- a stored card with no dismissals ------------------- */

const card = (extra: Partial<CricketTeamScorecard["battingRows"][number]> = {}): CricketTeamScorecard[] => [
  {
    teamId: "1",
    teamName: "England",
    battingLabels: ["R", "B", "4s", "6s", "SR"],
    battingRows: [
      { name: "Ben Stokes", athleteId: "311158", stats: ["84", "98", "5", "2", "85.71"], ...extra },
      { name: "Jos Buttler", athleteId: "9999", stats: ["59", "60", "4", "1", "98.33"], dismissal: "c Latham b Henry" },
      { name: "Did Not Bat", athleteId: "1", stats: [] },
    ],
    bowlingLabels: [],
    bowlingRows: [],
  },
];

test("a card with no dismissal text takes 'not out' from the stored per-player figures, so both copies of a match agree", () => {
  const stored = new Map([
    ["311158", { batting: { notOut: true } }],
    ["9999", { batting: { notOut: true } }],
    ["1", { batting: { notOut: true } }],
  ]);
  const filled = withStoredNotOuts(card(), stored);
  assert.equal(filled[0].battingRows[0].dismissal, "not out");
  // An existing dismissal is never overwritten, and a row with no figures is left alone.
  assert.equal(filled[0].battingRows[1].dismissal, "c Latham b Henry");
  assert.equal(filled[0].battingRows[2].dismissal, undefined);
  assert.equal(potmLine(card(), "Ben Stokes"), "84 (98)");
  assert.equal(potmLine(filled, "Ben Stokes"), "84* (98)");
});

test("nothing stored, or an innings that was out, changes nothing", () => {
  const c = card();
  assert.equal(withStoredNotOuts(c, new Map()), c);
  assert.equal(withStoredNotOuts(c, new Map([["311158", { batting: { notOut: false } }]])), c);
});

test("a Test card is matched by innings number", () => {
  const c = card({ innings: 2 });
  const stored = new Map([["311158", { innings: [{ n: 1, batting: { notOut: true } }, { n: 2, batting: { notOut: false } }] }]]);
  assert.equal(withStoredNotOuts(c, stored), c);
  const stored2 = new Map([["311158", { innings: [{ n: 1, batting: { notOut: false } }, { n: 2, batting: { notOut: true } }] }]]);
  assert.equal(withStoredNotOuts(c, stored2)[0].battingRows[0].dismissal, "not out");
});

test("getGameDetails completes an old cricket card from player_game_stats", async () => {
  await db.pool.query(`insert into players (league, espn_id, name, slug) values ('odi', '311158', 'Ben Stokes', 'ben-stokes')`);
  await db.pool.query(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('odi', 'g1', '311158', '1', $1::jsonb)`, [JSON.stringify({ batting: { runs: 84, ballsFaced: 98, fours: 5, sixes: 2, notOut: true } })]);
  const details = { scorecard: card(), team_stats: [], player_box: [], events: [], lineups: [], leaders: [], win_probability: [] };
  await db.pool.query(`insert into game_details (league, game_espn_id, details) values ('odi', 'g1', $1::jsonb)`, [JSON.stringify(details)]);
  const got = await queries.getGameDetails("odi", "g1");
  assert.equal(got?.scorecard[0].battingRows[0].dismissal, "not out");
  assert.equal(got?.scorecard[0].battingRows[1].dismissal, "c Latham b Henry");
});
