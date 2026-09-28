import { notFound, permanentRedirect } from "next/navigation";
import { isLeague } from "@/lib/queries";

// Nothing here varies, but a page with no window is served `s-maxage=31536000` and the edge keeps
// its first copy for a year (page-cache-lifetime.test.ts). Five minutes, like everything else.
export const revalidate = 300;

/**
 * `/nba/scores` and `/epl/scores` were 404s. The only page below `/scores` is the one for a named
 * day, so the bare address — typed in, linked from off-site, or guessed from the `/tennis/scores`
 * rule that next.config.ts already redirects — had nothing to answer with.
 *
 * A league's own page leads with the latest day it played and links the full scoreboard for it, so
 * this sends the address there rather than standing up a second scoreboard that would say the same
 * thing at a second URL. Permanent, matching the tennis rule; it stays a page rather than another
 * next.config entry so the league list has one home — an address whose first segment is not a
 * league still 404s here instead of bouncing to a page that then 404s itself.
 */
export default async function LeagueScoresPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();
  permanentRedirect(`/${league}`);
}
