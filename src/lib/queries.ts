import { pool } from "./db";

export type League = "nba" | "nfl" | "epl";
export const LEAGUES: League[] = ["epl", "nfl", "nba"];
export const LEAGUE_LABEL: Record<League, string> = { nba: "NBA", nfl: "NFL", epl: "Premier League" };

export function isLeague(value: string): value is League {
  return LEAGUES.includes(value as League);
}

export interface GameRow {
  league: League;
  espn_id: string;
  date: string;
  name: string;
  short_name: string | null;
  home_score: number | null;
  away_score: number | null;
  status_state: string | null;
  status_detail: string | null;
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
    g.status_state, g.status_detail, g.completed,
    g.home_team_espn_id, g.away_team_espn_id,
    ht.name as home_name, ht.slug as home_slug, ht.abbreviation as home_abbr, ht.logo_url as home_logo, ht.color as home_color,
    at.name as away_name, at.slug as away_slug, at.abbreviation as away_abbr, at.logo_url as away_logo, at.color as away_color
  from games g
  join teams ht on ht.league = g.league and ht.espn_id = g.home_team_espn_id
  join teams at on at.league = g.league and at.espn_id = g.away_team_espn_id
`;

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
}

export async function getStandings(league: League): Promise<StandingRow[]> {
  const { rows } = await pool.query(
    `select s.team_espn_id, t.name, t.slug, t.abbreviation, t.logo_url, t.color,
            s.conference, s.wins, s.losses, s.win_percent, s.streak, s.playoff_seed,
            s.draws, s.points, s.goals_for, s.goals_against
     from standings s
     join teams t on t.league = s.league and t.espn_id = s.team_espn_id
     where s.league = $1
     order by s.conference, s.points desc nulls last, s.wins desc, s.losses asc`,
    [league]
  );
  return rows;
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

export async function getTeamBySlug(league: League, slug: string): Promise<TeamRow | null> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, abbreviation, logo_url, color, alternate_color from teams where league = $1 and slug = $2`,
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

export async function getTeamGames(league: League, teamEspnId: string): Promise<GameRow[]> {
  const { rows } = await pool.query(
    `${GAME_SELECT}
     where g.league = $1 and (g.home_team_espn_id = $2 or g.away_team_espn_id = $2)
     order by g.date desc`,
    [league, teamEspnId]
  );
  return rows;
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
  away_name: string;
  away_slug: string;
  away_score: number | null;
  completed: boolean;
  status_state: string | null;
  date: string;
}

export async function getTickerGames(limit = 12): Promise<TickerGame[]> {
  const { rows } = await pool.query(
    `select g.league, g.date, g.completed, g.status_state, g.home_score, g.away_score,
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
}

export async function getTeamRoster(league: League, teamEspnId: string): Promise<RosterPlayer[]> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, position, jersey, height, weight, age, headshot_url
     from players where league = $1 and team_espn_id = $2
     order by position, name`,
    [league, teamEspnId]
  );
  return rows;
}

export async function getPlayerSeasonStats(
  league: League,
  playerEspnId: string
): Promise<{ season: number; categories: Record<string, { labels: string[]; values: string[] }> } | null> {
  const { rows } = await pool.query(
    `select season, categories from player_season_stats where league = $1 and player_espn_id = $2 order by season desc limit 1`,
    [league, playerEspnId]
  );
  return rows[0] ?? null;
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
