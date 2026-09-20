// What a Formula 1 race weekend is, for display: a result (the race has a winner), called off, or still to come.
// ESPN keeps a cancelled Grand Prix on the calendar with every session STATUS_CANCELED (state "post", completed
// false, detail "Canceled", no competitors), so it has no winner and must not read as an upcoming race.
// Pure, so tests need no React and no database.
import { calledOffLabel, isCalledOff } from "./gameStatus";

export type F1EventStatus = { kind: "result" | "called-off" | "upcoming"; label: string | null };

/** `race_status_detail` and `race_completed` are the event's Race session (f1_sessions.status_detail / completed). */
export function f1EventStatus(ev: { winner_name: string | null; race_completed: boolean | null; race_status_detail: string | null }): F1EventStatus {
  if (ev.winner_name) return { kind: "result", label: null };
  if (ev.race_completed !== true && isCalledOff(ev.race_status_detail)) return { kind: "called-off", label: calledOffLabel(ev.race_status_detail) };
  return { kind: "upcoming", label: null };
}

/**
 * The state stored for a session by the historical backfill. That endpoint's session `status` is a bare reference,
 * and the backfill used to mark every session final on the grounds that it is from a past event, which turns a
 * cancelled session into "Final". A session whose status was read keeps it; one whose status could not be read
 * is final, as before.
 */
export function f1BackfillSessionStatus(status: { type?: { state?: string; detail?: string; completed?: boolean } } | null | undefined): { state: string; detail: string; completed: boolean } {
  const t = status?.type;
  if (!t || !t.state) return { state: "post", detail: "Final", completed: true };
  return { state: t.state, detail: t.detail ?? (t.completed ? "Final" : ""), completed: t.completed === true };
}

/** The meta description of a race weekend's page; `where` is " at <circuit>" or "". */
export function f1EventDescription(ev: { name: string; winner_name: string | null; race_completed: boolean | null; race_status_detail: string | null }, year: number, where: string): string {
  const status = f1EventStatus(ev);
  if (status.kind === "result") return `${ev.winner_name} won the ${year} ${ev.name}${where}. Classifications for the race, qualifying and practice.`;
  if (status.kind === "called-off") {
    const label = status.label ?? "Postponed";
    return `The ${year} ${ev.name}${where} was ${label.toLowerCase()}${label === "Cancelled" ? " and no sessions were run" : ""}.`;
  }
  return `The ${year} ${ev.name}${where}: practice, qualifying and race classifications, added as each session finishes.`;
}
