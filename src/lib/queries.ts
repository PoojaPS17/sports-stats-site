import { BETTING_TEXT_PG, isBettingApp } from "./betting";
import { pool } from "./db";
import { CALLED_OFF } from "./gameStatus";
import { dayTimeZone } from "./gameDay";
import { isCricketLeague } from "./leagues";
import type { League } from "./leagues";
import type { GameDetails } from "./matchDetail";
import type { GameStage } from "./gameStage";
import { fetchEspnSeasons, fetchPlayerLog, fetchReportedGames } from "./playerLog";
import { notPseudoAthleteSql } from "./pseudoAthlete";
import { seriesHasPlaySql } from "./cricketSeriesKey";
import { sortStandings } from "./standingsOrder";
import type { EspnSeasonTotals } from "./espnSeason";
import type { PlayerLogRow, ReportedGames } from "./playerProfile";

export type { League } from "./leagues";
export { sortStandings } from "./standingsOrder";
export { LEAGUES, CRICKET_LEAGUES, INTERNATIONAL_CRICKET, SOCCER_LEAGUES, ALL_LEAGUES, LEAGUE_LABEL, isLeague, isCricketLeague, isInternationalCricket, isFirstClassCricket, hasStandings, hasNewsFeed, formatSeasonLabel, isSoccerLeague, hasTies, isCupCompetition, UCL_LEAGUE_PHASE_FROM, leagueNameWithArticle } from "./leagues";

export interface GameRow {
  league: League;
  espn_id: string;
  date: string;
  name: string;
  short_name: string | null;
  home_score: number | null;
  away_score: number | null;
  home_score_display: string | null;
  away_score_display: string | null;
  home_winner: boolean | null;
  away_winner: boolean | null;
  season_year: number | null;
  status_state: string | null;
  status_detail: string | null;
  status_summary: string | null;
  round: string | null;
  /** The stored classification (games.stage): regular, playoffs, playin, excluded or other. Absent on rows from a query that does not select it. */
  stage?: GameStage | null;
  completed: boolean;
  /** Official week number from the feed (NFL only). */
  week?: number | null;
  /** Kickoff as first scheduled, before any postponement. */
  first_seen_date?: string | null;
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
  // Only selected by getGameByEspnId (the game-detail page) — every other query that
  // returns a GameRow is a list view that has no use for pre-game context like this.
  odds_details?: string | null;
  odds_spread?: number | null;
  odds_over_under?: number | null;
  odds_provider?: string | null;
  broadcast_network?: string | null;
  weather_display?: string | null;
  weather_temperature?: number | null;
}

export const GAME_SELECT = `
  select
    g.league, g.espn_id, g.date, g.name, g.short_name, g.home_score, g.away_score,
    g.home_score_display, g.away_score_display, g.home_winner, g.away_winner, g.season_year,
    g.status_state, g.status_detail, g.status_summary, g.round, g.stage, g.completed, g.week, g.first_seen_date,
    g.home_team_espn_id, g.away_team_espn_id,
    ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
    at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color
  from games g
  join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
  join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
`;

// Only the single-game detail view needs odds/broadcast/weather context, so this has
// its own SELECT rather than adding those columns to the shared GAME_SELECT that
// every list query also uses.
export async function getGameByEspnId(league: League, espnId: string): Promise<GameRow | null> {
  const { rows } = await pool.query(
    `select
       g.league, g.espn_id, g.date, g.name, g.short_name, g.home_score, g.away_score,
       g.home_score_display, g.away_score_display, g.home_winner, g.away_winner, g.season_year,
       g.status_state, g.status_detail, g.status_summary, g.round, g.stage, g.completed,
       g.home_team_espn_id, g.away_team_espn_id,
       g.odds_details, g.odds_spread, g.odds_over_under, g.odds_provider,
       g.broadcast_network, g.weather_display, g.weather_temperature,
       ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
       at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.league = $1 and g.espn_id = $2`,
    [league, espnId]
  );
  return rows[0] ?? null;
}

// The stored match report (see lib/matchDetail.ts GameDetails), written by the scraper
// for completed games; null until the backfill reaches a game.
export async function getGameDetails(league: League, espnId: string): Promise<GameDetails | null> {
  const { rows } = await pool.query(`select details from game_details where league = $1 and game_espn_id = $2`, [league, espnId]);
  return rows[0]?.details ?? null;
}

// Every game tagged with a playoff-stage round for a season, in chronological order —
// powers the standings-page season summary (Qualifier 1/Eliminator/Final for IPL,
// each playoff round/series for NBA/NFL). Not meaningful for EPL, which has no
// postseason of its own (round is always null there).
export async function getSeasonPlayoffGames(league: League, season: number): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT} where g.league = $1 and g.season_year = $2 and g.round is not null and g.completed = true order by g.date asc`,
    [league, season]
  );
  return rows;
}

// A day's games are the games of that league's calendar day (see lib/gameDay.ts): US Eastern for the
// NFL and the NBA, UTC for everything else. The exact test converts the stored instant into that zone,
// which no index can help with, so it is paired with a coarse bound on g.date itself that the
// (league, date) index does serve. The bounds are a day either side, wide enough for any zone on
// earth, so they never exclude a game the exact test would have kept. They are written as UTC
// instants (`at time zone 'UTC'`): a bare date plus an interval is a zoneless timestamp that
// Postgres would otherwise read in the session's TimeZone setting, which nothing here pins.
export async function getGamesByDate(league: League, dateISO: string): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = $1
       and g.date >= ($2::date - interval '1 day') at time zone 'UTC'
       and g.date < ($2::date + interval '2 days') at time zone 'UTC'
       and (g.date at time zone $3::text)::date = $2::date
     order by g.date asc`,
    [league, dateISO, dayTimeZone(league)]
  );
  return rows;
}

