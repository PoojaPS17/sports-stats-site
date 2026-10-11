// The sport filter on the homepage's Live now / Coming up tabs and on /scores: which sport a league belongs to, how the
// visible counts are tallied and where each sport's own page is. Pure (no database), so the server list builders and the
// client chips share one mapping.
import { isCricketLeague, SOCCER_LEAGUES, type League } from "./leagues";
import { SPORT_PICKS, type SportPick } from "./sportPicks";

/** The sport a league's matches are filed under: every football competition is Football, every cricket competition Cricket. */
export function sportOfLeague(league: League): SportPick {
  if ((SOCCER_LEAGUES as string[]).includes(league)) return "football";
  if (isCricketLeague(league)) return "cricket";
  if (league === "nfl" || league === "nba" || league === "mlb") return league;
  return "football";
}

/**
 * Where "see all" goes for a sport: the page that lists everything for it, not just the headline picks on the tabs.
 * Football has no single page (each league has its own), so it goes to the scores page, which has a Football filter.
 */
export const SPORT_HUB: Record<SportPick, string> = {
  cricket: "/cricket/series",
  football: "/scores",
  nfl: "/nfl",
  nba: "/nba",
  mlb: "/mlb",
  tennis: "/tennis",
  f1: "/f1",
};

export type SportCounts = Partial<Record<SportPick, number>>;

/** How many of the given items each sport has. */
export function tally(sports: SportPick[]): SportCounts {
  const out: SportCounts = {};
  for (const s of sports) out[s] = (out[s] ?? 0) + 1;
  return out;
}

/** The sports present in any of the tallies, in the picker's own order. */
export function sportsPresent(...tallies: SportCounts[]): SportPick[] {
  return SPORT_PICKS.filter((s) => tallies.some((t) => (t[s] ?? 0) > 0));
}

/** Space-separated sports for a `data-has` attribute: lets one CSS rule hide a block with nothing for the chosen sport. */
export const hasAttr = (sports: SportPick[]): string => [...new Set(sports)].join(" ");

/** What is in play, per sport: the same lists the Live now panel draws, so a chip's number is the count of cards it shows. */
export function liveSportCounts(d: { liveGames: { league: League }[]; liveCricket: unknown[]; liveTennis: unknown[] }): SportCounts {
  const t = tally(d.liveGames.map((g) => sportOfLeague(g.league)));
  if (d.liveCricket.length > 0) t.cricket = (t.cricket ?? 0) + Math.min(d.liveCricket.length, 6);
  if (d.liveTennis.length > 0) t.tennis = d.liveTennis.length;
  return t;
}

/** The Coming up panel's picks, per sport. */
export function comingSportCounts(d: { upcomingGames: { league: League }[]; nextCricket: unknown[]; nextTennis: unknown[]; f1: unknown | null }): SportCounts {
  const t = tally(d.upcomingGames.map((g) => sportOfLeague(g.league)));
  if (d.nextCricket.length > 0) t.cricket = (t.cricket ?? 0) + d.nextCricket.length;
  if (d.nextTennis.length > 0) t.tennis = d.nextTennis.length;
  if (d.f1) t.f1 = 1;
  return t;
}
