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
  await q(`update games set round = 'Semifinal' where espn_id = 'gd'`);
  await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, round, completed, season_type, competition_type) values
    ('nba', 'ge', now() + interval '30 days', 'x', 2026, 'mia', 'bos', 'Semifinal', false, 2, 'STD')`);
  await q(`insert into players (league, espn_id, name, slug) values ('atp', 'dj', 'Novak Djokovic', 'novak-djokovic'), ('atp', 'ca', 'Carlos Alcaraz', 'carlos-alcaraz')`);
  await q(`insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, location, major, start_date) values ('189-2026', 'atp', '189', 2026, 'Wimbledon', 'London', true, now() - interval '60 days')`);
  await q(`insert into tennis_matches (tour, espn_id, tournament_name, tournament_espn_id, round, date, day, player1_espn_id, player2_espn_id, score_display, winner_espn_id, completed)
           values ('atp', 'tm1', 'Wimbledon', '189-2026', 'Final', now() - interval '50 days', current_date - 50, 'dj', 'ca', '6-4 6-4', 'dj', true)`);
  await q(`insert into tennis_matches (tour, espn_id, tournament_name, tournament_espn_id, round, date, day, player1_espn_id, player2_espn_id, completed, side1, side2)
           values ('atp', 'tm2', 'Wimbledon', '189-2026', 'Round 2', now() - interval '55 days', current_date - 55, 'x1', 'x2', true,
                   '{"ids":["b1","b2"],"names":["Bob Bryan","Mike Bryan"]}', '{"ids":["r1","r2"],"names":["Rajeev Ram","Joe Salisbury"]}')`);
  await q(`insert into cricket_series (espn_id, name, kind) values ('s1', 'Ranji Trophy', 'domestic')`);
  await q(`insert into cricket_series_matches (espn_id, series_espn_id, date, name, description, status_summary, status_state, home, away, league_candidates) values
    ('c1', 's1', now() - interval '20 days', 'x', '3rd Match', 'Mumbai won by 5 wickets', 'post', '{"name":"Mumbai"}', '{"name":"Karnataka"}', '{}'),
    ('ct', 's1', now() - interval '21 days', 'x', '1st Test', 'x', 'post', '{"name":"England"}', '{"name":"India"}', '{test}')`);
  await q(`insert into teams (league, espn_id, name, slug) values ('test', 'eng', 'England', 'england'), ('test', 'ind', 'India', 'india')`);
  await q(`insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, completed, season_type, competition_type) values
    ('test', 'ct', now() - interval '21 days', 'x', 2026, 'eng', 'ind', true, 2, 'STD')`);
  await q(`insert into f1_events (espn_id, name, date, season_year, circuit_name, circuit_city, circuit_country) values ('f1a', 'Monaco Grand Prix', now() - interval '100 days', 2026, 'Circuit de Monaco', 'Monte Carlo', 'Monaco')`);
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

const ids = (rows: { href: string }[]) => rows.map((r) => r.href.split("/").pop());

test("games between the clubs named are listed, games still to come first, then the past newest first", async () => {
  const both = await queries.searchGames("lakers vs celtics");
  assert.deepEqual(ids(both), ["ga", "gc"]);
  assert.equal(both[0].href, "/nba/games/ga");
  assert.equal(both[0].title, "Los Angeles Lakers at Boston Celtics");
  assert.equal(both[0].detail, "100-90");
  assert.deepEqual(ids(await queries.searchGames("celtics lakers")), ["ga", "gc"]);
  const lakers = await queries.searchGames("lakers");
  assert.deepEqual(ids(lakers), ["gb", "ga", "gc"]);
  assert.equal(lakers[0].detail, null);
  assert.deepEqual(ids(await queries.searchGames("man city")), ["gd"]);
});

test("a year narrows the games, and the round is searchable", async () => {
  assert.deepEqual(ids(await queries.searchGames("lakers celtics 2025")), ["gc"]);
  assert.deepEqual(ids(await queries.searchGames("lakers 2026")), ["gb", "ga", "gc"]);
  assert.deepEqual(ids(await queries.searchGames("semifinal")), ["ge", "gd"]);
  assert.deepEqual(ids(await queries.searchGames("heat semifinal")), ["ge"]);
});

test("tennis matches, tournaments, cricket series matches and F1 weekends are found too", async () => {
  const singles = await queries.searchGames("djokovic alcaraz");
  assert.deepEqual(singles.map((r) => [r.href, r.title, r.label]), [["/tennis/tournaments/189-2026", "Novak Djokovic v Carlos Alcaraz", "tennis"]]);
  assert.equal(singles[0].detail, "Wimbledon · Final · 6-4 6-4");
  assert.deepEqual(ids(await queries.searchGames("alcaraz djokovic final")), ["189-2026"]);
  assert.deepEqual(ids(await queries.searchGames("alcaraz wimbledon")).length, 1);
  const doubles = await queries.searchGames("bryan ram");
  assert.equal(doubles.length, 1);
  assert.equal(doubles[0].title, "Bob Bryan / Mike Bryan v Rajeev Ram / Joe Salisbury");
  const tournament = await queries.searchGames("wimbledon 2026");
  // The tournament itself comes first, then that year's matches in it.
  assert.deepEqual(tournament.map((r) => r.label), ["tennis tournament", "tennis", "tennis"]);
  assert.equal(tournament[0].title, "Wimbledon 2026");
  const cricket = await queries.searchGames("karnataka mumbai");
  assert.deepEqual(cricket.map((r) => [r.href, r.label, r.detail]), [["/cricket/matches/c1", "cricket", "Ranji Trophy · 3rd Match · Mumbai won by 5 wickets"]]);
  // A match whose scorecard is held as a game is listed once, from the games table.
  assert.deepEqual(ids(await queries.searchGames("india england")), ["ct"]);
  const f1 = await queries.searchGames("monaco grand prix");
  assert.deepEqual(f1.map((r) => [r.href, r.title, r.detail]), [["/f1/events/f1a", "Monaco Grand Prix 2026", "Circuit de Monaco · Monaco"]]);
  assert.deepEqual(ids(await queries.searchGames("monte carlo")), ["f1a"]);
});

test("a one- or two-letter query lists no games, and a name with no club lists none", async () => {
  assert.deepEqual(await queries.searchGames("la"), []);
  assert.deepEqual(await queries.searchGames("lebron"), []);
  assert.deepEqual(await queries.searchGames("zzz"), []);
  assert.deepEqual(await queries.searchGames(""), []);
});
