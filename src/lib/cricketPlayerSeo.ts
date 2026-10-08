// The meta description of a cricket player's page: the career figures a searcher types the name for
// ("virat kohli ipl runs"), in the order that fits the player. Search results show about 160
// characters, so the description is shortened from the least useful end rather than cut mid-figure.
import { LEAGUE_LABEL, LEAGUE_SHORT, type League } from "./leagues";
import type { CricketCareerStats } from "./queries";
import { highScoreText, trunc2 } from "./cricketFormat";
import { archiveScope } from "./cricketCoverage";

const n = (v: number) => v.toLocaleString("en-US");
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function battingLine(c: CricketCareerStats, full: boolean): string | null {
  if (c.runs <= 0 && c.inningsBatted === 0) return null;
  if (!full) return `${n(c.runs)} runs`;
  const milestones = [c.hundreds > 0 ? plural(c.hundreds, "hundred", "hundreds") : null, c.fifties > 0 ? plural(c.fifties, "fifty", "fifties") : null].filter(Boolean);
  return `${n(c.runs)} runs${c.average != null ? ` at ${trunc2(c.average)}` : ""}${milestones.length ? ` with ${milestones.join(" and ")}` : ""}${c.highestScore != null ? `, best ${highScoreText(c.highestScore, c.highestScoreNotOut)}` : ""}`;
}

function bowlingLine(c: CricketCareerStats, full: boolean): string | null {
  if (c.wickets <= 0) return null;
  const average = c.wickets > 0 ? trunc2(c.runsConceded / c.wickets) : null;
  const hauls = full && c.fiveWicketHauls > 0 ? ` with ${plural(c.fiveWicketHauls, "five-wicket haul", "five-wicket hauls")}` : "";
  return `${n(c.wickets)} wickets${average ? ` at ${average}` : ""}${hauls}`;
}

/**
 * With a stored career: "Name League stats: 252 matches, 8,004 runs at 38.67 with 8 hundreds and 55 fifties, best 113,
 * for Team." A bowler leads with wickets (a batter's occasional wickets are left out); an all-rounder gets both.
 * A league whose archive starts after the format did says so ("ODI stats since 2002: ..."): the totals are over the matches
 * the site holds, so an unscoped figure would read as the whole career. Without a career, the plain line the page always had.
 */
export function cricketPlayerDescription(league: League, name: string, team: string | null, career: CricketCareerStats | null, testStart?: number): string {
  if (!career || career.matches === 0) return `${name}${team ? ` (${team})` : ""} ${LEAGUE_LABEL[league]} career figures, match-by-match record and splits.`;
  const bowlerFirst = career.wickets * 25 > career.runs;
  // A batter's handful of wickets, or a bowler's handful of runs, is not a figure anyone searches for.
  const parts = (full: boolean) => {
    const bat = battingLine(career, full && !bowlerFirst);
    const bowl = bowlerFirst || career.wickets >= 10 || career.wickets * 25 >= career.runs ? bowlingLine(career, full) : null;
    return (bowlerFirst ? [bowl, bat] : [bat, bowl]).filter(Boolean) as string[];
  };
  const scope = archiveScope(league, testStart);
  const lead = (leagueName: string, withTeam: boolean, full: boolean) =>
    `${name} ${leagueName} stats${scope ? ` ${scope}` : ""}: ${plural(career.matches, "match", "matches")}, ${parts(full).join(", ")}${withTeam && team ? `, for ${team}` : ""}.`;
  const candidates = [lead(LEAGUE_LABEL[league], true, true), lead(LEAGUE_SHORT[league], true, true), lead(LEAGUE_SHORT[league], false, true), lead(LEAGUE_SHORT[league], false, false)];
  const chosen = candidates.find((c) => c.length <= 160) ?? candidates[candidates.length - 1];
  const tail = " Match log and splits.";
  return chosen.length + tail.length <= 160 ? chosen + tail : chosen;
}
