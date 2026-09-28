import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { outcome } from "./helpers/nextErrors";
import { listArticles } from "../src/lib/beyondTheScoreline";
import { absoluteUrl } from "../src/lib/site";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// renderToStaticMarkup HTML-escapes straight quotes/apostrophes in text nodes
// (' -> &#x27;, " -> &quot;), so a plain escapeRe-based RegExp won't match
// rendered text that contains them. This variant matches either form.
const htmlTextRe = (s: string) =>
  new RegExp(escapeRe(s).replace(/'/g, "(?:'|&#x27;)").replace(/"/g, '(?:"|&quot;)'));
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

test("the index page links every article by its own title and slug", async () => {
  const { default: IndexPage } = await import("../src/app/beyond-the-scoreline/page");
  const html = renderToStaticMarkup(createElement(IndexPage));
  for (const a of listArticles()) {
    assert.match(html, new RegExp(`href="/beyond-the-scoreline/${a.slug}"`), a.slug);
    assert.match(html, htmlTextRe(a.title), a.slug);
  }
});

test("a known slug renders its title, dek, related links, attribution and exactly one BlogPosting block", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const [article] = listArticles();
  const result = await outcome(() => articlePage.default(params(article.slug)));
  assert.ok(typeof result === "object" && "value" in result, "renders, not a 404");
  const html = renderToStaticMarkup((result as { value: ReactElement }).value);
  assert.match(html, htmlTextRe(article.title));
  assert.match(html, htmlTextRe(article.dek));
  assert.equal(html.match(/"@type":"BlogPosting"/g)?.length ?? 0, 1);
  for (const link of article.relatedLinks) assert.match(html, new RegExp(`href="${link.href}"`), link.href);
  if (article.dataAttribution) assert.match(html, htmlTextRe(article.dataAttribution));
});

test("an unknown slug 404s the page and noindexes its metadata", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const result = await outcome(() => articlePage.default(params("not-a-real-article")));
  assert.equal(result, "not-found");
  const meta = await articlePage.generateMetadata(params("not-a-real-article"));
  assert.deepEqual(meta.robots, { index: false, follow: true });
});

test("a known slug's metadata carries a matching canonical and title", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const [article] = listArticles();
  const meta = await articlePage.generateMetadata(params(article.slug));
  assert.deepEqual(meta.alternates, { canonical: absoluteUrl(`/beyond-the-scoreline/${article.slug}`) });
  assert.equal(meta.title, article.title);
});

test("generateStaticParams returns every registered slug", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  assert.deepEqual(
    articlePage.generateStaticParams().map((p) => p.slug).sort(),
    listArticles().map((a) => a.slug).sort()
  );
});

// Every article shared the site's generic card, so five different pieces looked like one link
// wherever they were posted and the BlogPosting `image` pointed at the same picture five times.
// Each now has its own opengraph-image route beside its page.
test("an article's metadata names no image, leaving the card to its own opengraph-image file", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const [article] = listArticles();
  const meta = await articlePage.generateMetadata(params(article.slug));
  assert.equal(meta.openGraph?.images, undefined, "an image named here would replace the file's");
  assert.equal(meta.twitter?.images, undefined);
});

test("a slug that is not an article keeps the generic card", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const meta = await articlePage.generateMetadata(params("not-a-real-article"));
  assert.deepEqual(meta.openGraph?.images, [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: "SportsDB: live scores, standings and stats" }]);
});

test("the share card route is built for every article, at the size the meta tags promise", async () => {
  const og = await import("../src/app/beyond-the-scoreline/[slug]/opengraph-image");
  assert.deepEqual(
    og.generateStaticParams().map((p) => p.slug).sort(),
    listArticles().map((a) => a.slug).sort()
  );
  // pageMeta's og:image:width / og:image:height are fixed at 1200x630 for every page on the site.
  assert.deepEqual(og.size, { width: 1200, height: 630 });
  assert.equal(og.contentType, "image/png");
});

test("the BlogPosting image is the article's own card, not the site's", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const [article] = listArticles();
  const result = await outcome(() => articlePage.default(params(article.slug)));
  const html = renderToStaticMarkup((result as { value: ReactElement }).value);
  assert.match(html, new RegExp(`"image":"${escapeRe(absoluteUrl(`/beyond-the-scoreline/${article.slug}/opengraph-image`))}"`));
});

/** A PNG's own idea of its size, from the IHDR chunk that follows the 8-byte signature. */
function pngSize(buf: Buffer): { magic: string; width: number; height: number } {
  return { magic: buf.subarray(0, 8).toString("hex"), width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Not a shape check: the card is drawn by satori, which throws on a layout the browser would
// forgive (a node with two children and no explicit `display: flex`), and a share card that fails
// to draw is invisible until someone posts a link. So draw all five and look at the bytes.
test("every article's share card actually draws, at the size its meta tags promise", async () => {
  const og = await import("../src/app/beyond-the-scoreline/[slug]/opengraph-image");
  for (const article of listArticles()) {
    const res = await og.default({ params: Promise.resolve({ slug: article.slug }) });
    assert.equal(res.status, 200, article.slug);
    assert.equal(res.headers.get("content-type"), "image/png", article.slug);
    assert.deepEqual(pngSize(Buffer.from(await res.arrayBuffer())), { magic: "89504e470d0a1a0a", width: 1200, height: 630 }, article.slug);
  }
});

test("a slug with no article still draws a card rather than throwing", async () => {
  const og = await import("../src/app/beyond-the-scoreline/[slug]/opengraph-image");
  const res = await og.default({ params: Promise.resolve({ slug: "not-a-real-article" }) });
  assert.equal(res.status, 200);
  assert.deepEqual(pngSize(Buffer.from(await res.arrayBuffer())).width, 1200);
});

test("a headline is set smaller the longer it is, and every published one is in the top two steps", async () => {
  const { shareTitleSize } = await import("../src/lib/articleArt");
  const steps = [10, 60, 90, 120].map((n) => shareTitleSize("x".repeat(n)));
  assert.deepEqual(steps, [...steps].sort((a, b) => b - a), "longer never gets bigger");
  assert.equal(new Set(steps).size, steps.length, "and each band is its own size");
  for (const a of listArticles()) assert.ok(shareTitleSize(a.title) >= 52, `${a.slug} (${a.title.length} chars) still sets large`);
});
