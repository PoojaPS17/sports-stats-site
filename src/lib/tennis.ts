import { pool } from "./db";
import type { Tour } from "./tennisTours";
import { easternDateSql, TENNIS_ZONE } from "./tennisDates";
import { rankingAsOf } from "./tennisRankings";

export type { Tour } from "./tennisTours";
export { TOURS, TOUR_LABEL, isTour } from "./tennisTours";

/* ------------------------------------------------------------------------ */
/* Rankings                                                                  */
/* ------------------------------------------------------------------------ */

export interface TennisRankingRow {
  rank: number;
  previous_rank: number | null;
  points: number | null;
  player_espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  country: string | null;
}

export async function getTennisRankings(tour: Tour, limit = 100): Promise<TennisRankingRow[]> {
  const { rows } = await pool.query(
    `select tr.rank, tr.previous_rank, tr.points, p.espn_id as player_espn_id, p.name, p.slug, p.headshot_url, p.country
     from tennis_rankings tr
     join players p on p.league = tr.tour and p.espn_id = tr.player_espn_id
     where tr.tour = $1
     order by tr.rank asc
     limit $2`,
    [tour, limit]
  );
  return rows;
}

/** Which ranking the stored rows are: ESPN's week number and the Monday the tour dates it (null until the loader has stored one). */
export async function getTennisRankingsAsOf(tour: Tour): Promise<{ week: number | null; asOf: string | null }> {
  const { rows } = await pool.query(
    `select max(ranking_week)::int as week, to_char(max(espn_updated) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated from tennis_rankings where tour = $1`,
    [tour]
  );
  const { week, updated } = rows[0] ?? {};
  return { week: week ?? null, asOf: updated ? rankingAsOf(updated) : null };
}

/* ------------------------------------------------------------------------ */
/* Matches                                                                   */
/* ------------------------------------------------------------------------ */

export type CompetitionType = "mens-singles" | "womens-singles" | "mens-doubles" | "womens-doubles" | "mixed-doubles" | "team-cup";

export const COMPETITION_LABEL: Record<CompetitionType, string> = {
  "mens-singles": "Men's Singles",
  "womens-singles": "Women's Singles",
  "mens-doubles": "Men's Doubles",
  "womens-doubles": "Women's Doubles",
  "mixed-doubles": "Mixed Doubles",
  // Davis Cup, United Cup...: ESPN files the singles and the doubles rubbers of a tie under this one type.
  "team-cup": "Team Cup",
};

// Display order within a tournament: singles first, then the doubles draws.
export const COMPETITION_ORDER: CompetitionType[] = ["mens-singles", "womens-singles", "mens-doubles", "womens-doubles", "mixed-doubles", "team-cup"];

export interface TennisSet {
  games: number;
  tiebreak: number | null;
  winner: boolean;
}

export interface TennisSide {
  ids: string[];
  names: string[];
  countries: (string | null)[];
  /** Player page slugs, aligned with `ids`; null when the player is not on file. */
  slugs: (string | null)[];
  seed: number | null;
  rank: number | null;
  score: string | null;
  sets: TennisSet[];
}

export interface TennisMatch {
  espn_id: string;
  tour: Tour;
  tournament_espn_id: string | null;
  tournament_name: string;
  tournament_location: string | null;
  major: boolean;
  competition_type: CompetitionType | null;
  round: string | null;
  round_number: number | null;
  court: string | null;
  date: string;
  day: string | null;
  completed: boolean;
  status_state: string | null;
  status_detail: string | null;
  winner_side: 1 | 2 | null;
  /** Another match on the same court that day starts earlier, so this start time is an estimate (see tennisDisplay). */
  after_court_match?: boolean;
  side1: TennisSide;
  side2: TennisSide;
}

