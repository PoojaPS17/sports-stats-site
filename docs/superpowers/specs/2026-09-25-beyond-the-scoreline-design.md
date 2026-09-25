# Beyond the Scoreline: design

Status: APPROVED (2026-09-25). Branch `feat/beyond-the-scoreline` off `main` at `ad8c174`. Implementation plan not written yet.

## Goal

The user wants an original editorial section on the site — long-form articles (history, facts, latest news, data-driven angles), 3-4 published per week, written in a genuinely human voice with no detectable AI tells, fact-checked to the same standard already used for social posts (see [[social-posts-log]] / [[social-posting-workflow]]), with charts where they earn their place. Section name: **"Beyond the Scoreline"**. Purpose is engagement and, per the user's explicit SEO ask, better Google visibility — the site already has an active indexing push (`25a9d90`, "Fix internal-linking gaps hurting Google indexing", prompted by low GSC coverage on the new domain), so this section has to plug into that effort, not sit next to it.

Two constraints came directly from the user and shape the design more than anything else:
1. **No one should be able to tell the articles are AI-written.** This is a writing-process requirement, not something code can enforce, but the workflow below (fact-check → draft against a house style → self-check against banned patterns → human review) is built around it.
2. **Short sentences, active/passive balance, SEO-aware writing.** Also a process requirement, folded into the same style pass.

## What already exists (read from the code, 2026-09-25)

