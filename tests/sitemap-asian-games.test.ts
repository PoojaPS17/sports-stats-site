import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb, type TestDb } from "./helpers/testDb";

let sitemapEntries: typeof import("../src/lib/sitemap").sitemapEntries;
let db: TestDb;

before(async () => {
  db = await startTestDb();
  ({ sitemapEntries } = await import("../src/lib/sitemap"));
});
after(async () => {
  await (await import("../src/lib/db")).pool.end();
  await db?.stop();
});

// The 2026 Games closed on 2026-10-04 and no edition is current after it, so with no Asian Games cricket
// stored the hub is a page that says nothing is on: out of the sitemap. Its medal tally stays.
test("once the Games are over with no cricket from them, the sitemap drops the hub and keeps the medal tally", async () => {
  const urls = (await sitemapEntries("core")).map((e) => e.url);
  assert.ok(urls.some((u) => u.endsWith("/asian-games/medal-tally")));
  assert.ok(!urls.some((u) => u.endsWith("/asian-games")), "the empty hub should not be listed");
});
