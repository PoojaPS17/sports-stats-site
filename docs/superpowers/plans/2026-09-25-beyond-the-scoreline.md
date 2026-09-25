# Beyond the Scoreline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Beyond the Scoreline" editorial section: a file-based article registry, its routes, SEO wiring (structured data, sitemap, nav, homepage teaser), a reusable chart pattern, and the first real article.

**Architecture:** Articles are plain TypeScript/TSX files under `src/content/beyondTheScoreline/`, each exporting one typed `article` object. `src/lib/beyondTheScoreline.ts` holds the curated `ARTICLES[]` list (one import per file, mirroring how `asianGamesEditions.ts` treats editions as curated code) and the pure `listArticles()`/`getArticle()` accessors the routes and sitemap read from. No database table, no admin UI — publishing an article is adding it to `ARTICLES[]` and committing.

**Tech Stack:** Next.js App Router (React Server Components), TypeScript, Tailwind v4 utility classes and the site's existing CSS custom properties (no new dependencies). Tests use `node:test` + `node:assert/strict`, run via `npm test`.

**Spec:** [docs/superpowers/specs/2026-09-25-beyond-the-scoreline-design.md](../specs/2026-09-25-beyond-the-scoreline-design.md)

## Global Constraints

- No new database table, admin UI, or draft/published flag mechanism — file-based + git is the whole publishing workflow.
- Every article's `relatedLinks` must contain at least one entry (enforced at the type level with a non-empty tuple).
- House style (applies to article body copy, not to this plan): short sentences by default; active voice by default; no em dashes (use a period, comma, or colon instead); no AI-tell phrasing ("In conclusion," summary outros, listicle headers); unsigned "Beyond the Scoreline Desk" byline; a footer/attribution line carries only license-required data credit, never a "sources cross-checked against X, Y, Z" line.
- Every indexable page must call `pageMeta()` from `src/lib/metadata.ts` — no bespoke metadata objects.
- Structured data uses `@type: "BlogPosting"`, not `NewsArticle` (the site doesn't meet `NewsArticle`'s publisher-logo requirements).
- Slugs are kebab-case and never renamed once published (404/lost-backlink risk).

---

## File Structure

