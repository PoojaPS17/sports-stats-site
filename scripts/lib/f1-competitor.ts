// What ESPN says about one competitor of a race session beyond his finishing order: the status he finished with and the laps
// he completed. A competitor in an event resource carries both only as bare $refs (one request each), so they are read here
// once per driver and saved, for the Ret / DSQ labels and the order of the back of the field (src/lib/f1RaceOrder.ts).
import type { Pool } from "pg";
import { F1_DID_NOT_START_STATUS, F1_PRACTICE_ONLY_STATUS, F1_RACE_OVERRIDES } from "../../src/lib/f1RaceOrder";

export type FetchRef = (ref: string) => Promise<any>;

// A status a driver keeps once the session is over. Anything else (a status still reading "In Pit" or "Running", as ESPN
// leaves a few drivers) is asked about again by the next run.
const FINAL_STATUSES = new Set(["STATUS_CLASSIFIED", "STATUS_RETIRED", "STATUS_DISQUALIFIED", "STATUS_NOT_CLASSIFIED", "STATUS_DID_NOT_START"]);

export interface F1CompetitorDetail {
  /** ESPN's status name: STATUS_CLASSIFIED, STATUS_RETIRED, STATUS_DISQUALIFIED, ... */
  status: string | null;
  /** lapsCompleted; only read for a driver whose status is not STATUS_CLASSIFIED (a finisher's order needs no laps). */
  laps: number | null;
}

/** The session types whose drivers get a status: the race and the sprint. (Practice and qualifying have no retirements to label.) */
export function f1SessionHasStatuses(sessionType: string | undefined): boolean {
  return sessionType === "Race" || sessionType === "SR" || sessionType === "Sprint";
}

/** A driver ESPN lists in a race only because he drove on Friday (startOrder 0, no finishing order, status STATUS_FREE_PRACTICE). */
export function isPracticeOnlyCompetitor(c: any): boolean {
  return c?.startOrder === 0 && (c.order === undefined || c.order === null);
}

export function statusNameOf(status: any): string | null {
  const name = status?.type?.name;
  return typeof name === "string" && name ? name : null;
}

/** lapsCompleted out of a competitor's statistics resource (or an inline list of {name, value} stats). */
export function lapsOf(statistics: any): number | null {
  const stats: any[] = Array.isArray(statistics)
    ? statistics
    : (statistics?.splits?.categories ?? []).flatMap((category: any) => category?.stats ?? []);
  const laps = stats.find((s) => s?.name === "lapsCompleted")?.value;
  return typeof laps === "number" && Number.isFinite(laps) ? Math.round(laps) : null;
}

/** The winner of the session: his laps are the distance the 90% classification line is measured from (src/lib/f1RaceOrder.ts f1DistanceZone). */
function isSessionWinner(c: any): boolean {
  return c?.winner === true || c?.order === 1;
}

/**
 * The status and laps of one competitor. A scoreboard that carries them inline is used as it is; otherwise they are fetched
 * from the competitor's refs when `fetchRef` is given. Laps are read for a driver who did not finish, and for the winner (a
 * finisher's own laps are not needed, but the winner's give the race distance). `known` is what is already stored: a driver whose
 * final status and laps are stored is not asked about again, so a run that was cut off can be run again cheaply. A request that
 * fails leaves that value unknown (the stored one is kept) and is reported to `onFailure`, so the caller can count them.
 */
