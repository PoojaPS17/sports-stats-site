// Cross-links that tie the deep pages together: teammates and position peers on
// a player page, most-faced rivals and top players on a team page. Each helper is
// one indexed query against the latest season's stats, cheap enough to run on
// every render.
import { pool } from "./db";
import { isSoccerLeague, type League } from "./leagues";
import { ON_ROSTER_SQL } from "./queries";

export interface RelatedLink {
  href: string;
  label: string;
  sub?: string | null;
  image?: string | null;
  imageName?: string;
}

interface SeasonMetricRow {
  slug: string;
  name: string;
  position: string | null;
  headshot_url: string | null;
  team_name: string | null;
  team_slug: string | null;
  goals: number | null;
  assists: number | null;
  pts_avg: string | null;
  passing_yards: number | null;
  rushing_yards: number | null;
  receiving_yards: number | null;
}

// How players are ranked for "teammates" and "peers": the season stat a reader of
// that league would rank them by.
function metricSql(league: League): string {
  if (isSoccerLeague(league)) return "coalesce(ps.goals, 0) * 2 + coalesce(ps.assists, 0)";
  if (league === "nba") return "coalesce(ps.pts_avg, 0)";
  if (league === "nfl") return "coalesce(ps.passing_yards, 0) + coalesce(ps.rushing_yards, 0) + coalesce(ps.receiving_yards, 0)";
  return "0";
}

function metricText(league: League, r: SeasonMetricRow): string | null {
  if (isSoccerLeague(league)) return r.goals == null && r.assists == null ? null : `${r.goals ?? 0} G · ${r.assists ?? 0} A`;
  if (league === "nba") return r.pts_avg == null ? null : `${Number(r.pts_avg).toFixed(1)} PPG`;
  if (league === "nfl") {
    const best = [
      ["passing", r.passing_yards ?? 0],
      ["rushing", r.rushing_yards ?? 0],
      ["receiving", r.receiving_yards ?? 0],
    ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    return Number(best[1]) > 0 ? `${Number(best[1]).toLocaleString("en-US")} ${best[0]} yds` : null;
  }
  return null;
}

const SEASON_JOIN = `left join player_season_stats ps on ps.league = p.league and ps.player_espn_id = p.espn_id
                       and ps.season = (select max(season) from player_season_stats where league = p.league)`;
const SELECT = `select p.slug, p.name, p.position, coalesce(p.headshot_url, p.photo_url) as headshot_url, t.name as team_name, t.slug as team_slug,
                       ps.goals, ps.assists, ps.pts_avg, ps.passing_yards, ps.rushing_yards, ps.receiving_yards`;

function toLink(league: League, r: SeasonMetricRow, withTeam: boolean): RelatedLink {
  const bits = [r.position, metricText(league, r), withTeam ? r.team_name : null].filter(Boolean);
  return { href: `/${league}/players/${r.slug}`, label: r.name, sub: bits.join(" · ") || null, image: r.headshot_url, imageName: r.name };
}

/** Current squad-mates, best season first. */
export async function getTeammates(league: League, teamEspnId: string, excludeEspnId: string, limit = 8): Promise<RelatedLink[]> {
  const { rows } = await pool.query<SeasonMetricRow>(
    `${SELECT}
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     ${SEASON_JOIN}
     where p.league = $1 and p.team_espn_id = $2 and p.espn_id <> $3 and (${ON_ROSTER_SQL})
     order by ${metricSql(league)} desc, p.name
     limit $4`,
    [league, teamEspnId, excludeEspnId, limit]
  );
  return rows.map((r) => toLink(league, r, false));
}

export interface TeamChip {
  espn_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  color: string | null;
}

/** Teams with a game in the league's latest season — the current membership, not every club on record. */
export async function getCurrentSeasonTeams(league: League): Promise<TeamChip[]> {
  const { rows } = await pool.query(
    `select t.espn_id, t.slug, t.name, t.logo_url, t.color
     from teams t
     where t.league = $1 and exists (
       select 1 from games g where g.league = t.league and (g.home_team_espn_id = t.espn_id or g.away_team_espn_id = t.espn_id)
         and g.season_year = (select max(season_year) from games where league = t.league)
     )
     order by t.name`,
    [league]
  );
  return rows;
}

// NFL positions are ranked within their stat family; a linebacker has no season
// yards to rank by, so those positions get no peer list rather than a random one.
const NFL_PEER_GROUPS: Record<string, string[]> = { QB: ["QB"], RB: ["RB", "FB"], FB: ["RB", "FB"], WR: ["WR", "TE"], TE: ["WR", "TE"] };

/** The league's leading players at the same position this season. */
export async function getPositionPeers(league: League, position: string | null | undefined, excludeEspnId: string, limit = 8): Promise<RelatedLink[]> {
  if (!position || metricSql(league) === "0") return [];
  const positions = league === "nfl" ? NFL_PEER_GROUPS[position] : [position];
  if (!positions) return [];
  const { rows } = await pool.query<SeasonMetricRow>(
    `${SELECT}
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     ${SEASON_JOIN}
     where p.league = $1 and p.position = any($2) and p.espn_id <> $3 and ${metricSql(league)} > 0
     order by ${metricSql(league)} desc, p.name
     limit $4`,
    [league, positions, excludeEspnId, limit]
  );
  return rows.map((r) => toLink(league, r, true));
}

/** The team's best players this season, for the team page. */
export async function getTeamTopPlayers(league: League, teamEspnId: string, season: number | null = null, limit = 6): Promise<RelatedLink[]> {
  if (metricSql(league) === "0") return [];
  // A past season ranks the players who were on the team's stat line that year,
  // whoever they play for now.
  const { rows } = await pool.query<SeasonMetricRow>(
    `${SELECT}
     from players p
     left join teams t on t.league = p.league and t.espn_id = p.team_espn_id
     join player_season_stats ps on ps.league = p.league and ps.player_espn_id = p.espn_id
       and ps.season = coalesce($3::int, (select max(season) from player_season_stats where league = p.league))
     where p.league = $1 and ps.team_espn_id = $2 and ${metricSql(league)} > 0
     order by ${metricSql(league)} desc, p.name
     limit $4`,
    [league, teamEspnId, season, limit]
  );
  return rows.map((r) => toLink(league, r, false));
}

export interface OpponentCount {
  espn_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  games: number;
}

/** Opponents met most often on record, for head-to-head links. */
export async function getMostFacedOpponents(league: League, teamEspnId: string, limit = 8): Promise<OpponentCount[]> {
  const { rows } = await pool.query(
    `select t.espn_id, t.slug, t.name, t.logo_url, count(*)::int as games
     from games g
     join teams t on t.league = g.league and t.espn_id = case when g.home_team_espn_id = $2 then g.away_team_espn_id else g.home_team_espn_id end
     where g.league = $1 and g.completed and (g.home_team_espn_id = $2 or g.away_team_espn_id = $2)
     group by t.espn_id, t.slug, t.name, t.logo_url
     order by games desc, t.name
     limit $3`,
    [league, teamEspnId, limit]
  );
  return rows;
}
