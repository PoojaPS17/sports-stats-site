import type { ArtPalette, BeyondTheScorelineArticle } from "./beyondTheScoreline";

export const ART_PALETTES: readonly ArtPalette[] = ["football", "cricket", "f1", "asian-games", "nfl", "nba", "mlb", "tennis", "neutral"];

const SPORT_LABEL: Record<ArtPalette, string> = {
  football: "Football",
  cricket: "Cricket",
  f1: "Formula 1",
  "asian-games": "Asian Games",
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  tennis: "Tennis",
  neutral: "Beyond the Scoreline",
};

/**
 * The same panel backgrounds as the `.art-*` rules in globals.css, as plain CSS a share-card
 * renderer can draw: satori resolves neither custom properties nor gradient stops past 100%, so
 * `neutral` carries the literal masthead tokens and the stops are clamped. article-art.test.ts
 * holds this map and the stylesheet to the same colours, so a repaint cannot change one alone.
 */
export const ART_GRADIENT: Record<ArtPalette, string> = {
  football: "linear-gradient(120deg, #6cabdd, #1c2c5b 90%)",
  cricket: "linear-gradient(120deg, #1d9a6c, #0b3d2e 90%)",
  f1: "linear-gradient(120deg, #101010, #2a2a2a 60%, #e10600 100%)",
  "asian-games": "linear-gradient(120deg, #ff9933 0%, #ff6a00 60%, #138808 100%)",
  nfl: "linear-gradient(120deg, #013369, #d50a0a 100%)",
  nba: "linear-gradient(120deg, #c9082a, #17408b 100%)",
  mlb: "linear-gradient(120deg, #bf0d3e, #041e42 100%)",
  tennis: "linear-gradient(120deg, #c8f135, #1f6f3a 100%)",
  neutral: "linear-gradient(120deg, #121c33, #0b1324 90%)",
};

/**
 * How large a headline is set on the share card. Satori neither shrinks text to fit nor scrolls it
 * away, so a long one has to be asked for in advance: the steps hold today's five articles (40-58
 * characters) at three lines or fewer, and the bottom step is headroom for whatever the daily draft
 * routine writes next, since nothing caps an article's title. Here rather than in the route module,
 * so it can be read by a test without adding an export Next does not expect on an image route.
 */
export function shareTitleSize(title: string): number {
  if (title.length > 104) return 36;
  if (title.length > 78) return 44;
  if (title.length > 54) return 52;
  return 62;
}

// First match wins; tags are the article's own, lower-case, hyphenated.
const TAG_PALETTE: [RegExp, ArtPalette][] = [
  [/^(asian-games|kabaddi|hockey|shooting|athletics|medal)/, "asian-games"],
  [/^(f1|formula-1|formula1|grand-prix)/, "f1"],
  [/^(cricket|ipl|bbl|wpl|odi|t20|test-cricket|world-cup-cricket)/, "cricket"],
  [/^(nfl|super-bowl)/, "nfl"],
  [/^(nba|basketball)/, "nba"],
  [/^(mlb|baseball|world-series)/, "mlb"],
  [/^(tennis|atp|wta|grand-slam)/, "tennis"],
  [/^(football|soccer|premier-league|la-liga|laliga|bundesliga|serie-a|seriea|champions-league|ucl|epl|man-city|arsenal|liverpool|barcelona|real-madrid)/, "football"],
];

/** The display name of a palette, for the eyebrow above a headline and the card's sport line. */
export function sportLabel(palette: ArtPalette): string {
  return SPORT_LABEL[palette];
}

export function paletteForTags(tags: string[]): ArtPalette {
  for (const tag of tags) {
    const hit = TAG_PALETTE.find(([re]) => re.test(tag.toLowerCase()));
    if (hit) return hit[1];
  }
  return "neutral";
}

export function articleArt(article: Pick<BeyondTheScorelineArticle, "art" | "tags">): { number: string; caption: string; palette: ArtPalette; sport: string } {
  const palette = article.art.palette ?? paletteForTags(article.tags);
  return { number: article.art.number, caption: article.art.caption, palette, sport: SPORT_LABEL[palette] };
}