export async function getRecentAndUpcoming(league: League, daysBack = 2, daysForward = 5): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = $1
       and g.date > now() - ($2 || ' days')::interval
       and g.date < now() + ($3 || ' days')::interval
     order by g.date asc`,
    [league, daysBack, daysForward]
  );
  return rows;
}

// The last results of one season, newest first — the closing games of a season that
// has ended (a final, the last matchday) for the between-seasons recap.
export async function getSeasonLastResults(league: League, season: number, limit = 6): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT} where g.league = $1 and g.season_year = $2 and g.completed = true order by g.date desc, g.espn_id desc limit $3`,
    [league, season, limit]
  );
  return rows;
}

// Newest completed matches, for competitions that have results but no fixture feed.
export async function getLatestResults(league: League, limit = 12): Promise<GameRow[]> {
  const { rows } = await pool.query(`${GAME_SELECT} where g.league = $1 and g.completed = true order by g.date desc, g.espn_id desc limit $2`, [league, limit]);
  return rows;
}

export async function getFeaturedGames(league: League, limit = 3): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = $1 and g.date > now() - interval '3 days' and g.date < now() + interval '10 days'
     order by g.completed desc, abs(coalesce(g.home_score,0) - coalesce(g.away_score,0)) desc, g.date asc
     limit $2`,
    [league, limit]
  );
  return rows;
}

export interface StandingRow {
  season: number;
  team_espn_id: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
  conference: string | null;
  division: string | null;
  wins: number;
  losses: number;
  win_percent: string;
  streak: string | null;
  playoff_seed: number | null;
  draws: number | null;
  points: number | null;
  goals_for: number | null;
  goals_against: number | null;
  no_result: number | null;
  net_run_rate: string | null;
  /** ESPN's own position in its table (head-to-head and the other tie-breaks applied); null when the feed sent none. */
  rank: number | null;
  /** Set by sortStandings on every row of a table nobody has played in yet: it has no order, so no positions are shown. */
  unranked?: boolean;
}

const STANDING_SELECT = `
  select s.season, s.team_espn_id, t.name, t.slug, t.abbreviation, t.logo_url, t.color,
         s.conference, s.division, s.wins, s.losses, s.win_percent, s.streak, s.playoff_seed,
         s.draws, s.points, s.goals_for, s.goals_against, s.no_result, s.net_run_rate, s.rank
  from standings s
  join teams t on t.league = s.league and t.espn_id = s.team_espn_id
`;
// The rows come out of SQL in a stable order only; sortStandings (src/lib/standingsOrder.ts) puts
// them into tables and orders each one: ESPN's rank for soccer and cricket, win percentage for the
// NFL and NBA, the later stage of a two-stage tournament first.
const STANDING_ROW_ORDER = `order by s.conference nulls last, t.name`;

// The `standings` table now holds every backfilled historical season too, so this
// must pin to the most recent one rather than returning every season's rows mixed
// together.
export async function getStandings(league: League): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `${STANDING_SELECT}
     where s.league = $1 and s.season = (select max(season) from standings where league = $1)
     ${STANDING_ROW_ORDER}`,
    [league]
  );
  return sortStandings(league, rows);
}

export async function getStandingsBySeason(league: League, season: number): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `${STANDING_SELECT} where s.league = $1 and s.season = $2 ${STANDING_ROW_ORDER}`,
    [league, season]
  );
  return sortStandings(league, rows);
}

// Every season with a standings table on file, most recent first — powers the
// year-toggle tabs on the standings page.
export async function getStandingsSeasons(league: League): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season from standings where league = $1 order by season desc`, [league]);
  return rows.map((r) => r.season as number);
}

// The most recent season that's actually been played, as opposed to getStandingsSeasons()'s
// most recent season *on file* — a standings row for the upcoming season already
// exists (every team 0-0) well before it starts, so "most recent on file" points at an
// empty table during preseason. Used for "nothing scheduled right now, see the last
// real season" style empty states, where an all-zero table would be a non-answer.
export async function getMostRecentPlayedSeason(league: League): Promise<number | null> {
  const { rows } = await pool.query(
    `select season from standings where league = $1
     group by season having sum(wins + losses + coalesce(draws, 0)) > 0
     order by season desc limit 1`,
    [league]
  );
  return rows[0]?.season ?? null;
}

export interface TeamRow {
  espn_id: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  logo_url: string | null;
  color: string | null;
  alternate_color: string | null;
}

export interface TeamDetail extends TeamRow {
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_country: string | null;
  head_coach: string | null;
}

export async function getTeamBySlug(league: League, slug: string): Promise<TeamDetail | null> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, abbreviation, logo_url, color, alternate_color,
            venue_name, venue_city, venue_state, venue_country, head_coach
     from teams where league = $1 and slug = $2`,
    [league, slug]
  );
  return rows[0] ?? null;
}

// A slug from before accents were handled ("atl-tico-madrid"): the current slug of
// that row, so the page can redirect permanently instead of 404ing an old link.
export async function findTeamSlugByLegacy(league: League, slug: string): Promise<string | null> {
  const { rows } = await pool.query(`select slug from teams where league = $1 and legacy_slug = $2`, [league, slug]);
  return rows[0]?.slug ?? null;
}

export async function findPlayerSlugByLegacy(league: string, slug: string): Promise<string | null> {
  const { rows } = await pool.query(`select slug from players p where p.league = $1 and p.legacy_slug = $2 and ${notPseudoAthleteSql()}`, [league, slug]);
  return rows[0]?.slug ?? null;
}

export async function getAllTeams(league: League): Promise<TeamRow[]> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, abbreviation, logo_url, color, alternate_color from teams where league = $1 order by name`,
    [league]
  );
  return rows;
}

