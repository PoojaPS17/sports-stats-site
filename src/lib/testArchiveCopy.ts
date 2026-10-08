// Every line of copy that says how far back the men's Test archive goes, derived from TEST_ARCHIVE_START_YEAR
// (leagues.ts) so that loading earlier years is one constant, never a hunt for a stale "since 2015".
// Each function takes the start year as an optional argument only so a test can show both ends; the site
// always calls them bare.
import { FIRST_TEST_YEAR, TEST_ARCHIVE_START_YEAR, TEST_BALLS_RECORDED_FROM_YEAR } from "./leagues";

/** True when the archive starts at the first Test ever played: nothing is excluded at the early end. */
export const isFullTestHistory = (start: number = TEST_ARCHIVE_START_YEAR): boolean => start <= FIRST_TEST_YEAR;

/** "since 2015", or "since 1877" for the full history. Short form for meta descriptions. */
export const testsSince = (start: number = TEST_ARCHIVE_START_YEAR): string => `since ${Math.max(start, FIRST_TEST_YEAR)}`;

/** "since the start of 2015", or "since 1877" for the full history. */
export const testsSinceStartOf = (start: number = TEST_ARCHIVE_START_YEAR): string => (isFullTestHistory(start) ? testsSince(start) : `since the start of ${start}`);

/**
 * The sentence about older scorecards, or null while the archive starts at or after 1980 (every scorecard in it
 * then carries balls faced; saying otherwise would be a claim about data the page does not show).
 */
export function testUnrecordedNote(start: number = TEST_ARCHIVE_START_YEAR): string | null {
  return start < TEST_BALLS_RECORDED_FROM_YEAR ? `Balls faced and boundaries were not recorded for many matches before ${TEST_BALLS_RECORDED_FROM_YEAR}.` : null;
}

const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" ");

/** The career note's sentence about which Tests are counted. */
export function testCoverageSentence(start: number = TEST_ARCHIVE_START_YEAR): string {
  return isFullTestHistory(start)
    ? `Counts the men's Tests held on this site: every Test ${testsSince(start)}. A match the site lacks is not counted, so totals can be lower than Cricinfo's.`
    : `Counts the men's Tests held on this site: every Test ${testsSinceStartOf(start)}. Tests before ${start} are not included, so totals for anyone who played earlier are lower than Cricinfo's.`;
}

/** The Test career note without the sentence shared by every league (Matches counts ...). */
export function testCareerCopy(start: number = TEST_ARCHIVE_START_YEAR): string {
  const unrecorded = testUnrecordedNote(start);
  return join(
    testCoverageSentence(start),
    unrecorded ? `${unrecorded} Strike rate counts only the innings where balls faced were recorded.` : null,
    "Average, highest score, hundreds and five-wicket hauls are counted per innings."
  );
}

/** The Test results page's meta description. */
export const testHubDescription = (start: number = TEST_ARCHIVE_START_YEAR): string => `Latest Test match results with full four-innings scorecards, and every men's Test ${testsSince(start)}.`;

/** The line under the Test results page's title. */
export const testHubIntro = (start: number = TEST_ARCHIVE_START_YEAR): string =>
  join(`Every men's Test ${testsSinceStartOf(start)}, with new results added daily: completed matches only. A Test in progress is on the cricket series pages.`, testUnrecordedNote(start));

/** The Test centuries page's meta description. */
export const testCenturiesDescription = (start: number = TEST_ARCHIVE_START_YEAR): string =>
  testUnrecordedNote(start) === null
    ? `Every Test century ${testsSince(start)}, most recent first, with balls faced, boundaries, opponent and ground.`
    : `Every Test century ${testsSince(start)}, most recent first, with opponent and ground, and balls faced and boundaries where the scorers recorded them.`;

/** The line under the Test centuries page's title (`count` is "All 412" or "Showing the latest 1000 of 2210"). */
export const testCenturiesIntro = (count: string, start: number = TEST_ARCHIVE_START_YEAR): string =>
  join(`${count} Test centuries ${testsSinceStartOf(start)}, newest first.`, testUnrecordedNote(start));

/** The shared image's subtitle: the same sentence without the full stop and the note. */
export const testCenturiesSubtitle = (count: string, start: number = TEST_ARCHIVE_START_YEAR): string => `${count} Test centuries ${testsSinceStartOf(start)}, newest first`;
