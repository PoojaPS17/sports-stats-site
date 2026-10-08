// Turns what the site already knows about a visitor (follows) and what they search for
// into blocks. Follows of games and tennis tournaments have no block type yet.
import { blockId, type HomeBlock } from "./blockTypes";
import type { FollowItem } from "./follow";
import { isLeague, LEAGUE_LABEL, type League } from "./leagues";
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

export interface PaletteResult {
  block: HomeBlock;
  /** Every block id that already stands for this result: its own, and the same person's pages in other competitions. */
  ids: string[];
}

/**
 * Folded search results as palette chips: one per person (the caller asks the search to fold a cricketer's or footballer's
 * pages into one row), with the person's other pages kept as ids so a chip reads as added when any of them is on the page.
 * Two different people with one name (an Indian and an Indonesian "Rohit Sharma") stay separate and get the club or country
 * in the label, so the chips can be told apart.
 */
export function searchResultsToPalette(results: (Pick<SearchResult, "type" | "league" | "name" | "slug" | "subtitle"> & { also?: { league: string; slug: string }[] })[], limit: number): PaletteResult[] {
  const entries: { r: (typeof results)[number]; block: HomeBlock; ids: string[] }[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const block = searchResultToBlock(r);
    if (!block || seen.has(block.id)) continue;
    seen.add(block.id);
    const ids = [block.id];
    for (const a of r.also ?? []) {
      const other = searchResultToBlock({ ...r, league: a.league, slug: a.slug });
      if (other) ids.push(other.id);
    }
    entries.push({ r, block, ids });
  }
  const players = entries.slice(0, limit).filter((e) => e.r.type === "player");
  const byName = new Map<string, typeof players>();
  for (const e of players) byName.set(e.r.name.toLowerCase(), [...(byName.get(e.r.name.toLowerCase()) ?? []), e]);
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const withTeam = group.map((e) => e.r.subtitle || LEAGUE_LABEL[e.r.league as League] || e.r.league);
    const needsMore = new Set(withTeam.filter((t, i) => withTeam.indexOf(t) !== i));
    group.forEach((e, i) => {
      const where = needsMore.has(withTeam[i]) ? `${withTeam[i]}, ${LEAGUE_LABEL[e.r.league as League] ?? e.r.league}` : withTeam[i];
      e.block = { ...e.block, label: `${e.r.name} (${where}): last five` };
    });
  }
  return entries.slice(0, limit).map(({ block, ids }) => ({ block, ids }));
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