export async function getTeamGamesBySeason(league: League, teamEspnId: string, season: number): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = $1 and (g.home_team_espn_id = $2 or g.away_team_espn_id = $2) and g.season_year = $3
     order by g.date desc`,
    [league, teamEspnId, season]
  );
  return rows;
}

// Every season a team has at least one game in, most recent first — powers the
// year-toggle tabs on team pages. Up to 10+ years of backfilled history plus the
// live season.
export async function getTeamSeasons(league: League, teamEspnId: string): Promise<number[]> {
  const { rows } = await pool.query(
    `select distinct season_year from games
     where league = $1 and (home_team_espn_id = $2 or away_team_espn_id = $2) and season_year is not null
     order by season_year desc`,
    [league, teamEspnId]
  );
  return rows.map((r) => r.season_year as number);
}

export interface PlayerRow {
  espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  team_espn_id: string | null;
  team_name: string | null;
  team_slug: string | null;
  team_color: string | null;
  position?: string | null;
  jersey?: string | null;
  age?: number | null;
  height?: string | null;
  weight?: string | null;
  /** Listed in the team's latest roster fetch; false for players who have moved on. */
  on_roster?: boolean;
  /** Set only when headshot_url is a Wikimedia Commons photo (ESPN had none): its attribution. */
  photo_credit?: string | null;
  photo_license?: string | null;
  photo_source_url?: string | null;
}

export async function getPlayerBySlug(league: League, slug: string): Promise<PlayerRow | null> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url, p.team_espn_id, p.position, p.jersey, p.age, p.height, p.weight,
            t.name as team_name, t.slug as team_slug, t.color as team_color,
            case when p.headshot_url is null then p.photo_credit end as photo_credit,
            case when p.headshot_url is null then p.photo_license end as photo_license,
            case when p.headshot_url is null then p.photo_source_url end as photo_source_url,
            coalesce(p.team_espn_id is not null and (${ON_ROSTER_SQL}), false) as on_roster
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league = $1 and p.slug = $2 and ${notPseudoAthleteSql()}`,
    [league, slug]
  );
  return rows[0] ?? null;
}

// Batch-resolves espn_id -> slug for players who show up in a match's box score, so
// the box score can link to a player page only when we actually have one (most
// historical opponents in a decade-old game were never on a "current roster").
export async function getPlayerSlugsByEspnIds(league: League, espnIds: string[]): Promise<Map<string, string>> {
  if (espnIds.length === 0) return new Map();
  const { rows } = await pool.query(`select p.espn_id, p.slug from players p where p.league = $1 and p.espn_id = any($2) and ${notPseudoAthleteSql()}`, [league, espnIds]);
  return new Map(rows.map((r) => [r.espn_id as string, r.slug as string]));
}

