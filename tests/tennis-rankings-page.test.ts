// The rankings page: the movement column is headed "Move" (as on the share image), not "Prev." over ▲/▼ arrows.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { startTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let Page: typeof import("../src/app/tennis/[tour]/rankings/page").default;

before(async () => {
  db = await startTestDb();
  ({ default: Page } = await import("../src/app/tennis/[tour]/rankings/page"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

const text = (fragment: string) => fragment.replace(/<[^>]+>/g, "").trim();
const heads = (markup: string) => [...markup.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
const render = async (tour: string) => renderToStaticMarkup((await Page({ params: Promise.resolve({ tour }) })) as ReactElement);
// The visible table only: the page also carries the (hidden) share-image card, which has its own headers.
const pageTable = (markup: string) => markup.match(/<table class="w-full border-collapse text-sm">[\s\S]*?<\/table>/)?.[0] ?? "";

beforeEach(async () => {
  await db.pool.query(`delete from tennis_rankings`);
  await db.pool.query(`delete from players`);
  await db.pool.query(`insert into players (league, espn_id, name, slug, country) values ('wta', '1', 'Iga Swiatek', 'iga-swiatek', 'POL'), ('wta', '2', 'Aryna Sabalenka', 'aryna-sabalenka', 'BLR')`);
  await db.pool.query(`insert into tennis_rankings (tour, player_espn_id, rank, previous_rank, points) values ('wta', '1', 2, 3, 8000), ('wta', '2', 1, 1, 9000)`);
});

test("the movement column is headed Move, over the arrows", async () => {
  const table = pageTable(await render("wta"));
  assert.deepEqual(heads(table), ["Rank", "Player", "Points", "Move"]);
  assert.match(table, /▲1/);
});
