import { pool } from "./db";

export type League = "nba" | "nfl" | "epl" | "ipl";
export const LEAGUES: League[] = ["epl", "nfl", "nba", "ipl"];
export const LEAGUE_LABEL: Record<League, string> = { nba: "NBA", nfl: "NFL", epl: "Premier League", ipl: "IPL" };

export function isLeague(value: string): value is League {
  return LEAGUES.includes(value as League);
}

// ESPN labels a season by its *ending* year for NBA ("2023" = the 2022-23 season) but
// by its *starting* year for NFL/EPL/IPL ("2024" = the 2024 NFL season / 2024-25 EPL
// season / 2024 IPL season). Render the conventional human label for each.
export function formatSeasonLabel(league: League, year: number | null): string | null {
  if (!year) return null;
  if (league === "nba") return `${year - 1}-${String(year).slice(2)}`;
  if (league === "epl") return `${year}-${String(year + 1).slice(2)}`;
  return String(year);
}

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
  completed: boolean;
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
}

const GAME_SELECT = `
  select
    g.league, g.espn_id, g.date, g.name, g.short_name, g.home_score, g.away_score,
    g.home_score_display, g.away_score_display, g.home_winner, g.away_winner, g.season_year,
    g.status_state, g.status_detail, g.status_summary, g.round, g.completed,
    g.home_team_espn_id, g.away_team_espn_id,
    ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
    at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color
  from games g
  join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
  join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
`;

export async function getGameByEspnId(league: League, espnId: string): Promise<GameRow | null> {
  const { rows } = await pool.query(`${GAME_SELECT} where g.league = $1 and g.espn_id = $2`, [league, espnId]);
  return rows[0] ?? null;
}

export async function getGamesByDate(league: League, dateISO: string): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT} where g.league = $1 and g.date::date = $2::date order by g.date asc`,
    [league, dateISO]
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
}

const STANDING_SELECT = `
  select s.season, s.team_espn_id, t.name, t.slug, t.abbreviation, t.logo_url, t.color,
         s.conference, s.wins, s.losses, s.win_percent, s.streak, s.playoff_seed,
         s.draws, s.points, s.goals_for, s.goals_against, s.no_result, s.net_run_rate
  from standings s
  join teams t on t.league = s.league and t.espn_id = s.team_espn_id
`;
const STANDING_ORDER = `order by s.conference, s.points desc nulls last, s.net_run_rate desc nulls last, s.wins desc, s.losses asc`;

// The `standings` table now holds every backfilled historical season too, so this
// must pin to the most recent one rather than returning every season's rows mixed
// together.
export async function getStandings(league: League): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `${STANDING_SELECT}
     where s.league = $1 and s.season = (select max(season) from standings where league = $1)
     ${STANDING_ORDER}`,
    [league]
  );
  return rows;
}

export async function getStandingsBySeason(league: League, season: number): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `${STANDING_SELECT} where s.league = $1 and s.season = $2 ${STANDING_ORDER}`,
    [league, season]
  );
  return rows;
}

// Every season with a standings table on file, most recent first — powers the
// year-toggle tabs on the standings page.
export async function getStandingsSeasons(league: League): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season from standings where league = $1 order by season desc`, [league]);
  return rows.map((r) => r.season as number);
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
}

export async function getPlayerBySlug(league: League, slug: string): Promise<PlayerRow | null> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, p.headshot_url, p.team_espn_id,
            t.name as team_name, t.slug as team_slug, t.color as team_color
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league = $1 and p.slug = $2`,
    [league, slug]
  );
  return rows[0] ?? null;
}

// Batch-resolves espn_id -> slug for players who show up in a match's box score, so
// the box score can link to a player page only when we actually have one (most
// historical opponents in a decade-old game were never on a "current roster").
export async function getPlayerSlugsByEspnIds(league: League, espnIds: string[]): Promise<Map<string, string>> {
  if (espnIds.length === 0) return new Map();
  const { rows } = await pool.query(`select espn_id, slug from players where league = $1 and espn_id = any($2)`, [league, espnIds]);
  return new Map(rows.map((r) => [r.espn_id as string, r.slug as string]));
}

export async function getAllPlayers(league: League): Promise<PlayerRow[]> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, p.headshot_url, p.team_espn_id,
            t.name as team_name, t.slug as team_slug, t.color as team_color
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.league = $1
     order by p.name`,
    [league]
  );
  return rows;
}

export interface PlayerGameStatRow {
  game_espn_id: string;
  date: string;
  opponent_name: string;
  opponent_slug: string;
  opponent_logo: string | null;
  stats: Record<string, Record<string, string>>;
}

export async function getPlayerGameLog(league: League, playerEspnId: string): Promise<PlayerGameStatRow[]> {
  const { rows } = await pool.query(
    `select pgs.game_espn_id, g.date, pgs.stats,
            case when g.home_team_espn_id = pgs.team_espn_id then awt.name else hmt.name end as opponent_name,
            case when g.home_team_espn_id = pgs.team_espn_id then awt.slug else hmt.slug end as opponent_slug,
            case when g.home_team_espn_id = pgs.team_espn_id then awt.logo_url else hmt.logo_url end as opponent_logo
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     join teams hmt on hmt.league = g.league and hmt.espn_id = g.home_team_espn_id
     join teams awt on awt.league = g.league and awt.espn_id = g.away_team_espn_id
     where pgs.league = $1 and pgs.player_espn_id = $2
     order by g.date desc`,
    [league, playerEspnId]
  );
  return rows;
}

