import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// `updated_at` is what the sitemaps publish as <lastmod>, so it has to mean "this game's
// data changed", not "the scraper looked at this game". The hourly scrape re-reads every
// game in its window whether or not anything moved; if each pass bumped the timestamp,
// every finished game in the sitemap would claim to have changed on the last scrape.

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

// One finished NBA game, with the scores the caller asks for.
function event(homeScore: string, awayScore: string, detail = "Final") {
  return {
    id: "g",
    date: "2026-04-20T00:00:00Z",
    name: "A at B",
    season: { year: 2026, type: 2 },
    competitions: [
      {
        type: { abbreviation: "STD" },
        competitors: [team("1", "Alpha", true, homeScore), team("2", "Bravo", false, awayScore)],
        status: { type: { state: "post", completed: true, detail } },
      },
    ],
  };
}

const updatedAt = async (): Promise<Date> =>
  (await db.pool.query(`select updated_at from games where league = 'nba' and espn_id = 'g'`)).rows[0].updated_at;

test("re-ingesting a game whose data has not changed leaves updated_at alone", async () => {
  await games.upsertEvent("nba", event("100", "90"));
  const first = await updatedAt();

  await games.upsertEvent("nba", event("100", "90"));

  assert.deepEqual(await updatedAt(), first);
});

test("re-ingesting a game with a new score moves updated_at", async () => {
  await games.upsertEvent("nba", event("100", "90"));
  const first = await updatedAt();

  await games.upsertEvent("nba", event("110", "95"));

  assert.ok((await updatedAt()) > first, "updated_at should advance when the score changes");
});

// IndexNow is for pages a crawler has not seen; re-announcing a game on every scrape pass
// is what gets a site throttled. The insert is the only reliable "this URL is new" signal,
// so upsertEvent reports it rather than leaving callers to guess.
test("upsertEvent reports a game it has just created, and not one it has seen before", async () => {
  assert.equal((await games.upsertEvent("nba", event("100", "90"))).inserted, true);

  assert.equal((await games.upsertEvent("nba", event("110", "95"))).inserted, false);
});

test("a change to the status alone still moves updated_at", async () => {
  await games.upsertEvent("nba", event("100", "90", "Final"));
  const first = await updatedAt();

  await games.upsertEvent("nba", event("100", "90", "Final/OT"));

  assert.ok((await updatedAt()) > first, "updated_at should advance when the status detail changes");
});

// storeCricketDates already refuses to rewrite unchanged dates (the live scrape calls it on
// every poll). It just never moved updated_at when the dates did change, so a match that
// slid a day kept announcing the old lastmod.
test("a cricket match whose local day changes has its lastmod moved", async () => {
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed)
     values ('ipl', 'c1', '2026-03-23T14:00:00Z', 'Alpha v Bravo', '1', '2', 2026, false)`
  );
  const at = async () => (await db.pool.query(`select updated_at from games where league = 'ipl' and espn_id = 'c1'`)).rows[0].updated_at;

  await games.storeCricketDates("ipl", "c1", "1st Match (N), Indian Premier League at Mumbai, Mar 23 2026", [], "2026-03-23T14:00:00Z");
  const first = await at();

  await games.storeCricketDates("ipl", "c1", "1st Match (N), Indian Premier League at Mumbai, Mar 24 2026", [], "2026-03-24T14:00:00Z");
  assert.ok((await at()) > first, "a new local day should move the match's lastmod");

  const moved = await at();
  await games.storeCricketDates("ipl", "c1", "1st Match (N), Indian Premier League at Mumbai, Mar 24 2026", [], "2026-03-24T14:00:00Z");
  assert.deepEqual(await at(), moved, "re-reading the same day should leave it alone");
});
