import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// Final review, Important 4: the header ticker named an upcoming cricket match "Chennai at Mumbai" (the US-league
// wording) where the match page's title, heading and structured data say "Mumbai v Chennai". A fixture has no batting
// order yet and the ticker's query carries no scorecard, so cricket takes the home side first with "v", the order the
// match page's title uses (`gameSides`); a finished match's line names its winner, which is not an order at all.
let db: TestDb;
let ticker: typeof import("../src/lib/ticker");

before(async () => {
  db = await startTestDb();
  ticker = await import("../src/lib/ticker");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});
beforeEach(async () => {
  await db.pool.query(`delete from games`);
  await db.pool.query(`delete from teams`);
});

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function seed(rows: { league: string; id: string; date: string; done?: boolean; scores?: [number, number]; summary?: string }[]) {
  for (const league of new Set(rows.map((r) => r.league))) {
    await db.pool.query(`insert into teams (league, espn_id, name, slug) values ($1, '1', 'Mumbai', 'mumbai'), ($1, '2', 'Chennai', 'chennai')`, [league]);
  }
  for (const r of rows) {
    await db.pool.query(
      `insert into games (league, espn_id, date, name, season_year, home_team_espn_id, away_team_espn_id, home_score, away_score, completed, status_state, status_detail, status_summary, home_winner, away_winner)
       values ($1, $2, $3, 'x', 2026, '1', '2', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [r.league, r.id, r.date, r.scores?.[0] ?? null, r.scores?.[1] ?? null, r.done ?? false, r.done ? "post" : "pre", r.done ? "Final" : "Scheduled", r.summary ?? null, r.done ? true : null, r.done ? false : null]
    );
  }
}
const labels = async () => Object.fromEntries((await ticker.getTicker()).items.map((i) => [i.href.split("/").pop()!, i.label]));

test("an upcoming cricket match reads 'Mumbai v Chennai', as the match page's title does", async () => {
  await seed([{ league: "ipl", id: "c1", date: at(48) }]);
  assert.match((await labels()).c1, /^IPL · Mumbai v Chennai, [A-Z][a-z]{2} \d{1,2}$/);
});

test("a finished cricket match names its winner and margin, as it did", async () => {
  await seed([{ league: "ipl", id: "c2", date: at(-24), done: true, scores: [180, 175], summary: "Mumbai won by 5 runs" }]);
  assert.equal((await labels()).c2, "IPL · Mumbai beat Chennai by 5 runs");
});

test("football and NBA fixtures and results read exactly as they did", async () => {
  await seed([
    { league: "epl", id: "e1", date: at(48) },
    { league: "nba", id: "n1", date: at(50) },
    { league: "nba", id: "n2", date: at(-24), done: true, scores: [110, 100] },
  ]);
  const l = await labels();
  assert.match(l.e1, /^Premier League · Mumbai v Chennai, [A-Z][a-z]{2} \d{1,2}$/);
  assert.match(l.n1, /^NBA · Chennai at Mumbai, [A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(l.n2, "NBA · Mumbai beat Chennai 110-100");
});
