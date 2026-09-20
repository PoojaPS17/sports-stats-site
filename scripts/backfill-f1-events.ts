// One-time historical backfill of F1 race weekends. Like tennis's scoreboard, F1's
// site.api scoreboard always returns "whichever event is currently on" regardless of
// season/date params (confirmed by testing) — the core API's season-scoped events
// list has no such restriction.
//
// A full event resource already inlines everything about every competitor
// (finishing order, winner flag, constructor/car number) except the driver's own
// name, which sits behind its own $ref — but the ~25-30 driver pool barely changes
// year to year, so names are resolved once per driver and cached, not once per race.
// Circuits repeat across years the same way and are cached the same way. That keeps
// the real cost to about one request per event (24/season) plus a few dozen one-time
// lookups total, not the thousands a naive per-competitor-per-race fetch would need.
import { pool } from "./lib/db";
import { fetchF1SeasonEventRefs, fetchByRef } from "./lib/f1";
import { uniqueSlugFor } from "./lib/players";
import { f1BackfillSessionStatus } from "../src/lib/f1Status";

const YEARS_BACK = 10;
const CONCURRENCY = 6;

const driverNameCache = new Map<string, string>();
const circuitCache = new Map<string, { name: string | null; city: string | null; country: string | null }>();

async function resolveDriverName(ref: string, id: string): Promise<string | null> {
  if (driverNameCache.has(id)) return driverNameCache.get(id)!;
  const athlete = await fetchByRef<any>(ref);
  const name = athlete.displayName ?? athlete.fullName ?? null;
  if (name) driverNameCache.set(id, name);
  return name;
}

async function resolveCircuit(ref: string | undefined) {
  if (!ref) return null;
  if (circuitCache.has(ref)) return circuitCache.get(ref)!;
  const circuit = await fetchByRef<any>(ref);
  const info = { name: circuit.fullName ?? null, city: circuit.address?.city ?? null, country: circuit.address?.country ?? null };
  circuitCache.set(ref, info);
  return info;
}

async function upsertDriver(id: string, name: string) {
  const slug = await uniqueSlugFor("f1", id, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug) values ('f1', $1, $2, $3)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [id, name, slug]
  );
}

async function backfillEvent(eventRef: string, seasonYear: number): Promise<number> {
  const event = await fetchByRef<any>(eventRef);
  const circuit = await resolveCircuit(event.circuit?.["$ref"]);

  await pool.query(
    `insert into f1_events (espn_id, name, short_name, date, end_date, season_year, circuit_name, circuit_city, circuit_country, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (espn_id) do update set
       date = excluded.date, end_date = excluded.end_date, circuit_name = excluded.circuit_name,
       circuit_city = excluded.circuit_city, circuit_country = excluded.circuit_country, updated_at = now()`,
    [event.id, event.name, event.shortName ?? null, event.date, event.endDate ?? null, seasonYear, circuit?.name ?? null, circuit?.city ?? null, circuit?.country ?? null]
  );

  let resultCount = 0;
  for (const comp of event.competitions ?? []) {
    // Unlike the live scoreboard (fetch-f1-scores.ts), this endpoint's `status` is a
    // bare $ref with no inline `.type` — the same shape tennis's historical events
    // have. Every session backfilled here is from a past event by construction, so
    // it's marked final outright rather than fetching yet another $ref just to
    // confirm what's already true (this was the actual bug: without this, every
    // backfilled session sat at completed=false despite having real results).
    // The exception is a session with no competitors: a Grand Prix ESPN cancelled
    // (2026 Bahrain and Saudi Arabia) lists every session with an empty field and
    // STATUS_CANCELED, which "final" would hide, so only those read their status.
    const noField = (comp.competitors ?? []).length === 0;
    const status = noField && comp.status?.["$ref"] ? await fetchByRef<any>(comp.status["$ref"]).catch(() => null) : null;
    const session = f1BackfillSessionStatus(status);
    await pool.query(
      `insert into f1_sessions (espn_id, event_espn_id, session_type, date, status_state, status_detail, completed, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7, now())
       on conflict (espn_id) do update set
         status_state = excluded.status_state, status_detail = excluded.status_detail, completed = excluded.completed, updated_at = now()`,
      [comp.id, event.id, comp.type?.abbreviation ?? null, comp.date, session.state, session.detail, session.completed]
    );

    for (const c of comp.competitors ?? []) {
      const athleteRef = c.athlete?.["$ref"];
      if (!c.id || !athleteRef) continue;
      const name = await resolveDriverName(athleteRef, c.id);
      if (!name) continue;
      await upsertDriver(c.id, name);
      await pool.query(
        `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (session_espn_id, driver_espn_id) do update set
           position = excluded.position, winner = excluded.winner,
           constructor_name = coalesce(excluded.constructor_name, f1_session_results.constructor_name),
           car_number = coalesce(excluded.car_number, f1_session_results.car_number)`,
        [comp.id, c.id, c.order ?? null, Boolean(c.winner), c.vehicle?.manufacturer ?? null, c.vehicle?.number ?? null]
      );
      resultCount++;
    }
  }
  return resultCount;
}

interface Job {
  seasonYear: number;
  eventRef: string;
}

async function runPool(jobs: Job[], concurrency: number) {
  let index = 0;
  let done = 0;
  let totalResults = 0;

  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index++];
      try {
        totalResults += await backfillEvent(job.eventRef, job.seasonYear);
      } catch (err) {
        console.error(`[backfill-f1-events] event failed (${job.eventRef}):`, err instanceof Error ? err.message : err);
      }
      done++;
      if (done % 10 === 0 || done === jobs.length) {
        console.log(`[backfill-f1-events] progress: ${done}/${jobs.length} events done`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return totalResults;
}

async function main() {
  const currentYear = new Date().getUTCFullYear();
  const jobs: Job[] = [];

  for (let year = currentYear - YEARS_BACK; year <= currentYear; year++) {
    try {
      const refs = await fetchF1SeasonEventRefs(year);
      for (const item of refs.items ?? []) jobs.push({ seasonYear: year, eventRef: item["$ref"] });
    } catch (err) {
      console.error(`[backfill-f1-events] ${year} season list failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[backfill-f1-events] starting ${jobs.length} events across ${YEARS_BACK + 1} seasons...`);

  const totalResults = await runPool(jobs, CONCURRENCY);
  console.log(`[backfill-f1-events] done: ${jobs.length} events, ${totalResults} session results, ${driverNameCache.size} unique drivers`);

  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-f1-events] failed:", err);
  process.exit(1);
});
