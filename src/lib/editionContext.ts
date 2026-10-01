// What the editions need from the server so the client never guesses an id: the
// international cricket sides with play coming, and the headline series that has a table.
import { unstable_cache } from "next/cache";
import { getCricketSeriesWindow } from "./cricketSeries";
import { hasStandings } from "./leagues";
import type { EditionContext } from "./editions";

export const getEditionContext = unstable_cache(
  async (): Promise<EditionContext> => {
    const window = await getCricketSeriesWindow(14, 60);
    const sides = new Map<string, string>();
    for (const s of window) {
      if (s.kind !== "international") continue;
      for (const t of s.teams) if (!sides.has(t.name)) sides.set(t.name, t.id);
    }
    const featured = window
      .filter((s) => s.featured && s.league !== null && hasStandings(s.league))
      .sort((a, b) => b.live_count - a.live_count || (a.start_date ?? "").localeCompare(b.start_date ?? ""))[0];
    return {
      cricketSides: [...sides].map(([name, id]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      featuredCricketSeries: featured ? { id: featured.espn_id, name: featured.name } : null,
    };
  },
  ["edition-context"],
  { revalidate: 900 }
);
