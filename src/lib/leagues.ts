// Pure league constants/helpers with no database import — safe to use from Client
// Components. queries.ts re-exports all of this for server-side callers; anything
// that runs in the browser (e.g. LeagueSubNav) must import from here directly instead
// of from queries.ts, since importing any value from that module pulls in `pg` (via
// ./db) and breaks the client bundle (`tls`/`util/types` aren't available there).
export type League = "nba" | "nfl" | "epl" | "ipl" | "bbl" | "cwc" | "t20wc" | "laliga";

// The 4 major, always-active leagues — these get homepage sections and top-level nav
// links. The other competitions (only in season occasionally, or every 2-4 years for
// the World Cups) are reachable via the Cricket/Soccer dropdowns instead, so they
// don't clutter the homepage with empty "no games scheduled" sections most of the year.
export const LEAGUES: League[] = ["epl", "nfl", "nba", "ipl"];
export const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc"];
export const SOCCER_LEAGUES: League[] = ["epl", "laliga"];
export const ALL_LEAGUES: League[] = [...LEAGUES, "bbl", "cwc", "t20wc", "laliga"];
export const LEAGUE_LABEL: Record<League, string> = {
  nba: "NBA",
  nfl: "NFL",
  epl: "Premier League",
  ipl: "IPL",
  bbl: "Big Bash League",
  cwc: "Cricket World Cup",
  t20wc: "T20 World Cup",
  laliga: "La Liga",
};

export function isLeague(value: string): value is League {
  return ALL_LEAGUES.includes(value as League);
}

export function isCricketLeague(league: League): boolean {
  return (CRICKET_LEAGUES as string[]).includes(league);
}

// ESPN labels a season by its *ending* year for NBA ("2023" = the 2022-23 season) but
// by its *starting* year for NFL/EPL/La Liga/IPL ("2024" = the 2024 NFL season /
// 2024-25 EPL season / 2024 IPL season). Render the conventional human label for each.
export function formatSeasonLabel(league: League, year: number | null): string | null {
  if (!year) return null;
  if (league === "nba") return `${year - 1}-${String(year).slice(2)}`;
  if (league === "epl" || league === "laliga") return `${year}-${String(year + 1).slice(2)}`;
  return String(year);
}
