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
//
// The exception is a race or sprint driver's status and laps completed (Ret / DSQ labels, the order of the back of the
// field): those are bare refs too, so each such driver costs one request (his status) and one more when he did not
// finish, and for the winner of each session (his laps are the distance the 90% classification line is measured from).
// That is the bulk of a full run: about 5,200 status requests, plus laps for some 800 drivers who did not finish and about
// 300 winners, on top of roughly 400 for the event lists, events, drivers and circuits, about 6,700 in all. A driver
// already stored with his status (and laps, where they are read) is skipped, so the run can be repeated safely and cheaply.
// The total is logged at the end; a failed status/laps request is counted, listed and makes the run exit non-zero.
import { pool } from "./lib/db";
import { fetchF1SeasonEventRefs, fetchByRef as fetchEspnRef } from "./lib/f1";
import { uniqueSlugFor } from "./lib/players";
import { saveBackfilledSession } from "./lib/f1-session";
import { addF1DidNotStartRows, f1CompetitorDetail, f1SessionHasStatuses, isPracticeOnlyCompetitor, loadKnownF1Details, saveF1CompetitorResult } from "./lib/f1-competitor";

const YEARS_BACK = 10;
const CONCURRENCY = 6;

// Sessions (event id/session id) whose status could not be read; the run exits non-zero when there are any.
const statusUnread: string[] = [];
// Driver status / laps requests that failed; those drivers keep what is stored (null on a first run), and the run exits non-zero.
const lookupsFailed: string[] = [];

// Every ESPN request this run makes goes through here, so the total is logged at the end.
let espnRequests = 0;
function fetchByRef<T = any>(ref: string): Promise<T> {
  espnRequests++;
  return fetchEspnRef<T>(ref);
}

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
       date = excluded.date, end_date = excluded.end_date,
       circuit_name = coalesce(excluded.circuit_name, f1_events.circuit_name),
       circuit_city = coalesce(excluded.circuit_city, f1_events.circuit_city),
       circuit_country = coalesce(excluded.circuit_country, f1_events.circuit_country), updated_at = now()`,
    [event.id, event.name, event.shortName ?? null, event.date, event.endDate ?? null, seasonYear, circuit?.name ?? null, circuit?.city ?? null, circuit?.country ?? null]
  );

  let resultCount = 0;
  for (const comp of event.competitions ?? []) {
    // Unlike the live scoreboard (fetch-f1-scores.ts), this endpoint's `status` is a bare $ref with no inline `.type`, so a
    // session that ran is marked final outright rather than fetching yet another $ref to confirm what is already true. A
    // session with no competitors is a Grand Prix ESPN cancelled and reads its status; if that read fails its stored status
    // is left alone and the run fails at the end (scripts/lib/f1-session.ts).
    if ((await saveBackfilledSession(pool, event.id, comp, fetchByRef)) === "status-unread") statusUnread.push(`${event.id}/${comp.id}`);

    // A race or sprint driver's status (retired, disqualified, ...) and laps completed are only bare refs in the event
    // resource: one request for his status, and one more for his laps when he did not finish. Drivers already stored with
    // both are not asked about again, so a run that was cut off is finished by running it again.
    const sessionType: string | undefined = comp.type?.abbreviation;
    const known = f1SessionHasStatuses(sessionType) ? await loadKnownF1Details(pool, comp.id) : undefined;
    for (const c of comp.competitors ?? []) {
      const athleteRef = c.athlete?.["$ref"];
      if (!c.id || !athleteRef) continue;
      if (f1SessionHasStatuses(sessionType) && isPracticeOnlyCompetitor(c)) {
        await saveF1CompetitorResult(pool, comp.id, sessionType, c, { status: null, laps: null }); // removes a stored practice-only row
        continue;
      }
      const name = await resolveDriverName(athleteRef, c.id);
      if (!name) continue;
      await upsertDriver(c.id, name);
      const detail = f1SessionHasStatuses(sessionType) ? await f1CompetitorDetail(c, fetchByRef, known?.get(c.id), (ref) => lookupsFailed.push(ref)) : { status: null, laps: null };
      if (await saveF1CompetitorResult(pool, comp.id, sessionType, c, detail)) resultCount++;
    }
    if (sessionType === "Race") await addF1DidNotStartRows(pool, event.id, comp.id);
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
      espnRequests++;
      const refs = await fetchF1SeasonEventRefs(year);
      for (const item of refs.items ?? []) jobs.push({ seasonYear: year, eventRef: item["$ref"] });
    } catch (err) {
      console.error(`[backfill-f1-events] ${year} season list failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[backfill-f1-events] starting ${jobs.length} events across ${YEARS_BACK + 1} seasons...`);

  const totalResults = await runPool(jobs, CONCURRENCY);
  console.log(`[backfill-f1-events] done: ${jobs.length} events, ${totalResults} session results, ${driverNameCache.size} unique drivers, ${espnRequests} ESPN requests`);

  await pool.end();

  if (lookupsFailed.length > 0) {
    console.error(`[backfill-f1-events] ERROR: ${lookupsFailed.length} driver status/laps request(s) failed, so those drivers have no status yet (a driver already stored keeps his). Run the backfill again; it only asks about the drivers still without one. First: ${lookupsFailed.slice(0, 3).join(", ")}`);
  }
  if (statusUnread.length > 0) {
    console.error(`[backfill-f1-events] ERROR: the status of ${statusUnread.length} empty session(s) could not be read, so their stored status was left as it was: ${statusUnread.join(", ")}. Run the backfill again.`);
  }
  if (statusUnread.length > 0 || lookupsFailed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill-f1-events] failed:", err);
  process.exit(1);
});
