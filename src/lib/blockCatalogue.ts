// The "Add more blocks" palette, grouped by sport. Phase one offers only block types
// the route can serve; the chips the mockup showed for scoreboards, top scorers and
// rankings wait for their block types.
import { btsBlock, cricketSideBlock, f1Block, liveBlock, seriesStandingsBlock, standingsBlock, type EditionContext } from "./editions";
import type { HomeBlock } from "./blockTypes";

export interface PaletteGroup {
  name: string;
  blocks: HomeBlock[];
}

export function paletteGroups(ctx: EditionContext): PaletteGroup[] {
  const featured = ctx.featuredCricketSeries ? [seriesStandingsBlock(ctx.featuredCricketSeries)] : [];
  return [
    { name: "Cricket", blocks: [...featured, standingsBlock("ipl"), ...ctx.cricketSides.slice(0, 10).map(cricketSideBlock)] },
    { name: "Football", blocks: [standingsBlock("epl"), standingsBlock("ucl"), standingsBlock("laliga"), standingsBlock("bundesliga"), standingsBlock("seriea")] },
    { name: "US sports", blocks: [standingsBlock("nfl"), standingsBlock("nba"), standingsBlock("mlb")] },
    { name: "More", blocks: [liveBlock(), f1Block(), btsBlock()] },
  ].map((g) => ({ ...g, blocks: dedupe(g.blocks) }));
}

function dedupe(blocks: HomeBlock[]): HomeBlock[] {
  const seen = new Set<string>();
  return blocks.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}
