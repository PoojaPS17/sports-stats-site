// Pure league constants/helpers with no database import — safe to use from Client
// Components. queries.ts re-exports all of this for server-side callers; anything
// that runs in the browser (e.g. LeagueSubNav) must import from here directly instead
// of from queries.ts, since importing any value from that module pulls in `pg` (via
// ./db) and breaks the client bundle (`tls`/`util/types` aren't available there).
export type League = "nba" | "nfl" | "epl" | "ipl" | "bbl" | "cwc" | "t20wc" | "laliga" | "bundesliga" | "seriea" | "ucl";

// The 4 major, always-active leagues — these get homepage sections and top-level nav
// links. The other competitions (only in season occasionally, or every 2-4 years for
// the World Cups) are reachable via the Cricket/Soccer dropdowns instead, so they
// don't clutter the homepage with empty "no games scheduled" sections most of the year.
export const LEAGUES: League[] = ["epl", "nfl", "nba", "ipl"];
export const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc"];
export const SOCCER_LEAGUES: League[] = ["epl", "laliga", "bundesliga", "seriea", "ucl"];
export const ALL_LEAGUES: League[] = [...LEAGUES, "bbl", "cwc", "t20wc", "laliga", "bundesliga", "seriea", "ucl"];
export const LEAGUE_LABEL: Record<League, string> = {
  nba: "NBA",
  nfl: "NFL",
  epl: "Premier League",
  ipl: "IPL",
  bbl: "Big Bash League",
  cwc: "Cricket World Cup",
  t20wc: "T20 World Cup",
  laliga: "La Liga",
  bundesliga: "Bundesliga",
  seriea: "Serie A",
  ucl: "Champions League",
};

// "the NBA", "the Premier League", but "La Liga" and "Serie A" take no article.
export function leagueNameWithArticle(league: League, capitalise = false): string {
  if (league === "laliga" || league === "seriea") return LEAGUE_LABEL[league];
  return `${capitalise ? "The" : "the"} ${LEAGUE_LABEL[league]}`;
}

export function isLeague(value: string): value is League {
  return ALL_LEAGUES.includes(value as League);
}

export function isCricketLeague(league: League): boolean {
  return (CRICKET_LEAGUES as string[]).includes(league);
}

export function isSoccerLeague(league: League): boolean {
  return (SOCCER_LEAGUES as string[]).includes(league);
}

// A cup competition has a league phase (or group stage) followed by knockout rounds,
// which the feed tags per game; those rounds are stored in `games.round` and kept
// out of tables, projections and matchday numbering. Domestic leagues have none.
export function isCupCompetition(league: League): boolean {
  return league === "ucl";
}

// Summer qualifying rounds ("Qualifying Third Round", the August "Playoff Round")
// precede the competition proper. They are real results, so they count for ratings,
// records and team pages, but they are not part of the matchday sequence or the
// knockout bracket, and the feed only carries them for clubs on a stored schedule.
export function isQualifyingRound(round: string | null | undefined): boolean {
  return Boolean(round && /qualifying|playoff round/i.test(round));
}

// The Champions League switched from eight groups of four to a single 36-team
// league phase in 2024-25. Tables, zones and projections differ between the formats.
export const UCL_LEAGUE_PHASE_FROM = 2024;

// ESPN labels a season by its *ending* year for NBA ("2023" = the 2022-23 season) but
// by its *starting* year for NFL/EPL/La Liga/IPL ("2024" = the 2024 NFL season /
// 2024-25 EPL season / 2024 IPL season). Render the conventional human label for each.
export function formatSeasonLabel(league: League, year: number | null): string | null {
  if (!year) return null;
  if (league === "nba") return `${year - 1}-${String(year).slice(2)}`;
  if (isSoccerLeague(league)) return `${year}-${String(year + 1).slice(2)}`;
  return String(year);
}