export async function getAllPlayers(league: League): Promise<PlayerRow[]> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url, p.team_espn_id,
            t.name as team_name, t.slug as team_slug, t.color as team_color
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league = $1 and ${notPseudoAthleteSql()}
     order by p.name`,
    [league]
  );
  return rows;
}

export interface TickerGame {
  league: League;
  espn_id: string;
  home_name: string;
  home_slug: string;
  home_score: number | null;
  home_score_display: string | null;
  home_winner: boolean | null;
  away_name: string;
  away_slug: string;
  away_score: number | null;
  away_score_display: string | null;
  away_winner: boolean | null;
  completed: boolean;
  status_summary: string | null;
  status_state: string | null;
  date: string;
}

export async function getTickerGames(limit = 12): Promise<TickerGame[]> {
  const { rows } = await pool.query(
    `select g.league, g.espn_id, g.date, g.completed, g.status_state, g.status_summary,
            g.home_score, g.home_score_display, g.home_winner,
            g.away_score, g.away_score_display, g.away_winner,
            ht.name as home_name, ht.slug as home_slug,
            at.name as away_name, at.slug as away_slug
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.date > now() - interval '3 days' and g.date < now() + interval '10 days'
       and (g.completed or g.status_state = 'in' or coalesce(g.status_detail, '') !~* $2)
     order by g.completed desc, case when g.completed then g.date end desc, g.date asc
     limit $1`,
    [limit, CALLED_OFF.source]
  );
  return rows;
}

export interface NewsArticle {
  article_id: string;
  headline: string;
  description: string | null;
  image_url: string | null;
  link: string | null;
  published: string | null;
}

export async function getNews(league: League, limit = 8): Promise<NewsArticle[]> {
  const { rows } = await pool.query(
    `select article_id, headline, description, image_url, link, published
     from news_articles
     where league = $1 and headline !~* $3 and coalesce(description, '') !~* $3
     order by published desc nulls last limit $2`,
    [league, limit, BETTING_TEXT_PG]
  );
  return rows;
}

export interface LeaderRow {
  player_espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  team_name: string | null;
  team_slug: string | null;
  value: number;
}

export interface LeaderCategory {
  column: string; // player_season_stats column
  label: string;
  unit: string;
}

export const LEADER_CATEGORIES: Record<League, LeaderCategory[]> = {
  nba: [
    { column: "pts_avg", label: "Points", unit: "PPG" },
    { column: "reb_avg", label: "Rebounds", unit: "RPG" },
    { column: "ast_avg", label: "Assists", unit: "APG" },
  ],
  nfl: [
    { column: "passing_yards", label: "Passing Yards", unit: "YDS" },
    { column: "rushing_yards", label: "Rushing Yards", unit: "YDS" },
    { column: "receiving_yards", label: "Receiving Yards", unit: "YDS" },
  ],
  epl: [
    { column: "goals", label: "Goals", unit: "GLS" },
    { column: "assists", label: "Assists", unit: "AST" },
  ],
  // Cricket boards are computed from per-match figures instead — see getCricketLeaders.
  ipl: [],
  bbl: [],
  cwc: [],
  t20wc: [],
  test: [],
  odi: [],
  t20i: [],
  wpl: [],
  wbbl: [],
  wcwc: [],
  wt20wc: [],
  wodi: [],
  wt20i: [],
  laliga: [
    { column: "goals", label: "Goals", unit: "GLS" },
    { column: "assists", label: "Assists", unit: "AST" },
  ],
  bundesliga: [
    { column: "goals", label: "Goals", unit: "GLS" },
    { column: "assists", label: "Assists", unit: "AST" },
  ],
  seriea: [
    { column: "goals", label: "Goals", unit: "GLS" },
    { column: "assists", label: "Assists", unit: "AST" },
  ],
  // Summed from box scores (see scripts/lib/boxscore-season-stats.ts).
  ucl: [
    { column: "goals", label: "Goals", unit: "GLS" },
    { column: "assists", label: "Assists", unit: "AST" },
  ],
};

const LEADER_COLUMNS = new Set(Object.values(LEADER_CATEGORIES).flatMap((cats) => cats.map((c) => c.column)));

// Every column here is a season total (or season average, for NBA) sourced from
// player_season_stats, which now holds many years of history per player — so this
// must pin to the most recent season, or it'd silently pick whichever of a player's
// seasons on file happened to be their best, mixed arbitrarily across different players.
// `season` pins a specific year (the off-season recap wants the season just played,
// not the new one whose zero rows may already exist); default is the latest on file.
export async function getLeaders(league: League, column: string, limit = 10, season?: number): Promise<LeaderRow[]> {
  if (!LEADER_COLUMNS.has(column)) throw new Error(`Unknown leader column: ${column}`);
  // A per-game average is only a leader-board figure once the player has played a
  // qualifying share of the season (the NBA's own rule is 70% of games, 58 of 82):
  // without it a ten-game injury season outranks a full one. The threshold follows
  // the most games anyone has played so far, so it tracks the season as it goes.
  const qualifier = column.endsWith("_avg")
    ? `and pss.games_played >= ceil(0.7 * (select max(games_played) from player_season_stats q where q.league = pss.league and q.season = pss.season))`
    : "";
  const { rows } = await pool.query(
    `select pss.player_espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url,
            t.name as team_name, t.slug as team_slug, pss.${column} as value
     from player_season_stats pss
     join players p on p.league = pss.league and p.espn_id = pss.player_espn_id
     left join teams t on t.league = pss.league and t.espn_id = pss.team_espn_id
     where pss.league = $1 and pss.${column} is not null and ${notPseudoAthleteSql()}
       and pss.season = coalesce($3, (select max(season) from player_season_stats where league = $1))
       ${qualifier}
     order by pss.${column} desc
     limit $2`,
    [league, limit, season ?? null]
  );
  return rows;
}

// The season the Leaders page's boards are for — same "most recent season on file"
// pin `getLeaders` uses, surfaced so the page can label itself unambiguously instead
// of leaving the reader to guess what time window these totals cover.
export async function getLeadersSeason(league: League): Promise<number | null> {
  const { rows } = await pool.query(`select max(season) as season from player_season_stats where league = $1`, [league]);
  return rows[0]?.season ?? null;
}

// Cricket has no season-totals feed; its boards are summed from the per-match
// batting and bowling figures for the most recent season on record.
export const CRICKET_LEADER_CATEGORIES: { key: "runs" | "wickets" | "sixes"; label: string; unit: string }[] = [
  { key: "runs", label: "Runs", unit: "RUNS" },
  { key: "wickets", label: "Wickets", unit: "WKTS" },
  { key: "sixes", label: "Sixes", unit: "6s" },
];

export async function getCricketLeadersSeason(league: League): Promise<number | null> {
  const { rows } = await pool.query(
    `select max(g.season_year) as season from player_game_stats s
     join games g on g.league = s.league and g.espn_id = s.game_espn_id
     where s.league = $1`,
    [league]
  );
  return rows[0]?.season ?? null;
}

export async function getCricketLeaders(league: League, key: "runs" | "wickets" | "sixes", season: number, limit = 10): Promise<LeaderRow[]> {
  const expr =
    key === "runs"
      ? "coalesce(sum((s.stats->'batting'->>'runs')::int), 0)"
      : key === "wickets"
        ? "coalesce(sum((s.stats->'bowling'->>'wickets')::int), 0)"
        : "coalesce(sum((s.stats->'batting'->>'sixes')::int), 0)";
  // The team is the one the player represented in that season's matches (the most
  // frequent team on their scorecards), not whatever the players table currently
  // holds, so a player who has since moved is credited to the right side.
  const { rows } = await pool.query(
    `with totals as (
       select s.player_espn_id, ${expr} as value,
              mode() within group (order by s.team_espn_id) as team_espn_id
       from player_game_stats s
       join games g on g.league = s.league and g.espn_id = s.game_espn_id
       where s.league = $1 and g.season_year = $2
       group by s.player_espn_id
       having ${expr} > 0
     )
     select x.player_espn_id, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url, t.name as team_name, t.slug as team_slug, x.value
     from totals x
     join players p on p.league = $1 and p.espn_id = x.player_espn_id
     left join teams t on t.league = $1 and t.espn_id = x.team_espn_id
     order by x.value desc, p.name asc
     limit $3`,
    [league, season, limit]
  );
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

export interface RosterPlayer {
  espn_id: string;
  name: string;
  slug: string;
  position: string | null;
  jersey: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  headshot_url: string | null;
  is_captain: boolean | null;
  is_wicketkeeper: boolean | null;
}

// "On the roster" means listed in the team's latest roster fetch. A team with no
// roster fetch at all (a club that dropped out of the league years ago) keeps every
// player last seen with it, which is the best record there is.
export const ON_ROSTER_SQL = `(select max(roster_seen_at) from players r where r.league = p.league and r.team_espn_id = p.team_espn_id) is null
       or p.roster_seen_at >= (select max(roster_seen_at) from players r where r.league = p.league and r.team_espn_id = p.team_espn_id) - interval '3 days'`;

export async function getTeamRoster(league: League, teamEspnId: string): Promise<RosterPlayer[]> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, p.position, p.jersey, p.height, p.weight, p.age, coalesce(p.headshot_url, p.photo_url) as headshot_url, p.is_captain, p.is_wicketkeeper
     from players p where p.league = $1 and p.team_espn_id = $2 and ${notPseudoAthleteSql()} and (${ON_ROSTER_SQL})
     order by p.is_captain desc nulls last, p.position, p.name`,
    [league, teamEspnId]
  );
  return rows;
}