export async function f1CompetitorDetail(
  c: any,
  fetchRef?: FetchRef,
  known?: { status: string | null; laps: number | null },
  onFailure: (ref: string, err: unknown) => void = (ref, err) => console.warn(`[f1] ESPN request failed (${ref}):`, err instanceof Error ? err.message : err)
): Promise<F1CompetitorDetail> {
  if (isPracticeOnlyCompetitor(c)) return { status: null, laps: null }; // no request for a driver who is not in the race
  const needsLaps = (status: string | null) => status !== "STATUS_CLASSIFIED" || isSessionWinner(c);
  if (known?.status && FINAL_STATUSES.has(known.status) && (known.laps !== null || !needsLaps(known.status))) return { status: known.status, laps: known.laps };
  const read = async (ref: string) => {
    try {
      return await fetchRef!(ref);
    } catch (err) {
      onFailure(ref, err);
      return null;
    }
  };
  let status = statusNameOf(c?.status);
  if (!status && c?.status?.["$ref"] && fetchRef) status = statusNameOf(await read(c.status["$ref"]));
  let laps = lapsOf(c?.statistics);
  if (laps === null && status && needsLaps(status) && c?.statistics?.["$ref"] && fetchRef) laps = lapsOf(await read(c.statistics["$ref"]));
  return { status, laps };
}

/**
 * Save one competitor's result. Position, winner and the team follow the feed; the status and laps are kept when this read
 * of the feed did not have them. A driver who is only in the race resource because he drove on Friday is not a result: his
 * row is removed, if an earlier run stored one.
 */
export async function saveF1CompetitorResult(pool: Pool, sessionId: string, sessionType: string | undefined, c: any, detail: F1CompetitorDetail): Promise<boolean> {
  if (f1SessionHasStatuses(sessionType) && (isPracticeOnlyCompetitor(c) || detail.status === F1_PRACTICE_ONLY_STATUS)) {
    await pool.query("delete from f1_session_results where session_espn_id = $1 and driver_espn_id = $2", [sessionId, c.id]);
    return false;
  }
  await pool.query(
    `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number, status, laps)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (session_espn_id, driver_espn_id) do update set
       position = excluded.position, winner = excluded.winner,
       constructor_name = coalesce(excluded.constructor_name, f1_session_results.constructor_name),
       car_number = coalesce(excluded.car_number, f1_session_results.car_number),
       status = coalesce(excluded.status, f1_session_results.status),
       laps = coalesce(excluded.laps, f1_session_results.laps)`,
    [sessionId, c.id, c.order ?? null, Boolean(c.winner), c.vehicle?.manufacturer ?? null, c.vehicle?.number ?? null, detail.status, detail.laps]
  );
  return true;
}

/** The status and laps already stored for a session's drivers, keyed by driver id (what `known` in f1CompetitorDetail takes). */
export async function loadKnownF1Details(pool: Pool, sessionId: string): Promise<Map<string, { status: string | null; laps: number | null }>> {
  const { rows } = await pool.query("select driver_espn_id, status, laps from f1_session_results where session_espn_id = $1", [sessionId]);
  return new Map(rows.map((r) => [r.driver_espn_id as string, { status: r.status as string | null, laps: r.laps as number | null }]));
}

/**
 * f1.com lists a driver who did not start where ESPN has no row for him (2023 Qatar: Sainz). Adds that row, with his team taken
 * from his other sessions of the weekend; a driver ESPN already lists, or one we have never stored, is left alone.
 */
export async function addF1DidNotStartRows(pool: Pool, eventId: string, raceSessionId: string): Promise<number> {
  const override = F1_RACE_OVERRIDES[eventId];
  if (!override) return 0;
  let added = 0;
  for (const [driverId, label] of Object.entries(override.labels)) {
    if (label !== "DNS") continue;
    const { rowCount } = await pool.query(
      `insert into f1_session_results (session_espn_id, driver_espn_id, position, winner, constructor_name, car_number, status)
       select $1, p.espn_id, null, false, t.constructor_name, t.car_number, $3
       from players p
       left join lateral (
         select r.constructor_name, r.car_number from f1_session_results r
         join f1_sessions s on s.espn_id = r.session_espn_id
         where s.event_espn_id = $4 and r.driver_espn_id = p.espn_id and r.constructor_name is not null
         order by s.date desc limit 1
       ) t on true
       where p.league = 'f1' and p.espn_id = $2
       on conflict (session_espn_id, driver_espn_id) do nothing`,
      [raceSessionId, driverId, F1_DID_NOT_START_STATUS, eventId]
    );
    added += rowCount ?? 0;
  }
  return added;
}
