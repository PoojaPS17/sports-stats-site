import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUniqueSlugs, getArticle, listArticles, sortByPublishedDesc } from "../src/lib/beyondTheScoreline";
import { TITLE_BUDGET } from "../src/lib/metadata";
import { ART_PALETTES } from "../src/lib/articleArt";

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

// Satori neither shrinks the number to fit the share card's 430px panel nor wraps the caption
// away, and the index cards give the caption 30ch. The caps are generous against today's longest
// ("114/115", and 61 characters of caption) but stop a draft that puts a sentence where a figure
// goes. The emptiness checks are the real point: a blank number used to be legal, and shipped.
const ART_NUMBER_MAX = 8;
const ART_CAPTION_MAX = 80;

test("every article's art carries a number and caption that fit the panel, and any palette it names is known", () => {
  for (const a of listArticles()) {
    const n = a.art.number.trim();
    const caption = a.art.caption.trim();
    assert.ok(n.length > 0, `${a.slug}: art.number is empty`);
    assert.ok(n.length <= ART_NUMBER_MAX, `${a.slug}: art.number "${n}" is ${n.length} chars, over the ${ART_NUMBER_MAX} the panel holds`);
    assert.ok(caption.length > 0, `${a.slug}: art.caption is empty`);
    assert.ok(caption.length <= ART_CAPTION_MAX, `${a.slug}: art.caption is ${caption.length} chars, over the ${ART_CAPTION_MAX} the panel holds`);
    if (a.art.palette) assert.ok((ART_PALETTES as readonly string[]).includes(a.art.palette), `${a.slug}: unknown palette ${a.art.palette}`);
  }
});