export interface InjuryRow {
  player_espn_id: string;
  player_name: string;
  status: string;
  short_comment: string | null;
  long_comment: string | null;
  reported_date: string | null;
}

// Real injury reports from ESPN's own /injuries endpoint (see fetch-injuries.ts) —
// only NBA/NFL/EPL/La Liga have one; cricket has no equivalent at all.
export async function getTeamInjuries(league: League, teamEspnId: string): Promise<InjuryRow[]> {
  const { rows } = await pool.query(
    `select player_espn_id, player_name, status, short_comment, long_comment, reported_date
     from injuries where league = $1 and team_espn_id = $2
     order by reported_date desc nulls last`,
    [league, teamEspnId]
  );
  return rows;
}

// The full game log behind a player profile: every box-score row with the game's
// context from the player's side (their team that day, the opponent, home or away,
// the result). One query; everything on the profile is derived from it in memory.
export async function getPlayerLog(league: League, playerEspnId: string): Promise<PlayerLogRow[]> {
  return fetchPlayerLog(pool, league, playerEspnId);
}

// ESPN's games played per season for an NFL or NBA player (empty for every other league): the log only
// holds games in which the player had a stat line, so it undercounts games played. It also says which seasons
// have a stored ESPN row with no stat but games.
export async function getPlayerReportedGames(league: League, playerEspnId: string): Promise<ReportedGames> {
  return fetchReportedGames(pool, league, playerEspnId);
}

// ESPN's whole-season line per season for an NBA player (empty for every other league), from the stored
// season row: what a season's figures show where the game rows are short of ESPN's games.
export async function getPlayerEspnSeasons(league: League, playerEspnId: string): Promise<Map<number, EspnSeasonTotals>> {
  return fetchEspnSeasons(pool, league, playerEspnId);
}

// Clock of every goal this player scored in the stored match reports for the given
// games (own goals excluded). Only games with a stored report count, so callers
// should say how many of the player's games that covers.
export async function getPlayerGoalClocks(league: League, playerEspnId: string, gameIds: string[]): Promise<{ clocks: string[]; reports: number }> {
  if (gameIds.length === 0) return { clocks: [], reports: 0 };
  const { rows } = await pool.query(
    `select gd.game_espn_id, e->>'clock' as clock
     from game_details gd
     left join lateral jsonb_array_elements(gd.details->'events') e
       on e->>'type' in ('goal', 'penalty') and e->'players'->0->>'id' = $3
     where gd.league = $1 and gd.game_espn_id = any($2)`,
    [league, gameIds, playerEspnId]
  );
  const reports = new Set(rows.map((r) => r.game_espn_id as string)).size;
  return { clocks: rows.map((r) => r.clock as string | null).filter((c): c is string => Boolean(c)), reports };
}

export interface PlayerSeasonStats {
  season: number;
  categories: Record<string, { labels: string[]; values: string[] }>;
}

export async function getPlayerSeasonStats(league: League, playerEspnId: string): Promise<PlayerSeasonStats | null> {
  const { rows } = await pool.query(
    `select season, categories from player_season_stats where league = $1 and player_espn_id = $2 order by season desc limit 1`,
    [league, playerEspnId]
  );
  return rows[0] ?? null;
}

export async function getPlayerSeasonStatsBySeason(
  league: League,
  playerEspnId: string,
  season: number
): Promise<PlayerSeasonStats | null> {
  const { rows } = await pool.query(
    `select season, categories from player_season_stats where league = $1 and player_espn_id = $2 and season = $3`,
    [league, playerEspnId, season]
  );
  return rows[0] ?? null;
}

