import { pool } from "./db";
import { isLeague, type League } from "./leagues";
import { featuredMatchSql, featuredSeriesSql, isFeaturedCricket } from "./cricketFeatured";

export type SeriesKind = "international" | "womens-international" | "domestic" | "womens-domestic" | "other";

export const SERIES_KIND_LABEL: Record<SeriesKind, string> = {
  international: "International",
  "womens-international": "Women's international",
  domestic: "Domestic",
  "womens-domestic": "Women's domestic",
  other: "Youth, A-team and other",
};

export interface CricketSeries {
  espn_id: string;
  name: string;
  short_name: string | null;
  abbreviation: string | null;
  is_tournament: boolean;
  kind: SeriesKind;
  formats: string[];
  season: number | null;
  start_date: string | null;
  end_date: string | null;
  match_count: number;
  completed_count: number;
  live_count: number;
  teams: { id: string; name: string; abbreviation: string | null; logo: string | null }[];
  /** The SportsDB competition this series is, when it is one (IPL, World Cups, ...). */
  league: League | null;
  /** Headline cricket (see cricketFeatured.ts): listed in live and upcoming, not only through the picker. */
  featured: boolean;
}

const KIND_RANK: Record<SeriesKind, number> = { international: 0, "womens-international": 1, domestic: 2, "womens-domestic": 3, other: 4 };

/** Featured cricket first, then internationals, domestic, and youth and A-team cricket; by start time within each. */
export function byPriority(a: CricketSeriesMatch, b: CricketSeriesMatch): number {
  return (
    Number(isFeaturedCricket(b)) - Number(isFeaturedCricket(a)) ||
    KIND_RANK[a.series_kind ?? "other"] - KIND_RANK[b.series_kind ?? "other"] ||
    a.date.localeCompare(b.date)
  );
}

export interface SeriesSide {
  id: string;
  name: string;
  abbreviation: string | null;
  score: string | null;
  winner: boolean;
  logo: string | null;
}

export interface CricketSeriesMatch {
  espn_id: string;
  series_espn_id: string;
  series_name: string;
  series_kind: SeriesKind | null;
  date: string;
  name: string;
  short_name: string | null;
  description: string | null;
  class_card: string | null;
  /** ESPN's international class: 1 Test, 2 ODI, 3 T20I, 8-10 the women's equivalents, "0" for everything else. */
  international_class_id: string | null;
  status_state: "pre" | "in" | "post" | null;
  status_summary: string | null;
  home: SeriesSide | null;
  away: SeriesSide | null;
  /** SportsDB league holding this match's stored scorecard, when one exists. */
  scorecard_league: League | null;
}

const SERIES_LEAGUE_SQL = `
  case s.espn_id when '8048' then 'ipl' when '8044' then 'bbl' when '8039' then 'cwc' when '8604' then 't20wc'
                 when '21282' then 'wpl' when '21284' then 'wbbl' when '8584' then 'wcwc' when '8634' then 'wt20wc' end as league`;

const SERIES_SELECT = `
  select s.espn_id, s.name, s.short_name, s.abbreviation, s.is_tournament, s.kind, s.formats, s.season,
         to_char(s.start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as start_date,
         to_char(s.end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as end_date,
         s.match_count, s.completed_count, s.teams,
         (select count(*) from cricket_series_matches m where m.series_espn_id = s.espn_id and m.status_state = 'in')::int as live_count,
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
     where s.start_date is not null
       and s.start_date <= now() + ($2 || ' days')::interval
       and s.end_date >= now() - ($1 || ' days')::interval
     order by s.kind = 'other', s.start_date, s.name`,
    [back, ahead]
  );
  return rows.map(shape);
}

export async function getCricketSeriesBySeason(season: number): Promise<CricketSeries[]> {
  const { rows } = await pool.query(`${SERIES_SELECT} where s.season = $1 order by s.start_date, s.name`, [season]);
  return rows.map(shape);
}

export async function getCricketSeriesSeasons(): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season from cricket_series where season is not null order by season desc`);
  return rows.map((r) => r.season as number);
}

export async function getCricketSeries(espnId: string): Promise<CricketSeries | null> {
  const { rows } = await pool.query(`${SERIES_SELECT} where s.espn_id = $1`, [espnId]);
  return rows[0] ? shape(rows[0]) : null;
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

/** Matches in play right now: every series, or only headline cricket. */
export async function getLiveCricketMatches(featuredOnly = false): Promise<CricketSeriesMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where m.status_state = 'in' ${featuredOnly ? `and ${featuredMatchSql("m")}` : ""} order by m.date`);
  return rows;
}

/** A day's cricket across every series: results, live and fixtures. */
export async function getCricketMatchesOnDay(day: string): Promise<CricketSeriesMatch[]> {
  const { rows } = await pool.query(`${MATCH_SELECT} where (m.date at time zone 'UTC')::date = $1::date order by s.kind = 'other', m.date`, [day]);
  return rows;
}

/** The next fixtures, nearest first; every series or only headline cricket, youth and A-team cricket last. */
export async function getUpcomingCricketMatches(limit = 6, withinDays = 7, featuredOnly = false): Promise<CricketSeriesMatch[]> {
  const { rows } = await pool.query(
    `${MATCH_SELECT}
     where coalesce(m.status_state, 'pre') = 'pre' and m.date >= now() - interval '1 hour' and m.date <= now() + ($2 || ' days')::interval
       -- a knockout fixture whose sides are still "TBA" is a placeholder, not a match to list
       and coalesce(m.home->>'name', '') !~* '^t?tb[acd]$' and coalesce(m.away->>'name', '') !~* '^t?tb[acd]$'
       ${featuredOnly ? `and ${featuredMatchSql("m")}` : ""}
     order by s.kind = 'other', m.date limit $1`,
    [limit, withinDays]
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
     where s.name ilike $1 or s.short_name ilike $1 or s.abbreviation ilike $1
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

/** "Sep 11 – 27, 2026", "Jan 3 – Dec 16, 2026" or a single day; null without a start date. */
export function formatSeriesDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  if (sameDay) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  // A season that spans the new year names both years, or "Nov 26 – Dec 6, 2026" reads as eleven days.
  if (s.getUTCFullYear() !== e.getUTCFullYear()) return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  return `${s.toLocaleDateString("en-US", opts)} – ${sameMonth ? e.getUTCDate() : e.toLocaleDateString("en-US", opts)}, ${e.getUTCFullYear()}`;
}
