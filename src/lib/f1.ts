import { pool } from "./db";
import { applyF1StandingsCorrections } from "./f1Corrections";
import { f1ConstructorEspnName, f1TeamLabel } from "./f1Names";

export interface F1EventRow {
  espn_id: string;
  name: string;
  short_name: string | null;
  date: string;
  end_date: string | null;
  season_year: number | null;
  circuit_name: string | null;
  circuit_city: string | null;
  circuit_country: string | null;
  winner_name: string | null;
  winner_slug: string | null;
  /** The Race session's status text ("Canceled" for a Grand Prix ESPN cancelled) and completed flag; null with no Race session on file. */
  race_status_state: string | null;
  race_status_detail: string | null;
  race_completed: boolean | null;
}

// One row per event, with the race winner (if that session's finished) pulled in via
// a correlated subquery rather than a join — an event has several sessions, but only
// ever one "Race", so this avoids the fan-out a plain join would cause.
// ESPN's circuit address data is inconsistently cased ("Monte carlo", "Kuala lumpur"
// alongside already-correct "Melbourne", "Sakhir") — initcap() fixes the display
// without needing to touch what's actually stored.
const EVENT_SELECT = `
  select e.espn_id, e.name, e.short_name, e.date, e.end_date, e.season_year,
         e.circuit_name, initcap(e.circuit_city) as circuit_city, initcap(e.circuit_country) as circuit_country,
         wp.name as winner_name, wp.slug as winner_slug,
         rs.status_state as race_status_state, rs.status_detail as race_status_detail, rs.completed as race_completed
  from f1_events e
  left join lateral (
    select s.status_state, s.status_detail, s.completed from f1_sessions s
    where s.event_espn_id = e.espn_id and s.session_type = 'Race'
    order by s.date desc limit 1
  ) rs on true
  left join lateral (
    select r.driver_espn_id
    from f1_session_results r
    join f1_sessions s on s.espn_id = r.session_espn_id
    where s.event_espn_id = e.espn_id and s.session_type = 'Race' and r.winner = true
    limit 1
  ) w on true
  left join players wp on wp.league = 'f1' and wp.espn_id = w.driver_espn_id
`;

export async function getF1Seasons(): Promise<number[]> {
  const { rows } = await pool.query(
    `select distinct season_year from f1_events where season_year is not null order by season_year desc`
  );
  return rows.map((r) => r.season_year as number);
}

export async function getF1Calendar(seasonYear: number): Promise<F1EventRow[]> {
  const { rows } = await pool.query(`${EVENT_SELECT} where e.season_year = $1 order by e.date asc`, [seasonYear]);
  return rows;
}

export async function getF1Event(espnId: string): Promise<F1EventRow | null> {
  const { rows } = await pool.query(`${EVENT_SELECT} where e.espn_id = $1`, [espnId]);
  return rows[0] ?? null;
}

export interface F1SessionResultRow {
  session_espn_id: string;
  session_type: string;
  session_date: string;
  status_detail: string | null;
  completed: boolean;
  driver_espn_id: string;
  driver_name: string;
  driver_slug: string;
  position: number | null;
  winner: boolean;
  /** The team's name in that season (f1TeamLabel), not the name ESPN stored. */
  constructor_name: string | null;
  car_number: string | null;
}

export async function getF1EventResults(eventEspnId: string): Promise<F1SessionResultRow[]> {
  const { rows } = await pool.query(
    `select s.espn_id as session_espn_id, s.session_type, s.date as session_date, s.status_detail, s.completed,
            p.espn_id as driver_espn_id, p.name as driver_name, p.slug as driver_slug,
            r.position, r.winner, r.constructor_name, r.car_number, e.season_year
     from f1_sessions s
     join f1_events e on e.espn_id = s.event_espn_id
     join f1_session_results r on r.session_espn_id = s.espn_id
     join players p on p.league = 'f1' and p.espn_id = r.driver_espn_id
     where s.event_espn_id = $1
     order by s.date asc, r.position asc nulls last`,
    [eventEspnId]
  );
  return rows.map(({ season_year, ...r }) => ({ ...r, constructor_name: f1TeamLabel(season_year, r.constructor_name) }));
}

