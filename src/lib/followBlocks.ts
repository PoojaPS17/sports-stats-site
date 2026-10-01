// Turns what the site already knows about a visitor (follows) and what they search for
// into blocks. Follows of games and tennis tournaments have no block type yet.
import { blockId, type HomeBlock } from "./blockTypes";
import type { FollowItem } from "./follow";
import { isLeague } from "./leagues";
import type { SearchResult } from "./queries";

type FollowLike = Pick<FollowItem, "kind" | "league" | "refId" | "label">;

function make(type: HomeBlock["type"], params: Record<string, string>, label: string): HomeBlock {
  return { id: blockId(type, params), type, params, label };
}

export function followToBlock(item: FollowLike): HomeBlock | null {
  switch (item.kind) {
    case "team":
      return isLeague(item.league) ? make("team-next", { league: item.league, team: item.refId }, `${item.label}: next three`) : null;
    case "player":
      return isLeague(item.league) ? make("player-form", { league: item.league, player: item.refId }, `${item.label}: last five`) : null;
    case "series":
      return make("series-standings", { series: item.refId }, `${item.label} standings`);
    default:
      return null;
  }
}

export function searchResultToBlock(r: Pick<SearchResult, "type" | "league" | "name" | "slug" | "subtitle">): HomeBlock | null {
  return followToBlock({ kind: r.type, league: r.league, refId: r.slug, label: r.name });
}

/** Follows as blocks in the order given, duplicates dropped. */
export function followsToBlocks(items: FollowLike[]): HomeBlock[] {
  const out: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const b = followToBlock(item);
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}
