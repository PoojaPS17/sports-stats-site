import { formatGameDate } from "./gameDay";
import { leagueNameWithArticle, type League } from "./leagues";

/**
 * The homepage's one line for a league with nothing on this week. A league with a fixture still to
 * come is on a break (an international window, the All-Star gap), not between seasons, so it names
 * the day play resumes, in the league's own day zone; only a league with nothing left to play is
 * "between seasons".
 */
export function breakLine(league: League, resumesOn: string | null): string {
  const name = leagueNameWithArticle(league, true);
  if (!resumesOn) return `${name} is between seasons`;
  return `${name} resumes ${formatGameDate(resumesOn, league, { weekday: "long", month: "short", day: "numeric" })}`;
}
