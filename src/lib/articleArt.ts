import type { ArtPalette, BeyondTheScorelineArticle } from "./beyondTheScoreline";

export const ART_PALETTES: readonly ArtPalette[] = ["football", "cricket", "f1", "asian-games", "nfl", "nba", "tennis", "neutral"];

const SPORT_LABEL: Record<ArtPalette, string> = {
  football: "Football",
  cricket: "Cricket",
  f1: "Formula 1",
  "asian-games": "Asian Games",
  nfl: "NFL",
  nba: "NBA",
  tennis: "Tennis",
  neutral: "Beyond the Scoreline",
};

// First match wins; tags are the article's own, lower-case, hyphenated.
const TAG_PALETTE: [RegExp, ArtPalette][] = [
  [/^(asian-games|kabaddi|hockey|shooting|athletics|medal)/, "asian-games"],
  [/^(f1|formula-1|formula1|grand-prix)/, "f1"],
  [/^(cricket|ipl|bbl|wpl|odi|t20|test-cricket|world-cup-cricket)/, "cricket"],
  [/^(nfl|super-bowl)/, "nfl"],
  [/^(nba|basketball)/, "nba"],
  [/^(tennis|atp|wta|grand-slam)/, "tennis"],
  [/^(football|soccer|premier-league|la-liga|laliga|bundesliga|serie-a|seriea|champions-league|ucl|epl|man-city|arsenal|liverpool|barcelona|real-madrid)/, "football"],
];

export function paletteForTags(tags: string[]): ArtPalette {
  for (const tag of tags) {
    const hit = TAG_PALETTE.find(([re]) => re.test(tag.toLowerCase()));
    if (hit) return hit[1];
  }
  return "neutral";
}

export function articleArt(article: Pick<BeyondTheScorelineArticle, "art" | "tags">): { number: string | null; caption: string | null; palette: ArtPalette; sport: string } {
  const palette = article.art?.palette ?? paletteForTags(article.tags);
  return { number: article.art?.number ?? null, caption: article.art?.caption ?? null, palette, sport: SPORT_LABEL[palette] };
}
