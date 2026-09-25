import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUniqueSlugs, getArticle, listArticles, sortByPublishedDesc } from "../src/lib/beyondTheScoreline";
import { TITLE_BUDGET } from "../src/lib/metadata";

test("listArticles returns at least the seed article, and never throws", () => {
  assert.ok(listArticles().length >= 1);
});

test("getArticle returns undefined for a slug that isn't registered", () => {
  assert.equal(getArticle("not-a-real-slug"), undefined);
});

test("assertUniqueSlugs passes on distinct slugs and throws on a duplicate", () => {
  assert.doesNotThrow(() => assertUniqueSlugs([{ slug: "a" }, { slug: "b" }]));
  assert.throws(() => assertUniqueSlugs([{ slug: "a" }, { slug: "a" }]), /duplicate/i);
});

test("listArticles sorts newest publishedAt first", () => {
  // sortByPublishedDesc is the pure function listArticles() calls internally;
  // exported separately so this test doesn't need real ARTICLES fixtures.
  const a = { slug: "a", publishedAt: "2026-01-01" };
  const b = { slug: "b", publishedAt: "2026-06-01" };
  const c = { slug: "c", publishedAt: "2026-03-01" };
  assert.deepEqual(sortByPublishedDesc([a, b, c]).map((x) => x.slug), ["b", "c", "a"]);
});

test("every article's title fits the site-wide title budget", () => {
  for (const a of listArticles()) {
    assert.ok(a.title.length <= TITLE_BUDGET, `${a.slug}: title is ${a.title.length} chars, budget is ${TITLE_BUDGET}`);
  }
});
