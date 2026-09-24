// Regression test for a real production outage (2026-09-24): the core sitemap's
// scores-by-date entries queried `local_date` without a `::text` cast, so node-postgres
// handed back a `date`-typed column as a JS Date object instead of a string. gameDayIso's
// localDay() called `.slice()` on it and threw, which failed the whole `next build` on
// /sitemap/core.xml — every other query in the codebase already casts local_date::text
// (see src/lib/queries.ts, src/lib/analytics.ts) for exactly this reason.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let db: TestDb;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
  // A cricket game (cricket is the one family that uses local_date, not the league's
  // time zone) dated "today" so it falls inside scoresByDate's 30-day-back/3-day-ahead window.
  await db.pool.query(
    `insert into games (league, espn_id, date, name, home_team_espn_id, away_team_espn_id, season_year, completed, local_date)
     values ('ipl', 'g1', now(), 'g1', '1', '2', 2026, true, to_char(now(), 'YYYY-MM-DD')::date)`
  );
});

after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

test("the core sitemap builds scores-by-date entries from a real local_date column without throwing", async () => {
  const entries = await sitemapEntries("core");
  const { rows } = await db.pool.query<{ day: string }>(`select to_char(now(), 'YYYY-MM-DD') as day`);
  const today = rows[0].day;
  assert.ok(
    entries.some((e) => e.url.endsWith(`/ipl/scores/${today}`)),
    "expected an /ipl/scores/<today> entry built from the game's local_date"
  );
});
