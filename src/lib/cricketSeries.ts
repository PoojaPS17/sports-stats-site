import { pool } from "./db";
import { isLeague } from "./leagues";
import { featuredMatchSql, featuredSeriesSql, isFeaturedCricket } from "./cricketFeatured";
import { CALLED_OFF } from "./gameStatus";
import { baseSeriesId, editionLabel, isEditionKey, seriesHasPlaySql } from "./cricketSeriesKey";
import type { SeriesKind } from "./cricketSeriesDisplay";
import { SERIES_KIND_LABEL, formatSeriesDates } from "./cricketSeriesDisplay";
import type { CricketSeries, CricketSeriesMatch } from "./cricketSeriesTypes";

export type { SeriesKind } from "./cricketSeriesDisplay";
export { SERIES_KIND_LABEL, formatSeriesDates } from "./cricketSeriesDisplay";
export type { CricketSeries, SeriesSide, CricketSeriesMatch } from "./cricketSeriesTypes";

const KIND_RANK: Record<SeriesKind, number> = { international: 0, "womens-international": 1, domestic: 2, "womens-domestic": 3, other: 4 };

/** Featured cricket first, then internationals, domestic, and youth and A-team cricket; by start time within each. */
export function byPriority(a: CricketSeriesMatch, b: CricketSeriesMatch): number {
  return (
    Number(isFeaturedCricket(b)) - Number(isFeaturedCricket(a)) ||
    KIND_RANK[a.series_kind ?? "other"] - KIND_RANK[b.series_kind ?? "other"] ||
    a.date.localeCompare(b.date)
  );
}

const SERIES_LEAGUE_SQL = `
  case split_part(s.espn_id, '-', 1) when '8048' then 'ipl' when '8044' then 'bbl' when '8039' then 'cwc' when '8604' then 't20wc'
                 when '21282' then 'wpl' when '21284' then 'wbbl' when '8584' then 'wcwc' when '8634' then 'wt20wc' end as league`;

const SERIES_SELECT = `
  select s.espn_id, s.name, s.short_name, s.abbreviation, s.is_tournament, s.kind, s.formats, s.season,
         to_char(s.start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
         to_char(s.end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
         s.match_count, s.completed_count, s.teams,
         (select count(*) from cricket_series_matches m where m.series_espn_id = s.espn_id and m.status_state = 'in')::int as live_count,
         -- a match that is not finished or in play and whose summary says it was called off (CALLED_OFF is a constant, not user input)
         (select count(*) from cricket_series_matches m where m.series_espn_id = s.espn_id and coalesce(m.status_state, 'pre') = 'pre'
            and coalesce(m.status_summary, '') ~* '${CALLED_OFF.source}')::int as called_off_count,
         ${SERIES_LEAGUE_SQL},
         ${featuredSeriesSql("s")} as featured
  from cricket_series s`;

function shape(row: Omit<CricketSeries, "league"> & { league: string | null }): CricketSeries {
  return {
    ...row,
    // A final's "TBA" placeholder is not a team.
    teams: (row.teams ?? []).filter((t) => !/^tb[ac]$/i.test(t.name)),
    league: row.league && isLeague(row.league) ? row.league : null,
  };
}

/** Series with play in a window: in progress today, starting within `ahead` days, or finished within `back` days. */
export async function getCricketSeriesWindow(back = 14, ahead = 60): Promise<CricketSeries[]> {
  const { rows } = await pool.query(
    `${SERIES_SELECT}
     where s.start_date is not null and ${seriesHasPlaySql("s")}
       and s.start_date <= now() + ($2 || ' days')::interval
       and s.end_date >= now() - ($1 || ' days')::interval
     order by s.kind = 'other', s.start_date, s.name`,
    [back, ahead]
  );
  return rows.map(shape);
}

/**
 * Series outside headline cricket (domestic, women's domestic, youth and A-team) with play in progress today:
 * those with a match live first, then by start date, newest first; youth and A-team cricket last.
 */
