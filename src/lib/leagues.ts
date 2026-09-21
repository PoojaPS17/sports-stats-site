// Pure league constants/helpers with no database import — safe to use from Client
// Components. queries.ts re-exports all of this for server-side callers; anything
// that runs in the browser (e.g. LeagueSubNav) must import from here directly instead
// of from queries.ts, since importing any value from that module pulls in `pg` (via
// ./db) and breaks the client bundle (`tls`/`util/types` aren't available there).
export type League =
  | "nba"
  | "nfl"
  | "epl"
  | "ipl"
  | "bbl"
  | "cwc"
  | "t20wc"
  | "laliga"
  | "bundesliga"
  | "seriea"
  | "ucl"
  | "test"
  | "odi"
  | "t20i"
  | "wpl"
  | "wbbl"
  | "wcwc"
  | "wt20wc"
  | "wodi"
  | "wt20i";

// The 4 major, always-active leagues — these get homepage sections and top-level nav
// links. The other competitions (only in season occasionally, or every 2-4 years for
// the World Cups) are reachable via the Cricket/Soccer dropdowns instead, so they
// don't clutter the homepage with empty "no games scheduled" sections most of the year.
export const LEAGUES: League[] = ["epl", "nfl", "nba", "ipl"];
export const CRICKET_LEAGUES: League[] = ["ipl", "bbl", "cwc", "t20wc", "test", "odi", "t20i", "wpl", "wbbl", "wcwc", "wt20wc", "wodi", "wt20i"];
// The women's game: the WPL and WBBL, both World Cups, and the bilateral formats.
export const WOMENS_CRICKET: League[] = ["wpl", "wbbl", "wcwc", "wt20wc", "wodi", "wt20i"];
// Bilateral internationals come from Cricsheet's archive (scripts/import-cricsheet.ts)
// and ESPN's daily listing (scripts/import-cricket-espn.ts) rather than a competition
// feed: completed matches with full scorecards, but no fixtures, standings or news,
// and nothing live. Tests are ESPN's alone; the archive starts in 2015 like the rest of the site.
export const INTERNATIONAL_CRICKET: League[] = ["test", "odi", "t20i", "wodi", "wt20i"];

// A first-class match: two innings a side, no overs limit, and a draw is a result.
export function isFirstClassCricket(league: League): boolean {
  return league === "test";
}
export const SOCCER_LEAGUES: League[] = ["epl", "laliga", "bundesliga", "seriea", "ucl"];
export const ALL_LEAGUES: League[] = [...LEAGUES, "bbl", "cwc", "t20wc", "test", "odi", "t20i", "wpl", "wbbl", "wcwc", "wt20wc", "wodi", "wt20i", "laliga", "bundesliga", "seriea", "ucl"];
export const LEAGUE_LABEL: Record<League, string> = {
  nba: "NBA",
  nfl: "NFL",
  epl: "Premier League",
  ipl: "IPL",
  bbl: "Big Bash League",
  cwc: "Cricket World Cup",
  t20wc: "T20 World Cup",
  test: "Test Cricket",
  odi: "ODI Internationals",
  t20i: "T20 Internationals",
  wpl: "Women's Premier League",
  wbbl: "Women's Big Bash",
  wcwc: "Women's World Cup",
  wt20wc: "Women's T20 World Cup",
  wodi: "Women's ODIs",
  wt20i: "Women's T20Is",
  laliga: "La Liga",
  bundesliga: "Bundesliga",
  seriea: "Serie A",
  ucl: "Champions League",
};

export function isWomensCricket(league: League): boolean {
  return (WOMENS_CRICKET as string[]).includes(league);
}

// "the NBA", "the Premier League", but "La Liga" and "Serie A" take no article.
export function leagueNameWithArticle(league: League, capitalise = false): string {
  if (league === "laliga" || league === "seriea" || isInternationalCricket(league)) return LEAGUE_LABEL[league];
  return `${capitalise ? "The" : "the"} ${LEAGUE_LABEL[league]}`;
}

export function isLeague(value: string): value is League {
  return ALL_LEAGUES.includes(value as League);
}

export function isCricketLeague(league: League): boolean {
  return (CRICKET_LEAGUES as string[]).includes(league);
}

export function isInternationalCricket(league: League): boolean {
  return (INTERNATIONAL_CRICKET as string[]).includes(league);
}

// Tables exist for every competition with a season structure; bilateral
// internationals have none (rankings are the ICC's, not derivable from results here).
export function hasStandings(league: League): boolean {
  return !isInternationalCricket(league);
}

// ESPN's news feed is per competition; the international formats have no feed.
export function hasNewsFeed(league: League): boolean {
  return !isInternationalCricket(league);
}

// Each sport's own words for what is coming up: football and cricket have fixtures,
// the NFL and NBA have a schedule of games; a football match kicks off, an NBA game
// tips off, a cricket match simply starts.
export function scheduleWords(league: League): { upcoming: string; heading: string; start: string } {
  if (league === "nba") return { upcoming: "games", heading: "Schedule", start: "tip-off times" };
  if (league === "nfl") return { upcoming: "games", heading: "Schedule", start: "kickoff times" };
  if ((CRICKET_LEAGUES as string[]).includes(league)) return { upcoming: "fixtures", heading: "Fixtures", start: "start times" };
  return { upcoming: "fixtures", heading: "Fixtures", start: "kick-off times" };
}

// A regular-season NFL game can end level, and ESPN counts it as half a win: records read W-L-T
// and win percentage is (W + T/2) / games. NBA games cannot tie; football's draws are their own column.
export function hasTies(league: League): boolean {
  return league === "nfl";
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