// Rows written by the daily feed carry both sides as JSON; rows from the earlier
// Slam backfill only have the two singles players, so those are shaped into the
// same structure (no seeds or sets) rather than shown differently.
const SIDE_SQL = (side: "side1" | "side2", player: "player1_espn_id" | "player2_espn_id") => `
  case when m.${side} is not null then
    m.${side} || jsonb_build_object('slugs', (
      select coalesce(jsonb_agg(p.slug order by u.ord), '[]'::jsonb)
      from jsonb_array_elements_text(m.${side} -> 'ids') with ordinality u(id, ord)
      left join players p on p.league = m.tour and p.espn_id = u.id))
  else jsonb_build_object(
    'ids', jsonb_build_array(m.${player}), 'names', jsonb_build_array(px_${side}.name),
    'countries', jsonb_build_array(px_${side}.country), 'slugs', jsonb_build_array(px_${side}.slug),
    'seed', null, 'rank', null, 'score', case when m.winner_espn_id = m.${player} then m.score_display end, 'sets', '[]'::jsonb)
  end as ${side}`;

const MATCH_SELECT = `
  select m.espn_id, m.tour, m.tournament_espn_id, m.tournament_name, t.location as tournament_location, coalesce(t.major, false) as major,
         m.competition_type, m.round, m.round_number, m.court,
         to_char(m.date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date, to_char(m.day, 'YYYY-MM-DD') as day,
         m.completed, m.status_state, m.status_detail,
         case when m.winner_espn_id is null then null
              when m.winner_espn_id = m.player1_espn_id then 1 else 2 end as winner_side,
         exists (select 1 from tennis_matches o
                 where o.tournament_espn_id = m.tournament_espn_id and o.court = m.court and o.day = m.day and o.date < m.date) as after_court_match,
         ${SIDE_SQL("side1", "player1_espn_id")},
         ${SIDE_SQL("side2", "player2_espn_id")}
  from tennis_matches m
  left join tennis_tournaments t on t.espn_id = m.tournament_espn_id
  left join players px_side1 on px_side1.league = m.tour and px_side1.espn_id = m.player1_espn_id
  left join players px_side2 on px_side2.league = m.tour and px_side2.espn_id = m.player2_espn_id
`;

// Slams first, then tour events by name; within a tournament singles before
// doubles, then the later rounds first, then by start time.
const MATCH_ORDER = `
  order by coalesce(t.major, false) desc, m.tournament_name,
           array_position(array['mens-singles','womens-singles','mens-doubles','womens-doubles','mixed-doubles','team-cup'], m.competition_type),
           m.round_number desc nulls last, m.date asc`;

/** Every match ESPN files under one calendar day (US Eastern), all tours. */
export async function getTennisDay(day: string, tour?: Tour): Promise<TennisMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.day = $1::date and ($2::text is null or m.tour = $2) ${MATCH_ORDER}`, [day, tour ?? null]);
  return rows;
}

/** Days around `day` that have any match on file, for the day strip. */
export async function getTennisDaysAround(day: string, span = 7): Promise<string[]> {
  const { rows } = await pool.query(
    `select distinct to_char(day, 'YYYY-MM-DD') as day from tennis_matches
     where day between $1::date - $2::int and $1::date + $2::int order by 1`,
    [day, span]
  );
  return rows.map((r) => r.day);
}

/** The most recent day with a completed match — the hub's default when today is quiet. */
export async function getLatestTennisDay(): Promise<string | null> {
  const { rows } = await pool.query(`select to_char(max(day), 'YYYY-MM-DD') as day from tennis_matches where completed and day <= current_date`);
  return rows[0]?.day ?? null;
}

export async function getTennisMatch(espnId: string): Promise<TennisMatch | null> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.espn_id = $1 limit 1`, [espnId]);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------------ */
/* Tournaments                                                               */
/* ------------------------------------------------------------------------ */

export interface TennisTournament {
  espn_id: string;
  tour: "atp" | "wta" | "both";
  tournament_id: string;
  season: number;
  name: string;
  location: string | null;
  major: boolean;
  /** The US Eastern calendar dates ESPN files the event under, 'YYYY-MM-DD' (see tennisDates.ts). */
  start_date: string | null;
  end_date: string | null;
  match_count: number;
  completed_count: number;
  /** Champions by draw, from completed finals on file. */
  champions: { competition_type: CompetitionType; names: string[]; slugs: (string | null)[] }[];
}

