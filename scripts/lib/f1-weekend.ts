import type { Pool } from "pg";
import { uniqueSlugFor } from "./players";

async function upsertDriver(pool: Pool, athleteId: string, name: string) {
  if (!athleteId || !name) return;
  const slug = await uniqueSlugFor("f1", athleteId, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug)
     values ('f1', $1, $2, $3)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [athleteId, name, slug]
  );
}

/**
 * Save one race weekend as ESPN's scoreboard returns it: the event, its sessions and each
 * session's classification. Session dates, event names and season year are refreshed on every run
 * so a rescheduled session or a corrected name reaches the site.
 */
export async function upsertF1Weekend(pool: Pool, event: any, seasonYear: number | null): Promise<{ sessions: number; results: number }> {
  const circuit = event.competitions?.[0]?.circuit;
  await pool.query(
    `insert into f1_events (espn_id, name, short_name, date, end_date, season_year, circuit_name, circuit_city, circuit_country, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (espn_id) do update set
       name = excluded.name, short_name = coalesce(excluded.short_name, f1_events.short_name),
       date = excluded.date, end_date = excluded.end_date,
       season_year = coalesce(excluded.season_year, f1_events.season_year),
       circuit_name = excluded.circuit_name, circuit_city = excluded.circuit_city,
       circuit_country = excluded.circuit_country, updated_at = now()`,
    [
      event.id,
      event.name,
      event.shortName ?? null,
      event.date,
      event.endDate ?? null,
      seasonYear,
      circuit?.fullName ?? null,
      circuit?.address?.city ?? null,
      circuit?.address?.country ?? null,
    ]
  );

  let sessions = 0;
  let results = 0;
  for (const comp of event.competitions ?? []) {
    await pool.query(
      `insert into f1_sessions (espn_id, event_espn_id, session_type, date, status_state, status_detail, completed, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (espn_id) do update set
         session_type = excluded.session_type, date = excluded.date,
         status_state = excluded.status_state, status_detail = excluded.status_detail,
         completed = excluded.completed, updated_at = now()`,
      [
        comp.id,
        event.id,
        comp.type?.abbreviation ?? null,
        comp.date,
        comp.status?.type?.state ?? null,
        comp.status?.type?.detail ?? null,
        Boolean(comp.status?.type?.completed),
      ]
    );
    sessions++;

    for (const c of comp.competitors ?? []) {
      const name = c.athlete?.displayName ?? c.athlete?.fullName;
      if (!c.id || !name) continue;
      await upsertDriver(pool, c.id, name);
      await pool.query(
        `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (session_espn_id, driver_espn_id) do update set
           position = excluded.position, winner = excluded.winner,
           constructor_name = coalesce(excluded.constructor_name, f1_session_results.constructor_name),
           car_number = coalesce(excluded.car_number, f1_session_results.car_number)`,
        [comp.id, c.id, c.order ?? null, Boolean(c.winner), c.vehicle?.manufacturer ?? null, c.vehicle?.number ?? null]
      );
      results++;
    }
  }
  return { sessions, results };
}
