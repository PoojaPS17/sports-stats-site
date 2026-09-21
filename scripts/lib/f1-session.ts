import type { Pool } from "pg";
import { f1BackfillSessionStatus } from "../../src/lib/f1Status";

type FetchRef = (ref: string) => Promise<any>;

/**
 * Save one session of a historical event for the backfill (scripts/backfill-f1-events.ts).
 *
 * That endpoint's `status` is a bare $ref, and a session that ran is final by construction. A session with no competitors is a
 * Grand Prix ESPN cancelled (2026 Bahrain and Saudi Arabia, 2023 Emilia Romagna, 2022 Russia), which "final" would hide, so only
 * those read their status. If that read fails, or returns no status, the session's status is NOT written: an earlier run's
 * status stays (a transient error must not turn a cancelled round into "Final"), and a session not stored yet gets no status.
 * The caller counts the "status-unread" results and fails the run, so the owner runs it again.
 */
export async function saveBackfilledSession(
  pool: Pool,
  eventId: string,
  comp: any,
  fetchRef: FetchRef,
  warn: (message: string) => void = console.warn
): Promise<"saved" | "status-unread"> {
  const args = [comp.id, eventId, comp.type?.abbreviation ?? null, comp.date];
  const noField = (comp.competitors ?? []).length === 0;
  if (noField && comp.status?.["$ref"]) {
    let status: any = null;
    let why = "no status returned";
    try {
      status = await fetchRef(comp.status["$ref"]);
    } catch (err) {
      why = err instanceof Error ? err.message : String(err);
    }
    if (!status?.type?.state) {
      warn(`[backfill-f1-events] WARNING: could not read the status of session ${comp.id} of event ${eventId} (${why}); its stored status is left as it is`);
      await pool.query(
        `insert into f1_sessions (espn_id, event_espn_id, session_type, date, updated_at) values ($1,$2,$3,$4, now())
         on conflict (espn_id) do update set session_type = excluded.session_type, date = excluded.date, updated_at = now()`,
        args
      );
      return "status-unread";
    }
    await writeStatus(pool, args, f1BackfillSessionStatus(status));
    return "saved";
  }
  await writeStatus(pool, args, f1BackfillSessionStatus(null));
  return "saved";
}

async function writeStatus(pool: Pool, args: unknown[], session: { state: string; detail: string; completed: boolean }) {
  await pool.query(
    `insert into f1_sessions (espn_id, event_espn_id, session_type, date, status_state, status_detail, completed, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7, now())
     on conflict (espn_id) do update set
       status_state = excluded.status_state, status_detail = excluded.status_detail, completed = excluded.completed, updated_at = now()`,
    [...args, session.state, session.detail, session.completed]
  );
}
