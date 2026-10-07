import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

// <lastmod> answers "when did this page's content last change". A scheduled fixture's
// end date is the opposite: a date the page's content has not reached yet. Publishing it
// tells Google the page changed on a day that has not happened, and Google's response to
// a lastmod it cannot trust is to stop trusting the site's lastmod at all -- including on
// the game pages where it is accurate and useful.

let db: TestDb;
let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));

  // A series running well into next season, with a match so the sitemap includes it.
  await db.pool.query(
    `insert into cricket_series (espn_id, name, kind, start_date, end_date)
     values ('s1', 'Long Tour', 'international', now() - interval '10 days', now() + interval '180 days')`
  );
  await db.pool.query(
    `insert into cricket_series_matches (espn_id, series_espn_id, date, name)
     values ('m1', 's1', now() + interval '60 days', '1st Test')`
  );
  // A tournament whose final is still months away.
  await db.pool.query(
    `insert into tennis_tournaments (espn_id, tour, tournament_id, season, name, start_date, end_date)
     values ('t1-2027', 'atp', 't1', 2027, 'Future Open', now() + interval '150 days', now() + interval '160 days')`
  );
});
after(async () => {
  await db?.stop();
});

const future = (v: unknown) => v != null && new Date(v as string).getTime() > Date.now();

test("a cricket series that ends in the future does not claim a future lastmod", async () => {
  const entries = await sitemapEntries("cricket-series");
  const series = entries.find((e) => e.url.endsWith("/cricket/series/s1"));

  assert.ok(series, "the series should be in the cricket-series sitemap");
  assert.equal(future(series.lastModified), false, `lastmod ${String(series.lastModified)} is in the future`);
});

// Every sitemap, not just the ones that were wrong: any future source added later (a
// scheduled article's publish date, a new fixture-dated column) is caught here rather than
// in a coverage report months afterwards.
test("no sitemap entry anywhere claims a lastmod in the future", async () => {
  const { SITEMAP_IDS } = await import("../src/lib/sitemap");

  const ahead: string[] = [];
  for (const id of SITEMAP_IDS) {
    for (const e of await sitemapEntries(id)) {
      if (future(e.lastModified)) ahead.push(`${id}: ${e.url} -> ${String(e.lastModified)}`);
    }
  }

  assert.deepEqual(ahead, []);
});

test("an f1 event's lastmod is when its data last changed, not when the race was run", async () => {
  await db.pool.query(
    `insert into f1_events (espn_id, name, date, updated_at)
     values ('e1', 'Old Grand Prix', '2020-05-10T00:00:00Z', now())`
  );

  const race = (await sitemapEntries("f1")).find((e) => e.url.endsWith("/f1/events/e1"));

  assert.ok(race, "the race should be in the f1 sitemap");
  assert.ok(race.lastModified, "a race with a stored update time should carry a lastmod");
  assert.equal(new Date(race.lastModified as string).getUTCFullYear(), new Date().getUTCFullYear());
});

test("no tennis sitemap entry claims a lastmod in the future", async () => {
  const entries = await sitemapEntries("tennis");

  const ahead = entries.filter((e) => future(e.lastModified)).map((e) => `${e.url} -> ${String(e.lastModified)}`);

  assert.deepEqual(ahead, []);
});
