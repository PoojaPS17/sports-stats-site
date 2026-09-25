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
