// The text of a kickoff time. Pure, so the Client Component that shows it and a test can share one formatter.
//
// Football (BBC, ESPN.com) prints a 24-hour clock with the zone named. `clock24` gives that: "14:30 BST" in the
// visitor's zone, or "14:30 UTC" when a zone is passed (the server's first paint, which must not read as the
// visitor's own). The US leagues keep the locale's clock, as before.
//
// `showZone` names the zone after the locale's own clock ("4:00 AM EDT"). Tennis uses it: a bare clock reading says
// nothing about which zone it is in, and the server's fallback (Eastern) and the visitor's own differ. `clock24`
// already names the zone, so the two never need combining.

export type LocalTimeFormat = "time" | "date" | "datetime";

const dateText = (d: Date, timeZone?: string) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });

function clockText(d: Date, opts: { clock24?: boolean; timeZone?: string; showZone?: boolean }): string {
  const { clock24, timeZone, showZone } = opts;
  // en-GB, not the visitor's locale: the 24-hour clock and its zone abbreviation must read the same on the server and in the browser.
  if (clock24) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short", timeZone });
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone, ...(showZone ? { timeZoneName: "short" as const } : {}) });
}

/** `timeZone: undefined` is what toLocale*String already does, so the visitor's own zone is used whenever none is passed. */
export function formatLocalTime(iso: string, fmt: LocalTimeFormat, opts: { clock24?: boolean; timeZone?: string; showZone?: boolean } = {}): string {
  const d = new Date(iso);
  if (fmt === "time") return clockText(d, opts);
  if (fmt === "date") return dateText(d, opts.timeZone);
  return `${dateText(d, opts.timeZone)} · ${clockText(d, opts)}`;
}
