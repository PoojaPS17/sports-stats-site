// The daily run's second half: complete the results of the weekends the scoreboard has just shown.
//
// The site.api scoreboard (scripts/fetch-f1-scores.ts) gives each driver's position and nothing else, and it moves on to the next
// weekend as soon as the race is over. The one-time history backfill (scripts/backfill-f1-events.ts) is the only other writer of a team,
// a status or laps, and it ran once, before the 2026 Azerbaijan and Bahrain Grands Prix. So those two races were stored with their
// positions and no team, no status and no laps (no Ret / DSQ labels, and the drivers' latest team stayed the one of the race before).
// ESPN's core API event resource has all of it for the same races, so this reads it for every weekend that has just run, and for any
// weekend of the season whose race is stored without a team or a status (the self-heal that fixed those two). Sessions and events
// are not touched here: their dates and status stay the scoreboard's, so a weekend in progress is never marked final.
import type { Pool } from "pg";
import { saveCoreSessionResults } from "./f1-core-event";
import type { FetchRef } from "./f1-competitor";

/** Weekends whose first session started in the last RECENT_DAYS days are read again on every run, so the finished classification (laps, final statuses) is captured. */
const RECENT_DAYS = 14;
const MAX_EVENTS_PER_RUN = 8;

/**
 * The events to read: season weekends that have started and (a) are recent or (b) have a Race stored without a team or a status for a
 * driver. Newest first, at most MAX_EVENTS_PER_RUN. A weekend with no Race results (future, cancelled) is never selected by (b).
 */
export async function f1EventsToRefresh(pool: Pool, seasonYear: number): Promise<string[]> {
  const { rows } = await pool.query(
    `select e.espn_id from f1_events e
     where e.season_year = $1 and e.date <= now()
       and (
         coalesce(e.end_date, e.date) >= now() - make_interval(days => $2)
         or exists (
           select 1 from f1_sessions s join f1_session_results r on r.session_espn_id = s.espn_id
           where s.event_espn_id = e.espn_id and s.session_type = 'Race' and s.status_state = 'post'
             and (r.constructor_name is null or r.status is null)
         )
       )
     order by e.date desc limit $3`,
    [seasonYear, RECENT_DAYS, MAX_EVENTS_PER_RUN]
  );
  return rows.map((r) => r.espn_id as string);
}

export interface F1RefreshDeps {
  fetchEvent: (eventId: string) => Promise<any>;
  fetchRef: FetchRef;
}

export interface F1RefreshResult {
  events: number;
  results: number;
  failures: string[];
}

/**
 * Save the drivers of every finished session of the given weekends from the core API. Only sessions the scoreboard has stored as
 * finished (state `post`) are read, so a session still to run or in play is left to the scoreboard. Idempotent: a driver stored with
 * his final status and laps is not asked about again, and a value the feed lacks keeps the stored one. A request that fails is
 * listed in `failures` (the caller fails the run on any); nothing is half-written for that driver.
 */
export async function refreshF1Results(pool: Pool, eventIds: string[], deps: F1RefreshDeps): Promise<F1RefreshResult> {
  const nameCache = new Map<string, string | null>();
  const result: F1RefreshResult = { events: 0, results: 0, failures: [] };
  for (const eventId of eventIds) {
    let event: any;
    try {
      event = await deps.fetchEvent(eventId);
    } catch (err) {
      result.failures.push(`${eventId}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (String(event?.id) !== eventId) {
      result.failures.push(`${eventId}: ESPN returned event ${event?.id ?? "none"}`);
      continue;
    }
    const { rows: finished } = await pool.query("select espn_id from f1_sessions where event_espn_id = $1 and status_state = 'post'", [eventId]);
    const finishedIds = new Set(finished.map((r) => r.espn_id as string));
    for (const comp of event.competitions ?? []) {
      if (!finishedIds.has(String(comp.id))) continue;
      result.results += await saveCoreSessionResults(pool, eventId, comp, {
        fetchRef: deps.fetchRef,
        resolveName: async (ref, id) => {
          if (nameCache.has(id)) return nameCache.get(id)!;
          // A driver already stored keeps his name: no request for the ~20 who are in every weekend.
          const stored = await pool.query("select name from players where league = 'f1' and espn_id = $1", [id]);
          let name: string | null = stored.rows[0]?.name ?? null;
          if (!name) {
            const athlete = await deps.fetchRef(ref);
            name = athlete?.displayName ?? athlete?.fullName ?? null;
          }
          nameCache.set(id, name);
          return name;
        },
        onLookupFailure: (ref, err) => result.failures.push(`${eventId}: ${ref} (${err instanceof Error ? err.message : String(err)})`),
      });
    }
    result.events++;
  }
  return result;
}
