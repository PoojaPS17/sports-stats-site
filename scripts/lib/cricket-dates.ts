// The local calendar date(s) of a cricket match.
//
// ESPN's `date` for a cricket event is a UTC instant, and the day it falls on in UTC is not always the
// day the match was played: a Test that starts at 10.30 in Melbourne is 23:30 UTC the day before
// ("2025-12-25T23:30Z" for the Boxing Day Test), a Women's Big Bash morning game is 23:00 UTC the
// day before, and a night match in the Americas is already tomorrow in UTC. Cricinfo and Statsguru
// print the local date. Both live in the feed as text:
//
//   - the event `description`, on the scoreboard and the summary alike, ends with the local day(s):
//     "39th Match, Women's Big Bash League at Melbourne, Nov 24 2024" (a one-day match),
//     "4th Test, England tour of Australia at Melbourne, Dec 26-27 2025", "1st Test, Australia
//     tour of New Zealand at Wellington, Feb 29-Mar 3 2024" (a Test, first and last day played);
//   - the summary's `notes` entry of type "matchdays", in looser wording: "26,27 December 2025
//     (5-day match)", "29 February 1,2,3 March 2024 (5-day match)", "28,29 February, 1, March 2024".
//
// This module is pure, so the scripts that write games and the tests can share it.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface CricketLocalDates {
  /** First day of the match, YYYY-MM-DD. */
  localDate: string;
  /** Last day, YYYY-MM-DD, only when it is after the first (a multi-day match). */
  endDate: string | null;
  /** Where the date came from; "utc" means neither text carried one and the UTC day of `date` was used. */
  source: "description" | "notes" | "utc";
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function valid({ y, m, d }: Ymd): boolean {
  if (!(y >= 1800 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const iso = ({ y, m, d }: Ymd) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const key = ({ y, m, d }: Ymd) => y * 10_000 + m * 100 + d;

/** Turns the first and last day found into the result, or null when either is not a real date or they run backwards. */
function result(first: Ymd | undefined, last: Ymd | undefined, source: "description" | "notes"): CricketLocalDates | null {
  if (!first || !valid(first)) return null;
  if (last && valid(last) && key(last) > key(first)) return { localDate: iso(first), endDate: iso(last), source };
  return { localDate: iso(first), endDate: null, source };
}

/**
 * The days in a description's trailing date: "Nov 24 2024", "Dec 26-27 2025", "Feb 29-Mar 3 2024",
 * "Dec 30 2021-Jan 3 2022". The date is the last comma-separated segment, so a series name with a
 * comma or a digit in it cannot be mistaken for one.
 */
function fromDescription(description: unknown): CricketLocalDates | null {
  if (typeof description !== "string") return null;
  const tail = description.split(",").pop()?.trim() ?? "";
  const parts = tail.split(/\s*[-–]\s*/);
  if (parts.length < 1 || parts.length > 2) return null;
  const part = /^(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:\s+(\d{4}))?$/;
  const a = parts[0].match(part);
  const b = parts[1]?.match(part);
  if (!a || !a[1] || (parts[1] && !b)) return null;
  const startMonth = MONTHS[a[1].toLowerCase()];
  if (!startMonth) return null;
  // A range carries its year once, at the end ("Dec 26-27 2025"); a one-day date, at the end too.
  const endYear = Number((b ? b[3] : a[3]) ?? NaN);
  if (!Number.isInteger(endYear)) return null;
  const endMonth = b ? (b[1] ? MONTHS[b[1].toLowerCase()] : startMonth) : startMonth;
  if (!endMonth) return null;
  const startYear = a[3] ? Number(a[3]) : endYear - (b && startMonth > endMonth ? 1 : 0);
  const first = { y: startYear, m: startMonth, d: Number(a[2]) };
  const last = b ? { y: endYear, m: endMonth, d: Number(b[2]) } : undefined;
  return result(first, last, "description");
}

/**
 * The days in a "matchdays" note. The wording varies, so this reads it as a sequence: every number
 * is a day of the month, and takes the month name that follows it; a four-digit number is a year and
 * takes every day before it that has none. A month sequence that runs backwards ("30,31 December,
 * 1,2 January 2021") puts the earlier days in the year before.
 */
function fromMatchdays(text: unknown): CricketLocalDates | null {
  if (typeof text !== "string") return null;
  const tokens = text.replace(/\([^)]*\)/g, " ").match(/\d{4}|\d{1,2}|[A-Za-z]{3,9}/g);
  if (!tokens) return null;
  const days: { d: number; m?: number; y?: number }[] = [];
  for (const t of tokens) {
    if (/^\d{4}$/.test(t)) {
      for (const day of days) if (day.y === undefined) day.y = Number(t);
    } else if (/^\d{1,2}$/.test(t)) {
      days.push({ d: Number(t) });
    } else {
      const month = MONTHS[t.toLowerCase()];
      if (!month) continue; // "day", "match" and the like
      for (const day of days) if (day.m === undefined) day.m = month;
    }
  }
  if (days.length === 0 || days.some((d) => d.m === undefined || d.y === undefined)) return null;
  const dates = days.map((d) => ({ y: d.y!, m: d.m!, d: d.d }));
  // A year-end match: earlier days that would fall after later ones belong to the year before.
  for (let i = dates.length - 2; i >= 0; i--) {
    if (key(dates[i]) > key(dates[i + 1])) dates[i] = { ...dates[i], y: dates[i].y - 1 };
  }
  return result(dates[0], dates[dates.length - 1], "notes");
}

/**
 * The local first and last day of a cricket match. The description is read first (both feeds carry
 * it, in a regular form), then the "matchdays" entries of `notes` (the summary feed only), and when
 * neither has a date (or its date is more than a day from the UTC day of `startIso`, so cannot be this
 * match's own) the UTC day of `startIso`. `endDate` is set only for a match that ran past its first day.
 */
export function parseCricketLocalDates(description: unknown, notes: unknown, startIso: string): CricketLocalDates {
  const utc = new Date(startIso);
  const utcDay = Number.isNaN(utc.getTime()) ? null : utc.toISOString().slice(0, 10);
  // The local day is never more than a day from the UTC day of the start (zones run from -12 to +14). A
  // date further away is a stale or mistyped description (a postponed match whose text kept the old day),
  // and is not trusted: the UTC day is used instead.
  const plausible = (parsed: CricketLocalDates | null): parsed is CricketLocalDates => {
    if (!parsed) return false;
    if (utcDay === null) return true;
    return Math.abs(Date.parse(`${parsed.localDate}T00:00:00Z`) - Date.parse(`${utcDay}T00:00:00Z`)) <= 86_400_000;
  };
  const fromDesc = fromDescription(description);
  if (plausible(fromDesc)) return fromDesc;
  if (Array.isArray(notes)) {
    for (const n of notes) {
      if (n?.type !== "matchdays") continue;
      const parsed = fromMatchdays(n.text);
      if (plausible(parsed)) return parsed;
    }
  }
  return { localDate: utcDay ?? "", endDate: null, source: "utc" };
}