export interface F1DriverStandingRow {
  position: number | null;
  points: number | null;
  wins: number | null;
  driver_espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  /** The team's name in that season (f1TeamLabel), not the name ESPN stored. */
  constructor_name: string | null;
}

// A driver's constructor isn't on the standings row itself (ESPN's standings entry is
// just points/wins, no team reference) — pulled instead from whichever constructor
// they raced for in their most recent session *that same season*, since a driver's
// team can differ year to year (Vettel raced for Ferrari in 2017, Aston Martin now) —
// scoping to the season being viewed matters here, unlike getF1ConstructorDrivers
// below, which deliberately wants the all-time-most-recent team for "who's on the
// roster right now".
// A driver stays on the table only with points or a stored finishing position in at least one Race: ESPN also lists
// the drivers who only took part in Friday practice (2017 would have 28 drivers, not the 23 who raced; 2018 21, not 20).
// ESPN's figures are corrected to the FIA final classification where they differ (f1Corrections.ts).
export async function getF1DriverStandings(seasonYear: number): Promise<F1DriverStandingRow[]> {
  const { rows } = await pool.query(
    `select fs.position, fs.points, fs.wins, p.espn_id as driver_espn_id, p.name, p.slug, p.headshot_url,
            (select r.constructor_name from f1_session_results r
             join f1_sessions s on s.espn_id = r.session_espn_id
             join f1_events e on e.espn_id = s.event_espn_id
             where r.driver_espn_id = p.espn_id and r.constructor_name is not null and e.season_year = $1
             order by s.date desc limit 1) as constructor_name
     from f1_standings fs
     join players p on p.league = 'f1' and p.espn_id = fs.entity_espn_id
     where fs.standings_type = 'driver' and fs.season_year = $1
       and (fs.points > 0 or exists (
         select 1 from f1_session_results rr
         join f1_sessions ss on ss.espn_id = rr.session_espn_id
         join f1_events ee on ee.espn_id = ss.event_espn_id
         where rr.driver_espn_id = p.espn_id and ss.session_type = 'Race' and rr.position is not null and ee.season_year = $1))
     order by fs.position asc nulls last`,
    [seasonYear]
  );
  const table = rows.map((r) => ({ ...r, points: r.points == null ? null : Number(r.points), constructor_name: f1TeamLabel(seasonYear, r.constructor_name) }));
  return applyF1StandingsCorrections(seasonYear, "driver", table, (r) => r.driver_espn_id);
}

export interface F1ConstructorStandingRow {
  position: number | null;
  points: number | null;
  wins: number | null;
  team_espn_id: string;
  /** The name the team raced under that season (f1TeamLabel). */
  name: string;
  /** Null for a team that no longer exists (Sauber, Force India, ...): it has no page to link to. */
  slug: string | null;
  logo_url: string | null;
  color: string | null;
}

// Every constructor in the season's table, whether or not it is one of today's teams (only those are in `teams`): the
// name of a team that is not comes from f1Names.ts by ESPN's manufacturer id, and its row has no slug.
export async function getF1ConstructorStandings(seasonYear: number): Promise<F1ConstructorStandingRow[]> {
  const { rows } = await pool.query(
    `select fs.position, fs.points, fs.wins, fs.entity_espn_id as team_espn_id, t.name as team_name, t.slug, t.logo_url, t.color
     from f1_standings fs
     left join teams t on t.league = 'f1' and t.espn_id = fs.entity_espn_id
     where fs.standings_type = 'constructor' and fs.season_year = $1
     order by fs.position asc nulls last`,
    [seasonYear]
  );
  const table: F1ConstructorStandingRow[] = rows.map(({ team_name, ...r }) => ({
    ...r,
    points: r.points == null ? null : Number(r.points),
    name: f1TeamLabel(seasonYear, team_name ?? f1ConstructorEspnName(r.team_espn_id, seasonYear)) ?? `Constructor ${r.team_espn_id}`,
  }));
  return applyF1StandingsCorrections(seasonYear, "constructor", table, (r) => r.team_espn_id);
}

