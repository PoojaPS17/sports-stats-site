import type { Pool } from "pg";
import { uniqueSlugFor } from "./players";
import { addF1DidNotStartRows, f1CompetitorDetail, f1SessionHasStatuses, loadKnownF1Details, saveF1CompetitorResult, type FetchRef } from "./f1-competitor";

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
 * so a rescheduled session or a corrected name reaches the site. A race or sprint driver's status and laps completed come from
 * the feed when it carries them, otherwise from his status/statistics refs when `opts.fetchRef` is given (f1-competitor.ts).
 */
export async function upsertF1Weekend(pool: Pool, event: any, seasonYear: number | null, opts: { fetchRef?: FetchRef } = {}): Promise<{ sessions: number; results: number }> {
  // ESPN's scoreboard puts the circuit on the event itself; a session carrying it is the older shape.
  const circuit = event.circuit ?? event.competitions?.[0]?.circuit;
  await pool.query(
    `insert into f1_events (espn_id, name, short_name, date, end_date, season_year, circuit_name, circuit_city, circuit_country, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (espn_id) do update set
       name = excluded.name, short_name = coalesce(excluded.short_name, f1_events.short_name),
       date = excluded.date, end_date = excluded.end_date,
       season_year = coalesce(excluded.season_year, f1_events.season_year),
       -- a run whose feed has no circuit keeps the stored one rather than blanking the venue
       circuit_name = coalesce(excluded.circuit_name, f1_events.circuit_name),
       circuit_city = coalesce(excluded.circuit_city, f1_events.circuit_city),
       circuit_country = coalesce(excluded.circuit_country, f1_events.circuit_country), updated_at = now()`,
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

    const sessionType: string | undefined = comp.type?.abbreviation;
    const known = f1SessionHasStatuses(sessionType) ? await loadKnownF1Details(pool, comp.id) : undefined;
    for (const c of comp.competitors ?? []) {
      const name = c.athlete?.displayName ?? c.athlete?.fullName;
      if (!c.id || !name) continue;
      await upsertDriver(pool, c.id, name);
      const detail = f1SessionHasStatuses(sessionType) ? await f1CompetitorDetail(c, opts.fetchRef, known?.get(c.id)) : { status: null, laps: null };
      if (await saveF1CompetitorResult(pool, comp.id, sessionType, c, detail)) results++;
    }
    if (sessionType === "Race") await addF1DidNotStartRows(pool, event.id, comp.id);
  }
  return { sessions, results };
}