- **No CMS, no articles table.** `news_articles` (`db/schema.sql:213`) is syndicated ESPN news snippets (headline/description/link/image per league), unrelated to original editorial — not reused here.
- **Static long-form pages are hand-built TSX**, not MDX/markdown: `src/app/privacy/page.tsx`, `src/app/contact/page.tsx` wrap a shared `LegalPage` component. This is the precedent for "content lives in code, one file per page."
- **`src/lib/metadata.ts`**: `pageMeta(title, description, path, opts)` — canonical URL, robots (indexable by default), OpenGraph + Twitter cards, `fitTitle()` (70-char search-result budget minus site name) and `clampDescription()` (160-char budget, cuts on sentence/word boundary). Every indexable page uses this; Beyond the Scoreline articles must too.
- **`src/components/JsonLd.tsx`**: generic schema.org JSON-LD emitter, `<` escaped for safety. No `Article`/`BlogPosting` schema exists yet anywhere in the codebase — this section introduces the first one.
- **`src/lib/sitemap.ts`** + `src/app/sitemap.ts`: one sitemap per `SITEMAP_IDS` entry, `sitemapEntries(id)` returns `MetadataRoute.Sitemap`. A new `"beyond-the-scoreline"` id needs to be added and given its own `entry()`-building function, following the existing per-id pattern.
- **`src/lib/nav.ts`**: single source of truth for header/drawer/footer nav, plain constants (`NavItem[]`), no DB access (imported into Client Components). A new top-level `{ label: "Beyond the Scoreline", href: "/beyond-the-scoreline" }` entry follows the existing F1/Asian Games shape (`25a9d90`'s own fix was exactly "a real page had zero inbound nav links" — not repeating that here).
- **`NewsCard` + `SectionHeader`** (used on `src/app/page.tsx`): the homepage's existing pattern for a "here's a teaser, click through" block. Reused for a "Latest from Beyond the Scoreline" homepage section, which is also how the section avoids being an orphan section reachable only via nav.
- **Chart precedent**: `src/components/GoalMinutesChart.tsx` — a purpose-built chart component fed by data the page already queried, not a generic charting library. Beyond the Scoreline charts follow the same shape, but fed by data I've fact-checked while researching the article, not a live query (these are point-in-time editorial pieces).
- **Internal-linking discipline is an active, named concern** on this site (`25a9d90`). Every article must link out to at least one relevant existing page (a team, player, series, or league page), and the homepage teaser is the inbound link back — this is not optional polish, it's the same category of problem that commit was fixing.

## Design

### 1. Content storage: file-based registry, no DB table

`src/content/beyondTheScoreline/` — one `.tsx` file per article, each exporting a typed object:

```ts
export const article: BeyondTheScorelineArticle = {
  slug: "india-asian-games-2026-medal-story",
  title: "...",
  dek: "...",              // one-sentence standfirst, also the meta description source
  publishedAt: "2026-09-25",
  readingMinutes: 6,        // computed at write time from word count, stored not derived at runtime
  tags: ["asian-games", "india"],
  relatedLinks: [{ label: "...", href: "/asian-games/medal-tally" }], // internal-linking requirement, enforced by type (min 1 entry)
  body: () => <>...JSX...</>,
};
```

`src/lib/beyondTheScoreline.ts` exports `ARTICLES: BeyondTheScorelineArticle[]` (an explicit array of imports — new articles are added here, not auto-discovered, so an unfinished draft file can exist in the directory without being live) plus `getArticle(slug)` and `listArticles()` (sorted by `publishedAt` desc). This mirrors how `asianGamesEditions.ts` treats editions as curated code, not scraped/discovered data.

**Why not the database-backed option** (considered and rejected, per the earlier design conversation): this site has exactly one author (me) and one approver (the user) with no need for a publishing UI; a DB table would add a schema, upsert scripts and a draft/published flag for a workflow git already does for free (a file not yet in `ARTICLES[]` is a real, buildable draft with zero extra machinery).

### 2. Routes

- `src/app/beyond-the-scoreline/page.tsx` — index. Lists `listArticles()`: title, dek, date, reading time, tags. Standard `pageMeta()` call.
- `src/app/beyond-the-scoreline/[slug]/page.tsx` — `generateStaticParams()` from `listArticles()`; 404 via `notFound()` for an unknown slug. Renders the article inside a new `ArticleLayout` component (title, dek, "Beyond the Scoreline Desk · {date} · {n} min read", body, `relatedLinks` as an inline "Related" block, chart slot). `generateMetadata()` builds `pageMeta(fitTitle(article.title), article.dek, ...)` plus `Article` JSON-LD (see below).
- Both `export const revalidate = false` (or a long value) — this is static editorial content, not live data; a new deploy is what changes it, matching how `privacy`/`contact` behave.

### 3. SEO

- **Metadata**: every article page calls `pageMeta()` exactly like existing indexable pages — no bespoke metadata logic. Title and dek are written with `fitTitle()`'s 70-char and `clampDescription()`'s 160-char budgets in mind from the first draft, not truncated after the fact.
- **Structured data**: `<JsonLd data={...} />` with `@type: "BlogPosting"` (schema.org's actual news/editorial type for a dated non-newsroom byline site — `NewsArticle` is for accredited news orgs and requires fields, like a publisher logo meeting Google's minimum dimensions, this site doesn't have yet), `headline`, `datePublished`, `author: { "@type": "Organization", name: "Beyond the Scoreline Desk" }`, `publisher`.
- **Sitemap**: new `"beyond-the-scoreline"` entry in `SITEMAP_IDS`, one `entry()` per article at priority comparable to other content pages, `lastModified` from `publishedAt`.
- **Internal linking (both directions)**:
  - Outbound: each article's `relatedLinks` (type-enforced, minimum one) points at real stat/team/player/series pages — the connective tissue Google (and readers) use to find the rest of the site from an article that ranks.
  - Inbound: a "Latest from Beyond the Scoreline" `NewsCard`-style block on the homepage (`src/app/page.tsx`) linking the 2-3 newest articles, so the section is never nav-only-reachable the way the internal-linking audit found other pages to be.
- **URL/slug**: kebab-case, descriptive, stable once published (a slug is never renamed after publishing — that's a 404/lost-backlink risk on a domain already fighting for index coverage).

### 4. Chart handling

New chart components live in `src/components/` alongside `GoalMinutesChart.tsx` when an article's data warrants one (e.g. a medal-count progression, a stat-trend line), following the `dataviz` skill's palette/accessibility guidance. Data is a literal array baked into the article file at write time (already fact-checked during research) — not a live DB query, since these charts illustrate a moment in a story, not a live widget.

### 5. Weekly workflow

1. **Topic sourcing** (weekly): I pull a shortlist of 4-5 candidates from upcoming fixtures, `trending_topics`, and recent news, and bring it to the user to pick 3-4.
2. **Research + fact-check**: same 2+-independent-source discipline as social posts, but applied per-claim across a full article — including explicitly checking *when* something happened, not just *whether* it's true (the recurring failure mode logged in this project's social-posting history).
3. **Draft**, against a house style (below).
4. **Self-check** the draft against the banned-pattern/style list before showing anyone.
5. **Review**: rendered as a styled Artifact matching the real `ArticleLayout` (including any chart), shown to the user in chat — the same "show me before you post" gate already standing for social content, extended to articles.
6. **On approval**: write the real article file, add it to `ARTICLES[]`, add the sitemap/homepage-teaser entries, commit. Deploy follows the site's existing deploy path (not touched by this feature — confirmed separately if it needs a step added).

### 6. House style (process, not code)

Applies to every draft, checked before the review step in the workflow above:

- **Sentence length**: short sentences by default; a long sentence only when a genuinely complex idea needs one clause built on another, not as a stylistic default. No stacking three-plus subordinate clauses.
- **Active/passive balance**: active by default (a specific person or team does something); passive only when the actor is unknown, irrelevant, or when passive genuinely reads more naturally for that sentence — not as a hedge to avoid naming who did what.
- **No AI tells**: no "In conclusion," "It's worth noting," "This underscores," stacked hedges ("some might argue," "it could be said"), no summary-paragraph outro restating the piece, no listicle-with-emoji-headers formatting, no generic scene-setting throat-clearing before the actual news. Lead with a concrete detail, number, or moment.
- **Voice**: opinionated where the facts support an opinion (like an experienced beat writer would), specific over generic, varied sentence rhythm paragraph to paragraph.
- **Byline**: unsigned, "Beyond the Scoreline Desk," per the user's earlier decision — not a named persona.

## Explicitly out of scope

- Any database table, admin UI, or publish/draft flag mechanism — file-based + git is the whole workflow (see §1).
- Comments, reactions, or any reader-interaction surface on articles.
- Auto-generated or live-updating charts inside articles — data is fixed at write time.
- A named recurring author persona/byline — user chose the unsigned desk byline.
- Automating topic selection end-to-end — the user picks from a weekly shortlist, this isn't a fire-and-forget content pipeline.
- `NewsArticle` schema.org type (considered, rejected — requires publisher-logo dimensions and other accredited-newsroom fields this site doesn't meet yet; `BlogPosting` is the honest fit).