// Every season this player has stats for, most recent first — powers the year-toggle
// tabs on the player page. Up to 10 years of backfilled history plus the live season.
export async function getPlayerSeasons(league: League, playerEspnId: string): Promise<number[]> {
  const { rows } = await pool.query(
    `select distinct season from player_season_stats where league = $1 and player_espn_id = $2 order by season desc`,
    [league, playerEspnId]
  );
  return rows.map((r) => r.season as number);
}

export type TopGamesWindow = "today" | "30d" | "quarter" | "alltime";

export const TOP_GAMES_WINDOWS: { key: TopGamesWindow; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "30d", label: "Last 30 Days" },
  { key: "quarter", label: "This Quarter" },
  { key: "alltime", label: "All-Time" },
];

const WINDOW_INTERVAL: Record<TopGamesWindow, string | null> = {
  today: "1 day",
  "30d": "30 days",
  quarter: "90 days",
  alltime: null,
};

export interface TopGameRow extends GameRow {
  views: number;
}

export interface TopGamesFilter {
  country?: string; // ISO country code from real visitor geolocation, e.g. "US", "GB", "IN"
  platform?: "ios" | "android" | "desktop";
}

// Ranked by real page views on our own match-detail pages (see the ViewTracker
// component and /api/track-view) — the same way an App Store chart is built from
// actual usage, not an editorial guess. Empty until the site has real traffic.
// Country/platform come from the visitor's own request (IP geolocation, User-Agent),
// not from any app store's own trending data — there's no free API for that.
export async function getTopGames(window: TopGamesWindow, filter: TopGamesFilter = {}, limit = 10): Promise<TopGameRow[]> {
  const interval = WINDOW_INTERVAL[window];
  const { rows } = await pool.query(
    `select g.league, g.espn_id, g.date, g.name, g.short_name, g.home_score, g.away_score,
            g.home_score_display, g.away_score_display, g.home_winner, g.away_winner, g.season_year,
            g.status_state, g.status_detail, g.status_summary, g.round, g.completed,
            g.home_team_espn_id, g.away_team_espn_id,
            ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
            at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color,
            v.views
     from (
       select league, game_espn_id, count(*) as views
       from game_views
       where ($2::interval is null or viewed_at > now() - $2::interval)
         and ($3::text is null or country = $3)
         and ($4::text is null or platform = $4)
       group by league, game_espn_id
       order by count(*) desc
       limit $1
     ) v
     join games g on g.league = v.league and g.espn_id = v.game_espn_id
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     order by v.views desc`,
    [limit, interval, filter.country ?? null, filter.platform ?? null]
  );
  return rows;
}

// Every country we've actually seen real traffic from, most-viewed first — powers the
// country picker with only options that mean something, instead of a static list of
// countries we may have zero data for.
export async function getTrackedCountries(): Promise<{ country: string; views: number }[]> {
  const { rows } = await pool.query(
    `select country, count(*) as views from game_views where country is not null group by country order by views desc`
  );
  return rows;
}

// External trending signals — real ones (Wikipedia pageview spikes, Apple's App Store
// Sports top charts), unlike game_views above which only reflects traffic to SportsDB
// itself. See scripts/fetch-trending-*.ts for how each is fetched; wikipedia is also
// matched against our own players/teams (app_store_ios isn't — an app isn't a player
// or team). Google Trends' daily list was tried and dropped: only 10 general-topic
// items/day/country meant most countries were sports-empty most days, and a
// category=sports param that looked like a filter turned out to be silently ignored
// (verified: identical results with and without it).
export type TrendingSource = "wikipedia" | "app_store_ios";

export interface TrendingTopic {
  rank: number;
  label: string;
  detail: string | null;
  url: string;
  image_url: string | null;
  matched_league: League | null;
  matched_type: "player" | "team" | null;
  matched_slug: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
}

// A fixed list rather than "every country we've fetched" — these sources cover a
// specific set of countries by design (see the fetch scripts), and offering only
// what's actually fetched avoids a picker full of dead-end selections.
export const TRENDING_COUNTRIES: { code: string; label: string }[] = [
  { code: "global", label: "Global" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "AU", label: "Australia" },
  { code: "ES", label: "Spain" },
  { code: "BR", label: "Brazil" },
];

// The App Store is inherently per-country (no "worldwide" chart to fetch), so
// "Global" falls back to US data for it; Wikipedia's "global" is a real fetch (the
// English edition), so it's left as-is.
export async function getTrendingTopics(source: TrendingSource, country: string): Promise<TrendingTopic[]> {
  const effectiveCountry = country === "global" && source !== "wikipedia" ? "US" : country;
  const { rows } = await pool.query(
    `select t.rank, t.label, t.detail, t.url, t.image_url, t.matched_league, t.matched_type, t.matched_slug,
            coalesce(p.headshot_url, p.photo_url, tm.logo_url) as avatar_url,
            tm.color as avatar_color
     from trending_topics t
     left join players p on t.matched_type = 'player' and p.league = t.matched_league and p.slug = t.matched_slug
     left join teams tm on t.matched_type = 'team' and tm.league = t.matched_league and tm.slug = t.matched_slug
     where t.source = $1 and t.country = $2
     order by t.rank asc`,
    [source, effectiveCountry]
  );
  if (source !== "app_store_ios") return rows;
  // Sportsbook and casino apps are left out, and the rest renumbered; the page says so.
  return (rows as TrendingTopic[]).filter((t) => !isBettingApp(t.label, t.detail)).map((t, i) => ({ ...t, rank: i + 1 }));
}

