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