const TOURNAMENT_SELECT = `
  select t.espn_id, t.tour, t.tournament_id, t.season, t.name, t.location, t.major,
         ${easternDateSql("t.start_date")} as start_date,
         ${easternDateSql("t.end_date")} as end_date,
         (select count(*) from tennis_matches m where m.tournament_espn_id = t.espn_id)::int as match_count,
         (select count(*) from tennis_matches m where m.tournament_espn_id = t.espn_id and m.completed)::int as completed_count,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'competition_type', f.competition_type,
                    'names', w -> 'names',
                    'slugs', (select coalesce(jsonb_agg(p.slug order by u.ord), '[]'::jsonb)
                              from jsonb_array_elements_text(w -> 'ids') with ordinality u(id, ord)
                              left join players p on p.league = f.tour and p.espn_id = u.id))
                  order by array_position(array['mens-singles','womens-singles','mens-doubles','womens-doubles','mixed-doubles'], f.competition_type))
           from (select m.competition_type, m.tour,
                        case when m.winner_espn_id = m.player1_espn_id then m.side1 else m.side2 end as w
                 from tennis_matches m
                 where m.tournament_espn_id = t.espn_id and m.completed and m.winner_espn_id is not null
                   and m.side1 is not null and lower(m.round) = 'final'
                   -- a team event's Final tie is several rubbers, not one champion
                   and m.competition_type is distinct from 'team-cup') f
         ), '[]'::jsonb) as champions
  from tennis_tournaments t`;

export async function getTennisTournaments(season: number): Promise<TennisTournament[]> {
  const { rows } = await pool.query(`${TOURNAMENT_SELECT} where t.season = $1 order by t.start_date nulls last, t.name`, [season]);
  return rows;
}

export async function getTennisTournamentSeasons(): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season from tennis_tournaments order by season desc`);
  return rows.map((r) => r.season as number);
}

export async function getTennisTournament(espnId: string): Promise<TennisTournament | null> {
  const { rows } = await pool.query(`${TOURNAMENT_SELECT} where t.espn_id = $1`, [espnId]);
  return rows[0] ?? null;
}

/** Other editions of the same tournament, newest first. */
export async function getTennisTournamentEditions(tournamentId: string): Promise<{ espn_id: string; season: number; name: string }[]> {
  const { rows } = await pool.query(`select espn_id, season, name from tennis_tournaments where tournament_id = $1 order by season desc`, [tournamentId]);
  return rows;
}

export async function getTennisTournamentMatches(espnId: string): Promise<TennisMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.tournament_espn_id = $1 ${MATCH_ORDER}`, [espnId]);
  return rows;
}

/** Tournaments in play on a day, or starting within the next week of it. */
export async function getTennisTournamentsAround(day: string): Promise<TennisTournament[]> {
  const { rows } = await pool.query(
    `${TOURNAMENT_SELECT}
     where (t.start_date is not null
            and (t.start_date at time zone '${TENNIS_ZONE}')::date <= $1::date + 7
            and coalesce((t.end_date at time zone '${TENNIS_ZONE}')::date, (t.start_date at time zone '${TENNIS_ZONE}')::date + 14) >= $1::date)
        or exists (select 1 from tennis_matches m where m.tournament_espn_id = t.espn_id and m.day between $1::date - 1 and $1::date + 7)
     order by t.major desc, t.start_date nulls last, t.name`,
    [day]
  );
  return rows;
}

/* ------------------------------------------------------------------------ */
/* Players                                                                   */
/* ------------------------------------------------------------------------ */

export interface TennisPlayer {
  espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  country: string | null;
}

export async function getTennisPlayerBySlug(tour: Tour, slug: string): Promise<TennisPlayer | null> {
  const { rows } = await pool.query(`select espn_id, name, slug, headshot_url, country from players where league = $1 and slug = $2`, [tour, slug]);
  return rows[0] ?? null;
}

