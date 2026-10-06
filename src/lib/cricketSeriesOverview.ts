// The series before a ball is bowled, in one sentence: who plays, how many matches of which format, when, and where.
// Google re-crawls a series page about weekly (Search Console, 2026-10-06), so for the first days of a competition it
// serves what it saw before the start; this gives that version the facts people search for ahead of a tournament.
import { seriesFormatLabels } from "./cricketSeriesSeo";

export interface SeriesOverviewInput {
  teams: { name: string }[];
  /** ESPN's class cards as stored ("Other OD", "Test", "Women T20", ...). */
  formats: string[];
  startDate: string | null;
  endDate: string | null;
  matchCount: number;
  /** Distinct venues of the listed matches, see `seriesVenues`. */
  venues: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (d: Date, year: boolean) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(year ? { year: "numeric" as const } : {}) });

/**
 * "from Oct 3 to Dec 22, 2026", "from Dec 28, 2026 to Jan 5, 2027", or for a single day "on Oct 9, 2026"; a lone
 * multi-day match (Test, first-class) is "starting Oct 9, 2026", since the end date is the last match's start.
 */
function when(start: string, end: string | null, multiDay: boolean): string {
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  if (s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10)) return `${multiDay ? "starting" : "on"} ${day(s, true)}`;
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  return `from ${day(s, !sameYear)} to ${day(e, true)}`;
}

/** "8 teams play 56 one-day matches from Oct 3 to Dec 22, 2026 across 6 venues." Null when the teams, dates or matches are unknown. */
export function cricketSeriesOverview({ teams, formats, startDate, endDate, matchCount, venues }: SeriesOverviewInput): string | null {
  if (teams.length < 2 || !startDate || matchCount < 1) return null;
  const who = teams.length === 2 ? `${teams[0].name} and ${teams[1].name}` : plural(teams.length, "team");
  const labels = seriesFormatLabels(formats);
  const format = labels.join(" and ");
  const multiDay = labels.some((l) => /test|first-class/i.test(l));
  const what = plural(matchCount, `${format ? `${format} ` : ""}match`, `${format ? `${format} ` : ""}matches`);
  const where = venues.length === 1 ? ` at ${venues[0]}` : venues.length > 1 ? ` across ${plural(venues.length, "venue")}` : "";
  return `${who} play ${what} ${when(startDate, endDate, multiDay)}${where}.`;
}

/** The distinct venues of a match list, in first-appearance order, blanks dropped. */
export function seriesVenues(matches: { venue: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const m of matches) {
    const v = m.venue?.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}
