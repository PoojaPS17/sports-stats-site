import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";
import type { SeriesMap, MatchRow } from "../scripts/lib/cricket-series-ingest";

// storeSeries writes a series row in two passes: an upsert of the labels (name, slug, kind)
// and then a recompute of everything derived from its matches -- the dates, the match and
// completed counts, the formats, the teams. The labels almost never change; the recompute is
// what changes the page a reader sees. The sitemap publishes `updated_at` as <lastmod>, so a
// recompute that left the timestamp alone would keep announcing a stale date for exactly the
// series that had just changed.

let db: TestDb;
let ingest: typeof import("../scripts/lib/cricket-series-ingest");

before(async () => {
  db = await startTestDb();
  ingest = await import("../scripts/lib/cricket-series-ingest");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const meta = (): SeriesMap =>
  new Map([["s9", { name: "Test Tour", short: "Tour", abbr: "TT", slug: "test-tour", isTournament: false, events: [] }]]);

const match = (id: string, day: string, state: string): MatchRow => ({
  id,
  series: "s9",
  date: `2026-0${day}T00:00:00Z`,
  name: `${id} match`,
  short: null,
  description: null,
  card: "ODI",
  className: "ODI",
  intl: "1",
  state,
  summary: null,
  venue: null,
  home: { id: "1", name: "Alpha", abbreviation: "ALP", score: null, winner: false, logo: null },
  away: { id: "2", name: "Bravo", abbreviation: "BRA", score: null, winner: false, logo: null },
  candidates: [],
});

const updatedAt = async (): Promise<Date> =>
  (await db.pool.query(`select updated_at from cricket_series where espn_id = 's9'`)).rows[0].updated_at;

test("a series that gains a match has its lastmod moved", async () => {
  await ingest.storeMatches([match("m1", "3-01", "pre")]);
  await ingest.storeSeries(meta());
  const before = await updatedAt();

  await ingest.storeMatches([match("m2", "3-05", "pre")]);
  await ingest.storeSeries(meta());

  assert.ok((await updatedAt()) > before, "adding a second match should move the series lastmod");
});

test("a series whose match finishes has its lastmod moved", async () => {
  const done = await updatedAt();

  await ingest.storeMatches([match("m2", "3-05", "post")]);
  await ingest.storeSeries(meta());

  assert.ok((await updatedAt()) > done, "a completed match changes the series page, so lastmod moves");
});

test("re-running the same listing leaves the series lastmod alone", async () => {
  const settled = await updatedAt();

  await ingest.storeMatches([match("m1", "3-01", "pre"), match("m2", "3-05", "post")]);
  await ingest.storeSeries(meta());

  assert.deepEqual(await updatedAt(), settled);
});
