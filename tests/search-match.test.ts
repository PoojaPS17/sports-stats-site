// Search matches every word of the query in any order, ignoring case and accents, finds clubs by abbreviation, ranks the
// whole-name match first and the busier player before a namesake, and lists games between the clubs named.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { foldText, searchTokens, likeTerm } from "../src/lib/searchText";

let db: TestDb;
let queries: typeof import("../src/lib/queries");

before(async () => {
  db = await startTestDb();
  queries = await import("../src/lib/queries");
  const q = (sql: string, params: unknown[] = []) => db.pool.query(sql, params);
  await q(`insert into teams (league, espn_id, name, slug, abbreviation) values
    ('nba', 'lal', 'Los Angeles Lakers', 'los-angeles-lakers', 'LAL'), ('nba', 'bos', 'Boston Celtics', 'boston-celtics', 'BOS'), ('nba', 'mia', 'Miami Heat', 'miami-heat', 'MIA'),
    ('epl', 'mci', 'Manchester City', 'manchester-city', 'MCI'), ('epl', 'mun', 'Manchester United', 'manchester-united', 'MUN'),
    ('ligue1', 'psg', 'Paris Saint-Germain', 'paris-saint-germain', 'PSG')`);
  await q(`insert into players (league, espn_id, team_espn_id, name, slug) values
    ('nba', 'p1', 'lal', 'LeBron James', 'lebron-james'), ('nba', 'p2', 'bos', 'Mike James', 'mike-james'),
    ('ligue1', 'p3', 'psg', 'Kylian Mbappé', 'kylian-mbappe'), ('ligue1', 'p4', 'psg', 'Ethan Mbappé', 'ethan-mbappe'),
    ('epl', 'p5', 'mci', 'Erling Haaland', 'erling-haaland'), ('nba', 'p6', 'mia', 'Jaylen Smith', 'jaylen-smith')`);
  await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type) values
    ('nba', 'ga', now() - interval '3 days', 'x', 2026, 'bos', 'lal', 100, 90, true, 2, 'STD'),
    ('nba', 'gb', now() + interval '5 days', 'x', 2026, 'lal', 'mia', null, null, false, 2, 'STD'),
    ('nba', 'gc', now() - interval '200 days', 'x', 2025, 'lal', 'bos', 80, 85, true, 2, 'STD'),
    ('epl', 'gd', now() - interval '1 days', 'x', 2026, 'mci', 'mun', 2, 1, true, 2, 'STD')`);
  // Kylian has two games, Ethan none.
  await q(`insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats) values ('ligue1', 'x1', 'p3', 'psg', '{}'), ('ligue1', 'x2', 'p3', 'psg', '{}')`);
  await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, season_type, competition_type) values
    ('ligue1', 'x1', now(), 'x', 2026, 'psg', 'psg', 1, 0, true, 2, 'STD'), ('ligue1', 'x2', now(), 'x', 2026, 'psg', 'psg', 1, 0, true, 2, 'STD')`);
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

test("text folding drops accents and case, and the query splits into words without the 'vs' between teams", () => {
  assert.equal(foldText("Kylian Mbappé"), "kylian mbappe");
  assert.equal(foldText("Łukasz Fabiański"), "lukasz fabianski");
  assert.deepEqual(searchTokens("  Lakers  vs. Celtics "), ["lakers", "celtics"]);
  assert.deepEqual(searchTokens("Lakers @ Celtics"), ["lakers", "celtics"]);
  assert.deepEqual(searchTokens("vs"), []);
  assert.equal(likeTerm("50%_x"), "%50\\%\\_x%");
});

test("a query without accents finds accented names, and either order of words finds the player", async () => {
  assert.deepEqual(names(await queries.search("mbappe")).slice(0, 1), ["Kylian Mbappé"]);
  assert.ok(names(await queries.search("MBAPPÉ")).includes("Ethan Mbappé"));
  assert.deepEqual(names(await queries.search("james lebron")), ["LeBron James"]);
  assert.deepEqual(names(await queries.search("lebron james")), ["LeBron James"]);
});

test("a club is found by part of its name or by its abbreviation", async () => {
  assert.deepEqual(names(await queries.search("man city")), ["Manchester City"]);
  assert.deepEqual(names(await queries.search("LAL")).slice(0, 1), ["Los Angeles Lakers"]);
  assert.deepEqual(names(await queries.search("paris saint germain")), ["Paris Saint-Germain"]);
  assert.deepEqual(names(await queries.search("saint-germain")), ["Paris Saint-Germain"]);
});

test("the player with games comes before a namesake with none, and an exact name before a longer one", async () => {
  const mbappes = await queries.search("mbappe");
  assert.deepEqual(names(mbappes), ["Kylian Mbappé", "Ethan Mbappé"]);
  const exact = await queries.search("mike james");
  assert.equal(exact[0].name, "Mike James");
});

test("no words, or only a joiner, finds nothing and a wildcard character is matched literally", async () => {
  assert.deepEqual(await queries.search("  "), []);
  assert.deepEqual(await queries.search("vs"), []);
  assert.deepEqual(await queries.search("%"), []);
  assert.deepEqual(await queries.search("_"), []);
  assert.deepEqual(await queries.search("a"), []);
});

test("games between the clubs named are listed, nearest to today first", async () => {
  const both = await queries.searchGames("lakers vs celtics");
  assert.deepEqual(both.map((g) => g.espn_id), ["ga", "gc"]);
  assert.equal(both[0].home, "Boston Celtics");
  assert.equal(both[0].home_score, "100");
  const reversed = await queries.searchGames("celtics lakers");
  assert.deepEqual(reversed.map((g) => g.espn_id), ["ga", "gc"]);
  const lakers = await queries.searchGames("lakers");
  assert.deepEqual(lakers.map((g) => g.espn_id), ["ga", "gb", "gc"]);
  assert.equal(lakers[1].completed, false);
  assert.deepEqual((await queries.searchGames("man city")).map((g) => g.espn_id), ["gd"]);
});

test("a one- or two-letter query lists no games, and a name with no club lists none", async () => {
  assert.deepEqual(await queries.searchGames("la"), []);
  assert.deepEqual(await queries.searchGames("lebron"), []);
  assert.deepEqual(await queries.searchGames("zzz"), []);
  assert.deepEqual(await queries.searchGames(""), []);
});
