import type { ArtPalette } from "./beyondTheScoreline";
import { articleArt } from "./articleArt";

export interface Topic {
  key: ArtPalette;
  label: string;
  count: number;
}

/** The filter pills on the index: one per sport that has an article, most written-about first, ties by first appearance. */
export function topicsFor(articles: { tags: string[]; art?: { palette: ArtPalette } }[]): Topic[] {
  const seen = new Map<ArtPalette, Topic>();
  for (const a of articles) {
    const { palette, sport } = articleArt({ tags: a.tags, art: a.art ? { number: "", palette: a.art.palette } : undefined });
    const t = seen.get(palette);
    if (t) t.count += 1;
    else seen.set(palette, { key: palette, label: sport, count: 1 });
  }
  const order = [...seen.keys()];
  return [...seen.values()].sort((x, y) => y.count - x.count || order.indexOf(x.key) - order.indexOf(y.key));
}