**Create:**
- `src/lib/beyondTheScoreline.ts` — types, `ARTICLES[]`, `listArticles()`, `getArticle()`, `assertUniqueSlugs()`.
- `src/lib/structuredData.ts` — **modify**, add `blogPostingSchema()`.
- `src/components/ShootingMedalsByEditionChart.tsx` — the first purpose-built chart component (mirrors `GoalMinutesChart.tsx`'s div/flex bar pattern).
- `src/components/BeyondTheScorelineArticleLayout.tsx` — shared article page chrome (byline, dek, body slot, related links, attribution).
- `src/components/ArticleTeaserCard.tsx` — small link card for the homepage/index list.
- `src/content/beyondTheScoreline/second-gold-asian-record.tsx` — the first real article.
- `src/app/beyond-the-scoreline/page.tsx` — index/listing route.
- `src/app/beyond-the-scoreline/[slug]/page.tsx` — article detail route.

**Modify:**
- `src/lib/sitemap.ts` — add `"beyond-the-scoreline"` to `SITEMAP_IDS`, add a `beyondTheScoreline()` entries function, wire it into `sitemapEntries()`.
- `src/lib/nav.ts` — add the nav entry.
- `src/app/page.tsx` — add a "Latest from Beyond the Scoreline" homepage sidebar block.

**Tests:**
- `tests/beyond-the-scoreline-registry.test.ts`
- `tests/structured-data.test.ts` — modify, add `blogPostingSchema` cases.
- `tests/sitemap-beyond-the-scoreline.test.ts`
- `tests/beyond-the-scoreline-pages.test.ts`

---

### Task 1: Article registry

**Files:**
- Create: `src/lib/beyondTheScoreline.ts`
- Test: `tests/beyond-the-scoreline-registry.test.ts`

**Interfaces:**
- Produces: `interface BeyondTheScorelineRelatedLink { label: string; href: string; description?: string }`; `interface BeyondTheScorelineArticle { slug: string; title: string; dek: string; publishedAt: string; readingMinutes: number; tags: string[]; relatedLinks: [BeyondTheScorelineRelatedLink, ...BeyondTheScorelineRelatedLink[]]; dataAttribution?: string; body: () => import("react").ReactNode }`; `listArticles(): BeyondTheScorelineArticle[]`; `getArticle(slug: string): BeyondTheScorelineArticle | undefined`; `assertUniqueSlugs(articles: { slug: string }[]): void`.

The registry starts with an empty `ARTICLES` array in this task (Task 5 adds the first real import) so the test suite can exercise the accessor functions against fixtures without depending on file content that doesn't exist yet.

- [ ] **Step 1: Write the failing test**

```ts
// tests/beyond-the-scoreline-registry.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUniqueSlugs, getArticle, listArticles, sortByPublishedDesc } from "../src/lib/beyondTheScoreline";

test("listArticles returns [] when nothing is registered yet, and never throws", () => {
  assert.deepEqual(listArticles(), []);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/beyond-the-scoreline-registry.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/beyondTheScoreline'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/beyondTheScoreline.ts
import type { ReactNode } from "react";

export interface BeyondTheScorelineRelatedLink {
  label: string;
  href: string;
  description?: string;
}

export interface BeyondTheScorelineArticle {
  slug: string;
  title: string;
  /** One-sentence standfirst; also the meta description source. */
  dek: string;
  /** ISO date, YYYY-MM-DD. */
  publishedAt: string;
  readingMinutes: number;
  tags: string[];
  /** At least one entry, enforced by the tuple type: every article links to something real on the site. */
  relatedLinks: [BeyondTheScorelineRelatedLink, ...BeyondTheScorelineRelatedLink[]];
  /** License-required data credit only (e.g. a Wikipedia/CC BY-SA line) — never a "sources cross-checked" note. */
  dataAttribution?: string;
  body: () => ReactNode;
}

export function assertUniqueSlugs(articles: { slug: string }[]): void {
  const seen = new Set<string>();
  for (const a of articles) {
    if (seen.has(a.slug)) throw new Error(`duplicate Beyond the Scoreline slug: "${a.slug}"`);
    seen.add(a.slug);
  }
}

export function sortByPublishedDesc<T extends { publishedAt: string }>(articles: T[]): T[] {
  return [...articles].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
}

// One import per article file (Task 5 adds the first one). Not auto-discovered from the
// directory on purpose: a draft file can sit in src/content/beyondTheScoreline/ without being
// live until it's added here — that's the whole draft/publish mechanism (see the design spec).
export const ARTICLES: BeyondTheScorelineArticle[] = [];

assertUniqueSlugs(ARTICLES);

export function listArticles(): BeyondTheScorelineArticle[] {
  return sortByPublishedDesc(ARTICLES);
}

export function getArticle(slug: string): BeyondTheScorelineArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/beyond-the-scoreline-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/beyondTheScoreline.ts tests/beyond-the-scoreline-registry.test.ts
git commit -m "Add Beyond the Scoreline article registry"
```

---

### Task 2: `BlogPosting` structured data

**Files:**
- Modify: `src/lib/structuredData.ts`
- Test: `tests/structured-data.test.ts`

**Interfaces:**
- Consumes: nothing new (uses `absoluteUrl` from `./site`, already imported in this file; reuses the existing `organizationSchema()` from the same file for the `publisher` field).
- Produces: `blogPostingSchema(article: { slug: string; title: string; dek: string; publishedAt: string }): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

Add to `tests/structured-data.test.ts` (extend the existing import line and append a new `test(...)`):

```ts
import { blogPostingSchema, breadcrumbSchema, organizationSchema, tennisPlayerSchema } from "../src/lib/structuredData";
```

```ts
test("a BlogPosting names the desk as author, reuses the Organization publisher, and links its own page", () => {
  const schema = blogPostingSchema({ slug: "second-gold-asian-record", title: "T", dek: "D", publishedAt: "2026-09-25" });
  assert.equal(schema["@type"], "BlogPosting");
  assert.equal(schema.headline, "T");
  assert.equal(schema.description, "D");
  assert.equal(schema.datePublished, "2026-09-25");
  assert.equal(schema.url, `${SITE_URL}/beyond-the-scoreline/second-gold-asian-record`);
  assert.deepEqual(schema.publisher, organizationSchema());
  assert.deepEqual(schema.author, { "@type": "Organization", name: "Beyond the Scoreline Desk", url: `${SITE_URL}/beyond-the-scoreline` });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/structured-data.test.ts`
Expected: FAIL — `blogPostingSchema` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/structuredData.ts`, near the other page-level schema builders:

```ts
export function blogPostingSchema(article: { slug: string; title: string; dek: string; publishedAt: string }) {
  const url = absoluteUrl(`/beyond-the-scoreline/${article.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.dek,
    datePublished: article.publishedAt,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Beyond the Scoreline Desk", url: absoluteUrl("/beyond-the-scoreline") },
    publisher: organizationSchema(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/structured-data.test.ts`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/structuredData.ts tests/structured-data.test.ts
git commit -m "Add BlogPosting structured data for Beyond the Scoreline"
```

---

### Task 3: Shooting-medals-by-edition chart component

**Files:**
- Create: `src/components/ShootingMedalsByEditionChart.tsx`

**Interfaces:**
- Produces: `interface ShootingMedalsByEdition { edition: string; hostCity: string; total: number; partial: boolean }`; `ShootingMedalsByEditionChart({ data: ShootingMedalsByEdition[] }): JSX.Element`.

This is a presentational component with no DB or business logic — following the codebase's convention (`GoalMinutesChart.tsx` has no dedicated unit test either), it's exercised through the article page render test in Task 6, which asserts its labels appear in the rendered HTML, plus a manual visual check in Task 8's dev-server pass. No standalone test file for this task; the step below is "write it, then typecheck."

- [ ] **Step 1: Write the component**

```tsx
// src/components/ShootingMedalsByEditionChart.tsx
export interface ShootingMedalsByEdition {
  edition: string;
  hostCity: string;
  total: number;
  /** True while the Games this edition belongs to are still open — the bar is styled and labeled as partial. */
  partial: boolean;
}

export function ShootingMedalsByEditionChart({ data }: { data: ShootingMedalsByEdition[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const hasPartial = data.some((d) => d.partial);
  return (
    <div className="card px-4 py-3">
      <div className="flex items-end gap-4" style={{ height: 120 }}>
        {data.map((d) => (
          <div
            key={d.edition}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`${d.total} shooting medal${d.total === 1 ? "" : "s"} at the ${d.edition} Asian Games${d.partial ? " (competition still ongoing)" : ""}`}
          >
            <span className="text-xs font-semibold tabular-nums">
              {d.total}
              {d.partial ? "*" : ""}
            </span>
            <div
              className={`w-full rounded-t ${d.partial ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]"}`}
              style={{ height: `${Math.max(4, (d.total / max) * 80)}px`, opacity: d.partial ? 0.85 : 0.9 }}
            />
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{d.edition}</span>
            <span className="text-[10px] text-[var(--text-faint)]">{d.hostCity}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        India&rsquo;s shooting medal count by Asian Games edition.{hasPartial ? " *Partial total: competition still ongoing." : ""}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `ShootingMedalsByEditionChart.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShootingMedalsByEditionChart.tsx
git commit -m "Add ShootingMedalsByEditionChart component"
```

---

### Task 4: Article layout component

**Files:**
- Create: `src/components/BeyondTheScorelineArticleLayout.tsx`

**Interfaces:**
- Consumes: `BeyondTheScorelineArticle` (Task 1), `Breadcrumbs` (`src/components/Breadcrumbs.tsx`, existing — `{ items: { label: string; href?: string }[] }`).
- Produces: `BeyondTheScorelineArticleLayout({ article: BeyondTheScorelineArticle }): JSX.Element`.

No dedicated test here — it's exercised by the Task 6 page render test, which asserts the rendered article page's title, dek, byline, related links and attribution line all appear. Breadcrumb JSON-LD correctness is already covered generally by `tests/breadcrumbs.test.ts`'s pattern; Task 6 adds the same "exactly one `BlogPosting` block" check for this section specifically.

- [ ] **Step 1: Write the component**

```tsx
// src/components/BeyondTheScorelineArticleLayout.tsx
import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

const DESK_BYLINE = "Beyond the Scoreline Desk";

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function BeyondTheScorelineArticleLayout({ article }: { article: BeyondTheScorelineArticle }) {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }, { label: article.title }]} />
      <article className="card mx-auto max-w-3xl px-6 py-8 sm:px-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Beyond the Scoreline</p>
        <h1 className="page-title mt-2">{article.title}</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--text-muted)]">{article.dek}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border)] pb-5 text-xs text-[var(--text-faint)]">
          <span className="font-semibold text-[var(--text-muted)]">{DESK_BYLINE}</span>
          <span aria-hidden>&middot;</span>
          <span>{formatPublished(article.publishedAt)}</span>
          <span aria-hidden>&middot;</span>
          <span>{article.readingMinutes} min read</span>
        </div>

        <div className="mt-6 flex max-w-[62ch] flex-col gap-4 text-[15px] leading-relaxed text-[var(--text)] [&_a]:text-[var(--accent)] [&_a]:underline [&_strong]:font-semibold">
          {article.body()}
        </div>

        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">Related on SportsDB</p>
          <ul className="mt-3 flex flex-col gap-2">
            {article.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm font-semibold text-[var(--accent)] hover:underline">
                  {link.label}
                </Link>
                {link.description && <p className="text-xs text-[var(--text-faint)]">{link.description}</p>}
              </li>
            ))}
          </ul>
        </div>

        {article.dataAttribution && <p className="mt-6 text-xs text-[var(--text-faint)]">{article.dataAttribution}</p>}
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `BeyondTheScorelineArticleLayout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/BeyondTheScorelineArticleLayout.tsx
git commit -m "Add BeyondTheScorelineArticleLayout component"
```

---

### Task 5: First real article — "Second Gold, Asian Record"

**Files:**
- Create: `src/content/beyondTheScoreline/second-gold-asian-record.tsx`
- Modify: `src/lib/beyondTheScoreline.ts:31` (the `ARTICLES` array — add the import and the entry)
- Modify: `tests/beyond-the-scoreline-registry.test.ts` (the "returns [] when nothing is registered" test becomes wrong once a real article exists — update it)

This is the article already drafted, fact-checked and approved earlier in this conversation (em dashes removed, footer trimmed to license attribution only). Porting it into the real component wires the registry, the chart and the layout together for the first time.

**Interfaces:**
- Consumes: `BeyondTheScorelineArticle` (Task 1), `ShootingMedalsByEditionChart` (Task 3).

- [ ] **Step 1: Update the now-stale registry test**

In `tests/beyond-the-scoreline-registry.test.ts`, replace:

```ts
test("listArticles returns [] when nothing is registered yet, and never throws", () => {
  assert.deepEqual(listArticles(), []);
});
```

with:

```ts
test("listArticles returns at least the seed article, and never throws", () => {
  assert.ok(listArticles().length >= 1);
});
```

- [ ] **Step 2: Run the test to confirm it currently fails for the right reason**

Run: `npx tsx --test tests/beyond-the-scoreline-registry.test.ts`
Expected: FAIL — `listArticles().length >= 1` is false (ARTICLES is still empty; this is the "why" the next step exists).

- [ ] **Step 3: Write the article file**

```tsx
// src/content/beyondTheScoreline/second-gold-asian-record.tsx
import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { ShootingMedalsByEditionChart } from "@/components/ShootingMedalsByEditionChart";

export const article: BeyondTheScorelineArticle = {
  slug: "second-gold-asian-record",
  title: "India's Second Gold Comes With an Asian Record in Shooting",
  dek: "Suruchi Singh and Kamaljeet broke an Asian Games record to win India's second gold at Aichi-Nagoya. Shooting has now delivered ten of India's twenty-three medals, with a week of competition still to come.",
  publishedAt: "2026-09-25",
  readingMinutes: 2,
  tags: ["asian-games", "shooting", "india"],
  relatedLinks: [
    {
      label: "Asian Games medal tally, 2026 and every edition back to 1951",
      href: "/asian-games/medal-tally",
      description: "Full country-by-country table, updated as results come in",
    },
    {
      label: "Asian Games hub",
      href: "/asian-games",
      description: "Host dates, India's live cricket fixtures, and the edition overview",
    },
  ],
  dataAttribution: `Medal data from Wikipedia's "2026 Asian Games medal table", used under CC BY-SA 4.0.`,
  body: () => (
    <>
      <p>
        Suruchi Singh set her pistol down and checked the score herself: 484.6. It was an Asian Games record in the
        10m air pistol mixed team event. Paired with Kamaljeet, the record turned into gold: India&rsquo;s second of
        these Games.
      </p>
      <p>
        It didn&rsquo;t stand alone for long. Later on Friday, Aishwary Pratap Singh Tomar, Rudrankksh Patil and
        Niraj Kumar took silver in the men&rsquo;s 50m rifle three positions team. Elavenil Valarivan won silver in
        the individual 10m air rifle, then teamed with Sonam Uttam Maskar and Vidarsa Kochalumkal Vinod for another
        silver in that event&rsquo;s team competition. Four shooting medals landed in one day.
      </p>
      <p>
        India&rsquo;s overall tally now stands at <strong>23 medals</strong>: two gold, nine silver, twelve bronze.
        That&rsquo;s good for 12th on the <Link href="/asian-games/medal-tally">full medal table</Link>. Shooting
        has delivered ten of those twenty-three.
      </p>
      <p>
        That split isn&rsquo;t new. India&rsquo;s shooters won nine medals across the whole of the 2018
        Jakarta-Palembang Games. They&rsquo;ve already matched that here, with a week of competition still to go.
        Four years later in Hangzhou, shooting had its best Asian Games yet: twenty-two medals, seven of them gold.
        Aichi-Nagoya sits between the two so far, and Friday&rsquo;s record suggests the ceiling hasn&rsquo;t been
        found.
      </p>
      <ShootingMedalsByEditionChart
        data={[
          { edition: "2018", hostCity: "Jakarta-Palembang", total: 9, partial: false },
          { edition: "2022", hostCity: "Hangzhou", total: 22, partial: false },
          { edition: "2026", hostCity: "Aichi-Nagoya", total: 10, partial: true },
        ]}
      />
      <p>
        Across every Asian Games India has shot in, the tally now reads <strong>82 medals</strong>: sixteen gold,
        thirty-two silver, thirty-four bronze. The shooting program here runs through October 1. There&rsquo;s
        still time to add to both numbers.
      </p>
    </>
  ),
};
```

- [ ] **Step 4: Register it**

In `src/lib/beyondTheScoreline.ts`, add the import near the top and populate `ARTICLES`:

```ts
import { article as secondGoldAsianRecord } from "@/content/beyondTheScoreline/second-gold-asian-record";
```

```ts
export const ARTICLES: BeyondTheScorelineArticle[] = [secondGoldAsianRecord];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsx --test tests/beyond-the-scoreline-registry.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/content/beyondTheScoreline/second-gold-asian-record.tsx src/lib/beyondTheScoreline.ts tests/beyond-the-scoreline-registry.test.ts
git commit -m "Add first Beyond the Scoreline article: second-gold-asian-record"
```

---

### Task 6: Routes — index and article detail pages

**Files:**
- Create: `src/app/beyond-the-scoreline/page.tsx`
- Create: `src/app/beyond-the-scoreline/[slug]/page.tsx`
- Test: `tests/beyond-the-scoreline-pages.test.ts`

**Interfaces:**
- Consumes: `listArticles`, `getArticle` (Task 1); `BeyondTheScorelineArticleLayout` (Task 4); `blogPostingSchema` (Task 2); `pageMeta`, `fitTitle` (`src/lib/metadata.ts`, existing); `JsonLd` (`src/components/JsonLd.tsx`, existing).
- Produces: default export `BeyondTheScorelineIndexPage(): JSX.Element` at `/beyond-the-scoreline`; default export `BeyondTheScorelineArticlePage({ params: Promise<{ slug: string }> }): Promise<JSX.Element>` and `generateMetadata({ params: Promise<{ slug: string }> }): Promise<Metadata>` at `/beyond-the-scoreline/[slug]`.

Neither route sets `export const revalidate` or fetches from the database — both render from the static `ARTICLES` array, so Next statically prerenders them at build time by default (the same as `src/app/privacy/page.tsx`), and `generateStaticParams()` returns every real slug rather than `[]`, so no page is deferred to first-request rendering.

- [ ] **Step 1: Write the failing test**

```ts
// tests/beyond-the-scoreline-pages.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { outcome } from "./helpers/nextErrors";
import { listArticles } from "../src/lib/beyondTheScoreline";
import { absoluteUrl } from "../src/lib/site";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

test("the index page links every article by its own title and slug", async () => {
  const { default: IndexPage } = await import("../src/app/beyond-the-scoreline/page");
  const html = renderToStaticMarkup(createElement(IndexPage));
  for (const a of listArticles()) {
    assert.match(html, new RegExp(`href="/beyond-the-scoreline/${a.slug}"`), a.slug);
    assert.match(html, new RegExp(escapeRe(a.title)), a.slug);
  }
});

test("a known slug renders its title, dek, related links, attribution and exactly one BlogPosting block", async () => {
  const articlePage = await import("../src/app/beyond-the-scoreline/[slug]/page");
  const [article] = listArticles();
  const result = await outcome(() => articlePage.default(params(article.slug)));
  assert.ok(typeof result === "object" && "value" in result, "renders, not a 404");
  const html = renderToStaticMarkup((result as { value: ReactElement }).value);
  assert.match(html, new RegExp(escapeRe(article.title)));
  assert.match(html, new RegExp(escapeRe(article.dek)));
  assert.equal(html.match(/"@type":"BlogPosting"/g)?.length ?? 0, 1);
  for (const link of article.relatedLinks) assert.match(html, new RegExp(`href="${link.href}"`), link.href);
  if (article.dataAttribution) assert.match(html, new RegExp(escapeRe(article.dataAttribution)));
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/beyond-the-scoreline-pages.test.ts`
Expected: FAIL — `Cannot find module '../src/app/beyond-the-scoreline/page'`.

- [ ] **Step 3: Write the index page**

```tsx
// src/app/beyond-the-scoreline/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { listArticles } from "@/lib/beyondTheScoreline";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = pageMeta(
  "Beyond the Scoreline",
  "Original long-form sports writing from the SportsDB desk: history, data and the stories behind the scoreline.",
  "/beyond-the-scoreline"
);

function formatPublished(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function BeyondTheScorelineIndexPage() {
  const articles = listArticles();
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Beyond the Scoreline" }]} />
      <PageHeader title="Beyond the Scoreline" subtitle="Original long-form sports writing from the SportsDB desk" />
      {articles.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing published yet. Check back soon.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {articles.map((a) => (
            <li key={a.slug} className="card flex flex-col gap-2 px-5 py-5">
              <Link href={`/beyond-the-scoreline/${a.slug}`} className="text-lg font-bold leading-snug text-[var(--text)] hover:text-[var(--accent)]">
                {a.title}
              </Link>
              <p className="text-sm text-[var(--text-muted)]">{a.dek}</p>
              <p className="text-xs text-[var(--text-faint)]">
                {formatPublished(a.publishedAt)} &middot; {a.readingMinutes} min read
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the article detail page**

```tsx
// src/app/beyond-the-scoreline/[slug]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fitTitle, pageMeta } from "@/lib/metadata";
import { getArticle, listArticles } from "@/lib/beyondTheScoreline";
import { blogPostingSchema } from "@/lib/structuredData";
import { BeyondTheScorelineArticleLayout } from "@/components/BeyondTheScorelineArticleLayout";
import { JsonLd } from "@/components/JsonLd";

export function generateStaticParams() {
  return listArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) {
    return pageMeta("Beyond the Scoreline", "Original long-form sports writing from the SportsDB desk.", undefined, { noindex: true });
  }
  return pageMeta(fitTitle(article.title), article.dek, `/beyond-the-scoreline/${article.slug}`);
}

export default async function BeyondTheScorelineArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  return (
    <>
      <JsonLd data={blogPostingSchema(article)} />
      <BeyondTheScorelineArticleLayout article={article} />
    </>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test tests/beyond-the-scoreline-pages.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/beyond-the-scoreline tests/beyond-the-scoreline-pages.test.ts
git commit -m "Add Beyond the Scoreline index and article detail routes"
```

---

### Task 7: Sitemap registration

**Files:**
- Modify: `src/lib/sitemap.ts`
- Test: `tests/sitemap-beyond-the-scoreline.test.ts`

**Interfaces:**
- Consumes: `listArticles` (Task 1); the file's own existing `entry()` helper and `Entry` type; `SITEMAP_IDS` (existing array in this file); `sitemapEntries(id: string): Promise<Entry[]>` (existing function in this file).
- Produces: `SITEMAP_IDS` includes `"beyond-the-scoreline"`; `sitemapEntries("beyond-the-scoreline")` resolves to one entry per article plus the index page.

This function is DB-free (it reads the static `ARTICLES` array), so the test only needs to close the lazily-constructed `pool` afterward — it never queries it, so no test database is started.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sitemap-beyond-the-scoreline.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/sitemap-beyond-the-scoreline.test.ts`
Expected: FAIL — `SITEMAP_IDS.includes("beyond-the-scoreline")` is false.

- [ ] **Step 3: Write the implementation**

In `src/lib/sitemap.ts`, add the import near the top:

```ts
import { listArticles } from "./beyondTheScoreline";
```

Add `"beyond-the-scoreline"` to `SITEMAP_IDS` (anywhere in the array literal — after `"tennis"` is fine):

```ts
export const SITEMAP_IDS: string[] = [
  "core",
  "f1",
  "tennis",
  "beyond-the-scoreline",
  ...SEASON_PAGE_LEAGUES.map((l) => `pseasons-${l}`),
  ...ALL_LEAGUES.flatMap((l) => [`teams-${l}`, `players-${l}`, `games-${l}`]),
  ...LEAGUES.filter((l) => supportsMatchweeks(l)).map((l) => `weeks-${l}`),
  ...ALL_LEAGUES.filter((l) => supportsScoreAnalytics(l)).map((l) => `h2h-${l}`),
];
```

Add the entries function near `core()`/`f1()`:

```ts
function beyondTheScoreline(): Entry[] {
  return [
    entry("/beyond-the-scoreline", "weekly", 0.6),
    ...listArticles().map((a) => entry(`/beyond-the-scoreline/${a.slug}`, "monthly", 0.5, a.publishedAt)),
  ];
}
```

Wire it into `sitemapEntries()`, alongside the `"core"`/`"f1"`/`"tennis"` checks:

```ts
export async function sitemapEntries(id: string): Promise<Entry[]> {
  if (id === "core") return core();
  if (id === "f1") return f1();
  if (id === "tennis") return tennisPlayers();
  if (id === "beyond-the-scoreline") return beyondTheScoreline();
  const [kind, league] = id.split("-") as [string, League];
  // ...unchanged below
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/sitemap-beyond-the-scoreline.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS. (`robots.ts` derives its sitemap list from `SITEMAP_IDS` automatically — no separate change needed there.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/sitemap.ts tests/sitemap-beyond-the-scoreline.test.ts
git commit -m "Register Beyond the Scoreline in the sitemap"
```

---

### Task 8: Nav entry and homepage teaser

**Files:**
- Modify: `src/lib/nav.ts`
- Create: `src/components/ArticleTeaserCard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `listArticles` (Task 1); `BeyondTheScorelineArticle` (Task 1); `SectionHeader` (`src/components/SectionHeader.tsx`, existing).
- Produces: `ArticleTeaserCard({ article: BeyondTheScorelineArticle }): JSX.Element`.

No existing test file covers `nav.ts` or `src/app/page.tsx` (checked: neither has a `tests/*.test.ts` precedent in this codebase), so this task is verified by typecheck, lint, the full test suite (to catch a regression in `tests/breadcrumbs.test.ts`-style whole-page assertions elsewhere), and a manual homepage check in the dev server — not a new unit test invented without precedent.

- [ ] **Step 1: Add the nav entry**

In `src/lib/nav.ts`, add one line to `NAV_ITEMS` (after the `"Asian Games"` entry):

```ts
  { label: "Asian Games", href: "/asian-games" },
  { label: "Beyond the Scoreline", href: "/beyond-the-scoreline" },
  { label: "Top Games", href: "/top-games" },
```

- [ ] **Step 2: Write the teaser card component**

```tsx
// src/components/ArticleTeaserCard.tsx
import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

export function ArticleTeaserCard({ article }: { article: BeyondTheScorelineArticle }) {
  return (
    <Link href={`/beyond-the-scoreline/${article.slug}`} className="card group flex flex-col gap-1 p-3">
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-[var(--accent)]">{article.title}</p>
      <p className="text-xs text-[var(--text-faint)]">{article.readingMinutes} min read</p>
    </Link>
  );
}
```

- [ ] **Step 3: Add the homepage teaser block**

In `src/app/page.tsx`, add imports:

```ts
import { ArticleTeaserCard } from "@/components/ArticleTeaserCard";
import { listArticles } from "@/lib/beyondTheScoreline";
```

Inside `HomePage()`, add near the top (alongside the existing `const spotlight = ...` line):

```ts
const beyondTheScorelineArticles = listArticles().slice(0, 3);
```

After the existing `{home.news.length > 0 && (<aside ...>Latest news...</aside>)}` block (still inside the same `<div className="grid gap-10 lg:grid-cols-3">`), add:

```tsx
{beyondTheScorelineArticles.length > 0 && (
  <aside className="lg:col-span-1">
    <SectionHeader action={{ label: "All articles", href: "/beyond-the-scoreline" }}>Beyond the Scoreline</SectionHeader>
    <div className="flex flex-col gap-2">
      {beyondTheScorelineArticles.map((a) => (
        <ArticleTeaserCard key={a.slug} article={a} />
      ))}
    </div>
  </aside>
)}
```

- [ ] **Step 4: Typecheck, lint, and run the full test suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all three pass clean.

- [ ] **Step 5: Manual visual check in the dev server**

Run: `npm run dev`, then open `/`, `/beyond-the-scoreline`, and `/beyond-the-scoreline/second-gold-asian-record` in a browser. Confirm: the nav bar shows "Beyond the Scoreline"; the homepage sidebar shows the new "Beyond the Scoreline" card linking to the article; the article page renders the chart, related links, and the attribution line; light and dark mode both look correct (the site's tokens already handle this — this step is confirming nothing was hardcoded around them).

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts src/components/ArticleTeaserCard.tsx src/app/page.tsx
git commit -m "Add Beyond the Scoreline nav entry and homepage teaser"
```

---

## Post-plan

Deploying this to production (the Oracle VM path described in the `production-hosting` memory) is not part of this plan — none of these tasks touch `deploy/vm/` or require a new scrape/cron step, since this feature has no live data pipeline. Once all 8 tasks are merged to `main`, ship it the same way the last feature (`feat/asian-games-medal-tally`) went out.
