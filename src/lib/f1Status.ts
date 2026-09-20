// What a Formula 1 race weekend is, for display: a result (the race has a winner), called off, or still to come.
// ESPN keeps a cancelled Grand Prix on the calendar with every session STATUS_CANCELED (state "post", completed
// false, detail "Canceled", no competitors), so it has no winner and must not read as an upcoming race.
// Pure, so tests need no React and no database.
import { calledOffLabel, isCalledOff } from "./gameStatus";

export type F1EventStatus = { kind: "result" | "called-off" | "live" | "upcoming"; label: string | null };

/** The event's Race session: f1_sessions.status_state / status_detail / completed. */
interface RaceStatus {
  race_status_state: string | null;
  race_status_detail: string | null;
  race_completed: boolean | null;
}

/** A Race in play is live, whatever its text says (a red flag reads "Suspended"), as for every other game. */
export function f1EventStatus(ev: { winner_name: string | null } & RaceStatus): F1EventStatus {
  if (ev.winner_name) return { kind: "result", label: null };
  if (ev.race_status_state === "in") return { kind: "live", label: "Live" };
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
  // The live writer stores ESPN's flag, so an explicit flag is believed; where ESPN sends none, state post is finished unless the text says it was called off.
  const detail = t.detail ?? "";
  return { state: t.state, detail: detail || (t.completed ? "Final" : ""), completed: t.completed ?? (t.state === "post" && !isCalledOff(detail)) };
}

/** The meta description of a race weekend's page; `where` is " at <circuit>" or "". */
export function f1EventDescription(ev: { name: string; winner_name: string | null } & RaceStatus, year: number, where: string): string {
  const status = f1EventStatus(ev);
  if (status.kind === "result") return `${ev.winner_name} won the ${year} ${ev.name}${where}. Classifications for the race, qualifying and practice.`;
  if (status.kind === "called-off") {
    const label = status.label ?? "Postponed";
    return `The ${year} ${ev.name}${where} was ${label.toLowerCase()}.`;
  }
  return `The ${year} ${ev.name}${where}: practice, qualifying and race classifications, added as each session finishes.`;
}
