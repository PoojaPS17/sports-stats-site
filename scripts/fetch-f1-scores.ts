// Recurring fetch of the current/most-recent race weekend — like tennis, F1's
// scoreboard endpoint always returns "whichever event is currently on" regardless of
// any date param (confirmed by testing), so this can't reach past weekends; see
// backfill-f1-events.ts for historical seasons.
import { pool } from "./lib/db";
import { fetchF1Scoreboard } from "./lib/f1";
import { uniqueSlugFor } from "./lib/players";

async function upsertDriver(athleteId: string, name: string) {
  if (!athleteId || !name) return;
  const slug = await uniqueSlugFor("f1", athleteId, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug)
     values ('f1', $1, $2, $3)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [athleteId, name, slug]
  );
}

async function main() {
  const data = await fetchF1Scoreboard();
  const league = data.leagues?.[0];
  const event = data.events?.[0];
  if (!event) {
    console.log("[fetch-f1-scores] no current event found");
    await pool.end();
    return;
  }

  const circuit = event.competitions?.[0]?.circuit;
  await pool.query(
    `insert into f1_events (espn_id, name, short_name, date, end_date, season_year, circuit_name, circuit_city, circuit_country, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (espn_id) do update set
       date = excluded.date, end_date = excluded.end_date, circuit_name = excluded.circuit_name,
       circuit_city = excluded.circuit_city, circuit_country = excluded.circuit_country, updated_at = now()`,
    [
      event.id,
      event.name,
      event.shortName ?? null,
      event.date,
      event.endDate ?? null,
      league?.season?.year ?? null,
      circuit?.fullName ?? null,
      circuit?.address?.city ?? null,
      circuit?.address?.country ?? null,
    ]
  );

  let sessionCount = 0;
  let resultCount = 0;
  for (const comp of event.competitions ?? []) {
    await pool.query(
      `insert into f1_sessions (espn_id, event_espn_id, session_type, date, status_state, status_detail, completed, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (espn_id) do update set
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
    sessionCount++;

    for (const c of comp.competitors ?? []) {
      const name = c.athlete?.displayName ?? c.athlete?.fullName;
      if (!c.id || !name) continue;
      await upsertDriver(c.id, name);
      await pool.query(
        `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (session_espn_id, driver_espn_id) do update set
           position = excluded.position, winner = excluded.winner,
           constructor_name = coalesce(excluded.constructor_name, f1_session_results.constructor_name),
           car_number = coalesce(excluded.car_number, f1_session_results.car_number)`,
        [comp.id, c.id, c.order ?? null, Boolean(c.winner), c.vehicle?.manufacturer ?? null, c.vehicle?.number ?? null]
      );
      resultCount++;
    }
  }

  console.log(`[fetch-f1-scores] ${event.name}: ${sessionCount} sessions, ${resultCount} results`);
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-f1-scores] failed:", err);
  process.exit(1);
});