export interface TickerGame {
  league: League;
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
  status_state: string | null;
  date: string;
}

export async function getTickerGames(limit = 12): Promise<TickerGame[]> {
  const { rows } = await pool.query(
    `select g.league, g.date, g.completed, g.status_state,
            g.home_score, g.home_score_display, g.home_winner,
            g.away_score, g.away_score_display, g.away_winner,
            ht.name as home_name, ht.slug as home_slug,
            at.name as away_name, at.slug as away_slug
     from games g
     join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
     join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
     where g.date > now() - interval '3 days' and g.date < now() + interval '10 days'
     order by g.completed desc, g.date asc
     limit $1`,
    [limit]
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
     from news_articles where league = $1 order by published desc nulls last limit $2`,
    [league, limit]
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
  key: string;
  column?: string; // player_season_stats column, for the ESPN-season-endpoint path (nba only)
  gameLabel?: string; // stat label inside player_game_stats.stats[key], for the self-computed path
  label: string;
  unit: string;
}

export const LEADER_CATEGORIES: Record<League, LeaderCategory[]> = {
  nba: [
    { key: "points", column: "pts_avg", label: "Points", unit: "PPG" },
    { key: "rebounds", column: "reb_avg", label: "Rebounds", unit: "RPG" },
    { key: "assists", column: "ast_avg", label: "Assists", unit: "APG" },
  ],
  nfl: [
    { key: "passing", gameLabel: "YDS", label: "Passing Yards", unit: "YDS" },
    { key: "rushing", gameLabel: "YDS", label: "Rushing Yards", unit: "YDS" },
    { key: "receiving", gameLabel: "YDS", label: "Receiving Yards", unit: "YDS" },
  ],
  epl: [
    { key: "match", gameLabel: "G", label: "Goals", unit: "GLS" },
    { key: "match", gameLabel: "A", label: "Assists", unit: "AST" },
  ],
  // No per-player match data for cricket yet (ESPN's roster/boxscore endpoints
  // 404 for this competition) — scores and standings only for now.
  ipl: [],
};

const LEADER_COLUMNS = new Set(
  Object.values(LEADER_CATEGORIES)
    .flat()
    .map((c) => c.column)
    .filter((c): c is string => Boolean(c))
);

export async function getLeaders(league: League, column: string, limit = 10): Promise<LeaderRow[]> {
  if (!LEADER_COLUMNS.has(column)) throw new Error(`Unknown leader column: ${column}`);
  const { rows } = await pool.query(
    `select pss.player_espn_id, p.name, p.slug, p.headshot_url,
            t.name as team_name, t.slug as team_slug, pss.${column} as value
     from player_season_stats pss
     join players p on p.league = pss.league and p.espn_id = pss.player_espn_id
     left join teams t on t.league = pss.league and t.espn_id = pss.team_espn_id
     where pss.league = $1 and pss.${column} is not null
     order by pss.${column} desc
     limit $2`,
    [league, limit]
  );
  return rows;
}

const GAME_STAT_CATEGORY = new Set(Object.values(LEADER_CATEGORIES).flatMap((cats) => cats.map((c) => c.key)));

// ESPN's per-player season-stats endpoint lags the live season (it may not have a row
// for the in-progress year for days/weeks), so NFL leaders are computed directly from
// our own accumulated game logs instead — always accurate, no external lag.
export async function getLeadersFromGameLogs(
  league: League,
  category: string,
  label: string,
  limit = 10
): Promise<LeaderRow[]> {
  if (!GAME_STAT_CATEGORY.has(category)) throw new Error(`Unknown leader category: ${category}`);
  const { rows } = await pool.query(
    `select p.espn_id as player_espn_id, p.name, p.slug, p.headshot_url,
            t.name as team_name, t.slug as team_slug,
            sum(replace(pgs.stats->$2->>$3, ',', '')::numeric) as value
     from player_game_stats pgs
     join players p on p.league = pgs.league and p.espn_id = pgs.player_espn_id
     left join teams t on t.league = pgs.league and t.espn_id = pgs.team_espn_id
     where pgs.league = $1
       and (pgs.stats->$2->>$3) ~ '^[0-9,]+$'
     group by p.espn_id, p.name, p.slug, p.headshot_url, t.name, t.slug
     having sum(replace(pgs.stats->$2->>$3, ',', '')::numeric) > 0
     order by value desc
     limit $4`,
    [league, category, label, limit]
  );
  return rows;
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

export async function getTeamRoster(league: League, teamEspnId: string): Promise<RosterPlayer[]> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, position, jersey, height, weight, age, headshot_url, is_captain, is_wicketkeeper
     from players where league = $1 and team_espn_id = $2
     order by is_captain desc nulls last, position, name`,
    [league, teamEspnId]
  );
  return rows;
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

export async function getLastUpdated(): Promise<string | null> {
  const { rows } = await pool.query(`select max(updated_at) as updated_at from games`);
  return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
}

export interface SearchResult {
  type: "team" | "player";
  league: League;
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
     select 'player' as type, p.league, p.name, p.slug, t.name as subtitle, p.headshot_url as image
     from players p left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     where p.name ilike $1
     limit $2`,
    [like, limit]
  );
  return rows;
}
