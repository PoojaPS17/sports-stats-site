import type { ReactNode } from "react";
import { article as kaneFastestTo100BundesligaGoals } from "@/content/beyondTheScoreline/kane-fastest-to-100-bundesliga-goals";
import { article as secondGoldAsianRecord } from "@/content/beyondTheScoreline/second-gold-asian-record";
import { article as russellBakuWinCutsTitleGap } from "@/content/beyondTheScoreline/russell-baku-win-cuts-title-gap";
import { article as kabaddiGoldenSweepAsianGames } from "@/content/beyondTheScoreline/kabaddi-golden-sweep-asian-games";
import { article as manCityGuiltyVerdict115Charges } from "@/content/beyondTheScoreline/man-city-guilty-verdict-115-charges";
import { article as barcelonaRecordSevenMatchWinStreak } from "@/content/beyondTheScoreline/barcelona-record-seven-match-win-streak";

export type ArtPalette = "football" | "cricket" | "f1" | "asian-games" | "nfl" | "nba" | "tennis" | "neutral";

/**
 * The generated "picture" of an article: its key number on a sport-coloured panel. This is the
 * article's whole visual presence, on the index cards and in every shared link, so it is required.
 */
export interface ArticleArt {
  /** The story's headline figure, exactly as it should read on the panel: "8", "66", "114/115". */
  number: string;
  /** Lower-case phrase finishing the number's sentence: "points between Antonelli and Russell after Baku". */
  caption: string;
  /** Leave it out and the palette comes from `tags`; set it only to override that. */
  palette?: ArtPalette;
}

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
  /** Required. Drafts used to omit it, and their cards printed the sport's name where a number belongs. */
  art: ArticleArt;
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
export const ARTICLES: BeyondTheScorelineArticle[] = [
  kaneFastestTo100BundesligaGoals,
  secondGoldAsianRecord,
  russellBakuWinCutsTitleGap,
  kabaddiGoldenSweepAsianGames,
  manCityGuiltyVerdict115Charges,
  barcelonaRecordSevenMatchWinStreak,
];

assertUniqueSlugs(ARTICLES);

export function listArticles(): BeyondTheScorelineArticle[] {
  return sortByPublishedDesc(ARTICLES);
}

export function getArticle(slug: string): BeyondTheScorelineArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
