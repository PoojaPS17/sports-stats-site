import { after, test } from "node:test";
import assert from "node:assert/strict";
import { SITEMAP_IDS, sitemapEntries } from "../src/lib/sitemap";
import { listArticles } from "../src/lib/beyondTheScoreline";
import { absoluteUrl } from "../src/lib/site";

after(async () => {
  await (await import("../src/lib/db")).pool.end();
});

test("SITEMAP_IDS includes beyond-the-scoreline", () => {
  assert.ok(SITEMAP_IDS.includes("beyond-the-scoreline"));
});

test("the beyond-the-scoreline sitemap lists the index once and every article exactly once", async () => {
  const urls = (await sitemapEntries("beyond-the-scoreline")).map((e) => e.url);
  assert.equal(urls.filter((u) => u === absoluteUrl("/beyond-the-scoreline")).length, 1);
  for (const a of listArticles()) {
    assert.equal(urls.filter((u) => u === absoluteUrl(`/beyond-the-scoreline/${a.slug}`)).length, 1, a.slug);
  }
  assert.equal(urls.length, 1 + listArticles().length);
});
