// Which calendar day a piece of tennis belongs to, and how a tournament's dates read. Pure (no database import), so
// queries, Server Components and the share images all use the same answer.
//
// ESPN files tennis under US Eastern days: a tournament's start is midnight Eastern (Valencia 2026 starts
// 2026-09-13T04:00Z) and its end is 23:59 Eastern (2026-09-21T03:59Z is the evening of the 20th). Reading those
// instants in UTC, as this site did, moved every end date a day late and kept an event "In play" the day after its
// final. The stored instants are unchanged; readers convert them to the Eastern day with `easternDateSql`.

export const TENNIS_ZONE = "America/New_York";

/** SQL for a timestamptz column as its US Eastern calendar date, 'YYYY-MM-DD'. The one place the query side names the zone. */
export function easternDateSql(column: string): string {
  return `to_char(${column} at time zone '${TENNIS_ZONE}', 'YYYY-MM-DD')`;
}

/** Today as ESPN's tennis scores files it: the US Eastern date, YYYY-MM-DD. */
export function tennisToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TENNIS_ZONE });
}

const dayOf = (s: string): Date => new Date(`${s.slice(0, 10)}T12:00:00Z`);

/**
 * "Sep 13 – 20, 2026" from two Eastern calendar dates (the query side returns 'YYYY-MM-DD'; an ISO string is read
 * by its date part). A one-day event, or one with no end, is a single date.
 */
export function formatTournamentRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = dayOf(start);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  const e = dayOf(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const left = s.toLocaleDateString("en-US", opts);
  const right = sameMonth ? e.getUTCDate() : e.toLocaleDateString("en-US", opts);
  return `${left} – ${right}, ${e.getUTCFullYear()}`;
}

/** The singles draws whose final ends an event: a tour event has one, a Slam (`both`) has both. */
const SINGLES_DRAWS: Record<"atp" | "wta" | "both", string[]> = {
  atp: ["mens-singles"],
  wta: ["womens-singles"],
  both: ["mens-singles", "womens-singles"],
};

/**
 * "In play" on `today` (an Eastern date): inside the event's dates, and the singles final(s) not yet played. The
 * feed's end date is the last scheduled day, and a final is often finished (and the event over) that same day.
 */
export function tournamentInPlay(
  t: { tour: "atp" | "wta" | "both"; start_date: string | null; end_date: string | null; champions: { competition_type: string }[] },
  today: string
): boolean {
  if (!t.start_date || !t.end_date) return false;
  if (t.start_date.slice(0, 10) > today || t.end_date.slice(0, 10) < today) return false;
  const decided = SINGLES_DRAWS[t.tour].every((d) => t.champions.some((c) => c.competition_type === d));
  return !decided;
}
