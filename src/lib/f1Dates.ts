// A Grand Prix weekend's dates. ESPN's event `date` is the start of the FIRST session (practice), its `endDate` the start of the
// Race, and one 2018 event carries a month-early date (the Australian Grand Prix, 2018-02-23). What a visitor should read is the
// day of the Race, at the circuit: only Las Vegas differs from the UTC date (Race Saturday 20:00 local is Sunday 04:00 UTC).
import { f1CircuitTimeZone } from "./f1Circuits";

type When = Date | string;

export interface F1EventDates {
  date: When;
  end_date: When | null;
  /** The Race session's start, when a Race session is on file. */
  race_date?: When | null;
  circuit_name: string | null;
}

/** When the Race starts: the Race session, else the event's end date, else its first date. */
export function f1RaceInstant(ev: F1EventDates): Date {
  return new Date(ev.race_date ?? ev.end_date ?? ev.date);
}

/** A date as a visitor reads it, in the circuit's own time zone. */
export function f1FormatDate(when: When, circuitName: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  return new Date(when).toLocaleDateString("en-US", { ...options, timeZone: f1CircuitTimeZone(circuitName) });
}

/** The calendar day (YYYY-MM-DD) of an instant at the circuit. */
function localDay(when: When, circuitName: string | null | undefined): string {
  return new Date(when).toLocaleDateString("en-CA", { timeZone: f1CircuitTimeZone(circuitName), year: "numeric", month: "2-digit", day: "2-digit" });
}

/** The day of the Race at the circuit, YYYY-MM-DD. */
export function f1RaceDay(ev: F1EventDates): string {
  return localDay(f1RaceInstant(ev), ev.circuit_name);
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * The days a weekend runs, first session to Race, at the circuit. A first-session date more than four days before the Race
 * cannot be a weekend (ESPN's 2018 Australian event), so the usual Friday to Sunday is used instead.
 */
export function f1WeekendDays(ev: F1EventDates): { start: string; end: string } {
  const end = f1RaceDay(ev);
  const start = localDay(ev.date, ev.circuit_name);
  const span = dayNumber(end) - dayNumber(start);
  return span >= 0 && span <= 4 ? { start, end } : { start: dayString(dayNumber(end) - 2), end };
}