/** Every match a player appears in (singles or as half of a doubles pair), newest first. */
export async function getTennisPlayerMatches(tour: Tour, playerEspnId: string, limit = 300): Promise<TennisMatch[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where m.tour = $1 and (m.player1_espn_id = $2 or m.player2_espn_id = $2 or m.side1 -> 'ids' ? $2 or m.side2 -> 'ids' ? $2)
     order by m.date desc limit $3`,
    [tour, playerEspnId, limit]
  );
  return rows;
}

// What counts as a singles match in a player's record, head-to-head and rivals (SQL, on alias `m`).
//  - the singles draws, plus a row with no draw type (the early Slam backfill stored singles only);
//  - a team-cup (Davis Cup, United Cup) singles rubber: ESPN files singles and doubles rubbers of a tie under the one
//    type 'team-cup', so it is told by both sides being one player. Those count in the record, as the tours count them.
const SINGLES_SQL = `(m.competition_type is null or m.competition_type like '%singles'
       or (m.competition_type = 'team-cup' and m.side1 is not null and jsonb_array_length(m.side1 -> 'ids') = 1 and jsonb_array_length(m.side2 -> 'ids') = 1))`;
// A walkover is not a match played: neither player's win nor loss (ESPN's detail is "Walkover"; a retirement, which
// has a score and a result, is played and counts).
const PLAYED_SQL = `coalesce(m.status_detail, '') not ilike 'walkover'`;

export interface TennisSeasonRecord {
  season: number;
  wins: number;
  losses: number;
  titles: number;
}

/**
 * Singles win–loss and titles by season, from matches on file: team-cup singles included, walkovers not, and a win in
 * a team event's Final tie is a win but no title.
 */
export async function getTennisPlayerSeasonRecords(tour: Tour, playerEspnId: string): Promise<TennisSeasonRecord[]> {
  const { rows } = await pool.query(
    `select extract(year from m.date)::int as season,
            count(*) filter (where ${PLAYED_SQL} and m.winner_espn_id = $2)::int as wins,
            count(*) filter (where ${PLAYED_SQL} and m.winner_espn_id is not null and m.winner_espn_id <> $2)::int as losses,
            count(*) filter (where m.winner_espn_id = $2 and lower(m.round) = 'final' and m.competition_type is distinct from 'team-cup')::int as titles
     from tennis_matches m
     where m.tour = $1 and m.completed and (m.player1_espn_id = $2 or m.player2_espn_id = $2)
       and ${SINGLES_SQL}
     group by 1 having count(*) filter (where ${PLAYED_SQL}) > 0 order by 1 desc`,
    [tour, playerEspnId]
  );
  return rows;
}

export interface TennisRanking {
  rank: number;
  previous_rank: number | null;
  points: number | null;
}

export async function getTennisPlayerRanking(tour: Tour, playerEspnId: string): Promise<TennisRanking | null> {
  const { rows } = await pool.query(`select rank, previous_rank, points from tennis_rankings where tour = $1 and player_espn_id = $2`, [
    tour,
    playerEspnId,
  ]);
  return rows[0] ?? null;
}

// Every singles match between two specific players, either order — powers the
// head-to-head record on the player page.
export async function getTennisHeadToHead(tour: Tour, playerAEspnId: string, playerBEspnId: string): Promise<TennisMatch[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where m.tour = $1 and ${SINGLES_SQL} and ${PLAYED_SQL}
       and ((m.player1_espn_id = $2 and m.player2_espn_id = $3) or (m.player1_espn_id = $3 and m.player2_espn_id = $2))
     order by m.date desc`,
    [tour, playerAEspnId, playerBEspnId]
  );
  return rows;
}

/** The player's most frequent singles opponents on file, for head-to-head links. */
export async function getTennisPlayerRivals(tour: Tour, playerEspnId: string, limit = 6): Promise<{ espn_id: string; name: string; slug: string; matches: number; wins: number }[]> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, count(*)::int as matches, count(*) filter (where m.winner_espn_id = $2)::int as wins
     from tennis_matches m
     join players p on p.league = m.tour and p.espn_id = case when m.player1_espn_id = $2 then m.player2_espn_id else m.player1_espn_id end
     -- a match with no winner (postponed or cancelled, which the scraper can store as completed) is not one played
     where m.tour = $1 and m.completed and m.winner_espn_id is not null and (m.player1_espn_id = $2 or m.player2_espn_id = $2)
       and ${SINGLES_SQL} and ${PLAYED_SQL}
     group by 1, 2, 3 order by matches desc, wins desc limit $3`,
    [tour, playerEspnId, limit]
  );
  return rows;
}
