import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// "Today in three lines" against a real database: which stored results become candidate facts, which are left
// out (stale, unfinished, not a hundred), and that the whole pipeline picks varied, linked lines.

let db: TestDb;
let readTeamStreakFacts: typeof import("../src/lib/threeLinesData").readTeamStreakFacts;
let readCricketFacts: typeof import("../src/lib/threeLinesData").readCricketFacts;
let readThreeLineFacts: typeof import("../src/lib/threeLinesData").readThreeLineFacts;
let selectLines: typeof import("../src/lib/threeLines").selectLines;
const q = (sql: string, args: unknown[] = []) => db.pool.query(sql, args);

const ago = (h: number) => `now() - interval '${h} hours'`;

async function game(league: string, id: string, hoursAgo: number, home: string, away: string, hs: number | null, as: number | null, completed = true) {
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, status_detail, home_score, away_score)
     values ($1,$2,${ago(hoursAgo)},$2,$3,$4,2026,$5,$6,$7,$8)`,
    [league, id, home, away, completed, completed ? "Full Time" : null, hs, as]
  );
}

before(async () => {
  db = await startTestDb();
  ({ readTeamStreakFacts, readCricketFacts, readThreeLineFacts } = await import("../src/lib/threeLinesData"));
  ({ selectLines } = await import("../src/lib/threeLines"));
  await q(
    `insert into teams (league, espn_id, name, slug, abbreviation) values
       ('epl','1','Arsenal','arsenal','ARS'), ('epl','2','Chelsea','chelsea','CHE'), ('epl','3','Liverpool','liverpool','LIV'), ('epl','4','Everton','everton','EVE'),
       ('nba','31','Boston Celtics','boston-celtics','BOS'), ('nba','32','Miami Heat','miami-heat','MIA'),
       ('odi','51','Coral Coast','coral-coast','COR'), ('odi','52','Highveld','highveld','HIG'),
       ('test','61','Eastmere','eastmere','EAS'), ('test','62','Kingsbridge','kingsbridge','KIN')`
  );
  // Arsenal: five straight wins (a draw before them), the latest 20 hours ago.
  await game("epl", "a0", 24 * 30, "1", "2", 1, 1);
  for (const [i, h] of [[1, 24 * 22], [2, 24 * 15], [3, 24 * 8], [4, 24 * 3], [5, 20]] as const) await game("epl", `a${i}`, h, "1", "4", 2, 0);
  // Liverpool: four straight wins, but the last one is four days old, so no result inside the window.
  for (const [i, h] of [[1, 24 * 20], [2, 24 * 14], [3, 24 * 9], [4, 24 * 4]] as const) await game("epl", `l${i}`, h, "3", "2", 3, 1);
  // Boston: two wins then a win 30 hours ago = three straight; Miami lost them all. An unfinished game is not a result.
  await game("nba", "b1", 24 * 6, "31", "32", 100, 90);
  await game("nba", "b2", 24 * 4, "31", "32", 100, 90);
  await game("nba", "b3", 30, "31", "32", 100, 90);
  await game("nba", "b4", -5, "31", "32", null, null, false);

  await q(
    `insert into players (league, espn_id, name, slug) values
       ('odi','p1','A. Rahman','a-rahman'), ('odi','p2','B. Khan','b-khan'), ('odi','p3','C. Dube','c-dube'), ('odi','p4','D. Old','d-old'),
       ('test','p5','E. Long','e-long')`
  );
  // An ODI that ended 10 hours ago: a 112 not out off 61 and a 99; another, 4 days ago, with a 150.
  await game("odi", "m1", 10, "51", "52", null, null);
  await game("odi", "m0", 24 * 4, "51", "52", null, null);
  await game("odi", "m2", 6, "51", "52", null, null, false);
  await q(
    `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values
       ('odi','m1','p1','51','{"batting":{"runs":112,"ballsFaced":61,"notOut":true}}'),
       ('odi','m1','p2','52','{"batting":{"runs":99,"ballsFaced":70,"notOut":false}}'),
       ('odi','m1','p3','52','{"bowling":{"wickets":5,"conceded":23,"overs":10}}'),
       ('odi','m0','p4','51','{"batting":{"runs":150,"ballsFaced":90,"notOut":false}}'),
       ('odi','m2','p1','51','{"batting":{"runs":130,"ballsFaced":80,"notOut":false}}')`
  );
  // A Test that began five days ago and ended 18 hours ago (end_date is the local last day): its innings list holds a 140.
  await q(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, end_date, status_detail, home_score, away_score)
     values ('test','t1',now() - interval '5 days','t1','61','62',2026,true,(now() - interval '18 hours')::date,'Draw',1,1)`
  );
  await q(
    `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values
       ('test','t1','p5','61','{"innings":[{"n":1,"batting":{"runs":20,"notOut":false}},{"n":2,"batting":{"runs":140,"ballsFaced":210,"notOut":false}}]}')`
  );
  // A series match (not archived under a competition): a five-for from a finished match, and a hundred in one still in play.
  await q(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name, status_state, home, away) values
       ('s1','900',${ago(5)},'Pearl v Reef','post','{"id":"7","name":"Pearl Bay"}','{"id":"8","name":"Reef Coast"}'),
       ('s2','900',${ago(2)},'Pearl v Reef','in','{"id":"7","name":"Pearl Bay"}','{"id":"8","name":"Reef Coast"}'),
       ('m1','901',${ago(10)},'Coral v Highveld','post','{"id":"51","name":"Coral Coast"}','{"id":"52","name":"Highveld"}')`
  );
  await q(
    `insert into cricket_series_player_stats (match_espn_id, series_espn_id, player_espn_id, player_name, team_espn_id, stats) values
       ('s1','900','q1','F. Singh','8','{"bowling":{"overs":4,"conceded":19,"wickets":6}}'),
       ('s1','900','q2','G. Ali','7','{"batting":{"runs":55,"ballsFaced":40,"notOut":false}}'),
       ('s2','900','q3','H. Rao','7','{"batting":{"runs":101,"ballsFaced":60,"notOut":false}}'),
       ('m1','901','p1','A. Rahman','51','{"batting":{"runs":112,"ballsFaced":61,"notOut":true}}')`
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db.stop();
});

test("streaks: only teams whose latest counted result is inside the window, worded as the team page words them", async () => {
  const facts = await readTeamStreakFacts();
  const byTeam = (slug: string) => facts.filter((f) => f.href.endsWith(`/teams/${slug}`));
  const arsenal = byTeam("arsenal");
  assert.deepEqual(arsenal.map((f) => f.kind).sort(), ["unbeaten", "win-streak"]);
  assert.equal(arsenal.find((f) => f.kind === "win-streak")?.text, "Arsenal have won 5 games in a row in the Premier League.");
  assert.equal(arsenal.find((f) => f.kind === "unbeaten")?.text, "Arsenal are unbeaten in all 6 of their games in the Premier League this season.");
  assert.equal(new Date(arsenal[0].at).getTime() > Date.now() - 21 * 3_600_000, true);
  assert.equal(arsenal[0].href, "/epl/teams/arsenal");
  // Liverpool's run ended four days ago: no fresh result, so no fact. Chelsea, Everton and Miami have no run.
  assert.deepEqual(byTeam("liverpool"), []);
  assert.deepEqual([byTeam("chelsea"), byTeam("everton"), byTeam("miami-heat")].flat(), []);
  const boston = byTeam("boston-celtics");
  assert.equal(boston.length, 1);
  assert.equal(boston[0].text, "Boston Celtics have won all 3 of their games in the NBA this season.");
  assert.equal(boston[0].sport, "nba");
});

test("cricket: hundreds and five-fors from matches that ended in the window, nothing else", async () => {
  const facts = await readCricketFacts();
  const texts = facts.map((f) => f.text).sort();
  assert.deepEqual(texts, [
    "A. Rahman made 112* off 61 balls for Coral Coast against Highveld.",
    "C. Dube took 5/23 for Highveld against Coral Coast.",
    "E. Long made 140 off 210 balls for Eastmere against Kingsbridge.",
    "F. Singh took 6/19 for Reef Coast against Pearl Bay.",
  ]);
  // The ODI is also a series match; it is read once, from the archive.
  assert.equal(facts.filter((f) => f.text.includes("A. Rahman")).length, 1);
  const href = (needle: string) => facts.find((f) => f.text.includes(needle))?.href;
  assert.equal(href("A. Rahman"), "/odi/games/m1");
  assert.equal(href("E. Long"), "/test/games/t1");
  assert.equal(href("F. Singh"), "/cricket/matches/s1");
  // The Test is dated by its last day, not by the day it began.
  const test = facts.find((f) => f.text.includes("E. Long"))!;
  assert.ok(Date.now() - new Date(test.at).getTime() < 48 * 3_600_000);
});

test("the pipeline: three lines, three sports, strongest first, every one linked", async () => {
  const lines = selectLines(await readThreeLineFacts(), new Date());
  assert.equal(lines.length, 3);
  assert.deepEqual(new Set(lines.map((l) => l.sport)).size, 3);
  assert.ok(lines.every((l) => l.href.startsWith("/") && l.text.includes(l.figure)));
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i - 1].weight >= lines[i].weight);
});

test("an empty database gives no facts and no lines", async () => {
  await q("truncate games, player_game_stats, cricket_series_matches, cricket_series_player_stats");
  assert.deepEqual(await readThreeLineFacts(), []);
  assert.deepEqual(selectLines(await readThreeLineFacts(), new Date()), []);
});
