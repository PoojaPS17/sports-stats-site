// "Official tour rankings" said nothing about which week. ESPN's ranking resource carries occurrence.number (the
// week) and lastUpdated, which is the THURSDAY of that week (Jan 1 + 7 x (week - 1)); the tour publishes the ranking
// on the Monday after it, so lastUpdated 2026-09-10T07:00Z is "Ranking of Mon 14 Sep 2026". The loader stores both, the
// page and the share image say which ranking they show, and when the newest official Monday is later than the one in
// the feed the page says so rather than presenting a stale week as current.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";
import { newerRankingNote, rankingAsOf, rankingLabel } from "../src/lib/tennisRankings";

let db: TestDb;
let Page: typeof import("../src/app/tennis/[tour]/rankings/page").default;
let tennis: typeof import("../src/lib/tennis");
let loader: typeof import("../scripts/lib/tennis");

before(async () => {
  db = await startTestDb();
  ({ default: Page } = await import("../src/app/tennis/[tour]/rankings/page"));
  tennis = await import("../src/lib/tennis");
  loader = await import("../scripts/lib/tennis");
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

/* ---- the date ---- */

test("rankingAsOf: ESPN's Thursday lastUpdated is the Monday four days on", () => {
  assert.equal(rankingAsOf("2026-09-10T07:00Z"), "2026-09-14");
  assert.equal(rankingAsOf("2026-09-10T07:00:00Z"), "2026-09-14");
  assert.equal(rankingAsOf("2026-09-17T07:00Z"), "2026-09-21");
  // across a month and a year end
  assert.equal(rankingAsOf("2026-12-31T07:00Z"), "2027-01-04");
  assert.equal(rankingAsOf("2026-01-29T07:00Z"), "2026-02-02");
});

test("rankingAsOf: every week of 2026 (lastUpdated = Jan 1 + 7 x (week - 1)) lands on a Monday", () => {
  for (let w = 1; w <= 52; w++) {
    const thursday = new Date(Date.UTC(2026, 0, 1 + 7 * (w - 1), 7));
    const asOf = rankingAsOf(thursday.toISOString());
    assert.equal(new Date(`${asOf}T12:00:00Z`).getUTCDay(), 1, `week ${w} ${asOf}`);
  }
});

test("rankingLabel reads 'Ranking of Mon 14 Sep 2026', and falls back until a week is on file", () => {
  assert.equal(rankingLabel("2026-09-14"), "Ranking of Mon 14 Sep 2026");
  assert.equal(rankingLabel("2026-01-05"), "Ranking of Mon 5 Jan 2026");
  assert.equal(rankingLabel(null), "Official world rankings");
});

test("newerRankingNote: a week or more after the ranking's Monday, the newer Monday is named as not in the feed yet", () => {
  assert.equal(newerRankingNote("2026-09-14", "2026-09-20"), null);
  assert.equal(newerRankingNote("2026-09-14", "2026-09-14"), null);
  assert.equal(newerRankingNote("2026-09-14", "2026-09-21"), "The Mon 21 Sep ranking is published but not in our feed yet, so this is the previous week.");
  assert.equal(newerRankingNote("2026-09-14", "2026-09-27"), "The Mon 21 Sep ranking is published but not in our feed yet, so this is the previous week.");
  // two weeks behind: the newest Monday is named
  assert.match(newerRankingNote("2026-09-14", "2026-10-06") ?? "", /Mon 5 Oct/);
  assert.equal(newerRankingNote(null, "2026-09-21"), null);
});

/* ---- the schema: additive, and applying it again keeps the rows ---- */

test("schema: ranking_week and espn_updated are added to an existing tennis_rankings without losing rows", async () => {
  await db.pool.query(`delete from tennis_rankings`);
  await db.pool.query(`alter table tennis_rankings drop column ranking_week, drop column espn_updated`);
  await db.pool.query(`insert into tennis_rankings (tour, player_espn_id, rank, points) values ('wta', '1', 1, 9000)`);
  await db.pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
  await db.pool.query(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8")); // and again
  const { rows } = await db.pool.query(`select rank, points::int as points, ranking_week, espn_updated from tennis_rankings`);
  assert.deepEqual(rows, [{ rank: 1, points: 9000, ranking_week: null, espn_updated: null }]);
});

/* ---- the loader stores the week ---- */

const store = (tour: "atp" | "wta", id: string, rank: number, week: number | null, updated: string | null) =>
  loader.upsertRanking(db.pool, tour, id, { current: rank, previous: rank + 1, points: 1000 - rank }, { week, lastUpdated: updated });

beforeEach(async () => {
  await db.pool.query(`delete from tennis_rankings`);
  await db.pool.query(`delete from players`);
  await db.pool.query(`insert into players (league, espn_id, name, slug, country) values ('wta', '1', 'Iga Swiatek', 'iga-swiatek', 'POL'), ('wta', '2', 'Aryna Sabalenka', 'aryna-sabalenka', 'BLR')`);
});

test("upsertRanking stores the week and ESPN's lastUpdated, and a later run overwrites them", async () => {
  await store("wta", "1", 2, 37, "2026-09-10T07:00Z");
  let row = (await db.pool.query(`select rank, ranking_week, to_char(espn_updated at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as u from tennis_rankings`)).rows[0];
  assert.deepEqual(row, { rank: 2, ranking_week: 37, u: "2026-09-10T07:00Z" });
  await store("wta", "1", 1, 38, "2026-09-17T07:00Z");
  row = (await db.pool.query(`select rank, ranking_week, to_char(espn_updated at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as u from tennis_rankings`)).rows[0];
  assert.deepEqual(row, { rank: 1, ranking_week: 38, u: "2026-09-17T07:00Z" });
  // a feed with no week leaves the columns empty, not stale
  await store("wta", "1", 1, null, null);
  assert.deepEqual((await db.pool.query(`select ranking_week, espn_updated from tennis_rankings`)).rows[0], { ranking_week: null, espn_updated: null });
});

test("getTennisRankingsAsOf returns the Monday, from the newest row, per tour", async () => {
  await store("wta", "1", 2, 37, "2026-09-10T07:00Z");
  await store("wta", "2", 1, 37, "2026-09-10T07:00Z");
  await store("atp", "9", 1, 38, "2026-09-17T07:00Z");
  assert.deepEqual(await tennis.getTennisRankingsAsOf("wta"), { week: 37, asOf: "2026-09-14" });
  assert.deepEqual(await tennis.getTennisRankingsAsOf("atp"), { week: 38, asOf: "2026-09-21" });
});

test("getTennisRankingsAsOf is empty before the loader has run since the migration", async () => {
  await db.pool.query(`insert into tennis_rankings (tour, player_espn_id, rank, points) values ('wta', '1', 1, 9000)`);
  assert.deepEqual(await tennis.getTennisRankingsAsOf("wta"), { week: null, asOf: null });
});

/* ---- the page and the share image ---- */

const text = (fragment: string) => fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const render = async () => renderToStaticMarkup((await Page({ params: Promise.resolve({ tour: "wta" }) })) as ReactElement);

test("the page (and the share image) say which ranking they show", async () => {
  await store("wta", "1", 2, 37, "2026-09-10T07:00Z");
  await store("wta", "2", 1, 37, "2026-09-10T07:00Z");
  const markup = text(await render());
  assert.match(markup, /Ranking of Mon 14 Sep 2026/);
  assert.doesNotMatch(markup, /Official tour rankings/);
  // the visible subtitle and the share image's subtitle are the same words
  assert.ok((markup.match(/Ranking of Mon 14 Sep 2026/g) ?? []).length >= 2);
});

test("a ranking older than a week shows the not-in-our-feed note; the current one does not", async () => {
  await store("wta", "1", 2, 2, "2026-01-08T07:00Z"); // Monday 2026-01-12, long past
  assert.match(text(await render()), /published but not in our feed yet/);
  await db.pool.query(`delete from tennis_rankings`);
  await store("wta", "1", 2, 99, "2099-01-01T07:00Z"); // in the future: nothing newer can exist
  assert.doesNotMatch(text(await render()), /not in our feed yet/);
});

test("before the loader has stored a week, the page still says it is the official ranking, with no date", async () => {
  await db.pool.query(`insert into tennis_rankings (tour, player_espn_id, rank, points) values ('wta', '1', 1, 9000)`);
  const markup = text(await render());
  assert.match(markup, /Official world rankings/);
  assert.doesNotMatch(markup, /Ranking of/);
});

/* ---- the loader script (an entry point: source-text) ---- */

const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the loader reads the week and lastUpdated from the ranking resource and passes them to upsertRanking", () => {
  const src = withoutComments(readFileSync("scripts/fetch-tennis-rankings.ts", "utf8"));
  assert.match(src, /data\.occurrence\?\.number/);
  assert.match(src, /data\.lastUpdated/);
  assert.match(src, /await upsertRanking\(pool, tour, athlete\.id, r, meta\);/);
  assert.doesNotMatch(src, /insert into tennis_rankings/, "the one upsert lives in scripts/lib/tennis.ts");
});
