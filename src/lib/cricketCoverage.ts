// How far back each international cricket archive on the site goes, and what that means for a player's totals.
// A player's career figures are sums over the matches the site holds, so for a player who started before an
// archive does they are lower than the real career. Every line of copy that says so reads the years here (the Test
// year from leagues.ts), so loading earlier matches is one change and cannot leave a stale "since 2015".
import { FIRST_TEST_YEAR, TEST_ARCHIVE_START_YEAR, INTERNATIONAL_CRICKET, WOMENS_CRICKET, type League } from "./leagues";
import { testsSince } from "./testArchiveCopy";

export const ODI_ARCHIVE_START_YEAR = 2002; // Cricsheet's earliest men's ODI (production: first stored ODI is 2002-06-27)
export const T20I_ARCHIVE_START_YEAR = 2005; // Cricsheet's earliest men's T20I, which is also the first one played
export const WOMENS_ARCHIVE_START_YEAR = 2009; // ESPN's listing, women's ODIs and T20Is
/** From this year the men's ODI archive is as complete as ESPN's listing; 2002-2008 is Cricsheet alone and thin. */
export const ODI_FULL_FROM_YEAR = 2009;

interface Coverage {
  /** First calendar year of matches on the site. */
  start: number;
  /** First calendar year of the format itself: an archive starting here leaves nothing out at the early end. */
  firstEver: number;
  /** First year the archive is dense; a career whose first stored match is in or before it may have begun earlier. */
  denseFrom: number;
}

function coverageOf(league: League): Coverage | null {
  switch (league) {
    case "test":
      return { start: TEST_ARCHIVE_START_YEAR, firstEver: FIRST_TEST_YEAR, denseFrom: TEST_ARCHIVE_START_YEAR };
    case "odi":
      return { start: ODI_ARCHIVE_START_YEAR, firstEver: 1971, denseFrom: ODI_FULL_FROM_YEAR };
    case "t20i":
      return { start: T20I_ARCHIVE_START_YEAR, firstEver: 2005, denseFrom: T20I_ARCHIVE_START_YEAR };
    case "wodi":
      return { start: WOMENS_ARCHIVE_START_YEAR, firstEver: 1973, denseFrom: WOMENS_ARCHIVE_START_YEAR };
    case "wt20i":
      return { start: WOMENS_ARCHIVE_START_YEAR, firstEver: 2004, denseFrom: WOMENS_ARCHIVE_START_YEAR };
    default:
      return null;
  }
}

/** True when the league's archive leaves out part of the format's history (domestic leagues: never). */
export function archiveIsPartial(league: League, testStart: number = TEST_ARCHIVE_START_YEAR): boolean {
  const c = coverageOf(league);
  if (!c) return false;
  return league === "test" ? testStart > FIRST_TEST_YEAR : c.start > c.firstEver;
}

/** "since <year>" for a partial archive, null when nothing is left out. Short scope for meta descriptions and column labels. */
export function archiveScope(league: League, testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  const c = coverageOf(league);
  if (!c || !archiveIsPartial(league, testStart)) return null;
  return league === "test" ? testsSince(testStart) : `since ${c.start}`;
}

/** The year the archive starts, or null where it leaves nothing out. */
export function archiveStartYear(league: League, testStart: number = TEST_ARCHIVE_START_YEAR): number | null {
  const c = coverageOf(league);
  if (!c || !archiveIsPartial(league, testStart)) return null;
  return league === "test" ? testStart : c.start;
}

/**
 * True when a player whose first match on the site is in `firstStoredYear` may have played before it. The site
 * holds no debut dates, so this is a rule on the stored data: an archive that leaves out earlier years, and a first
 * stored match no later than the first year the archive is dense. A "may": a debutant of that year is flagged too.
 */
export function careerMayBeIncomplete(league: League, firstStoredYear: number | null, testStart: number = TEST_ARCHIVE_START_YEAR): boolean {
  const c = coverageOf(league);
  if (!c || !archiveIsPartial(league, testStart) || firstStoredYear === null) return false;
  return firstStoredYear <= (league === "test" ? testStart : c.denseFrom);
}

const FORMAT_NAME: Partial<Record<League, string>> = { test: "Tests", odi: "ODIs", t20i: "T20 internationals", wodi: "women's ODIs", wt20i: "women's T20 internationals" };

/** The column sub-label on a comparison: for example "Tests since <year>", or null for a league with no gap. */
export function archiveColumnLabel(league: League, testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  const scope = archiveScope(league, testStart);
  return scope ? `${FORMAT_NAME[league] ?? "Matches"} ${scope}` : null;
}

/** One sentence under a comparison saying which matches the totals are over; null where nothing is left out. */
export function compareCoverageLine(league: League, testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  const scope = archiveScope(league, testStart);
  return scope ? `Totals count the ${FORMAT_NAME[league] ?? "matches"} held on this site, ${scope}. Matches before then are not included.` : null;
}

/** The warning shown when either player may have played before the archive begins; null when neither did. */
export function comparePartialWarning(league: League, partialNames: string[], testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  const scope = archiveScope(league, testStart);
  if (scope === null || partialNames.length === 0) return null;
  const who = partialNames.length === 1 ? `${partialNames[0]}'s career` : `${partialNames[0]}'s and ${partialNames[1]}'s careers`;
  return `Partial comparison: ${who} may have begun before our ${FORMAT_NAME[league] ?? "match"} archive does (${scope}), so ${partialNames.length === 1 ? "that total is" : "those totals are"} lower than the real career. No figure is marked as better.`;
}

/**
 * The note under a cricketer's formats strip about a format with no page for him. It applies only to an
 * international format with a partial archive in which he has no stored match, and only when his first stored
 * international match is earlier than that archive starts (so matches he played back then would be missing).
 * It says "any": the site holds no debut dates, so it never claims he played them.
 */
export function missingFormatNote(name: string, league: League, firstInternationalYear: number | null, haveFormats: League[], testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  if (firstInternationalYear === null) return null;
  const womens = (WOMENS_CRICKET as string[]).includes(league);
  const notes: string[] = [];
  for (const l of INTERNATIONAL_CRICKET) {
    if ((WOMENS_CRICKET as string[]).includes(l) !== womens || l === league || haveFormats.includes(l)) continue;
    const start = archiveStartYear(l, testStart);
    if (start === null || firstInternationalYear >= start) continue;
    const format = FORMAT_NAME[l] ?? "Matches";
    notes.push(`${format[0].toUpperCase()}${format.slice(1)} before ${start} are not on this site yet, so there is no ${format} page for ${name}. Any played earlier are missing.`);
  }
  return notes.length ? notes.join(" ") : null;
}

/**
 * missingFormatNote for a player page: the earliest stored international match across his formats (same side of the
 * game as this page), and the formats he has stored matches in (by the strip and by the first-match years).
 */
export function cricketFormatNote(name: string, league: League, firstYears: Partial<Record<League, number>>, otherFormatLeagues: League[], testStart: number = TEST_ARCHIVE_START_YEAR): string | null {
  const womens = (WOMENS_CRICKET as string[]).includes(league);
  const years = INTERNATIONAL_CRICKET.filter((l) => (WOMENS_CRICKET as string[]).includes(l) === womens)
    .map((l) => firstYears[l])
    .filter((y): y is number => typeof y === "number");
  const have = [...new Set<League>([league, ...otherFormatLeagues, ...(Object.keys(firstYears) as League[])])];
  return missingFormatNote(name, league, years.length ? Math.min(...years) : null, have, testStart);
}
