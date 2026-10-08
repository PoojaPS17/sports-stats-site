import { formatSeasonLabel, isCricketLeague, isFirstClassCricket, type League } from "./leagues";
import { testsSince } from "./testArchiveCopy";
import type { MeetingTally } from "./h2hOutcome";

// URL helper shared by the pages that link to head-to-head history. One canonical
// URL per pairing (alphabetical), so the same matchup never exists at two addresses.
export function h2hPath(league: string, slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `/${league}/h2h/${a}-vs-${b}`;
}

/** The pieces of a head-to-head the wording below reads. */
export type H2hFigures = MeetingTally & { league: League };

/**
 * The record as W-D-L for the first team: "10-3-16". Cricket's limited-overs formats have no draw, so theirs is
 * "34-45", with ties and no results said separately (h2hOtherResults); a Test's draw is its middle figure.
 */
export function h2hRecord(h: Pick<H2hFigures, "league" | "winsA" | "winsB" | "draws">): string {
  return isCricketLeague(h.league) && !isFirstClassCricket(h.league) ? `${h.winsA}-${h.winsB}` : `${h.winsA}-${h.draws}-${h.winsB}`;
}

/** Cricket results that are neither side's win, for a line under the record: "2 tied, 1 no result", "3 drawn". Null when there are none (always null outside cricket). */
export function h2hOtherResults(h: Pick<H2hFigures, "league" | "draws" | "ties" | "noResults">): string | null {
  if (!isCricketLeague(h.league)) return null;
  const parts = [
    h.draws > 0 ? `${h.draws} drawn` : null,
    h.ties > 0 ? `${h.ties} tied` : null,
    h.noResults > 0 ? `${h.noResults} no result` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * How far back the record goes, for a meta description: "since 2015" for Tests (the archive's start, from
 * testArchiveCopy.ts, so it says 1877 once the full history is loaded), and for every other league the season of
 * the first meeting on record. Never "all-time": the archives start in 2015 (2023 for MLB, MLS and the Saudi
 * league, 2002 for ODIs), so the record is the one held here. Null when there is no meeting.
 */
export function h2hSince(league: League, firstSeason: number | null): string | null {
  if (isFirstClassCricket(league)) return testsSince();
  return firstSeason == null ? null : `since ${formatSeasonLabel(league, firstSeason)}`;
}

/**
 * Meta description of a pair page. With no counted meeting there is no record to quote ("0-0-0 in 0 meetings"),
 * and the page itself renders noindex, so the description says there is no completed regular-season or playoff
 * meeting. It does not say the two teams never met: a pair whose only game is a preseason or All-Star one has
 * that game listed on the page.
 */
export function h2hDescription(teamA: string, teamB: string, leagueLabel: string, h: H2hFigures, firstSeason: number | null): string {
  if (h.meetings === 0) return `${teamA} vs ${teamB} in the ${leagueLabel}: no completed regular-season or playoff meetings in our archive yet.`;
  const since = h2hSince(h.league, firstSeason);
  if (isCricketLeague(h.league)) {
    // Wins for each side, then what was not a win. A meeting with no recorded result is not in the figures, and the sentence says so.
    const other = h2hOtherResults(h);
    const recorded = h.meetings - h.unknown;
    const count = h.unknown > 0 ? `${recorded} of ${h.meetings} meetings with a recorded result` : `${h.meetings} ${h.meetings === 1 ? "meeting" : "meetings"}`;
    return `${teamA} vs ${teamB} ${leagueLabel} head-to-head record${since ? ` ${since}` : ""}: ${teamA} ${h.winsA} ${h.winsA === 1 ? "win" : "wins"}, ${teamB} ${h.winsB}${other ? `, ${other}` : ""} in ${count}, every result listed.`;
  }
  return `${teamA} vs ${teamB} ${leagueLabel} head-to-head record${since ? ` ${since}` : ""} (${h2hRecord(h)} in ${h.meetings} ${h.meetings === 1 ? "meeting" : "meetings"}), recent results and biggest wins.`;
}