export interface F1Driver {
  espn_id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
}

export async function getF1DriverBySlug(slug: string): Promise<F1Driver | null> {
  const { rows } = await pool.query(`select espn_id, name, slug, headshot_url from players where league = 'f1' and slug = $1`, [
    slug,
  ]);
  return rows[0] ?? null;
}

export interface F1DriverResultRow {
  event_espn_id: string;
  event_name: string;
  session_type: string;
  session_date: string;
  position: number | null;
  winner: boolean;
  /** The team's name in that season (f1TeamLabel), not the name ESPN stored. */
  constructor_name: string | null;
}

export async function getF1DriverResults(driverEspnId: string, limit = 20): Promise<F1DriverResultRow[]> {
  const { rows } = await pool.query(
    `select e.espn_id as event_espn_id, e.name as event_name, s.session_type, s.date as session_date,
            r.position, r.winner, r.constructor_name, e.season_year
     from f1_session_results r
     join f1_sessions s on s.espn_id = r.session_espn_id
     join f1_events e on e.espn_id = s.event_espn_id
     where r.driver_espn_id = $1 and s.session_type = 'Race'
     order by s.date desc
     limit $2`,
    [driverEspnId, limit]
  );
  return rows.map(({ season_year, ...r }) => ({ ...r, constructor_name: f1TeamLabel(season_year, r.constructor_name) }));
}

export interface F1Constructor {
  espn_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  color: string | null;
}

export async function getF1ConstructorBySlug(slug: string): Promise<F1Constructor | null> {
  const { rows } = await pool.query(
    `select espn_id, name, slug, logo_url, color from teams where league = 'f1' and slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

// Current drivers for a constructor: everyone whose most recent race was for this team,
// provided that race was in the latest season with a completed race. Races only, and
// the season check, keep out Friday-practice stand-ins and drivers who retired with
// the team years ago.
export async function getF1ConstructorDrivers(constructorName: string): Promise<F1Driver[]> {
  const { rows } = await pool.query(
    `select p.espn_id, p.name, p.slug, p.headshot_url
     from players p
     join lateral (
       select r.constructor_name, e.season_year from f1_session_results r
       join f1_sessions s on s.espn_id = r.session_espn_id
       join f1_events e on e.espn_id = s.event_espn_id
       where r.driver_espn_id = p.espn_id and r.constructor_name is not null and s.session_type = 'Race'
       order by s.date desc limit 1
     ) last on true
     where p.league = 'f1' and last.constructor_name = $1
       and last.season_year = (
         select max(e2.season_year) from f1_sessions s2 join f1_events e2 on e2.espn_id = s2.event_espn_id
         where s2.session_type = 'Race' and s2.completed
       )
     order by p.name`,
    [constructorName]
  );
  return rows;
}

export interface F1ConstructorResultRow extends F1DriverResultRow {
  driver_name: string;
  driver_slug: string;
}

export async function getF1ConstructorResults(constructorName: string, limit = 20): Promise<F1ConstructorResultRow[]> {
  const { rows } = await pool.query(
    `select e.espn_id as event_espn_id, e.name as event_name, s.session_type, s.date as session_date,
            r.position, r.winner, r.constructor_name, e.season_year, p.name as driver_name, p.slug as driver_slug
     from f1_session_results r
     join f1_sessions s on s.espn_id = r.session_espn_id
     join f1_events e on e.espn_id = s.event_espn_id
     join players p on p.league = 'f1' and p.espn_id = r.driver_espn_id
     where r.constructor_name = $1 and s.session_type = 'Race'
     order by s.date desc
     limit $2`,
    [constructorName, limit]
  );
  return rows.map(({ season_year, ...r }) => ({ ...r, constructor_name: f1TeamLabel(season_year, r.constructor_name) }));
}