export async function getCricketSeriesInProgressOther(limit = 6): Promise<CricketSeries[]> {
  const { rows } = await pool.query(
    `${SERIES_SELECT}
     where s.start_date is not null and ${seriesHasPlaySql("s")} and not ${featuredSeriesSql("s")}
       and s.start_date <= now() and s.end_date >= now() - interval '1 day'
     order by live_count desc, s.kind = 'other', s.start_date desc, s.name
     limit $1`,
    [limit]
  );
  return rows.map(shape);
}

export async function getCricketSeriesBySeason(season: number): Promise<CricketSeries[]> {
  const { rows } = await pool.query(`${SERIES_SELECT} where s.season = $1 and ${seriesHasPlaySql("s")} order by s.start_date, s.name`, [season]);
  return rows.map(shape);
}

export async function getCricketSeriesSeasons(): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season from cricket_series s where season is not null and ${seriesHasPlaySql("s")} order by season desc`);
  return rows.map((r) => r.season as number);
}

export async function getCricketSeries(espnId: string): Promise<CricketSeries | null> {
  const { rows } = await pool.query(`${SERIES_SELECT} where s.espn_id = $1`, [espnId]);
  return rows[0] ? shape(rows[0]) : null;
}

/**
 * A tournament is one series per edition ("8044-2025-26"), but ESPN's league id alone ("8044") is what older links,
 * follows and search results carry. The newest edition of that league, when `espnId` is a bare league id that has
 * editions; null for an edition key, a bilateral series or an unknown id.
 *
 * Null too while the old merged row for that league id still holds matches: until the re-run (or the nightly job) has
 * refiled all of them, the address keeps showing that row, not a partial newest edition. Once it is emptied it is deleted
 * by the ingest and the id goes to the newest edition.
 */
export async function getLatestCricketEdition(espnId: string): Promise<string | null> {
  if (!/^\d+$/.test(espnId)) return null;
  const { rows } = await pool.query(
    `select espn_id from cricket_series where espn_id like $1
       and not exists (select 1 from cricket_series_matches m where m.series_espn_id = $2)
     order by start_date desc nulls last, espn_id desc limit 1`,
    [`${espnId}-%`, espnId]
  );
  return rows[0]?.espn_id ?? null;
}

export interface CricketSeriesEdition {
  espn_id: string;
  /** "2025-26" */
  label: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  match_count: number;
}

/** Every edition of the tournament `espnId` belongs to, newest first (empty for a bilateral series, which has no other editions). */
export async function getCricketSeriesEditions(espnId: string): Promise<CricketSeriesEdition[]> {
  if (!isEditionKey(espnId)) return [];
  const { rows } = await pool.query(
    `select s.espn_id, s.name, s.match_count,
            to_char(s.start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
            to_char(s.end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date
     from cricket_series s where s.espn_id like $1 and ${seriesHasPlaySql("s")} order by s.start_date desc nulls last, s.espn_id desc`,
    [`${baseSeriesId(espnId)}-%`]
  );
  return rows.map((r) => ({ ...r, label: editionLabel(r.espn_id) as string }));
}

const MATCH_SELECT = `
  select m.espn_id, m.series_espn_id, s.name as series_name, s.kind as series_kind,
         to_char(m.date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as date,
         m.name, m.short_name, m.description, m.class_card, m.international_class_id, m.status_state, m.status_summary, m.home, m.away,
         (select g.league from games g where g.espn_id = m.espn_id and g.league = any(m.league_candidates)
            order by array_position(m.league_candidates, g.league) limit 1) as scorecard_league
  from cricket_series_matches m
  join cricket_series s on s.espn_id = m.series_espn_id`;

export async function getCricketSeriesMatches(seriesEspnId: string): Promise<CricketSeriesMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.series_espn_id = $1 order by m.date`, [seriesEspnId]);
  return rows;
}

export async function getCricketSeriesMatch(espnId: string): Promise<CricketSeriesMatch | null> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.espn_id = $1`, [espnId]);
  return rows[0] ?? null;
}

/** Matches in play right now: every series, or only headline cricket; optionally narrowed to series whose name matches `seriesNameLike`. */
export async function getLiveCricketMatches(featuredOnly = false, seriesNameLike?: string): Promise<CricketSeriesMatch[]> {
  const params = seriesNameLike ? [`%${seriesNameLike}%`] : [];
  const { rows } = await pool.query(
    `${MATCH_SELECT} where m.status_state = 'in' ${featuredOnly ? `and ${featuredMatchSql("m")}` : ""} ${seriesNameLike ? "and s.name ilike $1" : ""} order by m.date`,
    params
  );
  return rows;
}

/** A day's cricket across every series: results, live and fixtures. */
export async function getCricketMatchesOnDay(day: string): Promise<CricketSeriesMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where (m.date at time zone 'UTC')::date = $1::date order by s.kind = 'other', m.date`, [day]);
  return rows;
}

