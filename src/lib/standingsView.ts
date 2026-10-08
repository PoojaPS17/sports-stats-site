import { getFirstRegularGame, getStandings, getStandingsBySeason, getStandingsSeasons, getMostRecentPlayedSeason, type League, type StandingRow } from "@/lib/queries";
import { formatGameDate } from "@/lib/gameDay";
import { preseasonNote } from "@/lib/standingsSeasons";

/**
 * The table the standings page shows for a league, and the season it belongs to. A table for the coming season
 * exists (every team 0-0) before a ball is kicked; showing it as "current" is meaningless, so it falls back to the
 * last season with games (`fallbackSeason`, set when that happened). A season that only repeats the last one is not
 * in `seasons` at all (see standingsSeasons.ts). A preseason table is the current one but is labelled: `preseason`
 * carries the note ("Preseason records, the regular season starts Oct 20."), and the rows carry no positions.
 * The page and its share image read the same thing here, so the picture never shows a different table from the page it was shared from.
 */
export async function currentStandingsView(league: League): Promise<{
  standings: StandingRow[];
  seasons: number[];
  activeSeason: number | null;
  fallbackSeason: number | null;
  /** The note under the heading of a preseason table; null for any other. */
  preseason: string | null;
}> {
  const [latest, seasons] = await Promise.all([getStandings(league), getStandingsSeasons(league)]);
  const isPreseason = latest.length > 0 && latest.every((r) => r.preseason);
  const played = latest.some((r) => r.wins + r.losses + (r.draws ?? 0) > 0);
  const fallbackSeason = played || isPreseason ? null : await getMostRecentPlayedSeason(league);
  const standings = fallbackSeason ? await getStandingsBySeason(league, fallbackSeason) : latest;
  const activeSeason = standings[0]?.season ?? seasons[0] ?? null;
  return { standings, seasons, activeSeason, fallbackSeason, preseason: isPreseason && activeSeason ? await preseasonNoteFor(league, activeSeason) : null };
}

/** The preseason note for a season, its start date read from the first regular-season game on file (the league's own calendar day). */
export async function preseasonNoteFor(league: League, season: number): Promise<string> {
  const first = await getFirstRegularGame(league, season);
  return preseasonNote(first ? formatGameDate(first.date, league, { month: "short", day: "numeric" }, first.local_date) : null);
}
