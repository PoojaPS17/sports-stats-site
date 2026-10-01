// Pure cricket-series display helpers with no database import — safe to use from
// Client Components (see tennisTours.ts and leagues.ts for why this split exists:
// importing any value from a module that imports ./db pulls `pg` into the client
// bundle and breaks the build).
export type SeriesKind = "international" | "womens-international" | "domestic" | "womens-domestic" | "other";

export const SERIES_KIND_LABEL: Record<SeriesKind, string> = {
  international: "International",
  "womens-international": "Women's international",
  domestic: "Domestic",
  "womens-domestic": "Women's domestic",
  other: "Youth, A-team and other",
};

/** "Sep 11 – 27, 2026", "Jan 3 – Dec 16, 2026" or a single day; null without a start date. */
export function formatSeriesDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  if (sameDay) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  // A season that spans the new year names both years, or "Nov 26 – Dec 6, 2026" reads as eleven days.
  if (s.getUTCFullYear() !== e.getUTCFullYear()) return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  return `${s.toLocaleDateString("en-US", opts)} – ${sameMonth ? e.getUTCDate() : e.toLocaleDateString("en-US", opts)}, ${e.getUTCFullYear()}`;
}
