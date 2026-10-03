// The text of a kickoff time. Pure, so the Client Component that shows it and a test can share one formatter.
//
// Football (BBC, ESPN.com) prints a 24-hour clock with the zone named. `clock24` gives that: "14:30 BST" in the
// visitor's zone, or "14:30 UTC" when a zone is passed (the server's first paint, which must not read as the
// visitor's own). The US leagues keep the locale's clock, as before.
//
// `showZone` names the zone after the locale's own clock ("4:00 AM EDT"). Tennis uses it: a bare clock reading says
// nothing about which zone it is in, and the server's fallback (Eastern) and the visitor's own differ. `clock24`
// already names the zone, so the two never need combining. A zone ICU can only name as an offset ("GMT+5:30" is
// what en-US and en-GB make of India) is left off: the offset is noise on a card, and the weekday and AM/PM below
// already say which day and half of the day the game falls in.
//
// `day` is the calendar day the league files the game under (YYYY-MM-DD, from gameDayIso), and it is what NBA.com
// and ESPN's week pages do: the date beside a kickoff never moves to the visitor's zone, so it always agrees with
// the day heading above it, and the clock names its own weekday only when the visitor's day is a different one.
// A 7:00 PM Eastern tip-off on Saturday 3 October reads "Sat, Oct 3 · 7:00 PM" in New York and
// "Sat, Oct 3 · Sun 4:30 AM" in India. Without `day`, the date is the visitor's, as before.

export type LocalTimeFormat = "time" | "date" | "datetime";

export type LocalTimeOptions = { clock24?: boolean; timeZone?: string; showZone?: boolean; day?: string };

// formatToParts rather than an "en-CA" string, so the result is YYYY-MM-DD whatever the ICU build decides that locale looks like.
function dayIso(d: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const at = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${at("year")}-${at("month")}-${at("day")}`;
}

function dateText(d: Date, opts: LocalTimeOptions): string {
  // Noon UTC on the stored day, printed in UTC, is that day in every zone.
  if (opts.day) return new Date(`${opts.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: opts.timeZone });
}

/** The zone's short name when ICU has one ("EDT", "BST", "IST", "UTC"); null for a bare offset like "GMT+5:30". */
function zoneName(d: Date, timeZone?: string): string | null {
  const name = new Intl.DateTimeFormat([], { timeZone, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  return name && /^[A-Z]{2,5}$/.test(name) ? name : null;
}

function clockText(d: Date, opts: LocalTimeOptions): string {
  const { clock24, timeZone, showZone, day } = opts;
  // The clock's own weekday, only when the visitor's day is not the day the game is filed under.
  const weekday = day && dayIso(d, timeZone) !== day ? `${d.toLocaleDateString("en-US", { weekday: "short", timeZone })} ` : "";
  // en-GB, not the visitor's locale: the 24-hour clock and its zone abbreviation must read the same on the server and in the browser.
  if (clock24) return weekday + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short", timeZone });
  // hour12 is forced: an en-GB browser otherwise prints "4:30" with nothing to say which 4:30.
  const clock = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  const zone = showZone ? zoneName(d, timeZone) : null;
  return weekday + (zone ? `${clock} ${zone}` : clock);
}

/** `timeZone: undefined` is what toLocale*String already does, so the visitor's own zone is used whenever none is passed. */
export function formatLocalTime(iso: string, fmt: LocalTimeFormat, opts: LocalTimeOptions = {}): string {
  const d = new Date(iso);
  if (fmt === "time") return clockText(d, opts);
  if (fmt === "date") return dateText(d, opts);
  return `${dateText(d, opts)} · ${clockText(d, opts)}`;
}
