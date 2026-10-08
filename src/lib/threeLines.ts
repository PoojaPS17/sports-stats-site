// "Today in three lines" on the first-visit homepage: up to three short facts for a scanner, each one
// true, recent and checkable on the page it links to. This file holds only the rules for choosing them
// (pure: no database, no clock of its own), so they can be tested without either. The facts themselves are
// built from stored results in threeLinesData.ts.
//
// The rules, in order:
//   1. A fact older than FRESH_HOURS, dated in the future, or missing its text, figure or link is dropped.
//      Fewer than three facts left means fewer than three lines; nothing is padded.
//   2. Strongest first (weight), then the most recent, then id, so equal facts always sort the same way.
//   3. One line per sport first (the best fact of each sport in turn), so a day of football results does
//      not crowd out the cricket hundred; only when sports run out may a sport take a second line, never a
//      third.
//   4. Two lines never point at the same page: the second would show the reader the same match twice.
import { SOCCER_LEAGUES, isCricketLeague, type League } from "./leagues";

/** A fact is "today's" for this long after the thing it describes happened. */
export const FRESH_HOURS = 48;
export const MAX_LINES = 3;
/** A sport may fill a second line only once every other sport with a fact has one. */
export const MAX_PER_SPORT = 2;

export type FactKind = "win-streak" | "unbeaten" | "season-perfect" | "hundred" | "five-for";

export interface LineFact {
  /** Unique per fact, e.g. "team:epl:12". */
  id: string;
  /** The sport family used for variety ("soccer", "cricket", "nba", ...), not the league. */
  sport: string;
  kind: FactKind;
  /** The sentence shown. Contains `figure` verbatim. */
  text: string;
  /** The number or phrase in `text` that is set in bold: the thing the reader checks. */
  figure: string;
  /** The page that shows the same figure. */
  href: string;
  /** When the thing described happened (ISO): the last result of the run, the match the innings was played in. */
  at: string;
  /** How notable it is, higher first. Comparable across kinds (see factWeight). */
  weight: number;
}

/** The sport family of a league key: all football competitions are one sport, all cricket competitions another. */
export function sportOf(league: League): string {
  if ((SOCCER_LEAGUES as string[]).includes(league)) return "soccer";
  if (isCricketLeague(league)) return "cricket";
  return league;
}

/**
 * How notable a fact is. A run of 3 straight wins or a 100 is the bar for being printed at all, and each
 * kind earns more for going further past it; the caps keep one freak number (a 300, a 20-game run) from
 * outranking everything for ever. Kinds sit within a few points of each other on purpose: variety, not weight,
 * decides most days.
 */
export function factWeight(kind: FactKind, n: number): number {
  const over = (floor: number, step: number, cap: number) => Math.min(Math.max(n - floor, 0) * step, cap);
  switch (kind) {
    case "season-perfect":
      return 50 + over(3, 4, 30);
    case "win-streak":
      return 40 + over(3, 4, 30);
    case "unbeaten":
      return 36 + over(5, 3, 30);
    case "hundred":
      return 45 + over(100, 0.25, 25);
    case "five-for":
      return 45 + over(5, 8, 25);
  }
}

const HOUR_MS = 3_600_000;
/** A clock a few minutes ahead of the database's is not "the future". */
const CLOCK_SKEW_MS = 5 * 60_000;

function isUsable(f: LineFact, now: Date, maxAgeHours: number): boolean {
  if (!f.id || !f.text || !f.figure || !f.href || !f.text.includes(f.figure)) return false;
  const at = new Date(f.at).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= -CLOCK_SKEW_MS && age <= maxAgeHours * HOUR_MS;
}

const byStrength = (a: LineFact, b: LineFact) => (Number.isFinite(b.weight) ? b.weight : 0) - (Number.isFinite(a.weight) ? a.weight : 0) || new Date(b.at).getTime() - new Date(a.at).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Up to `max` lines (default three) chosen from the facts by the rules at the top of this file. */
export function selectLines(facts: LineFact[], now: Date, opts: { max?: number; maxAgeHours?: number; perSport?: number } = {}): LineFact[] {
  const max = opts.max ?? MAX_LINES;
  const maxAge = opts.maxAgeHours ?? FRESH_HOURS;
  const perSport = opts.perSport ?? MAX_PER_SPORT;

  const seenId = new Set<string>();
  const usable = facts
    .filter((f) => isUsable(f, now, maxAge))
    .sort(byStrength)
    .filter((f) => (seenId.has(f.id) ? false : (seenId.add(f.id), true)));

  const picked: LineFact[] = [];
  const hrefs = new Set<string>();
  const perSportCount = new Map<string, number>();
  const take = (f: LineFact) => {
    picked.push(f);
    hrefs.add(f.href);
    perSportCount.set(f.sport, (perSportCount.get(f.sport) ?? 0) + 1);
  };

  // Pass one: the strongest fact of each sport, strongest sport first.
  for (const f of usable) {
    if (picked.length >= max) break;
    if (!perSportCount.has(f.sport) && !hrefs.has(f.href)) take(f);
  }
  // Pass two: the sports have run out, so a sport may add a second line.
  for (const f of usable) {
    if (picked.length >= max) break;
    if (picked.includes(f) || hrefs.has(f.href) || (perSportCount.get(f.sport) ?? 0) >= perSport) continue;
    take(f);
  }
  return picked.sort(byStrength);
}
