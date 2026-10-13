// The Asian Games cricket on the hub page, read in one place so the page, its metadata and the sitemap
// agree on whether the hub has anything to show.
import { getLiveCricketMatches, getUpcomingCricketMatches } from "./cricketSeries";
import { isAsianGamesCricket } from "./cricketFeatured";
import { currentEdition, isGamesOpen } from "./asianGamesEditions";

export async function asianGamesCricket() {
  const [liveAll, upcomingAll] = await Promise.all([getLiveCricketMatches(false, "asian games"), getUpcomingCricketMatches(100, 20, false, "asian games")]);
  const liveCricket = liveAll.filter(isAsianGamesCricket);
  const liveIds = new Set(liveCricket.map((m) => m.espn_id));
  const upcomingCricket = upcomingAll.filter((m) => isAsianGamesCricket(m) && !liveIds.has(m.espn_id));
  return { liveCricket, upcomingCricket };
}

/**
 * The hub is worth a search result while the Games are on or cricket from them is live or still to
 * come. Once they are over with no fixtures left it is a page that says there is nothing on, so it is
 * kept out of search results and the sitemap (the medal tally keeps its own page).
 */
export function asianGamesWorthIndexing(open: boolean, fixtures: number): boolean {
  return open || fixtures > 0;
}

export async function asianGamesHubIndexable(): Promise<boolean> {
  const { liveCricket, upcomingCricket } = await asianGamesCricket();
  return asianGamesWorthIndexing(isGamesOpen(currentEdition()), liveCricket.length + upcomingCricket.length);
}