export function matchedTopicHref(topic: TrendingTopic): string | null {
  if (!topic.matched_league || !topic.matched_type || !topic.matched_slug) return null;
  return `/${topic.matched_league}/${topic.matched_type === "player" ? "players" : "teams"}/${topic.matched_slug}`;
}

export interface CricketCareerStats {
  matches: number;
  inningsBatted: number;
  runs: number;
  ballsFaced: number;
  notOuts: number;
  hundreds: number;
  fifties: number;
  highestScore: number | null;
  average: number | null;
  strikeRate: number | null;
  inningsBowled: number;
  overs: number;
  runsConceded: number;
  wickets: number;
  economy: number | null;
  fiveWicketHauls: number;
  catches: number;
}

// One row per innings a player batted or bowled in. A Test stores its innings as a
// list beside the match totals; a limited-overs match is its own single innings.
const CRICKET_INNINGS = `cross join lateral jsonb_array_elements(coalesce(pgs.stats->'innings', jsonb_build_array(pgs.stats))) as inn`;

// Computed fresh from every backfilled match's per-player figures (see
// backfill-cricket-player-stats.ts) rather than a maintained running total — always
// correct, and re-running the backfill can never double-count. Only covers whichever
// cricket competitions we've backfilled (IPL, Big Bash, World Cups, and every men's
// ODI/T20I from Cricsheet plus ESPN, and men's Tests since 2015 from ESPN). Figures are per
// competition: a player's Test, ODI and T20I careers are separate pages.
export async function getPlayerCricketCareer(league: League, playerEspnId: string): Promise<CricketCareerStats | null> {
  if (!isCricketLeague(league)) return null;
  const { rows } = await pool.query(
    `select
       count(distinct pgs.game_espn_id) as matches,
       count(*) filter (where inn->'batting' is not null) as innings_batted,
       coalesce(sum((inn->'batting'->>'runs')::int), 0) as runs,
       coalesce(sum((inn->'batting'->>'ballsFaced')::int), 0) as balls_faced,
       coalesce(sum((inn->'batting'->>'runs')::int) filter (where inn->'batting'->>'ballsFaced' is not null), 0) as runs_with_balls,
       count(*) filter (where (inn->'batting'->>'notOut')::boolean is true) as not_outs,
       count(*) filter (where (inn->'batting'->>'runs')::int >= 100) as hundreds,
       count(*) filter (where (inn->'batting'->>'runs')::int >= 50 and (inn->'batting'->>'runs')::int < 100) as fifties,
       max((inn->'batting'->>'runs')::int) as highest_score,
       count(*) filter (where inn->'bowling' is not null) as innings_bowled,
       coalesce(sum(floor((inn->'bowling'->>'overs')::numeric) * coalesce((inn->'bowling'->>'bpo')::int, 6) + round(((inn->'bowling'->>'overs')::numeric % 1) * 10)), 0) as balls_bowled,
       coalesce(sum((inn->'bowling'->>'conceded')::int), 0) as runs_conceded,
       coalesce(sum((inn->'bowling'->>'wickets')::int), 0) as wickets,
       count(*) filter (where (inn->'bowling'->>'wickets')::int >= 5) as five_fors,
       (select coalesce(sum((c.stats->>'catches')::int), 0) from player_game_stats c where c.league = $1 and c.player_espn_id = $2) as catches
     from player_game_stats pgs
     ${CRICKET_INNINGS}
     where pgs.league = $1 and pgs.player_espn_id = $2`,
    [league, playerEspnId]
  );
  const r = rows[0];
  if (!r || Number(r.matches) === 0) return null;

  const inningsBatted = Number(r.innings_batted);
  const notOuts = Number(r.not_outs);
  const runs = Number(r.runs);
  const ballsFaced = Number(r.balls_faced);
  // Written the cricket way: 12.3 is twelve overs and three balls.
  const ballsBowled = Number(r.balls_bowled);
  const overs = Number(`${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`);
  const runsConceded = Number(r.runs_conceded);
  const dismissals = inningsBatted - notOuts;

  return {
    matches: Number(r.matches),
    inningsBatted,
    runs,
    ballsFaced,
    notOuts,
    hundreds: Number(r.hundreds),
    fifties: Number(r.fifties),
    highestScore: r.highest_score === null ? null : Number(r.highest_score),
    average: dismissals > 0 ? runs / dismissals : null,
    // Only over the innings whose balls faced were recorded; older scorecards have none.
    strikeRate: ballsFaced > 0 ? (Number(r.runs_with_balls) / ballsFaced) * 100 : null,
    inningsBowled: Number(r.innings_bowled),
    overs,
    runsConceded,
    wickets: Number(r.wickets),
    economy: ballsBowled > 0 ? (runsConceded / ballsBowled) * 6 : null,
    fiveWicketHauls: Number(r.five_fors),
    catches: Number(r.catches),
  };
}

export type CricketSplitDimension = "team" | "opponent" | "venue";

export const CRICKET_SPLIT_DIMENSIONS: { key: CricketSplitDimension; label: string }[] = [
  { key: "team", label: "By Team" },
  { key: "opponent", label: "By Opponent" },
  { key: "venue", label: "By Venue" },
];

export interface CricketSplitRow {
  key: string;
  label: string;
  slug: string | null;
  matches: number;
  runs: number;
  wickets: number;
}

