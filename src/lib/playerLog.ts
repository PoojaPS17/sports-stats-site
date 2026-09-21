import type { Pool } from "pg";
import { EspnSeasons, espnSeasonTotals, POSTSEASON_PREFIX, storedRowHasStats } from "./espnSeason";
import type { League } from "./leagues";
import { ReportedGames, type PlayerLogRow } from "./playerProfile";

/** SQL condition, true for a row of `rowAlias` (a player_game_stats alias) whose NBA game has no player with a
 * stat line: no numeric MIN (a decimal counts, as `cell()` in playerProfile.ts reads it) and no PTS from 1 up.
 * That is how a game ESPN published no box score for looks; `fetchPlayerLog` flags it and the sitemap's played
 * rule accepts it, so both use this one text. The caller adds the league test. */
export function noStatLineGameSql(rowAlias: string): string {
  return `not exists (
               select 1 from player_game_stats q
               where q.league = ${rowAlias}.league and q.game_espn_id = ${rowAlias}.game_espn_id
                 and (coalesce(q.stats->'box'->>'MIN', '') ~ '^[0-9]+([.][0-9]+)?$' or coalesce(q.stats->'box'->>'PTS', '') ~ '^[1-9]')
            )`;
}

/** Every completed box-score row for a player with the game's context from the player's side.
 * `no_box_score` is NBA only: true when nobody in the game has a real stat line (the NBA `played` rule in
 * playerProfile.ts: a numeric MIN, or PTS above zero), which is how a game ESPN published no box score for looks.
 * Takes the connection so the read-only audit script can use its own pool. */
export async function fetchPlayerLog(db: Pick<Pool, "query">, league: League, playerEspnId: string): Promise<PlayerLogRow[]> {
  const { rows } = await db.query(
    `select pgs.game_espn_id, g.date, g.season_year, g.round, g.week, g.stage, g.season_type, g.competition_type, pgs.stats,
            (g.home_team_espn_id = pgs.team_espn_id) as is_home, g.neutral_site,
            pgs.team_espn_id, tm.name as team_name, tm.slug as team_slug, tm.abbreviation as team_abbr, tm.logo_url as team_logo,
            op.espn_id as opponent_espn_id, op.name as opponent_name, op.slug as opponent_slug, op.abbreviation as opponent_abbr, op.logo_url as opponent_logo,
            case when g.home_team_espn_id = pgs.team_espn_id then g.home_score else g.away_score end as team_score,
            case when g.home_team_espn_id = pgs.team_espn_id then g.away_score else g.home_score end as opponent_score,
            case
              when not g.completed or g.home_score is null or g.away_score is null then null
              when g.home_score = g.away_score then 'D'
              when (g.home_team_espn_id = pgs.team_espn_id) = (g.home_score > g.away_score) then 'W'
              else 'L'
            end as result,
            (pgs.league = 'nba' and ${noStatLineGameSql("pgs")}) as no_box_score
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     join teams tm on tm.league = g.league and tm.espn_id = pgs.team_espn_id
     join teams op on op.league = g.league and op.espn_id = case when g.home_team_espn_id = pgs.team_espn_id then g.away_team_espn_id else g.home_team_espn_id end
     where pgs.league = $1 and pgs.player_espn_id = $2 and g.completed
     order by g.date desc`,
    [league, playerEspnId]
  );
  return rows;
}

/** ESPN's games played per season (season year to games) for an NFL or NBA player: the regular-season figure the
 * loader stores in player_season_stats. NFL box scores list only players with a stat line, and some NBA games
 * have no box score at all, so the log undercounts games played. Other leagues get an empty map without a query.
 * For the NFL the result also says which seasons' stored ESPN row has no stat but games (`statFree`: no non-zero value
 * in any category outside GP and GS, and no yard total). Those are always listed with no box-score row. A season whose
 * row has a stat is listed with no box-score row too, unless the player has a playoffs row that season (ESPN's
 * regular-season row can be that postseason game): that rule is applied in `buildStagedProfile`, which sees the rows,
 * not here. */
export async function fetchReportedGames(db: Pick<Pool, "query">, league: League, playerEspnId: string): Promise<ReportedGames> {
  if (league !== "nfl" && league !== "nba") return new ReportedGames();
  const { rows } = await db.query<{ season: number; games_played: number; categories: unknown; passing_yards: number | null; rushing_yards: number | null; receiving_yards: number | null }>(
    `select season, games_played, categories, passing_yards, rushing_yards, receiving_yards from player_season_stats
     where league = $1 and player_espn_id = $2 and games_played is not null and games_played > 0`,
    [league, playerEspnId]
  );
  const statFree = league === "nfl" ? rows.filter((r) => !storedRowHasStats(r.categories) && !r.passing_yards && !r.rushing_yards && !r.receiving_yards) : [];
  return new ReportedGames(rows.map((r) => [r.season, r.games_played]), statFree.map((r) => r.season));
}

/** ESPN's whole-season NBA line per season (season year to its totals), read from the row the loader stores in
 * player_season_stats.categories. A season whose stored row cannot be read as a full line (`espnSeasonTotals`
 * gives null) is left out. The profile uses it where the game rows are short of ESPN's games. The result is the
 * regular-season map and also carries ESPN's postseason line per season (`postseason`, from the `postseason_`
 * keys), which feeds the playoffs table. Other leagues get an empty result without a query. */
export async function fetchEspnSeasons(db: Pick<Pool, "query">, league: League, playerEspnId: string): Promise<EspnSeasons> {
  if (league !== "nba") return new EspnSeasons();
  const { rows } = await db.query<{ season: number; categories: unknown }>(
    `select season, categories from player_season_stats where league = $1 and player_espn_id = $2`,
    [league, playerEspnId]
  );
  const regular: [number, NonNullable<ReturnType<typeof espnSeasonTotals>>][] = [];
  const postseason: typeof regular = [];
  for (const r of rows) {
    const totals = espnSeasonTotals(r.categories);
    if (totals) regular.push([r.season, totals]);
    const playoffs = espnSeasonTotals(r.categories, POSTSEASON_PREFIX);
    if (playoffs) postseason.push([r.season, playoffs]);
  }
  return new EspnSeasons(regular, postseason);
}
