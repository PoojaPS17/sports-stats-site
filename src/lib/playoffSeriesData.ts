// The database side of lib/playoffSeries.ts: reads the playoff series rows once, works out which games will never be
// played and which "CLE/CHW" placeholder sides have been settled, and lets each list surface drop or relabel them.
// Nothing is written or deleted: the rows stay (the scrapers would put them straight back).
import { pool } from "./db";
import { notNeededGames, placeholderParts, placeholderWinners, type NotNeeded, type SeriesGame } from "./playoffSeries";

/** Leagues whose playoffs are best-of series listed game by game (see seriesLength). */
const SERIES_LEAGUES = ["mlb", "nba"];

interface TeamLite {
  espn_id: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
}

export interface SeriesIndex {
  /** `league:espn_id` of each game that will not be played, with the series that decided it. */
  notNeeded: Map<string, NotNeeded>;
  /** `league:placeholder label` ("mlb:CLE/CHW") -> the team that won that series. */
  settled: Map<string, TeamLite>;
}

const EMPTY: SeriesIndex = { notNeeded: new Map(), settled: new Map() };

// The playoffs change by the minute but nothing here needs to be that fresh: a minute's memory keeps a page that lists
// forty games from asking the same question forty times. A failure is remembered as briefly, and never reaches a page.
const TTL_MS = 60_000;
let cached: { at: number; index: Promise<SeriesIndex> } | null = null;

/** Forget the remembered index (tests, and anything that has just changed series rows). */
export function clearSeriesIndex(): void {
  cached = null;
}

async function loadIndex(): Promise<SeriesIndex> {
  // Series rows from the recent past on: a postseason is a few weeks long and every game of one is in this window.
  const { rows } = await pool.query<SeriesGame>(
    `select g.league, g.espn_id, g.season_year, g.round, g.completed, g.status_state,
            g.home_team_espn_id, g.away_team_espn_id, g.home_winner, g.away_winner, g.home_score, g.away_score,
            ht.abbreviation as home_abbr, at.abbreviation as away_abbr
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.league = any($1::text[]) and g.round ~* 'game\\s*\\d' and g.date > now() - interval '120 days'`,
    [SERIES_LEAGUES]
  );
  const notNeeded = new Map<string, NotNeeded>();
  const settled = new Map<string, TeamLite>();
  for (const league of SERIES_LEAGUES) {
    const games = rows.filter((r) => r.league === league);
    for (const [k, v] of notNeededGames(games)) notNeeded.set(k, v);
    const winners = placeholderWinners(games);
    if (winners.size === 0) continue;
    const { rows: teams } = await pool.query<TeamLite>(`select espn_id, name, slug, abbreviation, logo_url, color from teams where league = $1 and espn_id = any($2::text[])`, [league, [...new Set(winners.values())]]);
    const byId = new Map(teams.map((t) => [t.espn_id, t]));
    for (const [label, id] of winners) {
      const team = byId.get(id);
      if (team) settled.set(`${league}:${label}`, team);
    }
  }
  return { notNeeded, settled };
}

export function getSeriesIndex(): Promise<SeriesIndex> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.index;
  const index = loadIndex().catch((err) => {
    console.error(`[series] could not read the playoff series: ${err instanceof Error ? err.message : err}`);
    return EMPTY;
  });
  cached = { at: now, index };
  return index;
}

type Keyed = { league: string; espn_id: string };

/** Why a game will not be played, or null for a game that is (or may still be) played. */
export async function getNotNeeded(game: Keyed): Promise<NotNeeded | null> {
  return (await getSeriesIndex()).notNeeded.get(`${game.league}:${game.espn_id}`) ?? null;
}

/** The rows without the games that will not be played. */
export async function dropNotNeeded<T extends Keyed>(rows: T[]): Promise<T[]> {
  const { notNeeded } = await getSeriesIndex();
  return notNeeded.size === 0 ? rows : rows.filter((g) => !notNeeded.has(`${g.league}:${g.espn_id}`));
}

/** `league:espn_id` of every game that will not be played, for a query that has to leave them out before it applies a LIMIT. */
export async function notNeededKeys(): Promise<string[]> {
  return [...(await getSeriesIndex()).notNeeded.keys()];
}

type SideRow = {
  league: string;
  home_team_espn_id: string;
  away_team_espn_id: string;
  home_name: string;
  home_slug: string;
  home_abbr: string | null;
  home_logo: string | null;
  home_color: string | null;
  away_name: string;
  away_slug: string;
  away_abbr: string | null;
  away_logo: string | null;
  away_color: string | null;
};

/** Rows whose "CLE/CHW" side belongs to a series that has been decided get the team that won it. An open series keeps "Winner of CLE-CHW". */
export async function settlePlaceholders<T extends SideRow>(rows: T[]): Promise<T[]> {
  if (!rows.some((g) => placeholderParts(g.home_abbr) || placeholderParts(g.away_abbr))) return rows;
  const { settled } = await getSeriesIndex();
  if (settled.size === 0) return rows;
  return rows.map((g) => {
    const home = placeholderParts(g.home_abbr) ? settled.get(`${g.league}:${g.home_abbr}`) : undefined;
    const away = placeholderParts(g.away_abbr) ? settled.get(`${g.league}:${g.away_abbr}`) : undefined;
    if (!home && !away) return g;
    return {
      ...g,
      ...(home ? { home_team_espn_id: home.espn_id, home_name: home.name, home_slug: home.slug, home_abbr: home.abbreviation, home_logo: home.logo_url, home_color: home.color } : {}),
      ...(away ? { away_team_espn_id: away.espn_id, away_name: away.name, away_slug: away.slug, away_abbr: away.abbreviation, away_logo: away.logo_url, away_color: away.color } : {}),
    };
  });
}

/** What every list of games passes its rows through: the unplayed games leave, the settled placeholders become teams. */
export async function presentGames<T extends Keyed & SideRow>(rows: T[]): Promise<T[]> {
  return settlePlaceholders(await dropNotNeeded(rows));
}