export async function getPlayerCricketSplits(
  league: League,
  playerEspnId: string,
  dimension: CricketSplitDimension
): Promise<CricketSplitRow[]> {
  if (dimension === "venue") {
    const { rows } = await pool.query(
      `select g.venue as key, g.venue as label, count(distinct pgs.game_espn_id) as matches,
              coalesce(sum((pgs.stats->'batting'->>'runs')::int), 0) as runs,
              coalesce(sum((pgs.stats->'bowling'->>'wickets')::int), 0) as wickets
       from player_game_stats pgs
       join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
       where pgs.league = $1 and pgs.player_espn_id = $2 and g.venue is not null
       group by g.venue
       order by runs desc`,
      [league, playerEspnId]
    );
    return rows.map((r) => ({ ...r, slug: null }));
  }

  const teamIdExpr =
    dimension === "opponent"
      ? `case when pgs.team_espn_id = g.home_team_espn_id then g.away_team_espn_id else g.home_team_espn_id end`
      : `pgs.team_espn_id`;

  const { rows } = await pool.query(
    `select t.espn_id as key, t.name as label, t.slug as slug, count(distinct pgs.game_espn_id) as matches,
            coalesce(sum((pgs.stats->'batting'->>'runs')::int), 0) as runs,
            coalesce(sum((pgs.stats->'bowling'->>'wickets')::int), 0) as wickets
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     join teams t on t.league = $1 and t.espn_id = (${teamIdExpr})
     where pgs.league = $1 and pgs.player_espn_id = $2
     group by t.espn_id, t.name, t.slug
     order by runs desc`,
    [league, playerEspnId]
  );
  return rows;
}

export interface CenturyRow {
  player_espn_id: string;
  player_name: string;
  player_slug: string;
  headshot_url: string | null;
  team_name: string;
  team_slug: string;
  team_logo: string | null;
  team_color: string | null;
  opponent_name: string;
  opponent_slug: string;
  runs: number;
  /** Null where the scorecard did not record them (most matches before the 1990s). */
  balls_faced: number | null;
  fours: number | null;
  sixes: number | null;
  not_out: boolean;
  date: string;
  venue: string | null;
  round: string | null;
  status_summary: string | null;
}

// Every century (100+ runs in an innings) on record for one cricket competition,
// computed fresh from the backfilled per-match batting figures — not a maintained
// list, so it's always consistent with whatever games are actually in the database.
export async function getCricketCenturies(league: League): Promise<CenturyRow[]> {
  const { rows } = await pool.query(
    `select p.espn_id as player_espn_id, p.name as player_name, p.slug as player_slug, coalesce(p.headshot_url, p.photo_url) as headshot_url,
            t.name as team_name, t.slug as team_slug, t.logo_url as team_logo, t.color as team_color,
            ot.name as opponent_name, ot.slug as opponent_slug,
            (inn->'batting'->>'runs')::int as runs,
            (inn->'batting'->>'ballsFaced')::int as balls_faced,
            (inn->'batting'->>'fours')::int as fours,
            (inn->'batting'->>'sixes')::int as sixes,
            coalesce((inn->'batting'->>'notOut')::boolean, false) as not_out,
            g.date, g.venue, g.round, g.status_summary
     from player_game_stats pgs
     ${CRICKET_INNINGS}
     join players p on p.league = $1 and p.espn_id = pgs.player_espn_id
     join teams t on t.league = $1 and t.espn_id = pgs.team_espn_id
     join games g on g.league = $1 and g.espn_id = pgs.game_espn_id
     join teams ot on ot.league = $1
       and ot.espn_id = (case when pgs.team_espn_id = g.home_team_espn_id then g.away_team_espn_id else g.home_team_espn_id end)
     where pgs.league = $1 and (inn->'batting'->>'runs')::int >= 100
     order by g.date desc, runs desc`,
    [league]
  );
  return rows;
}

export async function getLastUpdated(): Promise<string | null> {
  const { rows } = await pool.query(`select max(updated_at) as updated_at from games`);
  return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
}

export interface SearchResult {
  /** A cricket series result carries league "cricket" and the series' ESPN id as its slug. */
  type: "team" | "player" | "series";
  // Not actually always a `League` — the underlying query has no league filter, so
  // this also returns tennis tours ('atp'/'wta') and F1 ('f1'), neither of which are
  // `League` values. Widened to string so callers don't get a false sense of safety
  // from a type assertion the query never actually enforced.
  league: string;
  name: string;
  slug: string;
  subtitle: string | null;
  image: string | null;
}

export async function search(query: string, limit = 20): Promise<SearchResult[]> {
  const like = `%${query}%`;
  const { rows } = await pool.query(
    `select 'team' as type, league, name, slug, abbreviation as subtitle, logo_url as image
     from teams where name ilike $1
     union all
     select 'player' as type, p.league, p.name, p.slug, t.name as subtitle, coalesce(p.headshot_url, p.photo_url) as image
     from players p left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.name ilike $1 and ${notPseudoAthleteSql()}
     union all
     -- Every cricket series and tournament in the database, current or past (Ranji Trophy, PSL, a bilateral tour).
     select 'series' as type, 'cricket' as league, s.name, s.espn_id as slug,
            nullif(concat_ws(' · ', case s.kind when 'other' then 'Youth, A-team and other' when 'womens-international' then 'Women''s international'
                                                 when 'womens-domestic' then 'Women''s domestic' else initcap(s.kind) end,
                                    to_char(s.start_date, 'YYYY')), '') as subtitle,
            null as image
     from cricket_series s
     where (s.name ilike $1 or s.short_name ilike $1 or s.abbreviation ilike $1) and ${seriesHasPlaySql("s")}
     limit $2`,
    [like, limit]
  );
  return rows;
}
