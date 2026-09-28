import type { ArtPalette } from "./beyondTheScoreline";
import { paletteForTags, sportLabel } from "./articleArt";

export interface Topic {
  key: ArtPalette;
  label: string;
  count: number;
}

/** The filter pills on the index: one per sport that has an article, most written-about first, ties by first appearance. */
export function topicsFor(articles: { tags: string[]; art?: { palette?: ArtPalette } }[]): Topic[] {
  const seen = new Map<ArtPalette, Topic>();
  for (const a of articles) {
    const palette = a.art?.palette ?? paletteForTags(a.tags);
    const t = seen.get(palette);
    if (t) t.count += 1;
    else seen.set(palette, { key: palette, label: sportLabel(palette), count: 1 });
  }
  const order = [...seen.keys()];
  return [...seen.values()].sort((x, y) => y.count - x.count || order.indexOf(x.key) - order.indexOf(y.key));
}