/** The next fixtures, nearest first; every series or only headline cricket, youth and A-team cricket last; optionally narrowed to series whose name matches `seriesNameLike`. */
export async function getUpcomingCricketMatches(limit = 6, withinDays = 7, featuredOnly = false, seriesNameLike?: string): Promise<CricketSeriesMatch[]> {
  const params: (string | number)[] = [limit, withinDays, CALLED_OFF.source];
  if (seriesNameLike) params.push(`%${seriesNameLike}%`);
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where coalesce(m.status_state, 'pre') = 'pre' and m.date >= now() - interval '1 hour' and m.date <= now() + ($2 || ' days')::interval
       -- a knockout fixture whose sides are still "TBA" is a placeholder, not a match to list
       and coalesce(m.home->>'name', '') !~* '^t?tb[acd]$' and coalesce(m.away->>'name', '') !~* '^t?tb[acd]$'
       -- a postponed or cancelled match is not a fixture to list
       and coalesce(m.status_summary, '') !~* $3
       ${featuredOnly ? `and ${featuredMatchSql("m")}` : ""}
       ${seriesNameLike ? "and s.name ilike $4" : ""}
     order by s.kind = 'other', m.date limit $1`,
    params
  );
  return rows;
}

export interface CricketSeriesHit {
  espn_id: string;
  name: string;
  /** "International · ODI, T20I · Sep 11 – 27, 2026" */
  subtitle: string;
  live: boolean;
  featured: boolean;
}

/** Series whose name or abbreviation contains `query`, for the picker: current and upcoming first, then newest past seasons. */
export async function searchCricketSeries(query: string, limit = 8): Promise<CricketSeriesHit[]> {
  const like = `%${query}%`;
  const { rows } = await pool.query(
    `select s.espn_id, s.name, s.kind, s.formats,
            to_char(s.start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
            to_char(s.end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
            (select count(*) from cricket_series_matches m where m.series_espn_id = s.espn_id and m.status_state = 'in')::int as live_count,
            ${featuredSeriesSql("s")} as featured
     from cricket_series s
     where (s.name ilike $1 or s.short_name ilike $1 or s.abbreviation ilike $1) and ${seriesHasPlaySql("s")}
     -- current and upcoming series first, featured ones ahead within them, then the newest past seasons
     order by (s.end_date >= now() - interval '14 days') desc, ${featuredSeriesSql("s")} desc, s.start_date desc nulls last, s.name
     limit $2`,
    [like, limit]
  );
  return rows.map((r) => ({
    espn_id: r.espn_id,
    name: r.name,
    subtitle: [SERIES_KIND_LABEL[r.kind as SeriesKind], (r.formats as string[]).join(", ") || null, formatSeriesDates(r.start_date, r.end_date)].filter(Boolean).join(" · "),
    live: r.live_count > 0,
    featured: r.featured,
  }));
}

